import { Pool } from "pg";
import { ENV, loadSecrets } from "../config/env";

async function addTempSecretColumn() {
  await loadSecrets();
  const pool = new Pool({
    connectionString: ENV.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const query = `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "temp_mfa_secret" text;`;

  try {
    const client = await pool.connect();
    console.log("Adding temp_mfa_secret column...");
    await client.query(query);
    console.log("temp_mfa_secret column added successfully!");
    client.release();
  } catch (err) {
    console.error("Error adding column:", err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

addTempSecretColumn();
