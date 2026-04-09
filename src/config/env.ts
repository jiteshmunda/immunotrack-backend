import dotenv from "dotenv";
dotenv.config();

export const ENV = {
  DATABASE_URL: process.env.DATABASE_URL!,
  PORT: parseInt(process.env.PORT || "3000"),
  NODE_ENV: process.env.NODE_ENV || "development",
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY!,
  JWT_SECRET: process.env.JWT_SECRET!,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || "12"),
};

const required = ["DATABASE_URL", "ENCRYPTION_KEY", "JWT_SECRET"] as const;
for (const key of required) {
  if (!process.env[key]) throw new Error("Missing required env var: " + key);
}

if (ENV.ENCRYPTION_KEY.length !== 32) {
  throw new Error("ENCRYPTION_KEY must be exactly 32 characters");
}
