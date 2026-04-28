import { Request, Response } from "express";
import { SymptomService } from "./symptoms.service";
import { LogSymptomsSchema, HistoryFiltersSchema } from "./symptoms.schema";
import { sendSuccess, sendError } from "../../utils/response";

const symptomService = new SymptomService();

export class SymptomController {

  // ----------------------------------POST /symptoms/log-------------------------------------
  async logSymptoms(req: Request, res: Response) {
    try {
      const parsed = LogSymptomsSchema.parse(req.body);
      const userId = (req as any).user.userId;

      const result = await symptomService.logSymptoms(userId, parsed);

      return sendSuccess(res, result, 201);
    } catch (error: any) {
      return sendError(res, error, 500);
    }
  }

  // ------------------------------------GET /sympton/history----------------------------------------

  async getHistory(req: Request, res: Response) {
    try {
      const filters = HistoryFiltersSchema.parse(req.query);
      const userId = (req as any).user.userId;

      const result = await symptomService.getSymptomHistory(userId, filters);

      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(res, error, 500);
    }
  }


  // ------------------------------------GET /symptom/history/grouped----------------------------------------
  async getGroupedHistory(req: Request, res: Response) {
    try {
      const filters = HistoryFiltersSchema.parse(req.query);
      const userId = (req as any).user.userId;

      const result = await symptomService.getGroupedSymptomHistory(userId, filters);

      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(res, error, 500);
    }
  }
}
