import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import path from "path";
import { swaggerSpec } from "./config/swagger";
import { ENV } from "./config/env"
import router from "./routes";
import { trackMetrics } from "./common/middleware/metrics.middleware";

const app = express();

// Track API Metrics globally
app.use(trackMetrics);

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

// Static well-known files for deep linking
app.use("/.well-known", express.static(path.join(__dirname, "../deep-link-server-files/well-known"), {
  setHeaders: (res, filePath) => {
    // Apple requires no extension but application/json content type
    if (filePath.endsWith("apple-app-site-association")) {
      res.setHeader("Content-Type", "application/json");
    }
  }
}));

// Web Landing Page /invite
app.get('/invite', (req, res) => {
  const code = req.query.code as string;
  const ua = req.headers['user-agent'] || '';

  if (/android/i.test(ua)) {
    const referrer = encodeURIComponent(`invite_code=${code}`);
    return res.redirect(
      `https://play.google.com/store/apps/details?id=ai.immunotrack.app&referrer=${referrer}`
    );
  }

 if (/iphone|ipad|ipod/i.test(ua)) {
  return res.redirect(
    "https://apps.apple.com/app/id6766438796"
  );
}

  // Desktop fallback — show a download page with the code.
  res.send(`
    <html>
      <head>
        <title>Get ImmunoTrack</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; text-align: center; padding: 20px; color: #1B1E54; background: #f4f6f8; }
          .container { max-width: 500px; margin: 40px auto; background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(27,30,84,0.05); }
          .code { font-size: 32px; font-weight: 800; letter-spacing: 2px; font-family: monospace; padding: 20px; background: #f8fafc; border: 2px dashed #CBD5E1; border-radius: 12px; margin: 20px 0; -webkit-user-select: all; user-select: all; }
          h1 { color: #1B1E54; }
          p { color: #334155; line-height: 1.6; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Get ImmunoTrack</h1>
          <p>Your invite code is:</p>
          <div class="code">${code || 'NONE'}</div>
          <p>Download the ImmunoTrack app from the App Store or Google Play Store, then enter this code to get started.</p>
        </div>
      </body>
    </html>
  `);
});

// Documentation
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
// Health Check
app.use("/health", (req, res) => {
  res.json({ status: "ok" });
});

// API Routes
app.use("/api/v1", router);

export default app;

