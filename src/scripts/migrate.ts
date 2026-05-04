import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { ENV, loadSecrets } from "../config/env";

async function runMigrations() {
  console.log("--- Database Migration ---");
  
  // 1. Load configuration (from .env or AWS Secrets Manager)
  await loadSecrets();

  console.log(`Target Database: ${ENV.DATABASE_URL.split('@')[1] || 'Local'}`);

  const pool = new Pool({
    connectionString: ENV.DATABASE_URL,
    ssl: ENV.NODE_ENV === "production" ? { rejectUnauthorized: true } : false,
  });

  const db = drizzle(pool);

  await migrate(db, { migrationsFolder: "./src/db/migrations" });

  console.log("All migrations applied successfully!");
  await pool.end();
  process.exit(0);
}

runMigrations().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});