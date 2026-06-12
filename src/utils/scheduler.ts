import cron from "node-cron";
import { exec } from "child_process";

export function startAdherenceScheduler() {
  console.log("[Scheduler] Background adherence cron job successfully initialized.");

  const isProd = process.env.NODE_ENV === "production";
  const cmdPrefix = isProd ? "node dist" : "npx tsx src";
  const ext = isProd ? "js" : "ts";

  // Schedule to run every night at 12:30 AM (30 0 * * *)
  cron.schedule("30 0 * * *", () => {
    console.log("[Scheduler] Triggering scheduled medication adherence check...");
    
    // Executes the single-run version of the check script cleanly
    exec(`${cmdPrefix}/scripts/nightly-adherence-check.${ext}`, (error, stdout, stderr) => {
      if (error) console.error("[Scheduler] Error executing nightly adherence check:", error);
      if (stdout) console.log("[Scheduler] Nightly check output:\n", stdout);
    });

    exec(`${cmdPrefix}/scripts/nightly-declining-composite.${ext}`, (error, stdout, stderr) => {
      if (error) console.error("[Scheduler] Error executing nightly declining composite script:", error);
      if (stdout) console.log("[Scheduler] Nightly declining composite output:\n", stdout);
    });
  });

  // Schedule to run every night at 11:59:59 PM (59 59 23 * * *)
  cron.schedule("59 59 23 * * *", () => {
    console.log("[Scheduler] Triggering nightly auto-miss medication check...");
    
    exec(`${cmdPrefix}/scripts/nightly-auto-miss.${ext}`, (error, stdout, stderr) => {
      if (error) console.error("[Scheduler] Error executing nightly auto-miss script:", error);
      if (stdout) console.log("[Scheduler] Nightly auto-miss output:\n", stdout);
    });
  });

  // Schedule to check medication reminders every minute (* * * * *)
  cron.schedule("* * * * *", async () => {
    try {
      const { checkAndDispatchReminders } = await import("../modules/medication/reminder-scheduler");
      await checkAndDispatchReminders();
    } catch (err) {
      console.error("[Scheduler] Error running background medication reminder check:", err);
    }
  });
}
