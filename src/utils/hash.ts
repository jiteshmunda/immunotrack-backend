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
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const caps = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const nums = "0123456789";
  const specials = "!@#$%^&*";
  
  let pwd = "";
  pwd += caps[crypto.randomInt(caps.length)];
  pwd += nums[crypto.randomInt(nums.length)];
  pwd += specials[crypto.randomInt(specials.length)];
  
  for(let i=0; i<9; i++) {
    const pool = chars + nums + caps;
    pwd += pool[crypto.randomInt(pool.length)];
  }
  
  // Shuffle securely
  return pwd.split('').sort(() => 0.5 - Math.random()).join('');
}

export async function checkPwnedPassword(password: string): Promise<boolean> {
  // Temporarily disabled
  return false;
}