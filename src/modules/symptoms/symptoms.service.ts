import { db } from "../../db";
import { dailyLogs } from "../../db/schema/tracking.schema";
import { patients } from "../../db/schema/profile.schema";
import { alerts } from "../../db/schema/ai.schema";
import { eq, and, or, gte, lte, desc } from "drizzle-orm";
import { LogSymptomsInput, HistoryFilters } from "./symptoms.schema";
import { RpmService } from "../rpm/rpm.service";
import { 
  calculateRiskScore, 
  normalizeScore, 
  getSeverityLevel, 
  getStatusColor 
} from "./utils/symptom-scores";
import { encrypt } from "../../utils/encryption";
import { NotificationService } from "../notification/notification.service";

const rpmService = new RpmService();
const notificationService = new NotificationService();

export class SymptomService {
  async logSymptoms(userId: string, input: LogSymptomsInput) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    // 1. Calculate Composite Scores
    const respiratoryComposite = (
      (input.acq1_night_waking +
        input.acq2_morning_symptoms +
        input.acq3_activity_limitation +
        input.acq4_shortness_of_breath +
        input.acq5_wheeze +
        input.acq6_reliever_use) /
      6
    ).toFixed(2);

    const nasalComposite =
      input.sn_need_to_blow +
      input.sn1_nasal_blockage +
      input.sn2_runny_nose +
      input.sn3_sneezing +
      input.sn4_smell_taste +
      input.sn5_post_nasal_drip +
      input.sn_thick_discharge +
      input.sn6_facial_pain;

    const skinComposite =
      input.sk1_itch +
      input.sk2_sleep_disturbance +
      input.sk3_bleeding +
      input.sk4_weeping +
      input.sk5_cracked +
      input.sk6_flaking +
      input.sk7_dryness;

    return await db.transaction(async (tx) => {
      // 2. Check for existing log on this date (for duplicate RPM skipping)
      const [existingLog] = await tx
        .select()
        .from(dailyLogs)
        .where(
          and(
            eq(dailyLogs.patientId, patient.id),
            eq(dailyLogs.logDate, input.log_date)
          )
        )
        .limit(1);

      // 3. Upsert Daily Log
      const [log] = await tx
        .insert(dailyLogs)
        .values({
          patientId: patient.id,
          logDate: input.log_date,
          acq1NightWaking: input.acq1_night_waking,
          acq2MorningSymptoms: input.acq2_morning_symptoms,
          acq3ActivityLimitation: input.acq3_activity_limitation,
          acq4ShortnessOfBreath: input.acq4_shortness_of_breath,
          acq5Wheeze: input.acq5_wheeze,
          acq6RelieverUse: input.acq6_reliever_use,
          respiratoryComposite: respiratoryComposite.toString(),
          snNeedToBlow: input.sn_need_to_blow,
          sn1NasalBlockage: input.sn1_nasal_blockage,
          sn2RunnyNose: input.sn2_runny_nose,
          sn3Sneezing: input.sn3_sneezing,
          sn4SmellTaste: input.sn4_smell_taste,
          sn5PostNasalDrip: input.sn5_post_nasal_drip,
          snThickDischarge: input.sn_thick_discharge,
          sn6FacialPain: input.sn6_facial_pain,
          nasalComposite: nasalComposite,
          sk1Itch: input.sk1_itch,
          sk2SleepDisturbance: input.sk2_sleep_disturbance,
          sk3Bleeding: input.sk3_bleeding,
          sk4Weeping: input.sk4_weeping,
          sk5Cracked: input.sk5_cracked,
          sk6Flaking: input.sk6_flaking,
          sk7Dryness: input.sk7_dryness,
          skinComposite: skinComposite,
          peakFlow: input.peak_flow,
          rescueInhalerPuffs: input.rescue_inhaler_puffs,
          nighttimeSymptoms: input.nighttime_symptoms,
          notes: input.notes,
        })
        .onConflictDoUpdate({
          target: [dailyLogs.patientId, dailyLogs.logDate],
          set: {
            acq1NightWaking: input.acq1_night_waking,
            acq2MorningSymptoms: input.acq2_morning_symptoms,
            acq3ActivityLimitation: input.acq3_activity_limitation,
            acq4ShortnessOfBreath: input.acq4_shortness_of_breath,
            acq5Wheeze: input.acq5_wheeze,
            acq6RelieverUse: input.acq6_reliever_use,
            respiratoryComposite: respiratoryComposite.toString(),
            snNeedToBlow: input.sn_need_to_blow,
            sn1NasalBlockage: input.sn1_nasal_blockage,
            sn2RunnyNose: input.sn2_runny_nose,
            sn3Sneezing: input.sn3_sneezing,
            sn4SmellTaste: input.sn4_smell_taste,
            sn5PostNasalDrip: input.sn5_post_nasal_drip,
            snThickDischarge: input.sn_thick_discharge,
            sn6FacialPain: input.sn6_facial_pain,
            nasalComposite: nasalComposite,
            sk1Itch: input.sk1_itch,
            sk2SleepDisturbance: input.sk2_sleep_disturbance,
            sk3Bleeding: input.sk3_bleeding,
            sk4Weeping: input.sk4_weeping,
            sk5Cracked: input.sk5_cracked,
            sk6Flaking: input.sk6_flaking,
            sk7Dryness: input.sk7_dryness,
            skinComposite: skinComposite,
            peakFlow: input.peak_flow,
            rescueInhalerPuffs: input.rescue_inhaler_puffs,
            nighttimeSymptoms: input.nighttime_symptoms,
            notes: input.notes,
            loggedAt: new Date(), // Update the timestamp
          }
        })
        .returning();

      // 4. Trigger RPM Counter (only if it's the first log of the day)
      if (!existingLog) {
        await rpmService.recordTransmission(patient.id, input.log_date);
      }

      // 5. Check for Declining Composite Scores (Type A Alerts)
      const riskScore = calculateRiskScore(
        parseFloat(respiratoryComposite),
        nasalComposite,
        skinComposite
      );
      const severity = getSeverityLevel(riskScore);

      const recentLogs = await tx
        .select()
        .from(dailyLogs)
        .where(eq(dailyLogs.patientId, patient.id))
        .orderBy(desc(dailyLogs.logDate), desc(dailyLogs.loggedAt))
        .limit(2);
      
      const prevLog = recentLogs.length > 1 ? recentLogs[1] : null;

      const domains = [
        { 
          name: "respiratory", 
          currentScore: parseFloat(respiratoryComposite), 
          prevScore: prevLog ? parseFloat(prevLog.respiratoryComposite) : null,
          getColor: (s: number) => getStatusColor("respiratory", s)
        },
        { 
          name: "nasal", 
          currentScore: nasalComposite, 
          prevScore: prevLog ? prevLog.nasalComposite : null,
          getColor: (s: number) => getStatusColor("nasal", s)
        },
        { 
          name: "skin", 
          currentScore: skinComposite, 
          prevScore: prevLog ? prevLog.skinComposite : null,
          getColor: (s: number) => getStatusColor("skin", s)
        }
      ];

      // We need clinician info for notifications
      const { patientClinicianAssignments } = await import("../../db/schema/profile.schema");
      const assignments = await tx
        .select()
        .from(patientClinicianAssignments)
        .where(eq(patientClinicianAssignments.patientId, patient.id));

      for (const d of domains) {
        const currColor = d.getColor(d.currentScore);
        const prevColor = d.prevScore !== null ? d.getColor(d.prevScore) : "green";

        console.log(`[DEBUG Alert] Domain: ${d.name} | PrevScore: ${d.prevScore} | PrevColor: ${prevColor} | CurrScore: ${d.currentScore} | CurrColor: ${currColor}`);

        let subtype: string | null = null;
        let priority: string | null = null;

        if (currColor === "red") {
          subtype = "red_zone"; priority = "Critical";
        } else if (prevColor === "green" && currColor === "amber") {
          subtype = "threshold_crossing"; priority = "High";
        }

        console.log(`[DEBUG Alert] Subtype evaluated: ${subtype} | Priority: ${priority}`);

        const [activeAlert] = await tx
          .select()
          .from(alerts)
          .where(
            and(
              eq(alerts.patientId, patient.id),
              eq(alerts.domain, d.name),
              eq(alerts.status, "active")
            )
          )
          .limit(1);

        if (subtype && priority) {
          const alertDesc = `Patient's ${d.name} score has worsened.`;

          if (activeAlert) {
            await tx
              .update(alerts)
              .set({
                lastTriggeredAt: new Date(),
                compositeScoreCurrent: d.currentScore.toString(),
                description: encrypt(alertDesc),
                riskScore: riskScore.toString(),
              })
              .where(eq(alerts.id, activeAlert.id));
          } else {
            await tx.insert(alerts).values({
              patientId: patient.id,
              alertType: "symptom_deterioration",
              domain: d.name,
              alertSubtype: subtype,
              severityFrom: prevColor,
              severityTo: currColor,
              severity: priority,
              status: "active",
              compositeScoreAtTrigger: d.currentScore.toString(),
              compositeScoreCurrent: d.currentScore.toString(),
              description: encrypt(alertDesc),
              lastTriggeredAt: new Date(),
              riskScore: riskScore.toString(),
            });
          }

          console.log(`[DEBUG Alert] Alert created/updated for patient: ${patient.id}`);
          console.log(`[DEBUG Alert] Assignments found: ${assignments.length}`);

          if (assignments.length > 0) {
            const { clinicians } = await import("../../db/schema/profile.schema");
            for (const assignment of assignments) {
              const [clinician] = await tx.select().from(clinicians).where(eq(clinicians.id, assignment.clinicianId)).limit(1);
              console.log(`[DEBUG Alert] Checking clinician ID: ${assignment.clinicianId} | Found valid clinician: ${!!clinician}`);
              
              if (clinician) {
                 console.log(`[DEBUG Alert] Sending notification to clinician's userId: ${clinician.userId}`);
                 notificationService.sendNotification(
                   clinician.userId,
                   "patient_deterioration",
                   `Alert: ${d.name} Declining`,
                   alertDesc
                 ).catch(e => console.error(e));
              }
            }
          } else {
             console.log(`[DEBUG Alert] Skipped notification: Patient has no assigned clinicians in patient_clinician_assignments.`);
          }
        } else if (d.currentScore > (d.prevScore ?? 0)) {
            if (activeAlert) {
               await tx
              .update(alerts)
              .set({
                lastTriggeredAt: new Date(),
                compositeScoreCurrent: d.currentScore.toString(),
                riskScore: riskScore.toString(),
              })
              .where(eq(alerts.id, activeAlert.id));
            }
        }
      }

      return {
        success: true,
        log_id: log.id,
        composites: {
          respiratory: parseFloat(respiratoryComposite),
          nasal: nasalComposite,
          skin: skinComposite,
        },
        risk_score: riskScore,
        severity: severity,
        rpm_incremented: !existingLog,
      };
    });
  }

  public getStatusColor = getStatusColor;
  public calculateRiskScore = calculateRiskScore;
  public normalizeScore = normalizeScore;
  private getSeverityLevel = getSeverityLevel;

  async getSymptomHistory(userId: string, filters: HistoryFilters) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    const conditions = [eq(dailyLogs.patientId, patient.id)];

    const now = new Date();
    if (filters.period === "today") {
      const todayStr = now.toISOString().split("T")[0];
      conditions.push(eq(dailyLogs.logDate, todayStr));
    } else if (filters.period === "7days") {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      conditions.push(gte(dailyLogs.logDate, sevenDaysAgo.toISOString().split("T")[0]));
    } else if (filters.period === "month") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      conditions.push(gte(dailyLogs.logDate, thirtyDaysAgo.toISOString().split("T")[0]));
    } else if (filters.period === "custom" && filters.startDate && filters.endDate) {
      conditions.push(gte(dailyLogs.logDate, filters.startDate));
      conditions.push(lte(dailyLogs.logDate, filters.endDate));
    }

    const logs = await db.select()
      .from(dailyLogs)
      .where(and(...conditions))
      .orderBy(desc(dailyLogs.logDate), desc(dailyLogs.loggedAt));

    return logs.map(log => {
      const resp = parseFloat(log.respiratoryComposite);
      const nasal = log.nasalComposite;
      const skin = log.skinComposite;
      const avg = parseFloat(((resp + nasal + skin) / 3).toFixed(1));

      return {
        id: log.id,
        logDate: log.logDate,
        loggedAt: log.loggedAt,
        respiratoryScore: resp,
        nasalScore: nasal,
        skinScore: skin,
        averageScore: avg,
        severityLevel: this.getSeverityLevel(avg),
        notes: log.notes,
        acq1_night_waking: log.acq1NightWaking,
        acq2_morning_symptoms: log.acq2MorningSymptoms,
        acq3_activity_limitation: log.acq3ActivityLimitation,
        acq4_shortness_of_breath: log.acq4ShortnessOfBreath,
        acq5_wheeze: log.acq5Wheeze,
        acq6_reliever_use: log.acq6RelieverUse,
        sn_need_to_blow: log.snNeedToBlow,
        sn1_nasal_blockage: log.sn1NasalBlockage,
        sn2_runny_nose: log.sn2RunnyNose,
        sn3_sneezing: log.sn3Sneezing,
        sn4_smell_taste: log.sn4SmellTaste,
        sn5_post_nasal_drip: log.sn5PostNasalDrip,
        sn_thick_discharge: log.snThickDischarge,
        sn6_facial_pain: log.sn6FacialPain,
        sk1_itch: log.sk1Itch,
        sk2_sleep_disturbance: log.sk2SleepDisturbance,
        sk3_bleeding: log.sk3Bleeding,
        sk4_weeping: log.sk4Weeping,
        sk5_cracked: log.sk5Cracked,
        sk6_flaking: log.sk6Flaking,
        sk7_dryness: log.sk7Dryness,
      };
    });
  }

  async getGroupedSymptomHistory(userId: string, filters: HistoryFilters) {
    const enrichedLogs = await this.getSymptomHistory(userId, filters);
    
    // Group by logDate
    const grouped = enrichedLogs.reduce((acc: Record<string, any[]>, log) => {
      const date = log.logDate;
      if (!acc[date]) acc[date] = [];
      acc[date].push(log);
      return acc;
    }, {});

    // Return as array of groups
    return Object.entries(grouped)
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
      .map(([date, logs]) => ({
        date,
        logs
      }));
  }
}
