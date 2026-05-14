import { db } from "../../db";
import { medicationCatalog } from "../../db/schema/medication.schema";
import { patientMedications, medicationLogs, medicationReminders } from "../../db/schema/tracking.schema";
import { patients, clinicians, patientClinicianAssignments } from "../../db/schema/profile.schema";
import { eq, and, desc, between, sql } from "drizzle-orm";
import { encrypt, decrypt, hashForLookup } from "../../utils/encryption";
import { LogMedicationInput } from "./medication.validation";
import { calculateAdherenceWindow, formatAdherencePercentage } from "../../utils/adherence";

export interface AddMedicationInput {
  medicationId?: string; // Optional catalog link
  name: string;          // Encrypted in DB
  category: string;      // Required for UI grouping
  dose: string;          // Encrypted in DB
  route?: string;        // Auto-filled from catalog if ID exists
  frequency?: string;    // Auto-filled from catalog if ID exists
  startDate?: string;
  endDate?: string;
}

export class MedicationService {

// ----------------------------------GET /medications/catalog--------------------------------------------------
  async getCatalog() {
    const catalog = await db.select().from(medicationCatalog);
    
    // Group by category 
    const grouped = catalog.reduce((acc: Record<string, any[]>, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push({
        id: item.id,
        name: item.name,
        genericName: item.genericName,
        brandNames: item.brandNames,
        subCategory: item.subCategory,
        route: item.route,
        standardDose: item.standardDose,
        availableStrengths: item.availableStrengths,
        frequency: item.defaultFrequency,
        clinicalNotes: item.clinicalNotes
      });
      return acc;
    }, {});

    return grouped;
  }

//  -------------------------------------------- POST /medications---------------------------------------------------------
  async addMedicationToPlan(userId: string, input: AddMedicationInput) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    let finalCategory: string | undefined = input.category;
    let finalRoute = input.route;
    let finalFrequency = input.frequency;

    // Auto-fill from catalog if ID is provided
    if (input.medicationId) {
      const [catalogItem] = await db.select().from(medicationCatalog)
        .where(eq(medicationCatalog.id, input.medicationId)).limit(1);
      
      if (catalogItem) {
        finalCategory = finalCategory || catalogItem.category || undefined;
        finalRoute = finalRoute || catalogItem.route || undefined;
        finalFrequency = finalFrequency || catalogItem.defaultFrequency || undefined;
      }
    }

    if (!finalCategory || !finalFrequency) {
      throw new Error("CATEGORY_AND_FREQUENCY_REQUIRED_FOR_CUSTOM_MEDICATION");
    }

    // Duplicate check
    const nameHash = hashForLookup(input.name);
    const doseHash = hashForLookup(input.dose);

    const [existing] = await db.select()
      .from(patientMedications)
      .where(and(
        eq(patientMedications.patientId, patient.id),
        eq(patientMedications.nameHash, nameHash),
        eq(patientMedications.doseHash, doseHash),
        eq(patientMedications.category, finalCategory),
        eq(patientMedications.frequency, finalFrequency),
        eq(patientMedications.active, true)
      ))
      .limit(1);

    if (existing) {
      throw new Error("MEDICATION_ALREADY_EXISTS_IN_PLAN");
    }

    const [newMed] = await db.insert(patientMedications).values({
      patientId: patient.id,
      medicationId: input.medicationId,
      name: encrypt(input.name),
      nameHash,
      dose: encrypt(input.dose),
      doseHash,
      category: finalCategory as string,
      route: finalRoute || null,
      frequency: finalFrequency as string,
      startDate: input.startDate,
      endDate: input.endDate,
      active: true
    }).returning();

    return {
      ...newMed,
      name: input.name, 
      dose: input.dose
    };
  }

  // --------------------------------------------------------GET /medications -------------------------------------------------------
  async getMedicationPlan(userId: string) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    const meds = await db.select().from(patientMedications)
      .where(and(
        eq(patientMedications.patientId, patient.id),
        eq(patientMedications.active, true)
      ));

    return meds.map(m => ({
      id: m.id,
      medicationId: m.medicationId,
      category: m.category,
      name: decrypt(m.name),
      dose: decrypt(m.dose),
      route: m.route,
      frequency: m.frequency,
      startDate: m.startDate,
      endDate: m.endDate,
      createdAt: m.createdAt
    }));
  }
//
// -------------------------------------- DELETE /medications/:id ---------------------------------------------------
  async deleteMedicationFromPlan(userId: string, id: string) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    const result = await db.update(patientMedications)
      .set({ active: false, updatedAt: new Date() })
      .where(and(
        eq(patientMedications.id, id),
        eq(patientMedications.patientId, patient.id)
      )).returning();

    if (result.length === 0) throw new Error("MEDICATION_NOT_FOUND_OR_UNAUTHORIZED");

    await db.delete(medicationReminders)
      .where(eq(medicationReminders.medicationId, id));

    return { success: true };
  }

  // ---------------------------------- POST /medications/logs ------------------------------------------
  async logMedication(userId: string, input: LogMedicationInput) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    const [med] = await db.select().from(patientMedications)
      .where(and(
        eq(patientMedications.id, input.medicationId),
        eq(patientMedications.patientId, patient.id)
      )).limit(1);

    if (!med) throw new Error("MEDICATION_NOT_FOUND_OR_UNAUTHORIZED");

    const [log] = await db.insert(medicationLogs).values({
      patientId: patient.id,
      medicationId: input.medicationId,
      status: input.status,
      scheduledFor: null,
      takenTime: input.takenTime ? new Date(input.takenTime) : null,
      missedReason: input.missedReason || null,
    }).returning();

    const [reminder] = await db.select({ time: medicationReminders.reminderTime })
      .from(medicationReminders)
      .where(eq(medicationReminders.medicationId, input.medicationId))
      .limit(1);

    return {
      ...log,
      scheduledFor: reminder?.time || null
    };
  }

  // ---------------------------------- GET /medications/logs -------------------------------------------
  async getMedicationLogs(userId: string, filters: { startDate?: string, endDate?: string }) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    const conditions = [eq(medicationLogs.patientId, patient.id)];

    if (filters.startDate && filters.endDate) {
      conditions.push(between(
        medicationLogs.loggedAt, 
        new Date(filters.startDate), 
        new Date(filters.endDate)
      ));
    }

    const results = await db.select({
      id: medicationLogs.id,
      status: medicationLogs.status,
      scheduledFor: medicationLogs.scheduledFor,
      takenTime: medicationLogs.takenTime,
      missedReason: medicationLogs.missedReason,
      medicationName: patientMedications.name,
      reminderTime: sql<string>`(SELECT reminder_time FROM medication_reminders WHERE medication_id = ${medicationLogs.medicationId} LIMIT 1)`
    })
    .from(medicationLogs)
    .innerJoin(patientMedications, eq(medicationLogs.medicationId, patientMedications.id))
    .where(and(...conditions))
    .orderBy(desc(medicationLogs.createdAt));

    return results.map(r => ({
      ...r,
      medicationName: decrypt(r.medicationName),
      scheduledFor: r.scheduledFor ? r.scheduledFor.toISOString().split('T')[1].substring(0, 5) : (r.reminderTime || null)
    }));
  }

  // ---------------------------------- POST /medications/reminders -------------------------------------
  async createReminder(userId: string, data: { medicationId: string, time: string, frequency?: string }) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    const [medication] = await db.select()
      .from(patientMedications)
      .where(and(
        eq(patientMedications.id, data.medicationId),
        eq(patientMedications.patientId, patient.id)
      ))
      .limit(1);

    if (!medication) throw new Error("MEDICATION_NOT_FOUND_OR_UNAUTHORIZED");

    const [existing] = await db.select()
      .from(medicationReminders)
      .where(and(
        eq(medicationReminders.medicationId, data.medicationId),
        eq(medicationReminders.reminderTime, data.time)
      ))
      .limit(1);

    if (existing) throw new Error("REMINDER_ALREADY_EXISTS");

    const [newReminder] = await db.insert(medicationReminders)
      .values({
        patientId: patient.id,
        medicationId: data.medicationId,
        reminderTime: data.time,
        frequency: data.frequency || "DAILY",
      })
      .returning();

    return newReminder;
  }

  // ---------------------------------- GET /medications/reminders --------------------------------------
  async getReminders(userId: string) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    const reminders = await db.select({
      id: medicationReminders.id,
      medicationId: medicationReminders.medicationId,
      medicationName: patientMedications.name,
      time: medicationReminders.reminderTime,
      active: medicationReminders.isEnabled,
      frequency: medicationReminders.frequency,
    })
    .from(medicationReminders)
    .innerJoin(patientMedications, eq(medicationReminders.medicationId, patientMedications.id))
    .where(eq(medicationReminders.patientId, patient.id))
    .orderBy(desc(medicationReminders.createdAt));

    return reminders.map(r => ({
      ...r,
      medicationName: decrypt(r.medicationName),
    }));
  }

  // ---------------------------------- PATCH /medications/reminders/:id --------------------------------
  async updateReminder(userId: string, reminderId: string, data: { active?: boolean, time?: string }) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    const [reminder] = await db.select()
      .from(medicationReminders)
      .where(and(
        eq(medicationReminders.id, reminderId),
        eq(medicationReminders.patientId, patient.id)
      ))
      .limit(1);

    if (!reminder) throw new Error("REMINDER_NOT_FOUND_OR_UNAUTHORIZED");

    if (data.time && data.time !== reminder.reminderTime) {
      const [existing] = await db.select()
        .from(medicationReminders)
        .where(and(
          eq(medicationReminders.medicationId, reminder.medicationId),
          eq(medicationReminders.reminderTime, data.time)
        ))
        .limit(1);
      
      if (existing) throw new Error("REMINDER_ALREADY_EXISTS");
    }

    const [updated] = await db.update(medicationReminders)
      .set({ 
        isEnabled: data.active !== undefined ? data.active : reminder.isEnabled,
        reminderTime: data.time || reminder.reminderTime,
        updatedAt: new Date()
      })
      .where(eq(medicationReminders.id, reminderId))
      .returning();

    return updated;
  }

  // ---------------------------------- DELETE /medications/reminders/:id -------------------------------
  async deleteReminder(userId: string, reminderId: string) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    const result = await db.delete(medicationReminders)
      .where(and(
        eq(medicationReminders.id, reminderId),
        eq(medicationReminders.patientId, patient.id)
      ))
      .returning();

    if (result.length === 0) throw new Error("REMINDER_NOT_FOUND_OR_UNAUTHORIZED");

    return { success: true };
  }

  // ---------------------------------- GET /medications/adherence --------------------------------------
  async getAdherenceMetrics(userId: string, role: string, patientId?: string, rangeDays?: number) {
    let targetPatientId: string;

    if (role === "clinician") {
      if (!patientId) throw new Error("PATIENT_ID_REQUIRED_FOR_CLINICIANS");
      
      const [clinician] = await db.select().from(clinicians).where(eq(clinicians.userId, userId)).limit(1);
      if (!clinician) throw new Error("CLINICIAN_NOT_FOUND");

      const [assignment] = await db.select()
        .from(patientClinicianAssignments)
        .where(and(
          eq(patientClinicianAssignments.clinicianId, clinician.id),
          eq(patientClinicianAssignments.patientId, patientId)
        )).limit(1);

      if (!assignment) throw new Error("UNAUTHORIZED_ACCESS_TO_PATIENT_DATA");
      targetPatientId = patientId;
    } else {
      const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
      if (!patient) throw new Error("PATIENT_NOT_FOUND");
      targetPatientId = patient.id;
    }

    const meds = await db.select().from(patientMedications)
      .where(and(
        eq(patientMedications.patientId, targetPatientId),
        eq(patientMedications.active, true)
      ));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const metrics = await Promise.all(meds.map(async (m) => {
      // 3.1 Calculate Window using common utility
      const { windowStartDate, windowEndDate, totalDays } = calculateAdherenceWindow(
        m.startDate || m.createdAt,
        rangeDays
      );

      // 3.2 Query unique days logged as 'taken' within the window
      const uniqueDaysTaken = await db
        .select({
          logDate: sql<string>`DATE(${medicationLogs.loggedAt})`
        })
        .from(medicationLogs)
        .where(and(
          eq(medicationLogs.medicationId, m.id),
          eq(medicationLogs.status, 'taken'),
          between(
            sql`DATE(${medicationLogs.loggedAt})`, 
            windowStartDate.toISOString().split('T')[0], 
            windowEndDate.toISOString().split('T')[0]
          )
        ))
        .groupBy(sql`DATE(${medicationLogs.loggedAt})`);

      const daysTaken = uniqueDaysTaken.length;
      const adherencePercentage = formatAdherencePercentage(daysTaken, totalDays);

      return {
        id: m.id,
        name: decrypt(m.name),
        startDate: new Date(m.startDate || m.createdAt).toISOString().split('T')[0],
        calculationWindow: {
          start: windowStartDate.toISOString().split('T')[0],
          end: windowEndDate.toISOString().split('T')[0],
          totalDays
        },
        daysTaken,
        adherencePercentage
      };
    }));

    // 4. Calculate Overall Adherence (Average of all medications)
    const overallPercentage = metrics.length > 0 
      ? metrics.reduce((acc, m) => acc + m.adherencePercentage, 0) / metrics.length 
      : 0;

    return {
      overallAdherence: parseFloat(overallPercentage.toFixed(2)),
      rangeDays: rangeDays || "all-time",
      medications: metrics
    };
  }
}
