import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { diagnoses } from "../schema/profile.schema";
import { loadSecrets, ENV } from "../../config/env";

const seedData = [
  { name: "Allergic Rhinitis", icd10Code: "J30.1", category: "allergic_rhinitis" },
  { name: "Asthma", icd10Code: "J45.20", category: "asthma" },
  { name: "Allergic Rhinitis + Asthma", icd10Code: "J30.1, J45.20", category: "allergic_rhinitis" },
  { name: "Chronic Urticaria", icd10Code: "L50.9", category: "eczema" },
  { name: "Food Allergy", icd10Code: "Z91.010", category: "food_allergy" },
  { name: "Other Allergy/Immune Condition", icd10Code: "", category: "other" }
];

async function seed() {
  await loadSecrets();

  const pool = new Pool({
    connectionString: ENV.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const db = drizzle(pool);

  console.log("Seeding diagnoses...");
  
  for (const item of seedData) {
    await db.insert(diagnoses).values({
      name: item.name,
      icd10Code: item.icd10Code,
      category: item.category,
    }).onConflictDoUpdate({
      target: diagnoses.icd10Code,
      set: { name: item.name, category: item.category }
    });
  }

  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch(console.error);
