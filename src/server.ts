import { ENV, loadSecrets } from "./config/env";

async function startServer() {
  try {
    // Load configuration (from .env or AWS Secrets Manager)
    await loadSecrets();


    const { default: app } = await import("./app");

    const PORT = ENV.PORT || 3000;

    app.listen(PORT, async () => {
      console.log(`Server running on port ${PORT}`);
      
      // Start the background cron scheduler only if enabled AND running in AWS
      const isRunningInAWS = !!(process.env.ECS_CONTAINER_METADATA_URI || process.env.ECS_CONTAINER_METADATA_URI_V4 || process.env.AWS_EXECUTION_ENV || process.env.NODE_ENV === "production");
      if (process.env.ENABLE_REMINDER_SCHEDULER === "true" && isRunningInAWS) {
  try {
    const { startAdherenceScheduler } = await import("./utils/scheduler");
    startAdherenceScheduler();
  } catch (err) {
    console.error("Failed to start background scheduler:", err);
  }
} else {
  console.log("[Scheduler] Background reminder scheduler is disabled locally via ENABLE_REMINDER_SCHEDULER=false.");
}
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
