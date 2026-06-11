import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { ENV, loadSecrets } from "../config/env";

let pool: Pool;

function createPool() {
  return new Pool({
    connectionString: ENV.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    connectionTimeoutMillis: 20000,
  });
}

pool = createPool();

// RE-FETCH ON ROTATION: If the password changes in AWS, this handles it
pool.on("error", async (err: any) => {
  if (err.code === "28P01" || err.message.includes("password authentication failed")) {
    console.log("[DB] Password rotation detected. Refreshing secrets...");
    try {
      await loadSecrets(true);
      const oldPool = pool;
      pool = createPool();
      await oldPool.end();
      console.log("[DB] Successfully re-connected with the new password.");
    } catch (refreshErr) {
      console.error("[DB] Failed to refresh password:", refreshErr);
    }
  }
});

pool.connect()
  .then((client) => {
    console.log("db connected successfully");
    client.release();
  })
  .catch((err) => {
    console.error("Database connection error:", err.message);
  });

export const db = drizzle(pool, { schema, logger: false });