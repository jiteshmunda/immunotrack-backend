import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { ENV } from "../config/env";

const pool = new Pool({
  connectionString: ENV.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
});
pool.connect()
  .then((client) => {
    console.log("db connected successfully");
    client.release();
  })
  .catch((err) => {
    console.error("Database connection error:", err);
  });

export const db = drizzle(pool, { schema, logger: false });