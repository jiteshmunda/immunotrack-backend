import crypto from "crypto";
import { ENV } from "../config/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENV.ENCRYPTION_KEY), iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  return iv.toString("hex") + ":" + authTag + ":" + encrypted;
}

export function decrypt(text: string): string {
  if (!text || typeof text !== "string") return text;

  const parts = text.split(":");
  if (parts.length !== 3) {
    return text;
  }

  const [ivHex, authTagHex, encryptedHex] = parts;

  try {
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENV.ENCRYPTION_KEY), iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, undefined, "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error: any) {
    console.error("Decryption failed for value:", text, error.message);
    throw new Error("DECRYPTION_FAILED");
  }
}

// One-way hash for safe DB lookups — never decryptable
export function hashForLookup(value: string): string {
  return crypto
    .createHmac("sha256", ENV.ENCRYPTION_KEY)
    .update(value.toLowerCase().trim())
    .digest("hex");
}