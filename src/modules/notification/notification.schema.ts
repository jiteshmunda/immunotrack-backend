import { z } from "zod";

export const getInboxSchema = z.object({
  limit: z.string().optional().transform(val => {
    const parsed = parseInt(val || "20", 10);
    return isNaN(parsed) ? 20 : parsed;
  }),
  offset: z.string().optional().transform(val => {
    const parsed = parseInt(val || "0", 10);
    return isNaN(parsed) ? 0 : parsed;
  }),
});

export type GetInboxInput = z.infer<typeof getInboxSchema>;

export const deleteSelectiveSchema = z.object({
  ids: z.array(z.string().uuid("Invalid notification ID format")),
});
