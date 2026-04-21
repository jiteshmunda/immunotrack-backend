import bcrypt from "bcryptjs";
import { ENV } from "../config/env";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ENV.BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}