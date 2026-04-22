import { Request, Response } from "express";
import { SymptomService } from "./symptoms.service";
import { LogSymptomsSchema, HistoryFiltersSchema } from "./symptoms.schema";

const symptomService = new SymptomService();

export class SymptomController {

  // ----------------------------------POST /symptoms/log-------------------------------------
  async logSymptoms(req: Request, res: Response) {
    try {
      const parsed = LogSymptomsSchema.parse(req.body);
      const userId = (req as any).user.userId;

      const result = await symptomService.logSymptoms(userId, parsed);

      res.status(201).json(result);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "VALIDATION_FAILED", details: error.errors });
      }
      res.status(500).json({ error: error.message || "INTERNAL_SERVER_ERROR" });
    }
  }

  // ------------------------------------GET /sympton/history----------------------------------------

  async getHistory(req: Request, res: Response) {
    try {
      const filters = HistoryFiltersSchema.parse(req.query);
      const userId = (req as any).user.userId;

      const result = await symptomService.getSymptomHistory(userId, filters);

      res.status(200).json(result);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "VALIDATION_FAILED", details: error.errors });
      }
      res.status(500).json({ error: error.message || "INTERNAL_SERVER_ERROR" });
    }
  }


  // ------------------------------------GET /symptom/history/grouped----------------------------------------
  async getGroupedHistory(req: Request, res: Response) {
    try {
      const filters = HistoryFiltersSchema.parse(req.query);
      const userId = (req as any).user.userId;

      const result = await symptomService.getGroupedSymptomHistory(userId, filters);

      res.status(200).json(result);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "VALIDATION_FAILED", details: error.errors });
      }
      res.status(500).json({ error: error.message || "INTERNAL_SERVER_ERROR" });
    }
  }
}
