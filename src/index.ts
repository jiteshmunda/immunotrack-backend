import express from "express";
import cors from "cors";
import helmet from "helmet";
import { ENV } from "./config/env";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10kb" }));

app.get("/health", (_, res) => res.json({ status: "ok" }));

app.listen(ENV.PORT, () => {
  console.log(`Server running on port ${ENV.PORT}`);
});