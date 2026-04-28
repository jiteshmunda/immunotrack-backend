import { db } from "../index";
import { medicationCatalog } from "../schema/medication.schema";
import { medicationData } from "./medication-data";
import { count } from "drizzle-orm";

export async function seedMedications() {
  console.log("Starting Medication Catalog seeding...");

  // 1. Check if data already exists (idempotency check)
  const existingCountResult = await db.select({ value: count() }).from(medicationCatalog);
  const existingCount = existingCountResult[0].value;

  if (existingCount > 0) {
    console.warn(`Skipping seed: ${existingCount} medications already exist in the catalog.`);
    // As per user request: throw error if it exists (or skip)
    // We will throw a specific message to indicate it's already seeded
    throw new Error("Medication catalog is already seeded. Please clear the table manually if you want to re-run.");
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
