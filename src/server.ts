import { ENV, loadSecrets } from "./config/env";

async function startServer() {
  try {
    // Load configuration (from .env or AWS Secrets Manager)
    await loadSecrets();


    const { default: app } = await import("./app");

    const PORT = ENV.PORT || 3000;

    app.listen(PORT, async () => {
      console.log(`Server running on port ${PORT}`);
      
      // Start the background cron scheduler
      try {
        const { startAdherenceScheduler } = await import("./utils/scheduler");
        startAdherenceScheduler();
      } catch (err) {
        console.error("Failed to start background scheduler:", err);
      }
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
