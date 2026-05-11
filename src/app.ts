import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger";
import { ENV } from "./config/env"
import router from "./routes";

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

const allowedOrigins = (ENV.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

console.log("[CORS] Allowed Origins:", allowedOrigins);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      
      const normalizedOrigin = origin.trim().replace(/\/$/, "");
      const isAllowed = allowedOrigins.some(allowed => 
        allowed.trim().replace(/\/$/, "").toLowerCase() === normalizedOrigin.toLowerCase()
      );

      if (!isAllowed) {
        console.error(`[CORS Error] Origin "${origin}" not allowed. Allowed origins:`, allowedOrigins);
        const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  })
);
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

// Documentation
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
// Health Check
app.use("/health", (req, res) => {
  res.json({ status: "ok" });
});

// API Routes
app.use("/api/v1", router);

export default app;

