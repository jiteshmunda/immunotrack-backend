import swaggerJsdoc from "swagger-jsdoc";
import { ENV } from "./env";

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
  apis: ["./src/docs/*.yaml"], // separate swagger files
};

export const swaggerSpec = swaggerJsdoc(options);
