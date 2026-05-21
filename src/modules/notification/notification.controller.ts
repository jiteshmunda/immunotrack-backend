import { Request, Response } from "express";
import { NotificationService } from "./notification.service";
import { getInboxSchema } from "./notification.schema";
import { sendSuccess, sendError } from "../../utils/response";
import { writeAudit } from "../../utils/audit";

const notificationService = new NotificationService();

export class NotificationController {

  /**
   * GET /api/v1/notifications
   * Retrieves the notification inbox history for the authenticated user, paginated.
   */
  async getInbox(req: Request, res: Response) {
    try {
      const userId = (req as any).user.userId;
      
      // Validate query parameters
      const parsedQuery = getInboxSchema.safeParse(req.query);
      if (!parsedQuery.success) {
        throw new Error("INVALID_QUERY_PARAMETERS");
      }
      
      const { limit, offset } = parsedQuery.data;
      const result = await notificationService.getInbox(userId, limit, offset);

      // HIPAA Audit Log (Audit trail for reading PHI, as notifications contain PHI)
      await writeAudit(req, {
        action: "READ_PHI",
        status: "success",
        userId: userId,
        resourceType: "notifications",
        details: { limit, offset, count: result.notifications.length }
      });

      return res.status(200).json({
        notifications: result.notifications,
        unreadCount: result.unread_count
      });
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

  /**
   * PATCH /api/v1/notifications/:id/read
   * Marks a single notification as read.
   */
  async markAsRead(req: Request, res: Response) {
    try {
      const userId = (req as any).user.userId;
      const { id } = req.params;

      if (!id) {
        throw new Error("NOTIFICATION_ID_REQUIRED");
      }

      const result = await notificationService.markAsRead(id as string, userId);

      await writeAudit(req, {
        action: "UPDATE_PHI",
        status: "success",
        userId: userId,
        resourceType: "notification",
        resourceId: id as string,
        details: { read: true }
      });

      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }

  /**
   * PATCH /api/v1/notifications/read-all
   * Bulk marks all unread notifications for the user as read.
   */
  async markAllAsRead(req: Request, res: Response) {
    try {
      const userId = (req as any).user.userId;
      const result = await notificationService.markAllAsRead(userId);

      await writeAudit(req, {
        action: "UPDATE_PHI",
        status: "success",
        userId: userId,
        resourceType: "notifications",
        details: { read_all: true }
      });

      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(res, error, 400);
    }
  }
}
