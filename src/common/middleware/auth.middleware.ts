import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../../utils/jwt";
import { db } from "../../db";
import { userSessions } from "../../db/schema/session.schema";
import { eq } from "drizzle-orm";
import { sendError } from "../../utils/response";

import { users } from "../../db/schema/user.schema";

export interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    role: string;
    sid: string;
  };
}

export async function authenticateJWT(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return sendError(res, "Missing or invalid authorization header", 401);
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyToken(token);

    // Stateful Revocation: Check if session still exists in DB and user is not archived
    const [sessionData] = await db
      .select({
        session: userSessions,
        userStatus: users.status
      })
      .from(userSessions)
      .innerJoin(users, eq(userSessions.userId, users.id))
      .where(eq(userSessions.id, decoded.sid))
      .limit(1);

    if (!sessionData) {
      const [activeSession] = await db
        .select()
        .from(userSessions)
        .where(eq(userSessions.userId, decoded.userId))
        .limit(1);

      if (activeSession) {
        return sendError(
          res,
          "Your session has expired. Please login again.",
          401
        );
      }
      return sendError(res, "Your session has expired. Please login again.", 401);
    }

    if (sessionData.userStatus === "archived") {
      return sendError(res, "Account archived. Please contact support.", 403);
    }

    (req as AuthenticatedRequest).user = decoded;
    next();
  } catch (error) {
    return sendError(res, "Invalid or expired token", 401);
  }
}

export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthenticatedRequest).user;

    if (!user || !allowedRoles.includes(user.role)) {
      return sendError(res, "Forbidden: Insufficient permissions", 403);
    }

    next();
  };
}
