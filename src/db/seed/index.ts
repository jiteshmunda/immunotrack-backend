import { loadSecrets } from "../../config/env";

async function main() {
  console.log("🏁 Starting total database seed...");
  
  try {
    // 1. Load configuration (from .env or AWS Secrets Manager)
    await loadSecrets();

    // 2. Dynamically import seeders AFTER secrets are loaded
    const { seedRoles } = await import("./roles.seed");
    const { seedAdmin } = await import("./admin.seed");
    const { seedMedications } = await import("./medications.seed");
    // const { migrateToAdmin } = await import("./migrate-to-admin");

    await seedRoles();
    await seedAdmin();
    await seedMedications();
    // await migrateToAdmin();
    
    console.log("✅ Seeding completed successfully!");
    process.exit(0);
  } catch (error: any) {
    console.error("❌ Seeding failed!");
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
