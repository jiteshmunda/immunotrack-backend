import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { ENV, loadSecrets } from "../config/env";
import * as schema from "../db/schema";
import { eq, desc, and } from "drizzle-orm";
import { encrypt } from "../utils/encryption";
import { getStatusColor, calculateRiskScore } from "../modules/symptoms/utils/symptom-scores";

async function run() {
  console.log("Starting Nightly Feature Engineering (Symptom Trends)...");
  
  try {
    await loadSecrets();
  } catch (err) {
    console.error("Failed to load environment secrets:", err);
    process.exit(1);
  }

  const { NotificationService } = await import("../modules/notification/notification.service");
  const notificationService = new NotificationService();

  const pool = new Pool({
    connectionString: ENV.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  
  const db = drizzle(pool, { schema });

  try {
    const activePatients = await db
      .select({ id: schema.patients.id })
      .from(schema.patients)
      .where(eq(schema.patients.monitoringActive, true));

    for (const patient of activePatients) {
      // Get last 5 logs, ordered by date desc (most recent first)
      const logs = await db
        .select()
        .from(schema.dailyLogs)
        .where(eq(schema.dailyLogs.patientId, patient.id))
        .orderBy(desc(schema.dailyLogs.logDate), desc(schema.dailyLogs.loggedAt))
        .limit(5);

      if (logs.length < 3) continue;

      const domains = [
        { name: "respiratory", max: 6, getScore: (l: any) => parseFloat(l.respiratoryComposite) },
        { name: "nasal", max: 40, getScore: (l: any) => l.nasalComposite },
        { name: "skin", max: 28, getScore: (l: any) => l.skinComposite },
      ];

      // Find clinician assignment for notifications
      const [assignment] = await db
        .select()
        .from(schema.patientClinicianAssignments)
        .where(
          and(
            eq(schema.patientClinicianAssignments.patientId, patient.id),
            eq(schema.patientClinicianAssignments.isPrimary, true)
          )
        )
        .limit(1);
      
      let clinicianUserId: string | null = null;
      if (assignment) {
        const [clinician] = await db.select().from(schema.clinicians).where(eq(schema.clinicians.id, assignment.clinicianId)).limit(1);
        if (clinician) clinicianUserId = clinician.userId;
      }

      const riskScore = calculateRiskScore(
        parseFloat(logs[0].respiratoryComposite),
        logs[0].nasalComposite,
        logs[0].skinComposite
      );

      for (const d of domains) {
        const scores = logs.map(l => d.getScore(l)); // Index 0 is most recent
        
        let is5DayRising = false;
        if (scores.length === 5) {
          is5DayRising = scores[0] > scores[1] && scores[1] > scores[2] && scores[2] > scores[3] && scores[3] > scores[4];
        }

        let is3DayRising = false;
        let netIncreasePct = 0;
        if (scores.length >= 3) {
          is3DayRising = scores[0] > scores[1] && scores[1] > scores[2];
          netIncreasePct = ((scores[0] - scores[2]) / d.max) * 100;
        }

        let subtype: string | null = null;
        let priority: string | null = null;
        let streakDays = 0;

        if (is5DayRising) {
          subtype = "consecutive_streak";
          priority = "High";
          streakDays = 5;
        } else if (is3DayRising && netIncreasePct >= 20) {
          subtype = "consecutive_streak";
          priority = "Medium";
          streakDays = 3;
        }

        if (subtype && priority) {
          const currColor = getStatusColor(d.name as any, scores[0]);

          const [activeAlert] = await db
            .select()
            .from(schema.alerts)
            .where(
              and(
                eq(schema.alerts.patientId, patient.id),
                eq(schema.alerts.alertType, "declining_composite"),
                eq(schema.alerts.domain, d.name),
                eq(schema.alerts.status, "active")
              )
            )
            .limit(1);

          const alertDesc = `Sustained worsening in ${d.name} score over ${streakDays} days.`;

          if (activeAlert) {
            await db
              .update(schema.alerts)
              .set({
                lastTriggeredAt: new Date(),
                compositeScoreCurrent: scores[0].toString(),
                streakDays,
                weeklyChangePct: netIncreasePct.toString(),
                description: encrypt(alertDesc),
                riskScore: riskScore.toString(),
              })
              .where(eq(schema.alerts.id, activeAlert.id));
          } else {
            await db.insert(schema.alerts).values({
              patientId: patient.id,
              alertType: "declining_composite",
              domain: d.name,
              alertSubtype: subtype,
              severityTo: currColor,
              severity: priority,
              status: "active",
              compositeScoreAtTrigger: scores[0].toString(),
              compositeScoreCurrent: scores[0].toString(),
              streakDays,
              weeklyChangePct: netIncreasePct.toString(),
              description: encrypt(alertDesc),
              lastTriggeredAt: new Date(),
              riskScore: riskScore.toString(),
            });
          }

          if (priority === "High" && clinicianUserId) {
            notificationService.sendNotification(
              clinicianUserId,
              "patient_deterioration",
              `Alert: ${d.name} Sustained Worsening`,
              alertDesc
            ).catch(e => console.error(e));
          }
        }
      }
    }

    console.log("Nightly Feature Engineering completed successfully!");
  } catch (error) {
    console.error("Nightly Feature Engineering failed:", error);
  } finally {
    if (!process.argv.includes("--watch")) {
      await pool.end();
    }
  }
}

run().then(() => {
  if (process.argv.includes("--watch")) {
    console.log("Watch mode enabled. Repeating check every hour...");
    setInterval(() => {
      run();
    }, 60 * 60 * 1000);
  }
});
