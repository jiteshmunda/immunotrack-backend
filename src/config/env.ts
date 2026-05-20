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
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:3000",
  project_id: process.env.project_id || "",
  client_email: process.env.client_email || "",
  private_key: process.env.private_key || "",
  AWS_REGION: process.env.AWS_REGION || "us-east-1",
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || "",
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || "",
  SES_FROM_EMAIL: process.env.SES_FROM_EMAIL || "",
};

/**
 * Loads secrets from AWS Secrets Manager and populates the ENV object.
 * @param force If true, re-fetches secrets even if they are already loaded.
 */
export async function loadSecrets(force: boolean = false) {
  const secretName = process.env.AWS_SECRET_NAME;
  const dbSecretName = process.env.DB_AWS_SECRET_NAME;
  const region = process.env.AWS_REGION || "eu-north-1";

  if (!force && ENV.DATABASE_URL && !secretName && !dbSecretName) return;

  const fetchAndApply = async (name: string) => {
    const secrets = await getSecretsFromAWS(name, region);
    Object.assign(ENV, secrets);
    
    for (const [key, value] of Object.entries(secrets)) {
      if (typeof value === "string") process.env[key] = value;
    }
    return secrets;
  };

  try {
    if (secretName) await fetchAndApply(secretName);
    if (dbSecretName) await fetchAndApply(dbSecretName);

    const host = (ENV as any).DATABASE_HOST || (ENV as any).DATABASE_URL_HOST || process.env.DB_HOST || (ENV as any).host;
    const user = (ENV as any).username || (ENV as any).user;
    const pass = (ENV as any).password;
    const dbname = (ENV as any).dbname || (ENV as any).database || (ENV as any).dbInstanceIdentifier || "";
    const port = (ENV as any).port || 5432;

    if (!ENV.DATABASE_URL && host && user && pass) {
      let cleanHost = host.replace(/^postgresql?:\/\//, "").split(":")[0].split("/")[0];
      ENV.DATABASE_URL = `postgresql://${user}:${encodeURIComponent(pass)}@${cleanHost}:${port}/${dbname}`;
    }

    if (ENV.PORT) ENV.PORT = typeof ENV.PORT === "string" ? parseInt(ENV.PORT) : ENV.PORT;
    if (ENV.BCRYPT_ROUNDS) ENV.BCRYPT_ROUNDS = typeof ENV.BCRYPT_ROUNDS === "string" ? parseInt(ENV.BCRYPT_ROUNDS) : ENV.BCRYPT_ROUNDS;

    console.log("[Config] Secrets loaded successfully from AWS Secrets Manager.");
  } catch (error) {
    console.error("[Config] Failed to load secrets from AWS. Falling back to environment variables.");
    if (process.env.NODE_ENV === "production") {
      throw new Error("Critical: Could not load secrets from AWS in production environment.");
    }
  }

  // Validate required fields after loading
  const required = [
    "DATABASE_URL", 
    "ENCRYPTION_KEY", 
    "JWT_SECRET", 
    "ADMIN_EMAIL", 
    "ADMIN_PASSWORD", 
    "ADMIN_NAME",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "SES_FROM_EMAIL"
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
