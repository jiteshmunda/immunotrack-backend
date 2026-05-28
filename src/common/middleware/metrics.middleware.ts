import { Request, Response, NextFunction } from "express";

let totalResponseTimeMs = 0;
let requestCount = 0;

export function trackMetrics(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  
  res.on("finish", () => {
    const duration = Date.now() - start;
    totalResponseTimeMs += duration;
    requestCount++;
    
    // Prevent memory/integer overflow by resetting occasionally
    if (requestCount > 100000) {
      totalResponseTimeMs = totalResponseTimeMs / requestCount;
      requestCount = 1;
    }
  });

  next();
}

export function getAverageResponseTime(): number {
  if (requestCount === 0) return 0;
  return Math.round(totalResponseTimeMs / requestCount);
}
