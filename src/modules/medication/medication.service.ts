import { db } from "../../db";
import { medicationCatalog } from "../../db/schema/medication.schema";
import { patientMedications } from "../../db/schema/tracking.schema";
import { patients } from "../../db/schema/profile.schema";
import { eq, and, desc, between } from "drizzle-orm";
import { encrypt, decrypt } from "../../utils/encryption";
import { medicationLogs } from "../../db/schema/tracking.schema";
import { LogMedicationInput } from "./medication.validation";

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

    const [newMed] = await db.insert(patientMedications).values({
      patientId: patient.id,
      medicationId: input.medicationId,
      name: encrypt(input.name),
      category: finalCategory as string,
      dose: encrypt(input.dose),
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

    // hard delete here 
    const result = await db.delete(patientMedications)
      .where(and(
        eq(patientMedications.id, id),
        eq(patientMedications.patientId, patient.id)
      )).returning();

    if (result.length === 0) throw new Error("MEDICATION_NOT_FOUND_OR_UNAUTHORIZED");

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
      scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
      takenTime: input.takenTime ? new Date(input.takenTime) : null,
      missedReason: input.missedReason || null,
    }).returning();

    return log;
  }

  // ---------------------------------- GET /medications/logs -------------------------------------------
  async getMedicationLogs(userId: string, filters: { startDate?: string, endDate?: string }) {
    const [patient] = await db.select().from(patients).where(eq(patients.userId, userId)).limit(1);
    if (!patient) throw new Error("PATIENT_NOT_FOUND");

    const conditions = [eq(medicationLogs.patientId, patient.id)];

    if (filters.startDate && filters.endDate) {
      conditions.push(between(
        medicationLogs.scheduledFor, 
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
    })
    .from(medicationLogs)
    .innerJoin(patientMedications, eq(medicationLogs.medicationId, patientMedications.id))
    .where(and(...conditions))
    .orderBy(desc(medicationLogs.scheduledFor));

    return results.map(r => ({
      ...r,
      medicationName: decrypt(r.medicationName),
    }));
  }
}
