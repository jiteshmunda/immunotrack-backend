import { db } from "../index";
import { medicationCatalog } from "../schema/medication.schema";
import { medicationData } from "./medication-Catalog";

export async function seedMedications() {
  console.log("Starting Medication Catalog seeding (UPSERT)...");

  console.log(`Inserting/Updating ${medicationData.length} medications...`);
  
  try {
    for (const med of medicationData) {
      await db.insert(medicationCatalog).values(med).onConflictDoUpdate({
        target: medicationCatalog.externalId,
        set: med
      });
    }
    console.log("Medication catalog seeded successfully!");
  } catch (error) {
    console.error("Error seeding medications:", error);
    throw error;
  }
}
