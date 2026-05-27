import { db } from "../../db";
import { patients, clinicians, patientClinicianAssignments } from "../../db/schema/profile.schema";
import { users } from "../../db/schema/user.schema";
import { clinics } from "../../db/schema/clinic.schema";
import { patientConsents, onboardingSessions, notifications } from "../../db/schema/compliance.schema";
import { eq, and } from "drizzle-orm";
import { UpdatePatientProfileInput, PatientConsentInput } from "./patient.schema";
import { decrypt, encrypt } from "../../utils/encryption";
import { RpmService } from "../rpm/rpm.service";
import { SymptomService } from "../symptoms/symptoms.service";
import { MedicationService } from "../medication/medication.service";
import { aiInsights } from "../../db/schema/ai.schema";
import { desc } from "drizzle-orm";

const rpmService = new RpmService();
const symptomService = new SymptomService();
const medicationService = new MedicationService();

export class PatientService {

  //  ---------------------------PUT /patient/profile--------------------------------------

  async updateProfile(userId: string, input: UpdatePatientProfileInput) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    return await db.transaction(async (tx) => {
      if (input.first_name || input.last_name) {
        const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
        if (user && user.fullName) {
            const currentFullName = decrypt(user.fullName);
            const parts = currentFullName.split(" ");
            const first = input.first_name || parts[0];
            const last = input.last_name || parts.slice(1).join(" ");
            await tx.update(users).set({ fullName: encrypt(`${first} ${last}`), updatedAt: new Date() }).where(eq(users.id, userId));
        }
      }

      const updates: any = { updatedAt: new Date() };
      
      if (input.zip_code !== undefined) updates.locationZip = input.zip_code;
      if (input.sex !== undefined) updates.sex = input.sex;
      if (input.phone !== undefined) updates.phone = encrypt(input.phone);
      if (input.medication_reminders_enabled !== undefined) updates.medicationRemindersEnabled = input.medication_reminders_enabled;
      if (input.reminder_time_utc !== undefined) updates.reminderTimeUtc = input.reminder_time_utc;
      if (input.fcm_token !== undefined) updates.fcmToken = input.fcm_token;
      if (input.location !== undefined) updates.location = input.location;
      if (input.latitude !== undefined) updates.latitude = input.latitude !== null ? input.latitude.toString() : null;
      if (input.longitude !== undefined) updates.longitude = input.longitude !== null ? input.longitude.toString() : null;

      updates.onboardingCompleted = true;
      updates.monitoringActive = true;

      await tx.update(patients)
        .set(updates)
        .where(eq(patients.id, patient.id));

      if (input.first_name || input.last_name || input.zip_code) { // Notify if completing onboarding
        const [assignment] = await tx.select().from(patientClinicianAssignments).where(eq(patientClinicianAssignments.patientId, patient.id)).limit(1);
        if (assignment) {
          const [clinician] = await tx.select().from(clinicians).where(eq(clinicians.id, assignment.clinicianId)).limit(1);
          if (clinician) {
            const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
            const fullName = user && user.fullName ? decrypt(user.fullName) : "Patient";
            await tx.insert(notifications).values([{
              userId: clinician.userId,
              type: "patient_deterioration",
              title: encrypt("Patient Enrolled"),
              body: encrypt(`${fullName} has securely registered their account and activated remote monitoring.`),
            }]);
          }
        }
      }
        
      return { success: true, updated_fields: Object.keys(input), onboarding_complete: true };
    });
  }

  // -----------------------GET /patient/profile----------------------------------

  async getProfile(userId: string) {
    const [result] = await db
      .select({
        user: users,
        patient: patients,
      })
      .from(users)
      .innerJoin(patients, eq(users.id, patients.userId))
      .where(eq(users.id, userId))
      .limit(1);

    if (!result) throw new Error("PATIENT_NOT_FOUND");

    const { user, patient } = result;

    const fullNameDecrypted = decrypt(user.fullName);
    const parts = fullNameDecrypted.split(" ");
    const firstName = parts[0] || "";
    const lastName = parts.slice(1).join(" ") || "";

    const [assignment] = await db
      .select({
         clinicianName: users.fullName,
         clinicName: clinics.name
      })
      .from(patientClinicianAssignments)
      .innerJoin(clinicians, eq(patientClinicianAssignments.clinicianId, clinicians.id))
      .innerJoin(users, eq(clinicians.userId, users.id))
      .leftJoin(clinics, eq(clinicians.clinicId, clinics.id))
      .where(eq(patientClinicianAssignments.patientId, patient.id))
      .limit(1);

    return {
      user_id: user.id,
      email: decrypt(user.email),
      first_name: firstName,
      last_name: lastName,
      clinician_name: assignment?.clinicianName ? decrypt(assignment.clinicianName) : null,
      clinic_name: assignment?.clinicName || null,
      patient_id: patient.id,
      date_of_birth: (() => {
        if (!patient.dateOfBirth) return null;
        const rawDob = decrypt(patient.dateOfBirth);
        const dateObj = new Date(rawDob);
        if (isNaN(dateObj.getTime())) return rawDob;
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        const yyyy = dateObj.getFullYear();
        return `${mm}/${dd}/${yyyy}`;
      })(),
      sex: patient.sex,
      phone: patient.phone ? decrypt(patient.phone) : null,
      mrn: patient.mrn ? decrypt(patient.mrn) : null,
      primary_diagnosis: patient.primaryDiagnosis ? decrypt(patient.primaryDiagnosis) : null,
      location_zip: patient.locationZip,
      location: patient.location,
      latitude: patient.latitude ? parseFloat(patient.latitude) : null,
      longitude: patient.longitude ? parseFloat(patient.longitude) : null,
      icd10_qualifying_code: patient.icd10QualifyingCode ? decrypt(patient.icd10QualifyingCode) : null,
      medication_reminders_enabled: patient.medicationRemindersEnabled,
      reminder_time_utc: patient.reminderTimeUtc,
      onboarding_completed: patient.onboardingCompleted,
      monitoring_active: patient.monitoringActive,
      created_at: patient.createdAt,
      updated_at: patient.updatedAt,
    };
  }

  // -----------------------POST /patient/consent---------------------------------

  async recordConsent(userId: string, input: PatientConsentInput, ip?: string) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    // Encrypt PHI for storage
    const encryptedSignature = input.typed_signature ? encrypt(input.typed_signature) : null;
    const encryptedIcd10 = input.icd10_code ? encrypt(input.icd10_code) : null;

    await db.insert(patientConsents).values([{
      patientId: patient.id,
      consentType: input.consent_type,
      consentVersion: input.consent_version,
      consentedAt: new Date(),
      devicePlatform: input.device_platform,
      deviceId: input.device_id,
      scrollCompleted: input.scroll_completed,
      typedSignature: encryptedSignature,
      icd10Code: encryptedIcd10,
      consentFormVersion: input.consent_version,
      ipAddress: ip,
    }]);

    let next_step = "complete";
    if (input.consent_type === "platform") next_step = "consent_hipaa_npp";
    else if (input.consent_type === "hipaa_npp") {
      if (patient.icd10QualifyingCode) next_step = "consent_rpm";
      else next_step = "profile_setup";
    } else if (input.consent_type === "rpm") {
      next_step = "profile_setup";
    }

    if (input.consent_type === "rpm") {
      await rpmService.initializeEnrollment(patient.id, new Date(), input.icd10_code || "J45.20");
    }

    return { success: true, next_step };
  }

  // -----------------------GET /patient/dashboard----------------------------

  async getDashboardData(userId: string) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    // 1. Fetch Latest Symptom Status (Latest 2 logs for trend)
    const allLogs = await symptomService.getSymptomHistory(userId, { period: "month" } as any);
    const latestLog = allLogs.length > 0 ? allLogs[0] : null;
    const previousLog = allLogs.length > 1 ? allLogs[1] : null;

    const todayStr = new Date().toISOString().split("T")[0];
    const isToday = latestLog?.logDate === todayStr;

    const status = (latestLog && isToday) ? {
      respiratory: {
        score: latestLog.respiratoryScore,
        color: symptomService.getStatusColor("respiratory", latestLog.respiratoryScore),
      },
      nasal: {
        score: latestLog.nasalScore,
        color: symptomService.getStatusColor("nasal", latestLog.nasalScore),
      },
      skin: {
        score: latestLog.skinScore,
        color: symptomService.getStatusColor("skin", latestLog.skinScore),
      },
     
      risk_score: symptomService.calculateRiskScore(
        latestLog.respiratoryScore,
        latestLog.nasalScore,
        latestLog.skinScore
      ),
      overall_severity: latestLog.severityLevel,
      last_updated: latestLog.loggedAt,
      log_date: latestLog.logDate
    } : null;

    // 2. Fetch Active Medications
    const medications = await medicationService.getMedicationPlan(userId);

    // 3. Fetch Latest AI Insight
    const [latestInsight] = await db.select()
      .from(aiInsights)
      .where(eq(aiInsights.patientId, patient.id))
      .orderBy(desc(aiInsights.generatedAt))
      .limit(1);

    const insight = latestInsight ? {
      id: latestInsight.id,
      type: latestInsight.insightType,
      title: decrypt(latestInsight.title),
      description: decrypt(latestInsight.description),
      recommendation: latestInsight.recommendation ? decrypt(latestInsight.recommendation) : null,
      risk_level: latestInsight.riskLevel,
      generated_at: latestInsight.generatedAt
    } : null;

    return {
      today_status: status,
      medications: medications.map(m => ({
        name: m.name,
        dose: m.dose,
        frequency: m.frequency,
        category: m.category
      })),
      ai_insight: insight
    };
  }
}
