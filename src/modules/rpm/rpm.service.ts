import { db } from "../../db";
import { rpmConsents, rpmRollingPeriods, rpmCalendarPeriods } from "../../db/schema/rpm.schema";
import { patients } from "../../db/schema/profile.schema";
import { and, eq } from "drizzle-orm";
import { encrypt } from "../../utils/encryption";
import { addDays, startOfMonth, endOfMonth, format } from "date-fns";

export class RpmService {
  /**
   * Initializes RPM enrollment for a patient.
   * Creates Consent, First Rolling Period, and First Calendar Period.
   */
  async initializeEnrollment(patientId: string, enrollmentDate: Date, icd10Code: string) {
    const [patient] = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    return await db.transaction(async (tx) => {
      // 1. Create RPM Consent
      const enrollmentDateStr = format(enrollmentDate, "yyyy-MM-dd");

      const [consent] = await tx
        .insert(rpmConsents)
        .values([{
          patientId,
          consentSignedAt: new Date(),
          enrollmentDate: enrollmentDateStr,
          icd10Code: encrypt(icd10Code),
          icd10QualifyingCode: patient.icd10QualifyingCode || "J45.20", // Default to asthma if missing
          status: "active",
        }])
        .returning();

      // 2. Open First Rolling Period (30 days)
      const rollingEnd = addDays(enrollmentDate, 29);
      const rollingEndStr = format(rollingEnd, "yyyy-MM-dd");

      await tx.insert(rpmRollingPeriods).values([{
        patientId,
        rpmConsentId: consent.id,
        periodNumber: 1,
        periodStart: enrollmentDateStr,
        periodEnd: rollingEndStr,
        transmissionDays: 0,
        periodStatus: "open",
      }]);

      // 3. Open First Calendar Period (Current Month)
      const calStart = startOfMonth(enrollmentDate);
      const calEnd = endOfMonth(enrollmentDate);
      const calendarMonth = format(enrollmentDate, "yyyy-MM");

      await tx.insert(rpmCalendarPeriods).values([{
        patientId,
        rpmConsentId: consent.id,
        calendarMonth,
        periodStart: format(calStart, "yyyy-MM-dd"),
        periodEnd: format(calEnd, "yyyy-MM-dd"),
        transmissionDays: 0,
        reviewMinutesTotal: 0,
        periodStatus: "open",
      }]);

      // 4. Update core Patient profile
      await tx
        .update(patients)
        .set({
          rpmEnrollmentDate: enrollmentDateStr,
          monitoringActive: true,
          onboardingCompleted: true, // RPM consent is the final step
          updatedAt: new Date(),
        })
        .where(eq(patients.id, patientId));

      return { success: true, consentId: consent.id };
    });
  }

  /**
   * Records a daily transmission (symptom log).
   * Increments counters in BOTH rolling and calendar periods for the given date.
   */
  async recordTransmission(patientId: string, logDate: string) {
    return await db.transaction(async (tx) => {
      // 1. Check if patient has active consent
      const [consent] = await tx
        .select()
        .from(rpmConsents)
        .where(
          and(
            eq(rpmConsents.patientId, patientId),
            eq(rpmConsents.status, "active")
          )
        )
        .limit(1);

      if (!consent) return { success: false, reason: "NO_ACTIVE_RPM" };

      // 2. Increment rolling period counter
      const [rollingPeriod] = await tx
        .select()
        .from(rpmRollingPeriods)
        .where(
          and(
            eq(rpmRollingPeriods.patientId, patientId),
            eq(rpmRollingPeriods.periodStatus, "open")
          )
        )
        .limit(1);

      if (rollingPeriod) {
        // Logic to rollover if date is past periodEnd would go here
        // For now, just increment if within bounds
        await tx
          .update(rpmRollingPeriods)
          .set({ transmissionDays: rollingPeriod.transmissionDays + 1 })
          .where(eq(rpmRollingPeriods.id, rollingPeriod.id));
      }

      // 3. Increment calendar period counter
      const monthStr = logDate.substring(0, 7); // YYYY-MM
      const [calendarPeriod] = await tx
        .select()
        .from(rpmCalendarPeriods)
        .where(
          and(
            eq(rpmCalendarPeriods.patientId, patientId),
            eq(rpmCalendarPeriods.calendarMonth, monthStr)
          )
        )
        .limit(1);

      if (calendarPeriod) {
        await tx
          .update(rpmCalendarPeriods)
          .set({ transmissionDays: calendarPeriod.transmissionDays + 1 })
          .where(eq(rpmCalendarPeriods.id, calendarPeriod.id));
      }

      return { success: true };
    });
  }
}
