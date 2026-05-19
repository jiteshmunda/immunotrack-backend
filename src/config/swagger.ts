import swaggerJsdoc from "swagger-jsdoc";
import { ENV } from "./env";
import path from "path";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "ImmunoTrack API",
      version: "1.0.0",
      description: "HIPAA-Compliant Clinical Intelligence Platform for Immunology",
    },
    servers: [
      {
        url: `http://localhost:${ENV.PORT}/api/v1`,
        description: "Local Development Server",
      },
      {
        url: "https://dev-api.immunotrack.ai/api/v1",
        description: "Deployed Development Server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: [
    path.join(__dirname, "../docs/auth.yaml"),
    path.join(__dirname, "../docs/patient.yaml"),
    path.join(__dirname, "../docs/medication.yaml"),
    path.join(__dirname, "../docs/symptoms.yaml"),
    path.join(__dirname, "../docs/clinician.yaml"),
    path.join(__dirname, "../docs/alert.yaml"),
    path.join(__dirname, "../docs/notification.yaml"),
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
