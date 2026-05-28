import { db } from "../index";
import { medicationCatalog } from "../schema/medication.schema";
import { medicationData } from "./medication-Catalog";

import { count } from "drizzle-orm";

export async function seedMedications() {
  console.log("Starting Medication Catalog seeding...");

  // 1. Check if data already exists (idempotency check)
  const existingCountResult = await db.select({ value: count() }).from(medicationCatalog);
  const existingCount = existingCountResult[0].value;

  if (existingCount > 0) {
    console.warn(`Skipping seed: ${existingCount} medications already exist in the catalog.`);
    return;
  }

  // 2. Insert the data
  console.log(`Inserting ${medicationData.length} medications...`);
  
  try {
    await db.insert(medicationCatalog).values(medicationData);
    console.log("Medication catalog seeded successfully!");
  } catch (error) {
    console.error("Error seeding medications:", error);
    throw error;
  }
}
