import jwt from "jsonwebtoken";
import { ENV } from "../config/env";

interface TokenPayload {
  userId: string;
  role: string;
  sid: string; // Session ID for revocation
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, ENV.JWT_SECRET, {
    expiresIn: "15m", // Short-lived access token
  });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, ENV.JWT_SECRET, {
    expiresIn: "7d", // Longer-lived refresh token
  });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, ENV.JWT_SECRET) as TokenPayload;
}
