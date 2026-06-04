import { db } from "../../db";
import { users } from "../../db/schema/user.schema";
import { clinicians, patients, patientClinicianAssignments } from "../../db/schema/profile.schema";
import { clinics } from "../../db/schema/clinic.schema";
import { roles } from "../../db/schema/role.schema";
import { dailyLogs, patientMedications, medicationLogs } from "../../db/schema/tracking.schema";
import { alerts, flarePredictions, flareHistory } from "../../db/schema/ai.schema";
import { rpmRollingPeriods } from "../../db/schema/rpm.schema";
import { auditLogs } from "../../db/schema/compliance.schema";
import { invitations } from "../../db/schema/invitation.schema";
import { hashForLookup, encrypt, decrypt } from "../../utils/encryption";
import { hashPassword, generateTempPassword } from "../../utils/hash";
import { eq, sql, and, or, between, inArray, gte, lte, desc } from "drizzle-orm";
import { CreateClinicianInput } from "../clinician/clinician.schema";
import { MedicationService } from "../medication/medication.service";
import { calculateRiskScore, getSeverityLevel } from "../symptoms/utils/symptom-scores";
import { getAverageResponseTime } from "../../common/middleware/metrics.middleware";

const medicationService = new MedicationService();

export class AdminService {
  private async getAdminClinicId(adminId: string): Promise<string> {
    const [adminClinician] = await db
      .select({ clinicId: clinicians.clinicId })
      .from(clinicians)
      .where(eq(clinicians.userId, adminId))
      .limit(1);

    if (!adminClinician || !adminClinician.clinicId) {
      throw new Error("Admin organization not found");
    }
    return adminClinician.clinicId;
  }

  private async getOrgScopes(adminClinicId: string): Promise<{ userIds: string[], patientIds: string[] }> {
    const orgClinicians = await db
      .select({ userId: clinicians.userId, id: clinicians.id })
      .from(clinicians)
      .where(eq(clinicians.clinicId, adminClinicId));

    const clinicianUserIds = orgClinicians.map(c => c.userId).filter(Boolean) as string[];
    const clinicianIds = orgClinicians.map(c => c.id);

    let patientUserIds: string[] = [];
    let patientIds: string[] = [];
    
    if (clinicianIds.length > 0) {
      const orgPatients = await db
        .select({ userId: patients.userId, id: patients.id })
        .from(patientClinicianAssignments)
        .innerJoin(patients, eq(patientClinicianAssignments.patientId, patients.id))
        .where(inArray(patientClinicianAssignments.clinicianId, clinicianIds));
        
      patientUserIds = orgPatients.map(p => p.userId);
      patientIds = orgPatients.map(p => p.id);
    }
    
    return {
      userIds: Array.from(new Set([...clinicianUserIds, ...patientUserIds])),
      patientIds: Array.from(new Set(patientIds))
    };
  }

  async createAdmin(input: CreateClinicianInput) {
    const tempPassword = generateTempPassword();

    const emailHash = hashForLookup(input.email);
    const encryptedEmail = encrypt(input.email);
    const hashedPassword = await hashPassword(tempPassword);

    const [adminRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, "admin"))
      .limit(1);

    if (!adminRole) {
      throw new Error("Admin role not found in system");
    }

    return await db.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(users)
        .values({
          fullName: encrypt(input.fullName),
          email: encryptedEmail,
          emailHash: emailHash,
          passwordHash: hashedPassword,
          roleId: adminRole.id,
          status: "active",
          isTempPassword: true,
          passwordChangedAt: new Date(),
        })
        .returning();

      // Handle Clinic linking or creation
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

      // Create Admin's Profile in clinicians table
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
        adminId: newUser.id,
        tempPassword,
      };
    });
  }

  async getClinicians(adminId: string, filters?: { status?: string; role?: string; clinical_role?: string; search?: string }) {
    let roleId: string | undefined = undefined;
    if (filters?.role) {
      const [roleData] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, filters.role)).limit(1);
      if (roleData) {
        roleId = roleData.id;
      } else {
        return []; // If they asked for a role that doesn't exist, return empty
      }
    }

    const adminClinicId = await this.getAdminClinicId(adminId);
    const queryConditions: any[] = [eq(clinicians.clinicId, adminClinicId)];
    if (filters?.status) {
      queryConditions.push(eq(users.status, filters.status));
    }
    if (filters?.clinical_role) {
      queryConditions.push(eq(clinicians.clinicalRole, filters.clinical_role));
    }
    if (roleId) {
      queryConditions.push(eq(users.roleId, roleId));
    }

    const adminClinicians = await db
      .select({
        id: clinicians.id,
        user_id: users.id,
        full_name: users.fullName,
        email: users.email,
        status: users.status,
        clinical_role: clinicians.clinicalRole,
        specialty: clinicians.specialty,
        npi_number: clinicians.npiNumber,
        state_of_licensure: clinicians.stateOfLicensure,
        created_at: clinicians.createdAt,
      })
      .from(clinicians)
      .innerJoin(users, eq(clinicians.userId, users.id))
      .where(and(...queryConditions));

    let result = adminClinicians.map((clinician) => ({
      ...clinician,
      full_name: decrypt(clinician.full_name!),
      email: decrypt(clinician.email!),
      npi_number: clinician.npi_number ? decrypt(clinician.npi_number) : null,
    }));

    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(c => 
        (c.full_name && c.full_name.toLowerCase().includes(searchLower)) ||
        (c.email && c.email.toLowerCase().includes(searchLower)) ||
        (c.specialty && c.specialty.toLowerCase().includes(searchLower))
      );
    }

    return result;
  }

  async getAnalytics(adminId: string) {
    const adminClinicId = await this.getAdminClinicId(adminId);
    const adminClinicians = await db
      .select({ id: clinicians.id, userId: clinicians.userId, fullName: users.fullName })
      .from(clinicians)
      .innerJoin(users, eq(clinicians.userId, users.id))
      .where(eq(clinicians.clinicId, adminClinicId));

    if (adminClinicians.length === 0) {
      return this.emptyAnalytics();
    }
    const clinicianIds = adminClinicians.map(c => c.id);

    const assignedPatientsResult = await db
      .select({ id: patients.id })
      .from(patients)
      .innerJoin(users, eq(patients.userId, users.id))
      .innerJoin(patientClinicianAssignments, eq(patients.id, patientClinicianAssignments.patientId))
      .where(and(
        inArray(patientClinicianAssignments.clinicianId, clinicianIds),
        eq(users.status, "active")
      ));

    const uniquePatientsMap = new Map();
    assignedPatientsResult.forEach(p => uniquePatientsMap.set(p.id, p));
    const uniquePatients = Array.from(uniquePatientsMap.values());
    const total_patients = uniquePatients.length;

    if (total_patients === 0) {
      return this.emptyAnalytics();
    }
    const patientIds = uniquePatients.map(p => p.id);

    // 2. Composite score trends (box plot)
    const endOfToday = new Date();
    endOfToday.setUTCHours(23, 59, 59, 999);
    
    const startOf30DaysAgo = new Date(endOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);
    startOf30DaysAgo.setUTCHours(0, 0, 0, 0);

    const logs30Days = await db
      .select({
        patientId: dailyLogs.patientId,
        respiratoryComposite: dailyLogs.respiratoryComposite,
        nasalComposite: dailyLogs.nasalComposite,
        skinComposite: dailyLogs.skinComposite
      })
      .from(dailyLogs)
      .where(and(
        inArray(dailyLogs.patientId, patientIds),
        between(dailyLogs.loggedAt, startOf30DaysAgo, endOfToday)
      ));

    let scores = logs30Days.map(l => calculateRiskScore(Number(l.respiratoryComposite), Number(l.nasalComposite), Number(l.skinComposite)));
    scores.sort((a, b) => a - b);
    
    let composite_score_trends = { min: 0, q1: 0, median: 0, q3: 0, max: 0 };
    if (scores.length > 0) {
      const min = scores[0];
      const max = scores[scores.length - 1];
      const median = scores[Math.floor(scores.length / 2)];
      const q1 = scores[Math.floor(scores.length / 4)];
      const q3 = scores[Math.floor((scores.length * 3) / 4)];
      composite_score_trends = { min, q1, median, q3, max };
    }

    // 4. Medication adherence
    const activeMeds = await db.select().from(patientMedications)
      .where(and(inArray(patientMedications.patientId, patientIds), eq(patientMedications.active, true)));
    
    let totalAdherenceSum = 0;
    let patientsWithMeds = 0;
    await Promise.all(uniquePatients.map(async (p) => {
      const metrics = await medicationService.getAdherenceMetrics(adminId, "admin", p.id, 30);
      if (metrics.totalLogged > 0) {
        totalAdherenceSum += metrics.overallAdherence;
        patientsWithMeds++;
      }
    }));
    const medication_adherence = patientsWithMeds > 0 ? Math.round(totalAdherenceSum / patientsWithMeds) : 0;

    // 5. Active alerts count
    const activeAlerts = await db
      .select({
        id: alerts.id,
        patientId: alerts.patientId,
        clinicianId: patientClinicianAssignments.clinicianId,
      })
      .from(alerts)
      .innerJoin(patientClinicianAssignments, eq(alerts.patientId, patientClinicianAssignments.patientId))
      .where(and(
        inArray(alerts.patientId, patientIds),
        eq(alerts.status, "active")
      ));
    
    const alertsByClinician: Record<string, number> = {};
    for (const alert of activeAlerts) {
      alertsByClinician[alert.clinicianId] = (alertsByClinician[alert.clinicianId] || 0) + 1;
    }
    
    const active_alerts_count = adminClinicians.map(c => ({
      clinician: c.fullName ? decrypt(c.fullName) : "Unknown",
      count: alertsByClinician[c.id] || 0
    }));



    // 7. Clinician Activity
    const clinician_activity = await Promise.all(adminClinicians.map(async c => {
       const resolved = await db.select({ count: sql<number>`count(*)` })
          .from(alerts)
          .where(and(eq(alerts.resolvedBy, c.userId!), gte(alerts.resolvedAt, startOf30DaysAgo)));
          
       const invited = await db.select({ count: sql<number>`count(*)` })
          .from(invitations)
          .where(and(eq(invitations.clinicianId, c.id), gte(invitations.createdAt, startOf30DaysAgo)));

       return {
          clinician: c.fullName ? decrypt(c.fullName) : "Unknown",
          patients_invited: Number(invited[0]?.count || 0),
          alerts_resolved: Number(resolved[0]?.count || 0)
       };
    }));

    // 8. Audit log summary
    const startOfTodayForAudit = new Date(endOfToday.getTime());
    startOfTodayForAudit.setUTCHours(0, 0, 0, 0);

    const auditEvents = await db.select({ count: sql<number>`count(*)` })
       .from(auditLogs)
       .where(and(
          inArray(auditLogs.userId, adminClinicians.map(c => c.userId!).filter(Boolean)),
          gte(auditLogs.createdAt, startOfTodayForAudit)
       ));
    const audit_log_summary = Number(auditEvents[0]?.count || 0);

    return {
      total_patients,
      composite_score_trends,
      medication_adherence,
      active_alerts_count,
      clinician_activity,
      audit_log_summary
    };
  }

  private emptyAnalytics() {
    return {
      total_patients: 0,
      composite_score_trends: { min: 0, q1: 0, median: 0, q3: 0, max: 0 },
      medication_adherence: 0,
      active_alerts_count: [],
      clinician_activity: [],
      audit_log_summary: 0
    };
  }

  async getPopulationDashboard(adminId: string) {
    // 1. Identify Target Patients
    const adminClinicId = await this.getAdminClinicId(adminId);
    const adminClinicians = await db
      .select({ id: clinicians.id, status: users.status })
      .from(clinicians)
      .innerJoin(users, eq(clinicians.userId, users.id))
      .where(eq(clinicians.clinicId, adminClinicId));

    if (adminClinicians.length === 0) {
      return this.emptyDashboard();
    }
    const clinicianIds = adminClinicians.map(c => c.id);
    const active_clinicians = adminClinicians.filter(c => c.status === "active").length;

    const assignedPatientsResult = await db
      .select({ id: patients.id, userId: patients.userId })
      .from(patients)
      .innerJoin(users, eq(patients.userId, users.id))
      .innerJoin(patientClinicianAssignments, eq(patients.id, patientClinicianAssignments.patientId))
      .where(and(
        inArray(patientClinicianAssignments.clinicianId, clinicianIds),
        eq(users.status, "active")
      ));

    const uniquePatients = Array.from(new Map(assignedPatientsResult.map(p => [p.id, p])).values());
    const active_patients = uniquePatients.length;

    if (active_patients === 0) {
      return this.emptyDashboard(active_clinicians);
    }
    const patientIds = uniquePatients.map(p => p.id);

    // 2. Dates
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);

    const startOf7DaysAgo = new Date(); startOf7DaysAgo.setDate(startOf7DaysAgo.getDate() - 7); startOf7DaysAgo.setHours(0, 0, 0, 0);
    const startOf30DaysAgo = new Date(); startOf30DaysAgo.setDate(startOf30DaysAgo.getDate() - 30); startOf30DaysAgo.setHours(0, 0, 0, 0);

    // 3. Daily Logs & Avg Symptom Score
    const todaysLogs = await db
      .select()
      .from(dailyLogs)
      .where(and(
        inArray(dailyLogs.patientId, patientIds),
        between(dailyLogs.loggedAt, startOfToday, endOfToday)
      ));

    const daily_logs = todaysLogs.length;
    let avg_symptom_score = 0;
    if (daily_logs > 0) {
      const totalScore = todaysLogs.reduce((sum, log) => {
        return sum + calculateRiskScore(Number(log.respiratoryComposite), Number(log.nasalComposite), Number(log.skinComposite));
      }, 0);
      avg_symptom_score = parseFloat((totalScore / daily_logs).toFixed(1));
    }

    // 4. Alerts Today
    const [alertsTodayResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(alerts)
      .where(and(
        inArray(alerts.patientId, patientIds),
        eq(alerts.status, "active"),
        between(alerts.createdAt, startOfToday, endOfToday)
      ));
    const alerts_today = Number(alertsTodayResult?.count || 0);

    // 5. Adherence Rate
    let totalAdherenceSum = 0;
    let patientsWithMeds = 0;
    await Promise.all(uniquePatients.map(async (p) => {
      const metrics = await medicationService.getAdherenceMetrics(adminId, "admin", p.id, 30);
      if (metrics.totalLogged > 0) {
        totalAdherenceSum += metrics.overallAdherence;
        patientsWithMeds++;
      }
    }));
    const adherence_rate = patientsWithMeds > 0 ? Math.round(totalAdherenceSum / patientsWithMeds) : 0;

    // 6. User Engagement
    const todaysLogPatients = new Set(todaysLogs.map(l => l.patientId));
    const daily_active_users = Math.round((todaysLogPatients.size / active_patients) * 100);

    const logsLast7Days = await db.select({ patientId: dailyLogs.patientId, loggedAt: dailyLogs.loggedAt }).from(dailyLogs)
      .where(and(inArray(dailyLogs.patientId, patientIds), between(dailyLogs.loggedAt, startOf7DaysAgo, endOfToday)));
    const weeklyLogPatients = new Set(logsLast7Days.map(l => l.patientId));
    const weekly_active_users = Math.round((weeklyLogPatients.size / active_patients) * 100);

    const [logsLast30DaysCount] = await db.select({ count: sql<number>`count(*)` }).from(dailyLogs)
      .where(and(inArray(dailyLogs.patientId, patientIds), between(dailyLogs.loggedAt, startOf30DaysAgo, endOfToday)));
    const expectedLogs30Days = active_patients * 30;
    const logging_compliance = expectedLogs30Days > 0 ? Math.round((Number(logsLast30DaysCount?.count || 0) / expectedLogs30Days) * 100) : 0;

    // 7. System Health
    let data_sync_status = "Degraded";
    try {
      await db.execute(sql`SELECT 1`);
      data_sync_status = "Healthy";
    } catch (e) {
      data_sync_status = "Degraded";
    }

    const uptimeSeconds = Math.floor(process.uptime());
    const days = Math.floor(uptimeSeconds / (3600 * 24));
    const hours = Math.floor((uptimeSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    
    let rawUptime = "";
    if (days > 0) rawUptime += `${days}d `;
    if (hours > 0 || days > 0) rawUptime += `${hours}h `;
    rawUptime += `${minutes}m`;
    
    const system_uptime = `${rawUptime} (99.9%)`;

    // 8. Daily Symptom Log Trends (Last 7 Days)
    const daily_symptom_log_trends: { date: string; count: number }[] = [];
    const trendDays = 7;
    for (let i = trendDays - 1; i >= 0; i--) {
      const d = new Date(endOfToday.getTime() - i * 24 * 60 * 60 * 1000);
      const dStr = d.toISOString().split("T")[0];
      const count = logsLast7Days.filter(l => {
        // loggedAt might be Date or string, handle accordingly
        const logDate = l.loggedAt instanceof Date 
          ? l.loggedAt.toISOString().split("T")[0] 
          : new Date(l.loggedAt as string).toISOString().split("T")[0];
        return logDate === dStr;
      }).length;
      daily_symptom_log_trends.push({ date: dStr, count });
    }

    // 9. Today's Audit Events
    const auditLogsResponse = await this.getAuditLogs(adminId, { 
      limit: 1,
      date_from: startOfToday.toISOString(),
      date_to: endOfToday.toISOString()
    });
    const todays_audit_events_count = auditLogsResponse.total;

    return {
      active_patients,
      active_clinicians,
      daily_logs,
      adherence_rate,
      avg_symptom_score,
      alerts_today,
      todays_audit_events_count,
      daily_symptom_log_trends,
      user_engagement: {
        daily_active_users,
        weekly_active_users,
        logging_compliance
      },
      system_health: {
        api_response_time: `${getAverageResponseTime()}ms`,
        system_uptime,
        data_sync_status
      }
    };
  }

  private emptyDashboard(activeClinicians: number = 0) {
    return {
      active_patients: 0,
      active_clinicians: activeClinicians,
      daily_logs: 0,
      adherence_rate: 0,
      avg_symptom_score: 0,
      alerts_today: 0,
      todays_audit_events_count: 0,
      daily_symptom_log_trends: [],
      user_engagement: {
        daily_active_users: 0,
        weekly_active_users: 0,
        logging_compliance: 0
      },
      system_health: {
        api_response_time: `${getAverageResponseTime()}ms`,
        system_uptime: "99.9%",
        data_sync_status: "Healthy"
      }
    };
  }

  async getAdherenceAnalytics(adminId: string) {
    // 1. Get Patients
    const adminClinicId = await this.getAdminClinicId(adminId);
    const adminClinicians = await db
      .select({ id: clinicians.id })
      .from(clinicians)
      .where(eq(clinicians.clinicId, adminClinicId));

    if (adminClinicians.length === 0) {
      return this.emptyAdherenceAnalytics();
    }
    const clinicianIds = adminClinicians.map(c => c.id);

    const assignedPatientsResult = await db
      .select({ id: patients.id })
      .from(patients)
      .innerJoin(users, eq(patients.userId, users.id))
      .innerJoin(patientClinicianAssignments, eq(patients.id, patientClinicianAssignments.patientId))
      .where(and(
        inArray(patientClinicianAssignments.clinicianId, clinicianIds),
        eq(users.status, "active")
      ));

    const uniquePatientsMap = new Map();
    assignedPatientsResult.forEach(p => uniquePatientsMap.set(p.id, p));
    const uniquePatients = Array.from(uniquePatientsMap.values());
    if (uniquePatients.length === 0) return this.emptyAdherenceAnalytics();
    const patientIds = uniquePatients.map(p => p.id);

    // 2. Fetch Active Prescriptions
    const activeMeds = await db.select().from(patientMedications)
      .where(and(inArray(patientMedications.patientId, patientIds), eq(patientMedications.active, true)));
      
    // 3. Adherence by Medication Type
    const adherence_by_medication_type: { type: string; count: number }[] = [];
    const categoryMap = new Map<string, number>();
    for (const med of activeMeds) {
       const cat = med.category || "Other";
       categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
    }
    for (const [type, count] of categoryMap.entries()) {
       adherence_by_medication_type.push({ type, count });
    }

    // 4. Fetch Medication Logs (Last 30 days)
    const endOfToday = new Date();
    endOfToday.setUTCHours(23, 59, 59, 999);
    const startOf30DaysAgo = new Date();
    startOf30DaysAgo.setDate(startOf30DaysAgo.getDate() - 30);
    startOf30DaysAgo.setUTCHours(0, 0, 0, 0);
    
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const logs30Days = await db.select().from(medicationLogs)
      .where(and(inArray(medicationLogs.patientId, patientIds), between(medicationLogs.loggedAt, startOf30DaysAgo, endOfToday)));

    const missedDosesToday = logs30Days.filter(l => l.status.toLowerCase() === "missed" && new Date(l.loggedAt) >= startOfToday).length;
    
    // 5. Overall adherence rate
    let totalAdherenceSum = 0;
    let patientsWithMeds = 0;
    let excellentCount = 0;
    let moderateCount = 0;
    let needsSupportCount = 0;

    await Promise.all(uniquePatients.map(async (p) => {
      const metrics = await medicationService.getAdherenceMetrics(adminId, "admin", p.id, 30);
      if (metrics.totalLogged > 0) {
        totalAdherenceSum += metrics.overallAdherence;
        patientsWithMeds++;
        
        if (metrics.overallAdherence > 90) excellentCount++;
        else if (metrics.overallAdherence >= 70) moderateCount++;
        else needsSupportCount++;
      }
    }));
    const average_adherence_percentage = patientsWithMeds > 0 ? Math.round(totalAdherenceSum / patientsWithMeds) : 0;
    
    // 6. Missed Dose Reasons Breakdown
    const missedLogs = logs30Days.filter(l => l.status.toLowerCase() === "missed");
    const totalMissed = missedLogs.length;
    let forgotCount = 0;
    let sideEffectsCount = 0;
    let unavailableCount = 0;
    let otherCount = 0;
    
    for (const l of missedLogs) {
       const r = (l.missedReason || "").toLowerCase();
       if (r.includes("forgot")) forgotCount++;
       else if (r.includes("side effect") || r.includes("side_effects")) sideEffectsCount++;
       else if (r.includes("unavailable") || r.includes("out")) unavailableCount++;
       else otherCount++;
    }

    const missed_reasons_breakdown = totalMissed > 0 ? {
        forgot_percentage: Math.round((forgotCount / totalMissed) * 100),
        side_effects_percentage: Math.round((sideEffectsCount / totalMissed) * 100),
        unavailable_percentage: Math.round((unavailableCount / totalMissed) * 100),
        other_percentage: Math.round((otherCount / totalMissed) * 100),
    } : {
        forgot_percentage: 0,
        side_effects_percentage: 0,
        unavailable_percentage: 0,
        other_percentage: 0,
    };

    // 7. Weekly Adherence Trend
    const weekly_adherence_trend: { week: string; adherence_percentage: number }[] = [];
    for (let i = 3; i >= 0; i--) {
       const weekEnd = new Date(endOfToday.getTime() - i * 7 * 24 * 60 * 60 * 1000);
       const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
       const logsInWeek = logs30Days.filter(l => {
           const ld = new Date(l.loggedAt);
           return ld >= weekStart && ld <= weekEnd;
       });
       const totalInWeek = logsInWeek.length;
       const takenInWeek = logsInWeek.filter(l => l.status.toLowerCase() === "taken").length;
       const adp = totalInWeek > 0 ? Math.round((takenInWeek / totalInWeek) * 100) : 0;
       weekly_adherence_trend.push({ week: `Week ${4-i}`, adherence_percentage: adp });
    }

    const totalLoggedAllTime = logs30Days.length;
    const totalTakenAllTime = logs30Days.filter(l => l.status.toLowerCase() === "taken").length;
    const aggregated_adherence_percentage = totalLoggedAllTime > 0 ? Math.round((totalTakenAllTime / totalLoggedAllTime) * 100) : 0;

    return {
      average_adherence_percentage,
      active_medication_plans: activeMeds.length,
      missed_doses_today: missedDosesToday,
      aggregated_adherence_percentage,
      adherence_distribution: {
         excellent_count: excellentCount,
         moderate_count: moderateCount,
         needs_support_count: needsSupportCount
      },
      adherence_by_medication_type,
      missed_reasons_breakdown,
      weekly_adherence_trend
    };
  }

  private emptyAdherenceAnalytics() {
    return {
      average_adherence_percentage: 0,
      active_medication_plans: 0,
      missed_doses_today: 0,
      aggregated_adherence_percentage: 0,
      adherence_distribution: {
         excellent_count: 0,
         moderate_count: 0,
         needs_support_count: 0
      },
      adherence_by_medication_type: [],
      missed_reasons_breakdown: {
        forgot_percentage: 0,
        side_effects_percentage: 0,
        unavailable_percentage: 0,
        other_percentage: 0,
      },
      weekly_adherence_trend: []
    };
  }

  async getSymptomAnalytics(adminId: string) {
    // 1. Get Patients
    const adminClinicId = await this.getAdminClinicId(adminId);
    const adminClinicians = await db
      .select({ id: clinicians.id })
      .from(clinicians)
      .where(eq(clinicians.clinicId, adminClinicId));

    if (adminClinicians.length === 0) return this.emptySymptomAnalytics();

    const clinicianIds = adminClinicians.map(c => c.id);

    const assignedPatientsResult = await db
      .select({ id: patients.id })
      .from(patients)
      .innerJoin(users, eq(patients.userId, users.id))
      .innerJoin(patientClinicianAssignments, eq(patients.id, patientClinicianAssignments.patientId))
      .where(and(
        inArray(patientClinicianAssignments.clinicianId, clinicianIds),
        eq(users.status, "active")
      ));

    const uniquePatientsMap = new Map();
    assignedPatientsResult.forEach(p => uniquePatientsMap.set(p.id, p));
    const uniquePatients = Array.from(uniquePatientsMap.values());
    if (uniquePatients.length === 0) return this.emptySymptomAnalytics();
    const patientIds = uniquePatients.map(p => p.id);

    // 2. Fetch logs for 60 days
    const endOfToday = new Date();
    endOfToday.setUTCHours(23, 59, 59, 999);
    
    const startOfCurrentMonth = new Date(endOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);
    startOfCurrentMonth.setUTCHours(0, 0, 0, 0);

    const startOfPreviousMonth = new Date(startOfCurrentMonth.getTime() - 30 * 24 * 60 * 60 * 1000);
    startOfPreviousMonth.setUTCHours(0, 0, 0, 0);

    const logs60Days = await db.select({
       patientId: dailyLogs.patientId,
       loggedAt: dailyLogs.loggedAt,
       respiratoryComposite: dailyLogs.respiratoryComposite,
       nasalComposite: dailyLogs.nasalComposite,
       skinComposite: dailyLogs.skinComposite
    })
    .from(dailyLogs)
    .where(and(
        inArray(dailyLogs.patientId, patientIds),
        between(dailyLogs.loggedAt, startOfPreviousMonth, endOfToday)
    ));

    const logsCurrentMonth = logs60Days.filter(l => new Date(l.loggedAt) >= startOfCurrentMonth);
    const logsPreviousMonth = logs60Days.filter(l => new Date(l.loggedAt) < startOfCurrentMonth);

    // Helpers
    const calcAvg = (logs: any[], key: string) => {
        if (logs.length === 0) return 0;
        const sum = logs.reduce((acc, l) => acc + Number(l[key] || 0), 0);
        return Math.round((sum / logs.length) * 10) / 10;
    };
    
    const calcPercentageChange = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 100);
    };

    // 3. Top KPIs
    const avgRespiratoryScore = calcAvg(logsCurrentMonth, "respiratoryComposite");
    const avgNasalScore = calcAvg(logsCurrentMonth, "nasalComposite");
    const avgSkinScore = calcAvg(logsCurrentMonth, "skinComposite");

    const prevAvgRespiratoryScore = calcAvg(logsPreviousMonth, "respiratoryComposite");
    const prevAvgNasalScore = calcAvg(logsPreviousMonth, "nasalComposite");
    const prevAvgSkinScore = calcAvg(logsPreviousMonth, "skinComposite");

    const respChange = calcPercentageChange(avgRespiratoryScore, prevAvgRespiratoryScore);
    const nasalChange = calcPercentageChange(avgNasalScore, prevAvgNasalScore);
    const skinChange = calcPercentageChange(avgSkinScore, prevAvgSkinScore);

    // 4. 14-Day Trends
    const trends_14_day: any[] = [];
    for (let i = 13; i >= 0; i--) {
       const d = new Date(endOfToday.getTime() - i * 24 * 60 * 60 * 1000);
       const dStr = d.toISOString().split("T")[0];
       const dayLogs = logsCurrentMonth.filter(l => {
          const ld = new Date(l.loggedAt).toISOString().split("T")[0];
          return ld === dStr;
       });
       trends_14_day.push({
          date: dStr,
          respiratory: calcAvg(dayLogs, "respiratoryComposite"),
          nasal: calcAvg(dayLogs, "nasalComposite"),
          skin: calcAvg(dayLogs, "skinComposite")
       });
    }

    // 5. Patient Distribution (Normalized to 0-10)
    let bucket0to2 = 0;
    let bucket3to5 = 0;
    let bucket6to8 = 0;
    let bucket9to10 = 0;

    uniquePatients.forEach(p => {
       const pLogs = logsCurrentMonth.filter(l => l.patientId === p.id);
       if (pLogs.length > 0) {
           const pRespAvg = calcAvg(pLogs, "respiratoryComposite");
           const pNasalAvg = calcAvg(pLogs, "nasalComposite");
           const pSkinAvg = calcAvg(pLogs, "skinComposite");
           
           // Normalize to 10
           const normResp = (pRespAvg / 6) * 10;
           const normNasal = (pNasalAvg / 40) * 10;
           const normSkin = (pSkinAvg / 28) * 10;

           const overallAvg = (normResp + normNasal + normSkin) / 3;
           
           if (overallAvg <= 2.99) bucket0to2++;
           else if (overallAvg <= 5.99) bucket3to5++;
           else if (overallAvg <= 8.99) bucket6to8++;
           else bucket9to10++;
       }
    });

    const current_symptom_distribution = [
        { severity_range: "0-2", count: bucket0to2 },
        { severity_range: "3-5", count: bucket3to5 },
        { severity_range: "6-8", count: bucket6to8 },
        { severity_range: "9-10", count: bucket9to10 }
    ];

    // 6. MoM comparison
    const month_over_month_comparison = {
       current_month: {
          respiratory: avgRespiratoryScore,
          nasal: avgNasalScore,
          skin: avgSkinScore
       },
       previous_month: {
          respiratory: prevAvgRespiratoryScore,
          nasal: prevAvgNasalScore,
          skin: prevAvgSkinScore
       }
    };

    return {
        top_kpis: {
           respiratory: { avg_score: avgRespiratoryScore, percentage_change: respChange },
           nasal: { avg_score: avgNasalScore, percentage_change: nasalChange },
           skin: { avg_score: avgSkinScore, percentage_change: skinChange }
        },
        trends_14_day,
        current_symptom_distribution,
        month_over_month_comparison
    };
  }

  private emptySymptomAnalytics() {
      return {
        top_kpis: {
           respiratory: { avg_score: 0, percentage_change: 0 },
           nasal: { avg_score: 0, percentage_change: 0 },
           skin: { avg_score: 0, percentage_change: 0 }
        },
        trends_14_day: [],
        current_symptom_distribution: [
            { severity_range: "0-2", count: 0 },
            { severity_range: "3-5", count: 0 },
            { severity_range: "6-8", count: 0 },
            { severity_range: "9-10", count: 0 }
        ],
        month_over_month_comparison: {
           current_month: { respiratory: 0, nasal: 0, skin: 0 },
           previous_month: { respiratory: 0, nasal: 0, skin: 0 }
        }
    };
  }

  async getRiskClusterAnalytics(adminId: string) {
    // 1. Get unique assigned patients
    const adminClinicId = await this.getAdminClinicId(adminId);
    const adminClinicians = await db
      .select({ id: clinicians.id })
      .from(clinicians)
      .where(eq(clinicians.clinicId, adminClinicId));

    if (adminClinicians.length === 0) return this.emptyRiskAnalytics();
    const clinicianIds = adminClinicians.map(c => c.id);

    const assignedPatientsResult = await db
      .select({ id: patients.id })
      .from(patients)
      .innerJoin(users, eq(patients.userId, users.id))
      .innerJoin(patientClinicianAssignments, eq(patients.id, patientClinicianAssignments.patientId))
      .where(and(
        inArray(patientClinicianAssignments.clinicianId, clinicianIds),
        eq(users.status, "active")
      ));

    const uniquePatientsMap = new Map();
    assignedPatientsResult.forEach(p => uniquePatientsMap.set(p.id, p));
    const uniquePatients = Array.from(uniquePatientsMap.values());
    if (uniquePatients.length === 0) return this.emptyRiskAnalytics();
    const patientIds = uniquePatients.map(p => p.id);
    const totalPatients = patientIds.length;

    // Fetch daily logs up to 30 days ago
    const endOfToday = new Date();
    endOfToday.setUTCHours(23, 59, 59, 999);
    
    const startOf30DaysAgo = new Date(endOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);
    startOf30DaysAgo.setUTCHours(0, 0, 0, 0);

    const dLogs = await db.select({
       patientId: dailyLogs.patientId,
       loggedAt: dailyLogs.loggedAt,
       respiratoryComposite: dailyLogs.respiratoryComposite,
       nasalComposite: dailyLogs.nasalComposite,
       skinComposite: dailyLogs.skinComposite
    })
    .from(dailyLogs)
    .where(and(
        inArray(dailyLogs.patientId, patientIds),
        between(dailyLogs.loggedAt, startOf30DaysAgo, endOfToday)
    ));

    const medLogs = await db.select({
       patientId: medicationLogs.patientId,
       status: medicationLogs.status,
       loggedAt: medicationLogs.loggedAt
    })
    .from(medicationLogs)
    .where(and(
        inArray(medicationLogs.patientId, patientIds),
        between(medicationLogs.loggedAt, startOf30DaysAgo, endOfToday)
    ));

    // Helpers
    const getScoreForPatientOnDay = (pId: string, dEnd: Date) => {
        const past = dLogs.filter(l => l.patientId === pId && new Date(l.loggedAt) <= dEnd)
            .sort((a,b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime());
        if (past.length === 0) return 0;
        return calculateRiskScore(Number(past[0].respiratoryComposite), Number(past[0].nasalComposite), Number(past[0].skinComposite));
    };

    const getRiskForPatientOnDay = (pId: string, dEnd: Date) => {
        return getSeverityLevel(getScoreForPatientOnDay(pId, dEnd));
    };

    let lowCount = 0;
    let modCount = 0;
    let highCount = 0;

    let poorAdherenceCount = 0;
    let missedCheckinsCount = 0;

    let severeSymptomCount = 0;
    let symptomDeteriorationCount = 0;

    const dayEnds: Date[] = [];
    for(let i=0; i<=8; i++) {
        const d = new Date(endOfToday.getTime() - i * 24 * 60 * 60 * 1000);
        d.setUTCHours(23, 59, 59, 999);
        dayEnds.push(d);
    }

    const escalationsPast7Days = { lowToMod: 0, modToHigh: 0, total: 0 };
    const escalationsPerDayCount = Array(8).fill(0);
    const threeDaysAgo = new Date(endOfToday.getTime() - 3 * 24 * 60 * 60 * 1000);

    for (const pId of patientIds) {
        // Today's Risk
        const scoreToday = getScoreForPatientOnDay(pId, dayEnds[0]);
        const riskToday = getSeverityLevel(scoreToday);

        if (riskToday === "Low") lowCount++;
        else if (riskToday === "Moderate") modCount++;
        else highCount++;

        if (scoreToday > 8) severeSymptomCount++;

        // Missed check-ins: No log in the last 3 days
        const recentLogs = dLogs.filter(l => l.patientId === pId && new Date(l.loggedAt) >= threeDaysAgo);
        if (recentLogs.length === 0) missedCheckinsCount++;

        // Deterioration
        const scoreDayMinus1 = getScoreForPatientOnDay(pId, dayEnds[1]);
        const scoreDayMinus2 = getScoreForPatientOnDay(pId, dayEnds[2]);
        if (scoreToday > scoreDayMinus1 && scoreDayMinus1 > scoreDayMinus2) {
            symptomDeteriorationCount++;
        }

        // Adherence
        const pMeds = medLogs.filter(l => l.patientId === pId);
        if (pMeds.length > 0) {
            const taken = pMeds.filter(l => l.status === "taken").length;
            const adherence = taken / pMeds.length;
            if (adherence < 0.7) poorAdherenceCount++;
        }

        // 8-day Risk Array
        const pRiskLevels = dayEnds.map(d => getRiskForPatientOnDay(pId, d));
        let pEscalatedLast7DaysLowToMod = false;
        let pEscalatedLast7DaysModToHigh = false;

        for (let i = 0; i < 8; i++) {
            const riskTodayOrPast = pRiskLevels[i];
            const riskYesterdayForThatDay = pRiskLevels[i+1];

            if (riskYesterdayForThatDay === "Low" && riskTodayOrPast === "Moderate") {
                escalationsPerDayCount[i]++;
                if (i < 7) pEscalatedLast7DaysLowToMod = true;
            } else if (riskYesterdayForThatDay === "Moderate" && riskTodayOrPast === "High") {
                escalationsPerDayCount[i]++;
                if (i < 7) pEscalatedLast7DaysModToHigh = true;
            } else if (riskYesterdayForThatDay === "Low" && riskTodayOrPast === "High") {
                escalationsPerDayCount[i]++;
                if (i < 7) {
                    pEscalatedLast7DaysLowToMod = true;
                    pEscalatedLast7DaysModToHigh = true;
                }
            }
        }

        if (pEscalatedLast7DaysLowToMod) escalationsPast7Days.lowToMod++;
        if (pEscalatedLast7DaysModToHigh) escalationsPast7Days.modToHigh++;
    }

    escalationsPast7Days.total = escalationsPast7Days.lowToMod + escalationsPast7Days.modToHigh;

    const calcPct = (count: number) => totalPatients === 0 ? 0 : Math.round((count / totalPatients) * 100);

    const risk_escalations_8_days = [];
    for (let i = 7; i >= 0; i--) {
        const dStr = dayEnds[i].toISOString().split("T")[0];
        risk_escalations_8_days.push({
            date: dStr,
            escalations: escalationsPerDayCount[i]
        });
    }

    return {
        top_kpis: {
            total_patients: totalPatients,
            low_risk: { count: lowCount, percentage: calcPct(lowCount) },
            moderate_risk: { count: modCount, percentage: calcPct(modCount) },
            high_risk: { count: highCount, percentage: calcPct(highCount) }
        },
        risk_distribution: [
            { category: "Low Risk", percentage: calcPct(lowCount) },
            { category: "Moderate Risk", percentage: calcPct(modCount) },
            { category: "High Risk", percentage: calcPct(highCount) }
        ],
        risk_escalations_8_days,
        critical_risk: {
            declining_composite_score: symptomDeteriorationCount,
            severe_symptom_scores: severeSymptomCount
        },
        moderate_risk: {
            poor_adherence: poorAdherenceCount,
            missed_check_ins: missedCheckinsCount
        },
        escalations_trending_7_days: {
            low_to_moderate: escalationsPast7Days.lowToMod,
            moderate_to_high: escalationsPast7Days.modToHigh,
            total_escalations: escalationsPast7Days.total
        }
    };
  }

  private emptyRiskAnalytics() {
      return {
          top_kpis: { total_patients: 0, low_risk: { count: 0, percentage: 0 }, moderate_risk: { count: 0, percentage: 0 }, high_risk: { count: 0, percentage: 0 } },
          risk_distribution: [ { category: "Low Risk", percentage: 0 }, { category: "Moderate Risk", percentage: 0 }, { category: "High Risk", percentage: 0 } ],
          risk_escalations_8_days: [],
          critical_risk: { declining_composite_score: 0, severe_symptom_scores: 0 },
          moderate_risk: { poor_adherence: 0, missed_check_ins: 0 },
          escalations_trending_7_days: { low_to_moderate: 0, moderate_to_high: 0, total_escalations: 0 }
      };
  }

  async getAuditLogs(adminId: string, filters: {
    patient_id?: string;
    user_id?: string;
    action_type?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  }) {
    const adminClinicId = await this.getAdminClinicId(adminId);
    const orgScopes = await this.getOrgScopes(adminClinicId);

    if (orgScopes.userIds.length === 0) {
      return { total: 0, limit: filters.limit ? Number(filters.limit) : 50, offset: filters.offset ? Number(filters.offset) : 0, logs: [] };
    }

    const conditions = [];

    if (orgScopes.patientIds.length > 0) {
      conditions.push(or(
        inArray(auditLogs.userId, orgScopes.userIds),
        inArray(auditLogs.resourceId, orgScopes.patientIds)
      ));
    } else {
      conditions.push(inArray(auditLogs.userId, orgScopes.userIds));
    }

    if (filters.user_id) {
      conditions.push(eq(auditLogs.userId, filters.user_id));
    }
    if (filters.action_type) {
      conditions.push(eq(auditLogs.action, filters.action_type));
    }
    if (filters.patient_id) {
      conditions.push(eq(auditLogs.resourceId, filters.patient_id));
    }
    if (filters.date_from) {
      conditions.push(gte(auditLogs.createdAt, new Date(filters.date_from)));
    }
    if (filters.date_to) {
      conditions.push(lte(auditLogs.createdAt, new Date(filters.date_to)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const limit = filters.limit ? Number(filters.limit) : 50;
    const offset = filters.offset ? Number(filters.offset) : 0;

    const totalCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(auditLogs)
      .where(whereClause);
    
    const total = Number(totalCountResult[0]?.count || 0);

    const logs = await db
      .select()
      .from(auditLogs)
      .where(whereClause)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      total,
      limit,
      offset,
      logs
    };
  }

  async deleteClinician(adminId: string, clinicianId: string) {
    const targetClinicians = await db
      .select({
        id: clinicians.id,
        userId: clinicians.userId,
        clinicId: clinicians.clinicId
      })
      .from(clinicians)
      .where(eq(clinicians.id, clinicianId));

    if (targetClinicians.length === 0) {
      throw new Error("Clinician not found");
    }

    const clinician = targetClinicians[0];
    const adminClinicId = await this.getAdminClinicId(adminId);

    if (clinician.clinicId !== adminClinicId) {
      throw new Error("Forbidden: You do not have permission to delete this clinician");
    }

    await db
      .update(users)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(users.id, clinician.userId!));

    await db
      .delete(patientClinicianAssignments)
      .where(eq(patientClinicianAssignments.clinicianId, clinicianId));

    return { message: "Clinician successfully deleted and assigned patients have been unassigned." };
  }

  async getClinicianDetails(adminId: string, clinicianId: string) {
    const clinicianData = await db
      .select({
        id: clinicians.id,
        user_id: users.id,
        full_name: users.fullName,
        email: users.email,
        status: users.status,
        clinical_role: clinicians.clinicalRole,
        specialty: clinicians.specialty,
        npi_number: clinicians.npiNumber,
        state_of_licensure: clinicians.stateOfLicensure,
        created_at: clinicians.createdAt,
        createdBy: clinicians.createdBy,
        phone: clinicians.phone,
        clinic_name: clinics.name,
        clinicId: clinicians.clinicId
      })
      .from(clinicians)
      .innerJoin(users, eq(clinicians.userId, users.id))
      .leftJoin(clinics, eq(clinicians.clinicId, clinics.id))
      .where(eq(clinicians.id, clinicianId));

    if (clinicianData.length === 0) {
      throw new Error("Clinician not found");
    }

    const clinician = clinicianData[0];
    const adminClinicId = await this.getAdminClinicId(adminId);
    
    if (clinician.clinicId !== adminClinicId) {
      throw new Error("Forbidden: You do not have permission to view this clinician");
    }

    return {
      ...clinician,
      full_name: decrypt(clinician.full_name!),
      email: decrypt(clinician.email!),
      npi_number: clinician.npi_number ? decrypt(clinician.npi_number) : null,
      phone: clinician.phone ? decrypt(clinician.phone) : null,
      createdBy: undefined,
    };
  }

  async updateClinicianRole(adminId: string, clinicianId: string, newRoleName: string) {
    const validRoles = ["admin", "super admin", "clinician"];
    if (!validRoles.includes(newRoleName)) {
      throw new Error("Invalid role name");
    }

    const targetClinicians = await db
      .select({
        id: clinicians.id,
        userId: clinicians.userId,
        clinicId: clinicians.clinicId,
        status: users.status
      })
      .from(clinicians)
      .innerJoin(users, eq(clinicians.userId, users.id))
      .where(eq(clinicians.id, clinicianId));

    if (targetClinicians.length === 0) {
      throw new Error("Clinician not found");
    }

    if (targetClinicians[0].status === "archived") {
      throw new Error("Forbidden: Cannot modify an archived clinician");
    }

    const adminClinicId = await this.getAdminClinicId(adminId);
    if (targetClinicians[0].clinicId !== adminClinicId) {
      throw new Error("Forbidden: You do not have permission to modify this clinician");
    }

    const roleData = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, newRoleName));

    if (roleData.length === 0) {
      throw new Error("Role not found in system");
    }

    await db
      .update(users)
      .set({ roleId: roleData[0].id, updatedAt: new Date() })
      .where(eq(users.id, targetClinicians[0].userId!));

    return { message: `Clinician role successfully updated to ${newRoleName}` };
  }

  async transferPatients(adminId: string, toClinicianId: string, patientIds: string[]) {
    if (!patientIds || patientIds.length === 0) {
      throw new Error("patient_ids array is required and cannot be empty");
    }

    const targetClinicians = await db
      .select({
        id: clinicians.id,
        clinicId: clinicians.clinicId,
        userId: clinicians.userId,
        status: users.status
      })
      .from(clinicians)
      .innerJoin(users, eq(clinicians.userId, users.id))
      .where(eq(clinicians.id, toClinicianId));

    if (targetClinicians.length === 0) {
      throw new Error("Target clinician not found");
    }

    if (targetClinicians[0].status === "archived") {
      throw new Error("Forbidden: Cannot transfer patients to an archived clinician");
    }

    const adminClinicId = await this.getAdminClinicId(adminId);
    if (targetClinicians[0].clinicId !== adminClinicId) {
      throw new Error("Forbidden: You do not have permission to assign patients to this clinician");
    }

    for (const patientId of patientIds) {
      // Delete any existing assignment for this patient
      await db
        .delete(patientClinicianAssignments)
        .where(eq(patientClinicianAssignments.patientId, patientId));

      // Create the new assignment
      await db
        .insert(patientClinicianAssignments)
        .values({
          patientId,
          clinicianId: toClinicianId,
          isPrimary: true,
        });
    }

    return { message: "Patients successfully transferred" };
  }

  async getClinicianPatients(adminId: string, clinicianId: string, filters?: { status?: string; search?: string }) {
    const targetClinicians = await db
      .select({
        id: clinicians.id,
        clinicId: clinicians.clinicId
      })
      .from(clinicians)
      .where(eq(clinicians.id, clinicianId));

    if (targetClinicians.length === 0) {
      throw new Error("Clinician not found");
    }

    const adminClinicId = await this.getAdminClinicId(adminId);
    if (targetClinicians[0].clinicId !== adminClinicId) {
      throw new Error("Forbidden: You do not have permission to view this clinician's patients");
    }

    const queryConditions = [eq(patientClinicianAssignments.clinicianId, clinicianId)];
    if (filters?.status) {
      queryConditions.push(eq(users.status, filters.status));
    }

    const assignedPatientsResult = await db
      .select({
        id: patients.id,
        user_id: users.id,
        full_name: users.fullName,
        email: users.email,
        date_of_birth: patients.dateOfBirth,
        mrn: patients.mrn,
        status: users.status,
      })
      .from(patients)
      .innerJoin(users, eq(patients.userId, users.id))
      .innerJoin(patientClinicianAssignments, eq(patients.id, patientClinicianAssignments.patientId))
      .where(and(...queryConditions));

    let result = assignedPatientsResult.map(p => ({
      ...p,
      full_name: decrypt(p.full_name!),
      email: decrypt(p.email!),
      date_of_birth: p.date_of_birth ? decrypt(p.date_of_birth) : null,
      mrn: p.mrn ? decrypt(p.mrn) : null,
    }));

    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(p => 
        (p.full_name && p.full_name.toLowerCase().includes(searchLower)) ||
        (p.email && p.email.toLowerCase().includes(searchLower)) ||
        (p.mrn && p.mrn.toLowerCase().includes(searchLower))
      );
    }

    return result;
  }

  async getAllUsers(adminId: string, filters?: { role?: string; status?: string; search?: string; limit?: number; offset?: number }) {
    const adminClinicId = await this.getAdminClinicId(adminId);
    const orgScopes = await this.getOrgScopes(adminClinicId);

    if (orgScopes.userIds.length === 0) {
      return { data: [], total: 0 };
    }

    const queryConditions: any[] = [inArray(users.id, orgScopes.userIds)];
    
    if (filters?.status) {
      queryConditions.push(eq(users.status, filters.status));
    }

    if (filters?.role) {
      const [roleData] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, filters.role)).limit(1);
      if (roleData) {
        queryConditions.push(eq(users.roleId, roleData.id));
      } else {
        return { data: [], total: 0 };
      }
    }

    let query = db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        status: users.status,
        roleName: roles.name,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id));
      
    if (queryConditions.length > 0) {
      query = query.where(and(...queryConditions)) as any;
    }

    const allUsers = await query;

    let result = allUsers.map(u => ({
      ...u,
      fullName: u.fullName ? decrypt(u.fullName) : null,
      email: u.email ? decrypt(u.email) : null,
    }));

    if (filters?.search) {
      const searchLower = filters.search.toLowerCase().trim();
      result = result.filter(u => 
        (u.fullName && u.fullName.toLowerCase().includes(searchLower)) ||
        (u.email && u.email.toLowerCase().includes(searchLower))
      );
    }

    const total = result.length;
    
    if (filters?.limit !== undefined && filters?.offset !== undefined) {
      const offset = Number(filters.offset);
      const limit = Number(filters.limit);
      result = result.slice(offset, offset + limit);
    }

    return {
      data: result,
      total
    };
  }

  async getUserDetails(adminId: string, userId: string) {
    const adminClinicId = await this.getAdminClinicId(adminId);
    const orgScopes = await this.getOrgScopes(adminClinicId);

    if (!orgScopes.userIds.includes(userId)) {
      throw new Error("Forbidden: User not found or not in your organization");
    }

    const [user] = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        status: users.status,
        roleName: roles.name,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
        failedLoginAttempts: users.failedLoginAttempts,
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    return {
      ...user,
      fullName: user.fullName ? decrypt(user.fullName) : null,
      email: user.email ? decrypt(user.email) : null,
    };
  }

  async updateUserStatus(adminId: string, userId: string, status: string) {
    const validStatuses = ["active", "archived"];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(", ")}`);
    }

    const adminClinicId = await this.getAdminClinicId(adminId);
    const orgScopes = await this.getOrgScopes(adminClinicId);

    if (!orgScopes.userIds.includes(userId)) {
      throw new Error("Forbidden: User not found or not in your organization");
    }

    const [updatedUser] = await db
      .update(users)
      .set({ status, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id, status: users.status });

    if (!updatedUser) {
      throw new Error("User not found");
    }

    return updatedUser;
  }

  async deleteUser(adminId: string, userId: string) {
    const adminClinicId = await this.getAdminClinicId(adminId);
    const orgScopes = await this.getOrgScopes(adminClinicId);

    if (!orgScopes.userIds.includes(userId)) {
      throw new Error("Forbidden: User not found or not in your organization");
    }

    const [deletedUser] = await db
      .update(users)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    if (!deletedUser) {
      throw new Error("User not found");
    }

    return deletedUser;
  }

  // ------------------------------------- Organisation Patient List API ------------------------------------------

  async getOrgPatients(adminId: string, filters: { status?: string; clinician_id?: string; search?: string; limit?: string; offset?: string }) {
    const adminClinicId = await this.getAdminClinicId(adminId);
    
    const orgClinicians = await db
      .select({ id: clinicians.id, full_name: users.fullName })
      .from(clinicians)
      .innerJoin(users, eq(clinicians.userId, users.id))
      .where(eq(clinicians.clinicId, adminClinicId));

    if (orgClinicians.length === 0) return { total: 0, limit: 50, offset: 0, patients: [] };

    const clinicianMap = new Map(orgClinicians.map(c => [c.id, c.full_name ? decrypt(c.full_name) : "Unknown"]));
    const clinicianIds = orgClinicians.map(c => c.id);

    let conditions: any[] = [inArray(patientClinicianAssignments.clinicianId, clinicianIds)];

    if (filters.status) {
      conditions.push(eq(users.status, filters.status));
    }
    if (filters.clinician_id) {
      conditions.push(eq(patientClinicianAssignments.clinicianId, filters.clinician_id));
    }

    const baseQuery = db
      .select({
        id: patients.id,
        user_id: users.id,
        full_name: users.fullName,
        email: users.email,
        status: users.status,
        is_rpm_active: patients.monitoringActive,
        clinician_id: patientClinicianAssignments.clinicianId,
        created_at: patients.createdAt,
      })
      .from(patients)
      .innerJoin(users, eq(patients.userId, users.id))
      .innerJoin(patientClinicianAssignments, eq(patients.id, patientClinicianAssignments.patientId))
      .where(and(...conditions));

    const allResults = await baseQuery;

    let decryptedResults = allResults.map(p => ({
      ...p,
      full_name: decrypt(p.full_name!),
      email: decrypt(p.email!),
      clinician_name: clinicianMap.get(p.clinician_id) || "Unknown"
    }));

    const dedupedMap = new Map();
    for (const p of decryptedResults) {
      if (!dedupedMap.has(p.id)) {
        dedupedMap.set(p.id, p);
      } else {
        const existing = dedupedMap.get(p.id);
        if (!existing.clinician_name.includes(p.clinician_name)) {
          existing.clinician_name += `, ${p.clinician_name}`;
        }
      }
    }
    decryptedResults = Array.from(dedupedMap.values());

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      decryptedResults = decryptedResults.filter(p => 
        (p.full_name && p.full_name.toLowerCase().includes(searchLower)) ||
        (p.email && p.email.toLowerCase().includes(searchLower))
      );
    }

    // Sort descending by created_at by default
    decryptedResults.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = decryptedResults.length;
    const limit = filters.limit ? Number(filters.limit) : 50;
    const offset = filters.offset ? Number(filters.offset) : 0;
    
    const paginatedResults = decryptedResults.slice(offset, offset + limit);

    return {
      total,
      limit,
      offset,
      patients: paginatedResults
    };
  }

  async getOrgPatientDetails(adminId: string, patientId: string) {
    const adminClinicId = await this.getAdminClinicId(adminId);
    
    const orgClinicians = await db
      .select({ id: clinicians.id })
      .from(clinicians)
      .where(eq(clinicians.clinicId, adminClinicId));

    if (orgClinicians.length === 0) throw new Error("Forbidden: Patient not found or not in your organization");

    const clinicianIds = orgClinicians.map(c => c.id);

    const assignments = await db
      .select({ 
        id: patientClinicianAssignments.id,
        clinician_id: clinicians.id,
        clinician_name: users.fullName
      })
      .from(patientClinicianAssignments)
      .innerJoin(clinicians, eq(patientClinicianAssignments.clinicianId, clinicians.id))
      .innerJoin(users, eq(clinicians.userId, users.id))
      .where(and(
        eq(patientClinicianAssignments.patientId, patientId),
        inArray(patientClinicianAssignments.clinicianId, clinicianIds)
      ));

    if (assignments.length === 0) {
      throw new Error("Forbidden: Patient not found or not in your organization");
    }

    const assigned_clinicians = assignments.map(a => ({
      id: a.clinician_id,
      name: a.clinician_name ? decrypt(a.clinician_name) : "Unknown"
    }));

    const [patientData] = await db
      .select({
        id: patients.id,
        user_id: users.id,
        full_name: users.fullName,
        email: users.email,
        status: users.status,
        date_of_birth: patients.dateOfBirth,
        biological_sex: patients.sex,
        phone_number: patients.phone,
        is_rpm_active: patients.monitoringActive,
        created_at: patients.createdAt,
      })
      .from(patients)
      .innerJoin(users, eq(patients.userId, users.id))
      .where(eq(patients.id, patientId))
      .limit(1);

    if (!patientData) throw new Error("Patient not found");

    return {
      ...patientData,
      full_name: decrypt(patientData.full_name!),
      email: decrypt(patientData.email!),
      date_of_birth: patientData.date_of_birth ? decrypt(patientData.date_of_birth) : null,
      phone_number: patientData.phone_number ? decrypt(patientData.phone_number) : null,
      assigned_clinicians
    };
  }
}
