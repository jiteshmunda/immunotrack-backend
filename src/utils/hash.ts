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