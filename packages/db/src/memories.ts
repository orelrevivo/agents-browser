import { z } from "zod";

export const memoryInputSchema = z.object({
  agentId: z.string().uuid(),
  content: z.string().trim().min(1, "Memory cannot be empty.").max(2_000, "Keep memories under 2,000 characters."),
});
export const memoryIdSchema = z.string().uuid();
export type MemoryInput = z.infer<typeof memoryInputSchema>;
export interface Memory { id: string; agentId: string; content: string; createdAt: number; updatedAt: number; }
