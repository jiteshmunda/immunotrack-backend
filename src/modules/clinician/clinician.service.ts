import { db } from "../../db";
import { users } from "../../db/schema/user.schema";
import { clinicians, patients, patientClinicianAssignments, systemAdmins } from "../../db/schema/profile.schema";
import { dailyLogs, patientMedications, medicationLogs } from "../../db/schema/tracking.schema";
import { clinics } from "../../db/schema/clinic.schema";
import { roles } from "../../db/schema/role.schema";
import { patientClinicalNotes } from "../../db/schema/clinical-note.schema";
import { hashForLookup, encrypt, decrypt } from "../../utils/encryption";
import { hashPassword, generateTempPassword } from "../../utils/hash";
import { eq, desc, and, sql, between, or, inArray, ne } from "drizzle-orm";
import crypto from "crypto";
import { CreateClinicianInput, ClinicianAnalyticsResponse, UpdateClinicianProfileInput } from "./clinician.schema";
import { calculateRiskScore, getSeverityLevel, getStatusColor } from "../symptoms/utils/symptom-scores";
import { alerts } from "../../db/schema/ai.schema";
import { notifications } from "../../db/schema/compliance.schema";
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
import { EmailService } from "../../utils/email";

const medicationService = new MedicationService();
const emailService = new EmailService();

export class ClinicianService {

// -----------------------------------------------------POST /clinician/create--------------------------------------------------
  async createClinician(input: CreateClinicianInput, creatorId: string) {
    // 1. Generate secure random 16-character temporary password
    const tempPassword = generateTempPassword();
    
    const emailHash = hashForLookup(input.email);
    
    // Check if user already exists
    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.emailHash, emailHash))
      .limit(1);

    if (existingUser.length > 0) {
      throw new Error("A user with this email address already exists.");
    }

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

      // 4. Inherit Clinic from the creating Admin
      let clinicId: string | null = null;
      
      const [adminRecord] = await tx
        .select({ clinicId: clinicians.clinicId })
        .from(clinicians)
        .where(eq(clinicians.userId, creatorId))
        .limit(1);

      if (adminRecord && adminRecord.clinicId) {
        clinicId = adminRecord.clinicId;
      } else {
        const [systemAdminRecord] = await tx
          .select({ clinicId: systemAdmins.clinicId })
          .from(systemAdmins)
          .where(eq(systemAdmins.userId, creatorId))
          .limit(1);
        
        if (systemAdminRecord && systemAdminRecord.clinicId) {
          clinicId = systemAdminRecord.clinicId;
        }
      }

      // 5. Create Clinician Profile
      const encryptedLicense = input.licenseNumber ? encrypt(input.licenseNumber) : null;
      const encryptedNpi = encrypt(input.npiNumber);
      const encryptedPhone = input.phone ? encrypt(input.phone) : null;

      await tx.insert(clinicians).values({
        userId: newUser.id,
        clinicId: clinicId,
        createdBy: creatorId,
        licenseNumber: encryptedLicense,
        npiNumber: encryptedNpi,
        phone: encryptedPhone,
        stateOfLicensure: input.stateOfLicensure,
        clinicalRole: input.role,
        specialty: input.specialty,
        organizationName: input.organizationName,
        isClinician: input.is_clinician !== undefined ? input.is_clinician : true,
      });

      // Send the email asynchronously
      emailService.sendClinicianWelcomeEmail(input.email, input.fullName, tempPassword).catch(e => {
        console.error("Failed to send welcome email to clinician:", e);
      });

      return {
        clinicianId: newUser.id,
        tempPassword,
      };
    });
  }

  // ---------------------------------------------------- GET /clinician/profile ---------------------------------------------------
  async getProfile(userId: string) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new Error("CLINICIAN_NOT_FOUND");

    const [clinicianResult] = await db
      .select({
        clinician: clinicians,
        clinic: clinics,
      })
      .from(clinicians)
      .leftJoin(clinics, eq(clinicians.clinicId, clinics.id))
      .where(eq(clinicians.userId, userId))
      .limit(1);

    const fullNameDecrypted = decrypt(user.fullName!);
    const parts = fullNameDecrypted.split(" ");
    const firstName = parts[0] || "";
    const lastName = parts.slice(1).join(" ") || "";

    if (clinicianResult) {
      const { clinician, clinic } = clinicianResult;
      return {
        user_id: user.id,
        email: decrypt(user.email!),
        first_name: firstName,
        last_name: lastName,
        clinician_id: clinician.id,
        clinic_name: clinic ? clinic.name : clinician.organizationName,
        specialty: clinician.specialty,
        license_number: clinician.licenseNumber ? decrypt(clinician.licenseNumber) : null,
        npi_number: clinician.npiNumber ? decrypt(clinician.npiNumber) : null,
        phone: clinician.phone ? decrypt(clinician.phone) : null,
        state_of_licensure: clinician.stateOfLicensure,
        role: clinician.clinicalRole,
        is_clinician: clinician.isClinician,
        notifications_enabled: clinician.notificationsEnabled,
        email_notifications: clinician.emailNotifications,
        mfa_enabled: user.mfaEnabled,
        profile_picture: user.profilePicture ? decrypt(user.profilePicture) : null,
        created_at: clinician.createdAt,
      };
    }

    const [sysAdminResult] = await db
      .select({
        sysAdmin: systemAdmins,
        clinic: clinics,
      })
      .from(systemAdmins)
      .leftJoin(clinics, eq(systemAdmins.clinicId, clinics.id))
      .where(eq(systemAdmins.userId, userId))
      .limit(1);

    if (sysAdminResult) {
      const { sysAdmin, clinic } = sysAdminResult;
      return {
        user_id: user.id,
        email: decrypt(user.email!),
        first_name: firstName,
        last_name: lastName,
        clinician_id: sysAdmin.id,
        clinic_name: clinic ? clinic.name : null,
        role: "System Admin",
        is_clinician: false,
        mfa_enabled: user.mfaEnabled,
        profile_picture: user.profilePicture ? decrypt(user.profilePicture) : null,
        created_at: sysAdmin.createdAt,
      };
    }

    throw new Error("CLINICIAN_NOT_FOUND");
  }

  // ---------------------------------------------------- POST /clinician/profile/photo ---------------------------------------------------
  async uploadPhoto(userId: string, dataUri: string) {
    const encryptedUri = encrypt(dataUri);
    await db.update(users).set({ profilePicture: encryptedUri }).where(eq(users.id, userId));
    return { profile_picture: dataUri };
  }

  // ---------------------------------------------------- DELETE /clinician/profile/photo ---------------------------------------------------
  async deletePhoto(userId: string) {
    await db.update(users).set({ profilePicture: null }).where(eq(users.id, userId));
    return { success: true, message: "Profile picture deleted successfully" };
  }

  // ---------------------------------------------------- PUT /clinician/profile ---------------------------------------------------
  async updateProfile(userId: string, input: UpdateClinicianProfileInput) {
    const [clinician] = await db.select().from(clinicians).where(eq(clinicians.userId, userId)).limit(1);
    
    let isSystemAdmin = false;
    if (!clinician) {
      const [sysAdmin] = await db.select().from(systemAdmins).where(eq(systemAdmins.userId, userId)).limit(1);
      if (sysAdmin) {
        isSystemAdmin = true;
      } else {
        throw new Error("CLINICIAN_NOT_FOUND");
      }
    }

    return await db.transaction(async (tx) => {
      // 1. Update User (Full Name)
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

      if (input.mfa_enabled !== undefined) {
        if (input.mfa_enabled === false) {
          throw new Error("MFA cannot be disabled for clinicians under clinical security policy.");
        }
        await tx.update(users).set({ mfaEnabled: input.mfa_enabled, updatedAt: new Date() }).where(eq(users.id, userId));
      }

      // 2. Update Clinician Profile
      if (!isSystemAdmin) {
        const updates: any = {};
        if (input.specialty !== undefined) updates.specialty = input.specialty;
        if (input.stateOfLicensure !== undefined) updates.stateOfLicensure = input.stateOfLicensure;
        if (input.role !== undefined) updates.clinicalRole = input.role;
        if (input.phone !== undefined) updates.phone = input.phone ? encrypt(input.phone) : null;
        if (input.licenseNumber !== undefined) updates.licenseNumber = input.licenseNumber ? encrypt(input.licenseNumber) : null;
        if (input.npiNumber !== undefined) updates.npiNumber = input.npiNumber ? encrypt(input.npiNumber) : null;
        if (input.notifications_enabled !== undefined) updates.notificationsEnabled = input.notifications_enabled;
        if (input.email_notifications !== undefined) updates.emailNotifications = input.email_notifications;
        if (input.fcmToken !== undefined) updates.fcmToken = input.fcmToken;

        if (Object.keys(updates).length > 0) {
          await tx.update(clinicians)
            .set(updates)
            .where(eq(clinicians.id, clinician.id));
        }
      }

      return { success: true, updated_fields: Object.keys(input) };
    });
  }

  // ---------------------------------------------------- GET Assigned Patients with Risk Calculation ---------------------------------------------------

  async getAssignedPatients(userId: string, search?: string) {
    // 1. Get clinician profile or admin's clinicians
    const targetClinicians = await db
      .select({ id: clinicians.id })
      .from(clinicians)
      .where(eq(clinicians.userId, userId));

    if (targetClinicians.length === 0) {
      return {
        total_patient_count: 0,
        total_high_risk_count: 0,
        total_alerts_count: 0,
        patients: [],
      };
    }
    
    const clinicianIds = targetClinicians.map(c => c.id);

    // 2. Fetch all assigned patients with their core user data
    const assignedPatientsResult = await db
      .select({
        id: patients.id,
        fullName: users.fullName,
        email: users.email,
        primaryDiagnosis: patients.primaryDiagnosis,
        status: users.status,
      })
      .from(patientClinicianAssignments)
      .innerJoin(patients, eq(patientClinicianAssignments.patientId, patients.id))
      .innerJoin(users, eq(patients.userId, users.id))
      .where(
        and(
          inArray(patientClinicianAssignments.clinicianId, clinicianIds),
          ne(users.status, "archived")
        )
      );

    // Deduplicate patients since multiple clinicians under the admin might be assigned to the same patient
    const uniquePatientsMap = new Map();
    assignedPatientsResult.forEach(p => uniquePatientsMap.set(p.id, p));
    const assignedPatients = Array.from(uniquePatientsMap.values());

    if (assignedPatients.length === 0) {
      return {
        total_patient_count: 0,
        total_high_risk_count: 0,
        total_alerts_count: 0,
        patients: [],
      };
    }

    // 3. For each patient, fetch the latest daily log to calculate risk
    const patientIds = assignedPatients.map((p) => p.id);
    
    const latestLogs = await db
      .select()
      .from(dailyLogs)
      .where(sql`${dailyLogs.patientId} IN (${sql.join(patientIds.map(id => sql`${id}`), sql`, `)})`)
      .orderBy(dailyLogs.patientId, desc(dailyLogs.logDate), desc(dailyLogs.loggedAt));
    
    const patientAlerts = await db
      .select({
        patientId: alerts.patientId,
        count: sql<number>`count(${alerts.id})`.mapWith(Number),
      })
      .from(alerts)
      .where(and(
        sql`${alerts.patientId} IN (${sql.join(patientIds.map(id => sql`${id}`), sql`, `)})`,
        eq(alerts.status, "active")
      ))
      .groupBy(alerts.patientId);

    const alertsCountMap = patientAlerts.reduce((acc, row) => {
      acc[row.patientId] = row.count;
      return acc;
    }, {} as Record<string, number>);
    
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

      let alertsCount = alertsCountMap[p.id] || 0;

      return {
        id: p.id,
        name: decrypt(p.fullName!),
        email: p.email ? decrypt(p.email) : null,
        primary_diagnosis: p.primaryDiagnosis ? decrypt(p.primaryDiagnosis) : null,
        last_logged_date: lastLoggedDate,
        risk_score: riskScore,
        risk_level: riskLevel,
        alerts: alertsCount,
        status: p.status,
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

    const totalAlertsCount = patientList.reduce((sum, p) => sum + p.alerts, 0);

    return {
      total_patient_count: filteredList.length,
      total_high_risk_count: filteredList.filter(p => p.risk_level === "High").length,
      total_alerts_count: totalAlertsCount,
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
    }).from(clinicians).innerJoin(users, eq(clinicians.userId, users.id)).where(eq(clinicians.userId, clinicianUserId)).limit(1);

    if (!authData) throw new Error("CLINICIAN_NOT_FOUND");

    const targetClinicians = await db
      .select({ id: clinicians.id })
      .from(clinicians)
      .where(eq(clinicians.userId, clinicianUserId));
    
    if (targetClinicians.length === 0) throw new Error("UNAUTHORIZED_ACCESS_TO_PATIENT_DATA");
    const clinicianIds = targetClinicians.map(c => c.id);

    const [assignment] = await db
      .select({ id: patientClinicianAssignments.id })
      .from(patientClinicianAssignments)
      .where(and(
        eq(patientClinicianAssignments.patientId, patientId),
        inArray(patientClinicianAssignments.clinicianId, clinicianIds)
      ))
      .limit(1);

    if (!assignment) throw new Error("UNAUTHORIZED_ACCESS_TO_PATIENT_DATA");

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
    const currentAdherence = await medicationService.getAdherenceMetrics(clinicianUserId, "clinician", patientId, 30);
    const prevAdherence30d = await medicationService.getAdherenceMetrics(clinicianUserId, "clinician", patientId, 30, thirtyDaysAgo);
    
    const medication_adherence = {
      percentage: currentAdherence.overallAdherence,
      status: mapStatus(currentAdherence.overallAdherence >= 80 ? "green" : currentAdherence.overallAdherence >= 50 ? "amber" : "red"),
      trend_text: `${(currentAdherence.overallAdherence - prevAdherence30d.overallAdherence) >= 0 ? "↑" : "↓"} ${Math.abs(parseFloat((currentAdherence.overallAdherence - prevAdherence30d.overallAdherence).toFixed(2)))}% vs previous 30 days`,
      totalTaken: currentAdherence.totalTaken,
      totalDays: currentAdherence.totalDays,
      totalLogged: currentAdherence.totalLogged,
      medications: currentAdherence.medications
    };

    // 5. Clinical Notes, Medication Plan, Active Alerts & Medication Logged Days (Concurrent Queries)
    const [notes, medicationPlan, activeAlerts, medicationLoggedDaysResult] = await Promise.all([
      db.select({ id: patientClinicalNotes.id, type: patientClinicalNotes.noteType, notes: patientClinicalNotes.notes, created_at: patientClinicalNotes.createdAt, clinician_name: users.fullName }).from(patientClinicalNotes).innerJoin(clinicians, eq(patientClinicalNotes.clinicianId, clinicians.id)).innerJoin(users, eq(clinicians.userId, users.id)).where(eq(patientClinicalNotes.patientId, patientId)).orderBy(desc(patientClinicalNotes.createdAt)),
      medicationService.getMedicationPlan(patientData.user.id),
      db.select().from(alerts).where(and(eq(alerts.patientId, patientId), eq(alerts.status, "active"))).orderBy(desc(alerts.lastTriggeredAt)),
      db.select({
        count: sql<number>`count(distinct date(${medicationLogs.loggedAt} at time zone 'UTC'))`
      })
      .from(medicationLogs)
      .where(and(
        eq(medicationLogs.patientId, patientId),
        sql`${medicationLogs.loggedAt} >= ${thirtyDaysAgo}`
      ))
    ]);

    const medicationsLoggedCount = Number(medicationLoggedDaysResult[0]?.count || 0);

    // 6. Final Assembly
    const lastLogDate = logs[0] ? new Date(logs[0].loggedAt).toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : "No logs yet";
    
    let riskScore = 0;
    let riskLevel = "Low";
    if (logs[0]) {
      riskScore = calculateRiskScore(
        parseFloat(logs[0].respiratoryComposite),
        logs[0].nasalComposite,
        logs[0].skinComposite
      );
      riskLevel = getSeverityLevel(riskScore);
    }

    return {
      header: formatPatientHeader(patientData, decrypt(authData.fullName!), lastLogDate, decrypt),
      risk_score: riskScore,
      risk_level: riskLevel,
      alerts_count: activeAlerts.length,
      composite_summary,
      symptom_trends,
      medication_adherence,
      daily_log_summary: {
        logs_completed: { count: logs.length, total: 30, percentage: Math.round((logs.length / 30) * 100) },
        symptoms_logged: { count: logs.length, total: 30, percentage: Math.round((logs.length / 30) * 100) },
        medications_logged: { count: medicationsLoggedCount, total: 30, percentage: Math.round((medicationsLoggedCount / 30) * 100) },
      },
      clinical_notes: notes.map(n => ({ ...n, notes: decrypt(n.notes), clinician_name: decrypt(n.clinician_name!) })),
      medications: { plan: medicationPlan.map(m => ({ ...m, start_date: m.startDate })) },
      alerts: activeAlerts.map(a => {
        let mappedType = a.alertType?.toLowerCase() || "";
        if (mappedType === "symptom deterioration") mappedType = "symptom_deterioration";
        if (mappedType === "medication non-adherence") mappedType = "medication_non_adherence";
        return {
          id: a.id,
          type: mappedType,
          description: a.description ? decrypt(a.description) : null,
          created_at: a.createdAt,
          lastTriggeredAt: a.lastTriggeredAt,
        };
      }),
    };
  }

  async getClinicianAnalytics(clinicianUserId: string): Promise<ClinicianAnalyticsResponse> {
    // 1. Get Clinician
    const targetClinicians = await db.select({ id: clinicians.id })
      .from(clinicians)
      .where(eq(clinicians.userId, clinicianUserId));
      
    if (targetClinicians.length === 0) throw new Error("CLINICIAN_NOT_FOUND");
    const clinicianIds = targetClinicians.map(c => c.id);

    // 2. Get Assigned Patients
    const assignedPatientsResult = await db
      .select({ 
        id: patients.id, 
        fullName: users.fullName,
        userId: users.id
      })
      .from(patientClinicianAssignments)
      .innerJoin(patients, eq(patientClinicianAssignments.patientId, patients.id))
      .innerJoin(users, eq(patients.userId, users.id))
      .where(
        and(
          inArray(patientClinicianAssignments.clinicianId, clinicianIds),
          ne(users.status, "archived")
        )
      );
      
    const uniquePatientsMap = new Map();
    assignedPatientsResult.forEach(p => uniquePatientsMap.set(p.id, p));
    const assignedPatients = Array.from(uniquePatientsMap.values());

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
        average_score: parseFloat(totalScore.toFixed(2))
      });
    }

    while (symptomTrend.length > 0 && symptomTrend[0].average_score === 0) {
      symptomTrend.shift();
    }

    symptomTrend.forEach((item, index) => {
      item.week = `Week ${index + 1}`;
    });

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
