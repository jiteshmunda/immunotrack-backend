import { db } from "../../db";
import { users } from "../../db/schema/user.schema";
import { clinicians, patients, patientClinicianAssignments } from "../../db/schema/profile.schema";
import { dailyLogs } from "../../db/schema/tracking.schema";
import { clinics } from "../../db/schema/clinic.schema";
import { roles } from "../../db/schema/role.schema";
import { patientClinicalNotes } from "../../db/schema/clinical-note.schema";
import { hashForLookup, encrypt, decrypt } from "../../utils/encryption";
import { hashPassword } from "../../utils/hash";
import { eq, desc, and, sql } from "drizzle-orm";
import crypto from "crypto";
import { CreateClinicianInput } from "./clinician.schema";
import { calculateRiskScore, getSeverityLevel } from "../symptoms/utils/symptom-scores";
import { alerts } from "../../db/schema/ai.schema";
import { MedicationService } from "../medication/medication.service";

const medicationService = new MedicationService();

export class ClinicianService {

// -----------------------------------------------------POST /clinician/create--------------------------------------------------
  async createClinician(input: CreateClinicianInput) {
    // 1. Generate secure random 16-character temporary password
    const tempPassword = crypto.randomBytes(8).toString("hex");
    
    const emailHash = hashForLookup(input.email);
    const encryptedEmail = encrypt(input.email);
    const hashedPassword = await hashPassword(tempPassword);

    // 2. Fetch the 'clinician' role ID
    const [clinicianRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, "clinician"))
      .limit(1);

    if (!clinicianRole) {
      throw new Error("Clinician role not found in system");
    }

    return await db.transaction(async (tx) => {
      // 3. Create base User (Encrypted fullName for consistency)
      const [newUser] = await tx
        .insert(users)
        .values({
          fullName: encrypt(input.fullName),
          email: encryptedEmail,
          emailHash: emailHash,
          passwordHash: hashedPassword,
          roleId: clinicianRole.id,
          status: "active",
          isTempPassword: true,
          passwordChangedAt: new Date(),
        })
        .returning();

      // 4. Handle Clinic linking or creation
      let clinicId: string | null = null;
      if (input.organizationName) {
        const [existingClinic] = await tx
          .select({ id: clinics.id })
          .from(clinics)
          .where(eq(clinics.name, input.organizationName))
          .limit(1);

        if (existingClinic) {
          clinicId = existingClinic.id;
        } else {
          const [newClinic] = await tx
            .insert(clinics)
            .values({ name: input.organizationName })
            .returning({ id: clinics.id });
          clinicId = newClinic.id;
        }
      }

      // 5. Create Clinician Profile
      const encryptedLicense = input.licenseNumber ? encrypt(input.licenseNumber) : null;
      const encryptedNpi = encrypt(input.npiNumber);
      const encryptedPhone = input.phone ? encrypt(input.phone) : null;

      await tx.insert(clinicians).values({
        userId: newUser.id,
        clinicId: clinicId,
        licenseNumber: encryptedLicense,
        npiNumber: encryptedNpi,
        phone: encryptedPhone,
        stateOfLicensure: input.stateOfLicensure,
        clinicalRole: input.role,
        specialty: input.specialty,
        organizationName: input.organizationName,
      });

      return {
        clinicianId: newUser.id,
        tempPassword,
      };
    });
  }

  // ---------------------------------------------------- GET Assigned Patients with Risk Calculation ---------------------------------------------------

  async getAssignedPatients(userId: string, search?: string) {
    // 1. Get clinician profile
    const [clinician] = await db
      .select()
      .from(clinicians)
      .where(eq(clinicians.userId, userId))
      .limit(1);

    if (!clinician) throw new Error("CLINICIAN_NOT_FOUND");

    // 2. Fetch all assigned patients with their core user data
    const assignedPatients = await db
      .select({
        id: patients.id,
        fullName: users.fullName,
        primaryDiagnosis: patients.primaryDiagnosis,
      })
      .from(patientClinicianAssignments)
      .innerJoin(patients, eq(patientClinicianAssignments.patientId, patients.id))
      .innerJoin(users, eq(patients.userId, users.id))
      .where(eq(patientClinicianAssignments.clinicianId, clinician.id));

    if (assignedPatients.length === 0) {
      return {
        total_patient_count: 0,
        total_high_risk_count: 0,
        patients: [],
      };
    }

    // 3. For each patient, fetch the latest daily log to calculate risk
    const patientIds = assignedPatients.map((p) => p.id);
    
    const latestLogs = await db
      .select()
      .from(dailyLogs)
      .where(sql`${dailyLogs.patientId} IN ${patientIds}`)
      .orderBy(dailyLogs.patientId, desc(dailyLogs.logDate), desc(dailyLogs.loggedAt));
    
    const latestLogMap = latestLogs.reduce((acc: Record<string, any>, log) => {
      if (!acc[log.patientId]) {
        acc[log.patientId] = log;
      }
      return acc;
    }, {});

    let highRiskCount = 0;
    const patientList = assignedPatients.map((p) => {
      const latestLog = latestLogMap[p.id];
      let riskScore = 0;
      let riskLevel = "Low";
      let lastLoggedDate = null;

      if (latestLog) {
        lastLoggedDate = latestLog.loggedAt;
        riskScore = calculateRiskScore(
          parseFloat(latestLog.respiratoryComposite),
          latestLog.nasalComposite,
          latestLog.skinComposite
        );
        riskLevel = getSeverityLevel(riskScore);

        if (riskLevel === "High") highRiskCount++;
      }

      return {
        id: p.id,
        name: decrypt(p.fullName!),
        primary_diagnosis: p.primaryDiagnosis ? decrypt(p.primaryDiagnosis) : null,
        last_logged_date: lastLoggedDate,
        risk_score: riskScore,
        risk_level: riskLevel,
      };
    });

    // 4. Filter by search query (case-insensitive) if provided
    let filteredList = patientList;
    if (search) {
      const query = search.toLowerCase();
      filteredList = patientList.filter((p) => 
        p.name.toLowerCase().includes(query)
      );
    }

    return {
      total_patient_count: filteredList.length,
      total_high_risk_count: filteredList.filter(p => p.risk_level === "High").length,
      patients: filteredList,
    };
  }

  // ------------------------------------------------------POST /clinician/create-notes -------------------------------------------------------

  async createClinicalNote(clinicianUserId: string, patientId: string, input: { noteType: string; notes: string }) {
    const [clinician] = await db
      .select({
        id: clinicians.id,
        fullName: users.fullName,
      })
      .from(clinicians)
      .innerJoin(users, eq(clinicians.userId, users.id))
      .where(eq(clinicians.userId, clinicianUserId))
      .limit(1);

    if (!clinician) throw new Error("CLINICIAN_NOT_FOUND");

    const [patient] = await db
      .select({ id: patients.id })
      .from(patients)
      .where(eq(patients.id, patientId))
      .limit(1);

    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    const encryptedNotes = encrypt(input.notes);

    const [newNote] = await db
      .insert(patientClinicalNotes)
      .values({
        patientId,
        clinicianId: clinician.id,
        noteType: input.noteType,
        notes: encryptedNotes,
      })
      .returning();

    return {
      note_type: newNote.noteType,
      notes: decrypt(newNote.notes),
      created_at: newNote.createdAt,
      clinician_name: decrypt(clinician.fullName!),
    };
  }


  // ---------------------------------------------------- GET Comprehensive Patient Details ---------------------------------------------------

  async getPatientDetails(clinicianUserId: string, patientId: string) {
    const [clinician] = await db
      .select()
      .from(clinicians)
      .where(eq(clinicians.userId, clinicianUserId))
      .limit(1);

    if (!clinician) throw new Error("CLINICIAN_NOT_FOUND");

    const [assignment] = await db
      .select()
      .from(patientClinicianAssignments)
      .where(and(
        eq(patientClinicianAssignments.clinicianId, clinician.id),
        eq(patientClinicianAssignments.patientId, patientId)
      ))
      .limit(1);

    if (!assignment) throw new Error("UNAUTHORIZED_ACCESS_TO_PATIENT_DATA");

    const [patientData] = await db
      .select({
        user: users,
        patient: patients,
      })
      .from(patients)
      .innerJoin(users, eq(patients.userId, users.id))
      .where(eq(patients.id, patientId))
      .limit(1);

    if (!patientData) throw new Error("PATIENT_NOT_FOUND");

    const profile = {
      id: patientData.patient.id,
      name: decrypt(patientData.user.fullName!),
      email: patientData.user.email ? decrypt(patientData.user.email) : null,
      dob: patientData.patient.dateOfBirth ? decrypt(patientData.patient.dateOfBirth) : null,
      sex: patientData.patient.sex,
      mrn: patientData.patient.mrn ? decrypt(patientData.patient.mrn) : null,
      phone: patientData.patient.phone ? decrypt(patientData.patient.phone) : null,
      primary_diagnosis: patientData.patient.primaryDiagnosis ? decrypt(patientData.patient.primaryDiagnosis) : null,
    };

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const logs = await db
      .select()
      .from(dailyLogs)
      .where(and(
        eq(dailyLogs.patientId, patientId),
        sql`${dailyLogs.logDate} >= ${fourteenDaysAgo.toISOString().split('T')[0]}`
      ))
      .orderBy(desc(dailyLogs.logDate));

    const latestLog = logs[0];
    let riskScore = 0;
    let riskLevel = "Low";

    if (latestLog) {
      riskScore = calculateRiskScore(
        parseFloat(latestLog.respiratoryComposite),
        latestLog.nasalComposite,
        latestLog.skinComposite
      );
      riskLevel = getSeverityLevel(riskScore);
    }

    const symptomTrends = logs.map(l => ({
      date: l.logDate!,
      respiratory: parseFloat(l.respiratoryComposite),
      nasal: l.nasalComposite,
      skin: l.skinComposite,
      risk_score: calculateRiskScore(parseFloat(l.respiratoryComposite), l.nasalComposite, l.skinComposite),
    })).reverse();

    const notes = await db
      .select({
        id: patientClinicalNotes.id,
        type: patientClinicalNotes.noteType,
        notes: patientClinicalNotes.notes,
        created_at: patientClinicalNotes.createdAt,
        clinician_name: users.fullName,
      })
      .from(patientClinicalNotes)
      .innerJoin(clinicians, eq(patientClinicalNotes.clinicianId, clinicians.id))
      .innerJoin(users, eq(clinicians.userId, users.id))
      .where(eq(patientClinicalNotes.patientId, patientId))
      .orderBy(desc(patientClinicalNotes.createdAt));

    const medicationPlan = await medicationService.getMedicationPlan(patientData.user.id);
    const adherence30d = await medicationService.getAdherenceMetrics(clinicianUserId, "clinician", patientId, 30);
    
    const weeklyAdherence = [];
    for (let i = 3; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - (i * 7));
        const metrics = await medicationService.getAdherenceMetrics(clinicianUserId, "clinician", patientId, 7, date);
        weeklyAdherence.push(metrics.overallAdherence);
    }

    const activeAlerts = await db
      .select()
      .from(alerts)
      .where(and(
        eq(alerts.patientId, patientId),
        eq(alerts.status, "active")
      ))
      .orderBy(desc(alerts.lastTriggeredAt));

    return {
      profile,
      stats: {
        risk_score: riskScore,
        risk_level: riskLevel,
        active_alerts: activeAlerts.length,
      },
      symptom_trends: symptomTrends,
      clinical_notes: notes.map(n => ({
        id: n.id,
        type: n.type,
        notes: decrypt(n.notes),
        clinician_name: decrypt(n.clinician_name!),
        created_at: n.created_at,
      })),
      medications: {
        plan: medicationPlan.map(m => ({
          id: m.id,
          name: m.name,
          dose: m.dose,
          frequency: m.frequency,
          category: m.category,
          start_date: m.startDate,
        })),
        adherence_30d: adherence30d.overallAdherence,
        weekly_adherence: weeklyAdherence,
      },
      alerts: activeAlerts.map(a => ({
        id: a.id,
        type: a.alertType,
        description: a.description ? decrypt(a.description) : null,
        severity: a.severity,
        created_at: a.createdAt,
      })),
    };
  }

}
