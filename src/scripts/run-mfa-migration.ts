import { Pool } from "pg";
import { ENV, loadSecrets } from "../config/env";

async function runMfaDbUpdate() {
  console.log("--- Loading secrets and starting custom database update ---");
  await loadSecrets();

  console.log(`Target Database: ${ENV.DATABASE_URL.split('@')[1] || 'Local'}`);

  const pool = new Pool({
    connectionString: ENV.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const query = `
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfa_type" varchar(20) DEFAULT 'email' NOT NULL;
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfa_secret" text;
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfa_backup_codes" text;
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mfa_failed_attempts" integer DEFAULT 0 NOT NULL;
  `;

  try {
    const client = await pool.connect();
    console.log("Connected to database. Running schema update query...");
    await client.query(query);
    console.log("Schema update completed successfully (columns added if they didn't exist)!");
    client.release();
  } catch (err) {
    console.error("Error executing database update:", err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

runMfaDbUpdate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
