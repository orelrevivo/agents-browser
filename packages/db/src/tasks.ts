import { z } from "zod";

export const browserTaskIdSchema = z.string().uuid();
export const browserTaskStatusSchema = z.enum([
  "queued",
  "running",
  "waiting_for_approval",
  "waiting_for_human",
  "completed",
  "failed",
  "cancelled",
]);
export const browserTaskCreateSchema = z.object({
  conversationId: z.string().uuid().nullable().optional(),
  agentId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
});
export const browserTaskProgressSchema = z.object({
  message: z.string().trim().min(1).max(500),
  site: z.string().max(300).optional(),
  tabId: z.string().uuid().optional(),
  createdAt: z.number().int(),
});
export type BrowserTaskStatus = z.infer<typeof browserTaskStatusSchema>;
export type BrowserTaskProgress = z.infer<typeof browserTaskProgressSchema>;
export interface BrowserTask {
  id: string;
  conversationId: string | null;
  agentId: string | null;
  title: string;
  status: BrowserTaskStatus;
  currentStep: string;
  tabIds: string[];
  progress: BrowserTaskProgress[];
  error: string | null;
  createdAt: number;
  updatedAt: number;
}
export type BrowserTaskCreate = z.infer<typeof browserTaskCreateSchema>;
