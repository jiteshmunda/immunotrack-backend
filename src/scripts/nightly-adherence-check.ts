import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { ENV, loadSecrets } from "../config/env";
import * as schema from "../db/schema";
import { eq, and, sql, between } from "drizzle-orm";
import { decrypt, encrypt } from "../utils/encryption";
import { calculateAdherenceWindow, isPRNMedication, isControllerMedication } from "../utils/adherence";

async function run() {
  console.log("Starting Nightly Medication Adherence Check...");
  
  try {
    await loadSecrets();
  } catch (err) {
    console.error("Failed to load environment secrets:", err);
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: ENV.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  
  const db = drizzle(pool, { schema });

  try {
    // 1. Fetch all active patients and join with users to get names
    const activePatients = await db
      .select({
        id: schema.patients.id,
        fullName: schema.users.fullName,
      })
      .from(schema.patients)
      .innerJoin(schema.users, eq(schema.patients.userId, schema.users.id));

    console.log(`Found ${activePatients.length} active patients.`);

    const today = new Date();

    for (const patient of activePatients) {
      const patientName = patient.fullName ? decrypt(patient.fullName) : "Patient";

      // 2. Fetch active medications for this patient
      const activeMeds = await db
        .select()
        .from(schema.patientMedications)
        .where(
          and(
            eq(schema.patientMedications.patientId, patient.id),
            eq(schema.patientMedications.active, true)
          )
        );

      // 3. Filter for controller medications
      const controllerMeds = activeMeds.filter(med => isControllerMedication(med.category || ""));

      for (const med of controllerMeds) {
        const medName = decrypt(med.name);

        // Skip PRN medications from adherence tracking
        if (isPRNMedication(med.frequency || "")) {
          console.log(`Medication ${medName} (Patient ID: ${patient.id}) is PRN. Skipping adherence alert.`);
          continue;
        }

        // Skip weekly adherence alerts for low-frequency multi-week/monthly medications (biologics)
        const freqLower = (med.frequency || "").toLowerCase();
        const catLower = (med.category || "").toLowerCase();
        const isLowFrequency = catLower.includes("biologic") || 
                               freqLower.includes("every 2 weeks") || 
                               freqLower.includes("every 4 weeks") || 
                               freqLower.includes("every 2-4 weeks") || 
                               freqLower.includes("monthly");

        if (isLowFrequency) {
          console.log(`Medication ${medName} (Patient ID: ${patient.id}) is a biologic/low-frequency therapy. Skipping weekly adherence alert.`);
          
          // Clean up any legacy false non-adherence alerts for this low-frequency medication
          await db.delete(schema.alerts)
            .where(and(
              eq(schema.alerts.patientMedicationId, med.id),
              eq(schema.alerts.alertType, "medication_non_adherence"),
              eq(schema.alerts.status, "active")
            ));
            
          continue;
        }

        // 4. Calculate adherence window for last 7 days
        const { windowStartDate, windowEndDate, totalDays } = calculateAdherenceWindow(
          med.startDate || med.createdAt,
          7,
          today
        );

        if (totalDays === 0) {
          console.log(`Medication ${medName} (Patient ID: ${patient.id}) has 0 days in scheduled window. Skipping.`);
          continue;
        }

        // 5. Query all logs within the 7-day window
        const logs = await db
          .select({
            status: schema.medicationLogs.status,
            logDate: sql<string>`DATE(${schema.medicationLogs.loggedAt} AT TIME ZONE 'UTC')`
          })
          .from(schema.medicationLogs)
          .where(and(
            eq(schema.medicationLogs.medicationId, med.id),
            between(
              sql`DATE(${schema.medicationLogs.loggedAt} AT TIME ZONE 'UTC')`, 
              windowStartDate.toISOString().split('T')[0], 
              windowEndDate.toISOString().split('T')[0]
            )
          ));

        // Count unique logged days
        const uniqueLoggedDates = new Set(logs.map(l => l.logDate));
        const loggedDaysCount = uniqueLoggedDates.size;

        // Add Insufficient Data Constraint:
        // If daily medication has logged < 3 unique calendar days in the last 7 days, skip the weekly adherence alert.
        const isDaily = freqLower.includes("daily") || freqLower.includes("qday") || freqLower.includes("day") || freqLower.includes("times");
        if (isDaily && loggedDaysCount < 3) {
          console.log(`Medication ${medName} (Patient ID: ${patient.id}) - Only logged ${loggedDaysCount}/7 days. Skipping weekly adherence alert due to insufficient data.`);
          continue;
        }

        const takenCount = logs.filter(l => l.status === 'taken').length;
        const totalLoggedCount = logs.length;
        
        // Corrected Formula: (Taken / Logged) * 100
        const adherence = totalLoggedCount > 0 ? (takenCount / totalLoggedCount) * 100 : 0;

        console.log(`Medication ${medName} (Patient ID: ${patient.id}) - Adherence: ${adherence.toFixed(1)}% (${takenCount}/${totalLoggedCount} logs, ${loggedDaysCount} unique logged days)`);

        if (adherence < 80) {
          // Trigger or update Non-Adherence Alert!
          const [existingAlert] = await db
            .select()
            .from(schema.alerts)
            .where(
              and(
                eq(schema.alerts.patientId, patient.id),
                eq(schema.alerts.patientMedicationId, med.id),
                eq(schema.alerts.alertType, "medication_non_adherence"),
                eq(schema.alerts.status, "active")
              )
            )
            .limit(1);

          const description = `${patientName} weekly adherence to ${medName} is ${Math.round(adherence)}% (below 80% threshold).`;

          if (existingAlert) {
            console.log(`Updating active alert for Patient ID: ${patient.id} - Medication ID: ${med.id}`);
            await db
              .update(schema.alerts)
              .set({
                lastTriggeredAt: new Date(),
                description: encrypt(description),
              })
              .where(eq(schema.alerts.id, existingAlert.id));
          } else {
            console.log(`Creating new active alert for Patient ID: ${patient.id} - Medication ID: ${med.id}`);
            await db.insert(schema.alerts).values({
              patientId: patient.id,
              patientMedicationId: med.id,
              alertType: "medication_non_adherence",
              severity: "High",
              status: "active",
              description: encrypt(description),
              lastTriggeredAt: new Date(),
            });
          }
        }
      }
    }

    console.log("Nightly Medication Adherence Check completed successfully!");
  } catch (error) {
    console.error("Nightly adherence check failed:", error);
  } finally {
    if (!process.argv.includes("--watch")) {
      await pool.end();
    }
  }
}

// Run the check once. If --watch is passed, repeat every hour for monitoring.
run().then(() => {
  if (process.argv.includes("--watch")) {
    console.log("Watch mode enabled. Repeating adherence check every hour...");
    setInterval(() => {
      run();
    }, 60 * 60 * 1000);
  }
});
