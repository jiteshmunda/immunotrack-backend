import { seedRoles } from "./roles.seed";
import { seedAdmin } from "./admin.seed";

async function main() {
  console.log("🏁 Starting total database seed...");
  
  try {
    await seedRoles();
    await seedAdmin();
    // Add other seeds here as they are created
    
    console.log("Seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exit(1);
  }
}

main();
