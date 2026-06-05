import cron from "node-cron";
import { exec } from "child_process";

export function startAdherenceScheduler() {
  console.log("[Scheduler] Background adherence cron job successfully initialized.");

  // Schedule to run every night at 2:00 AM (0 2 * * *)
  cron.schedule("0 2 * * *", () => {
    console.log("[Scheduler] Triggering scheduled medication adherence check...");
    
    // Executes the single-run version of the check script cleanly
    exec("npx tsx src/scripts/nightly-adherence-check.ts", (error, stdout, stderr) => {
      if (error) console.error("[Scheduler] Error executing nightly adherence check:", error);
      if (stdout) console.log("[Scheduler] Nightly check output:\n", stdout);
    });

    exec("npx tsx src/scripts/nightly-declining-composite.ts", (error, stdout, stderr) => {
      if (error) console.error("[Scheduler] Error executing nightly declining composite script:", error);
      if (stdout) console.log("[Scheduler] Nightly declining composite output:\n", stdout);
    });
  });

  // Schedule to run every night at 11:59 PM (59 23 * * *)
  cron.schedule("59 23 * * *", () => {
    console.log("[Scheduler] Triggering nightly auto-miss medication check...");
    
    exec("npx tsx src/scripts/nightly-auto-miss.ts", (error, stdout, stderr) => {
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
