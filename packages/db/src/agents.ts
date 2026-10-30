import { z } from "zod";

export const agentInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give your agent a name.")
    .max(80, "Keep the name under 80 characters."),
  description: z.string().trim().max(240, "Keep the description under 240 characters."),
  avatarType: z.enum(["icon", "image"]),
  avatarData: z.string().min(1),
  provider: z.enum(["openai"]),
  model: z.enum(["gpt-5.6-luna", "gpt-4.1-mini", "gpt-4.1", "o4-mini"]),
  systemInstructions: z.string().trim().min(1, "Add system instructions for this agent."),
  goals: z.string().trim().max(2000),
  customInstructions: z.string().trim().max(2000),
  temperature: z.number().min(0).max(2),
  modelSettings: z.record(z.string(), z.unknown()),
  toolPermissions: z.record(z.string(), z.boolean()),
  memoryPreferences: z.record(z.string(), z.boolean()),
});

export const agentIdSchema = z.string().uuid();

export type AgentInput = z.infer<typeof agentInputSchema>;

export interface Agent extends AgentInput {
  id: string;
  isDefault: boolean;
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
}
