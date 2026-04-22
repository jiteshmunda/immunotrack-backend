import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger";
import { ENV } from "./config/env"
import router from "./routes";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

// Documentation
if (ENV.NODE_ENV !== "production") {
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}
// Health Check
app.use("/health", (req, res) => {
  res.json({ status: "ok" });
});

// API Routes
app.use("/api/v1", router);

export default app;

