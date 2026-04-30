import { ENV, loadSecrets } from "./config/env";

async function startServer() {
  try {
    // Load configuration (from .env or AWS Secrets Manager)
    await loadSecrets();


    const { default: app } = await import("./app");

    const PORT = ENV.PORT || 3000;

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
