import { db } from "../../db";
import { users } from "../../db/schema/user.schema";
import { clinicians, patients, patientClinicianAssignments } from "../../db/schema/profile.schema";
import { dailyLogs, patientMedications, medicationLogs } from "../../db/schema/tracking.schema";
import { clinics } from "../../db/schema/clinic.schema";
import { roles } from "../../db/schema/role.schema";
import { patientClinicalNotes } from "../../db/schema/clinical-note.schema";
import { hashForLookup, encrypt, decrypt } from "../../utils/encryption";
import { hashPassword } from "../../utils/hash";
import { eq, desc, and, sql, between } from "drizzle-orm";
import crypto from "crypto";
import { CreateClinicianInput, ClinicianAnalyticsResponse } from "./clinician.schema";
import { calculateRiskScore, getSeverityLevel, getStatusColor } from "../symptoms/utils/symptom-scores";
import { alerts } from "../../db/schema/ai.schema";
import { MedicationService } from "../medication/medication.service";
import { getDailyFrequency } from "../../common/constants/medication";
import { 
  calculateTrend, 
  mapStatus, 
  formatCompositeSummary, 
  formatSymptomTrends, 
  formatPatientHeader, 
  calculateMedicationAdherence 
} from "./clinician.helper";

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
    // 1. Auth & Security
    const [authData] = await db.select({
      clinicianId: clinicians.id, fullName: users.fullName,
      isAssigned: sql<boolean>`EXISTS (SELECT 1 FROM ${patientClinicianAssignments} WHERE clinician_id = ${clinicians.id} AND patient_id = ${patientId})`
    }).from(clinicians).innerJoin(users, eq(clinicians.userId, users.id)).where(eq(clinicians.userId, clinicianUserId)).limit(1);

    if (!authData) throw new Error("CLINICIAN_NOT_FOUND");
    if (!authData.isAssigned) throw new Error("UNAUTHORIZED_ACCESS_TO_PATIENT_DATA");

    // 2. Fetch Core Data
    const [patientData] = await db.select({ user: users, patient: patients }).from(patients).innerJoin(users, eq(patients.userId, users.id)).where(eq(patients.id, patientId)).limit(1);
    if (!patientData) throw new Error("PATIENT_NOT_FOUND");

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const logs = await db.select().from(dailyLogs).where(and(eq(dailyLogs.patientId, patientId), sql`${dailyLogs.logDate} >= ${thirtyDaysAgo.toISOString().split('T')[0]}`)).orderBy(desc(dailyLogs.logDate));

    // 3. Composite Summary & Trends
    const sevenDaysAgoStr = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const log7DaysAgo = logs.find(l => l.logDate! <= sevenDaysAgoStr) || logs[logs.length - 1];

    const composite_summary = formatCompositeSummary(logs[0], log7DaysAgo);
    const symptom_trends = formatSymptomTrends(logs);

    // 4. Medication Adherence
    const activeMeds = await db.select().from(patientMedications).where(and(eq(patientMedications.patientId, patientId), eq(patientMedications.active, true)));
    const medIds = activeMeds.map(m => m.id);
    const takenLogs = medIds.length > 0 ? await db.select({ medicationId: medicationLogs.medicationId, count: sql<number>`count(*)` }).from(medicationLogs).where(and(sql`${medicationLogs.medicationId} IN (${sql.join(medIds.map(id => sql`${id}`), sql`, `)})`, eq(medicationLogs.status, "taken"), sql`${medicationLogs.loggedAt} >= ${thirtyDaysAgo.toISOString()}`)).groupBy(medicationLogs.medicationId) : [];
    
    const takenMap = takenLogs.reduce((acc: Record<string, number>, curr) => ({ ...acc, [curr.medicationId]: Number(curr.count) }), {});
    const adherence = calculateMedicationAdherence(activeMeds, takenMap, thirtyDaysAgo, getDailyFrequency);
    
    const currentAdherence = await medicationService.getAdherenceMetrics(clinicianUserId, "clinician", patientId, 30);
    const prevAdherence30d = await medicationService.getAdherenceMetrics(clinicianUserId, "clinician", patientId, 30, thirtyDaysAgo);
    
    const medication_adherence = {
      ...adherence,
      doses_taken: adherence.taken,
      doses_total: adherence.expected,
      status: mapStatus(adherence.percentage >= 80 ? "green" : adherence.percentage >= 50 ? "amber" : "red"),
      trend_text: `${(adherence.percentage - prevAdherence30d.overallAdherence) >= 0 ? "↑" : "↓"} ${Math.abs(adherence.percentage - prevAdherence30d.overallAdherence)}% vs previous 30 days`,
      medications: currentAdherence.medications
    };

    // 5. Clinical Notes & Medication Plan
    const [notes, medicationPlan, activeAlerts] = await Promise.all([
      db.select({ id: patientClinicalNotes.id, type: patientClinicalNotes.noteType, notes: patientClinicalNotes.notes, created_at: patientClinicalNotes.createdAt, clinician_name: users.fullName }).from(patientClinicalNotes).innerJoin(clinicians, eq(patientClinicalNotes.clinicianId, clinicians.id)).innerJoin(users, eq(clinicians.userId, users.id)).where(eq(patientClinicalNotes.patientId, patientId)).orderBy(desc(patientClinicalNotes.createdAt)),
      medicationService.getMedicationPlan(patientData.user.id),
      db.select().from(alerts).where(and(eq(alerts.patientId, patientId), eq(alerts.status, "active"))).orderBy(desc(alerts.lastTriggeredAt))
    ]);

    // 6. Final Assembly
    const lastLogDate = logs[0] ? new Date(logs[0].loggedAt).toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : "No logs yet";
    
    return {
      header: formatPatientHeader(patientData, decrypt(authData.fullName!), lastLogDate, decrypt),
      composite_summary,
      symptom_trends,
      medication_adherence,
      daily_log_summary: {
        logs_completed: { count: logs.length, total: 30, percentage: Math.round((logs.length / 30) * 100) },
        symptoms_logged: { count: logs.length, total: 30, percentage: Math.round((logs.length / 30) * 100) },
        medications_logged: { count: logs.length, total: 30, percentage: Math.round((logs.length / 30) * 100) },
      },
      clinical_notes: notes.map(n => ({ ...n, notes: decrypt(n.notes), clinician_name: decrypt(n.clinician_name!) })),
      medications: { plan: medicationPlan.map(m => ({ ...m, start_date: m.startDate })) },
      alerts: activeAlerts.map(a => ({ id: a.id, type: a.alertType, description: a.description ? decrypt(a.description) : null, created_at: a.createdAt })),
    };
  }

  async getClinicianAnalytics(clinicianUserId: string): Promise<ClinicianAnalyticsResponse> {
    // 1. Get Clinician
    const [clinician] = await db.select({ id: clinicians.id })
      .from(clinicians)
      .where(eq(clinicians.userId, clinicianUserId))
      .limit(1);
    if (!clinician) throw new Error("CLINICIAN_NOT_FOUND");

    // 2. Get Assigned Patients
    const assignedPatients = await db
      .select({ 
        id: patients.id, 
        fullName: users.fullName,
        userId: users.id
      })
      .from(patientClinicianAssignments)
      .innerJoin(patients, eq(patientClinicianAssignments.patientId, patients.id))
      .innerJoin(users, eq(patients.userId, users.id))
      .where(eq(patientClinicianAssignments.clinicianId, clinician.id));

    if (assignedPatients.length === 0) {
      return {
        summary: {
          total_patients: 0,
          average_adherence: 0,
          average_symptom_score: 0,
          high_risk_patients: 0,
        },
        risk_distribution: { low: 0, moderate: 0, high: 0 },
        average_symptom_trend: [],
        patient_adherence_comparison: [],
      };
    }

    const patientIds = assignedPatients.map(p => p.id);

    // 3. Risk Distribution & Summary Stats
    const riskDistribution = { low: 0, moderate: 0, high: 0 };
    let totalRiskScoreForSummary = 0;
    
    // Efficiently get latest log for each patient
    const latestLogs = await db
      .select({
        patientId: dailyLogs.patientId,
        respiratoryComposite: dailyLogs.respiratoryComposite,
        nasalComposite: dailyLogs.nasalComposite,
        skinComposite: dailyLogs.skinComposite,
      })
      .from(dailyLogs)
      .where(sql`${dailyLogs.id} IN (
        SELECT id FROM (
          SELECT id, row_number() OVER (PARTITION BY patient_id ORDER BY log_date DESC, logged_at DESC) as rn
          FROM daily_logs
          WHERE patient_id IN (${sql.join(patientIds.map(id => sql`${id}`), sql`, `)})
        ) t WHERE rn = 1
      )`);

    latestLogs.forEach(log => {
      const score = calculateRiskScore(
        parseFloat(log.respiratoryComposite),
        log.nasalComposite,
        log.skinComposite
      );
      totalRiskScoreForSummary += score;
      const level = getSeverityLevel(score).toLowerCase() as keyof typeof riskDistribution;
      riskDistribution[level]++;
    });
    
    riskDistribution.low += (patientIds.length - latestLogs.length);

    // 4. Average Symptom Trend (4 Weeks)
    const symptomTrend = [];
    for (let i = 3; i >= 0; i--) {
        const startOffset = (i + 1) * 7;
        const endOffset = i * 7;
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - startOffset);
        const endDate = new Date();
        endDate.setDate(endDate.getDate() - endOffset);

        const logsInWeek = await db
            .select({
                respiratoryComposite: dailyLogs.respiratoryComposite,
                nasalComposite: dailyLogs.nasalComposite,
                skinComposite: dailyLogs.skinComposite,
            })
            .from(dailyLogs)
            .where(and(
                sql`${dailyLogs.patientId} IN (${sql.join(patientIds.map(id => sql`${id}`), sql`, `)})`,
                between(dailyLogs.logDate, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0])
            ));

        let totalScore = 0;
        if (logsInWeek.length > 0) {
            totalScore = logsInWeek.reduce((acc, log) => {
                return acc + calculateRiskScore(
                    parseFloat(log.respiratoryComposite),
                    log.nasalComposite,
                    log.skinComposite
                );
            }, 0) / logsInWeek.length;
        }

        symptomTrend.push({
            week: `Week ${4 - i}`,
            average_score: parseFloat(totalScore.toFixed(2)),
        });
    }

    // 5. Patient Adherence Comparison
    let totalAdherenceSum = 0;
    const adherenceComparison = await Promise.all(assignedPatients.map(async (p) => {
        const metrics = await medicationService.getAdherenceMetrics(clinicianUserId, "clinician", p.id, 30);
        totalAdherenceSum += metrics.overallAdherence;
        return {
            patient_name: decrypt(p.fullName!),
            adherence_percentage: metrics.overallAdherence,
        };
    }));

    return {
      summary: {
        total_patients: assignedPatients.length,
        average_adherence: parseFloat((totalAdherenceSum / assignedPatients.length).toFixed(2)),
        average_symptom_score: latestLogs.length > 0 ? parseFloat((totalRiskScoreForSummary / latestLogs.length).toFixed(2)) : 0,
        high_risk_patients: riskDistribution.high,
      },
      risk_distribution: riskDistribution,
      average_symptom_trend: symptomTrend,
      patient_adherence_comparison: adherenceComparison,
    };
  }
}
