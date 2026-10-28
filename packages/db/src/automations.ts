import { z } from "zod";

export const automationIdSchema = z.string().uuid();
export const automationFrequencySchema = z.enum(["hourly", "daily", "weekly"]);
export const automationStatusSchema = z.enum(["active", "paused"]);

export const automationInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).default(""),
  task: z.string().trim().min(1).max(10_000),
  frequency: automationFrequencySchema,
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  weeklyDay: z.number().int().min(0).max(6).default(1),
  timezone: z.string().trim().min(1).max(100),
  agentIds: z.array(z.string().uuid()).min(1),
});

export const automationUpdateSchema = automationInputSchema.partial();

export interface AutomationTask {
  id: string;
  name: string;
  description: string;
  task: string;
  frequency: z.infer<typeof automationFrequencySchema>;
  timeOfDay: string;
  weeklyDay: number;
  timezone: string;
  agentIds: string[];
  status: z.infer<typeof automationStatusSchema>;
  nextRunAt: number;
  lastRunAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export type AutomationInput = z.input<typeof automationInputSchema>;
export type AutomationUpdate = z.input<typeof automationUpdateSchema>;
