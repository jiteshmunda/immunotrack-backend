import dotenv from "dotenv";
import { getSecretsFromAWS } from "../utils/secrets";

dotenv.config();

export const ENV = {
  DATABASE_URL: process.env.DATABASE_URL || "",
  PORT: parseInt(process.env.PORT || "3000"),
  NODE_ENV: process.env.NODE_ENV || "development",
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || "",
  JWT_SECRET: process.env.JWT_SECRET || "",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || "12"),
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || "",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "",
  ADMIN_NAME: process.env.ADMIN_NAME || "",
};

export async function loadSecrets() {
  const secretName = process.env.AWS_SECRET_NAME;
  const region = process.env.AWS_REGION || "eu-north-1";

  if (secretName) {
    console.log(`[Config] Fetching secrets from AWS Secrets Manager: ${secretName}...`);
    try {
      const secrets = await getSecretsFromAWS(secretName, region);
      
      // Update ENV object with fetched secrets
      Object.assign(ENV, secrets);

      // Ensure numeric values are actually numbers (AWS returns strings)
      if (secrets.PORT) ENV.PORT = parseInt(secrets.PORT);
      if (secrets.BCRYPT_ROUNDS) ENV.BCRYPT_ROUNDS = parseInt(secrets.BCRYPT_ROUNDS);
      
      // Also update process.env for any other libraries that check it
      for (const [key, value] of Object.entries(secrets)) {
        process.env[key] = value as string;
      }
      
      console.log("[Config] Secrets loaded successfully from AWS.");
    } catch (error) {
      console.error("[Config] Failed to load secrets from AWS. Falling back to environment variables.");
      if (process.env.NODE_ENV === "production") {
        throw new Error("Critical: Could not load secrets from AWS in production environment.");
      }
    }
  }

  // Validate required fields
  const required = [
    "DATABASE_URL", 
    "ENCRYPTION_KEY", 
    "JWT_SECRET", 
    "ADMIN_EMAIL", 
    "ADMIN_PASSWORD", 
    "ADMIN_NAME"
  ] as const;

  for (const key of required) {
    if (!ENV[key as keyof typeof ENV]) {
      throw new Error(`Missing required configuration: ${key}. Ensure it is set in .env or AWS Secrets Manager.`);
    }
  }

  if (ENV.ENCRYPTION_KEY.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be exactly 32 characters");
  }
}
