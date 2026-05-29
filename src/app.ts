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

app.get("/apple-app-site-association", (_req, res) => {
  res.type("application/json");
  res.sendFile(
    path.join(
      __dirname,
      "../deep-link-server-files/well-known/apple-app-site-association",
    ),
  );
});

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
    // ─────────────────────────────────────────────────────────────────────────
    // WHY THIS BLOCK EXISTS — read before changing anything here.
    //
    // BACKGROUND
    // ----------
    // We send invite emails with a Universal Link as the CTA button:
    //   https://dev-api.immunotrack.ai/invite?code=IMMU12345678
    //
    // A Universal Link is a normal HTTPS URL that Apple has configured (via
    // the apple-app-site-association file we serve at /.well-known/) to open
    // the ImmunoTrack app directly instead of a browser — no App Store detour,
    // no browser flash, just straight into the app.
    //
    // THE PROBLEM — two distinct iOS behaviours
    // -----------------------------------------
    // CASE 1 — App installed, email opened in Apple Mail (the happy path):
    //   iOS intercepts the Universal Link BEFORE the browser ever loads this
    //   URL. The app opens directly. This route handler is never reached.
    //   ✅ No action needed here for this case.
    //
    // CASE 2 — App installed, email opened in Gmail / Outlook / any WebView:
    //   Third-party email apps embed a WKWebView to render emails. Apple
    //   deliberately does NOT honour Universal Links inside WKWebViews (only
    //   Safari and SFSafariViewController do). So the WebView loads this URL
    //   like a regular web request and we end up here.
    //
    //   OLD BEHAVIOUR (broken): We did `res.redirect(appStoreUrl)`.
    //   That caused a cascade of problems:
    //     - The WebView followed the redirect to the App Store.
    //     - iOS simultaneously opened Safari to follow the App Store URL.
    //     - The user ended up inside the app AND with a blank Safari/Chrome
    //       tab open — which looked like a bug and confused users.
    //
    //   NEW BEHAVIOUR (this block): We serve an interstitial HTML page with
    //   a small JavaScript snippet that tries the immunotrack:// custom scheme
    //   (registered in the app's AndroidManifest / Info.plist). If the app
    //   is installed, iOS intercepts the custom scheme and opens the app
    //   immediately. The page detects that it lost focus (app opened) and
    //   cancels the 2.5-second fallback timer — so the App Store redirect
    //   never fires, no extra browser tab opens, and the user lands cleanly
    //   on the correct invite screen. If the app is NOT installed, the custom
    //   scheme silently fails (iOS does nothing for unknown schemes — no popup,
    //   no error), the 2.5-second timer completes, and the user is sent to
    //   the App Store.
    //
    // HOW THE JS WORKS (step by step)
    // --------------------------------
    //  1. Page loads → spinner is shown, App Store timer is started (2500 ms).
    //  2. `window.location.href = 'immunotrack://invite?code=...'` fires.
    //       - App installed   → iOS opens the app. Page loses foreground focus.
    //       - App not installed → iOS ignores the unknown scheme silently.
    //  3. `visibilitychange` event fires when the page goes to background
    //     (i.e. the app opened and pushed the browser into the background).
    //     → Timer is cleared. App Store redirect never happens. ✅
    //  4. If timer was NOT cleared after 2500 ms → app wasn't installed.
    //     → Spinner is hidden, "Download on the App Store" button appears,
    //       and the browser navigates to the App Store URL automatically.
    //
    // IMPORTANT: Do NOT replace this with a simple res.redirect(appStoreUrl).
    // That is what caused the duplicate-browser-opening bug in the first place.
    // ─────────────────────────────────────────────────────────────────────────
    return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Opening ImmunoTrack…</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f4f6f8; color: #1B1E54;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; padding: 20px;
    }
    .card {
      background: white; border-radius: 20px;
      padding: 40px 32px; max-width: 380px; width: 100%;
      text-align: center;
      box-shadow: 0 8px 30px rgba(27,30,84,0.08);
    }
    .spinner {
      width: 44px; height: 44px; margin: 0 auto 24px;
      border: 3px solid #E2E8F0;
      border-top-color: #1B1E54;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { font-size: 20px; font-weight: 700; margin-bottom: 10px; }
    p  { font-size: 15px; color: #64748B; line-height: 1.5; }
    .store-btn {
      display: inline-block; margin-top: 28px;
      background: #1B1E54; color: white;
      padding: 14px 28px; border-radius: 12px;
      font-size: 15px; font-weight: 600;
      text-decoration: none;
    }
    .store-btn:active { opacity: 0.85; }
    #fallback { display: none; }
  </style>
</head>
<body>
  <div class="card">
    <!-- Shown while we attempt to open the app via custom scheme -->
    <div id="opening">
      <div class="spinner"></div>
      <h2>Opening ImmunoTrack…</h2>
      <p>If the app doesn't open automatically, tap the button below.</p>
    </div>
    <!-- Shown only if the app is not installed (timer fires after 2.5 s) -->
    <div id="fallback">
      <h2>Get ImmunoTrack</h2>
      <p>Download the app and use code <strong>${code || ''}</strong> during sign-up.</p>
      <a class="store-btn" href="https://apps.apple.com/app/id6766438796">
        Download on the App Store
      </a>
    </div>
  </div>

  <script>
    (function () {
      var code        = ${JSON.stringify(code || '')};
      var customScheme = 'immunotrack://invite?code=' + encodeURIComponent(code);
      var appStoreUrl  = 'https://apps.apple.com/app/id6766438796';

      // Step 1: Start the App Store fallback timer (2.5 s).
      // If the app opens successfully, step 3 will clear this before it fires.
      var fallbackTimer = setTimeout(function () {
        // App did not open (not installed). Show the fallback UI and redirect.
        document.getElementById('opening').style.display = 'none';
        document.getElementById('fallback').style.display  = 'block';
        window.location.href = appStoreUrl;
      }, 2500);

      // Step 3: If the app opened, this page moves to the background.
      // Cancel the timer so the App Store redirect does NOT fire.
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) clearTimeout(fallbackTimer);
      });
      // Belt-and-suspenders: pagehide also fires when the page is backgrounded.
      window.addEventListener('pagehide', function () {
        clearTimeout(fallbackTimer);
      });

      // Step 2: Attempt to open the app via its registered custom URL scheme.
      // iOS silently ignores this if the app is not installed — no error popup.
      window.location.href = customScheme;
    })();
  </script>
</body>
</html>`);
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
 