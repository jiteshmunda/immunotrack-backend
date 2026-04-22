import { db } from "../../db";
import { dailyLogs } from "../../db/schema/tracking.schema";
import { patients } from "../../db/schema/profile.schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { LogSymptomsInput, HistoryFilters } from "./symptoms.schema";
import { RpmService } from "../rpm/rpm.service";

const rpmService = new RpmService();

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
      input.sn1_nasal_blockage +
      input.sn2_runny_nose +
      input.sn3_sneezing +
      input.sn4_smell_taste +
      input.sn5_post_nasal_drip +
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

      // 3. Insert Daily Log
      const [log] = await tx
        .insert(dailyLogs)
        .values([{
          patientId: patient.id,
          logDate: input.log_date,
          acq1NightWaking: input.acq1_night_waking,
          acq2MorningSymptoms: input.acq2_morning_symptoms,
          acq3ActivityLimitation: input.acq3_activity_limitation,
          acq4ShortnessOfBreath: input.acq4_shortness_of_breath,
          acq5Wheeze: input.acq5_wheeze,
          acq6RelieverUse: input.acq6_reliever_use,
          respiratoryComposite: respiratoryComposite.toString(),
          sn1NasalBlockage: input.sn1_nasal_blockage,
          sn2RunnyNose: input.sn2_runny_nose,
          sn3Sneezing: input.sn3_sneezing,
          sn4SmellTaste: input.sn4_smell_taste,
          sn5PostNasalDrip: input.sn5_post_nasal_drip,
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
        }])
        .returning();

      // 4. Trigger RPM Counter (only if it's the first log of the day)
      if (!existingLog) {
        await rpmService.recordTransmission(patient.id, input.log_date);
      }

      return {
        success: true,
        log_id: log.id,
        composites: {
          respiratory: parseFloat(respiratoryComposite),
          nasal: nasalComposite,
          skin: skinComposite,
        },
        rpm_incremented: !existingLog,
      };
    });
  }

  private getSeverityLevel(score: number): string {
    if (score <= 4) return "Low";
    if (score <= 9) return "Moderate";
    return "High";
  }

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
