import bcrypt from "bcryptjs";
import { ENV } from "../config/env";
import crypto from "crypto";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ENV.BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function generateTempPassword(): string {
  const randomBytes = crypto.randomBytes(6).toString("hex"); // 12 chars lowercase & numbers
  return `Temp${randomBytes}!`; // Ensures uppercase, lowercase, numbers, and special character
}

export async function checkPwnedPassword(password: string): Promise<boolean> {
  const sha1 = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.substring(0, 5);
  const suffix = sha1.substring(5);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000); // 2-second timeout

  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) return false;

    const text = await response.text();
    const hashes = text.split('\n');

    for (const line of hashes) {
      const [h] = line.split(':');
      if (h === suffix) {
        return true;
      }
    }
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.warn("HIBP check timed out after 2 seconds. Failing open.");
    } else {
      console.error("Error checking pwned passwords:", error);
    }
  }
  return false;
}