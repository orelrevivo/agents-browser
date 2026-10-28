import { z } from "zod";

export const groupIdSchema = z.string().uuid();
export const agentGroupInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  agentIds: z.array(z.string().uuid()).min(2, "Choose at least two agents."),
  allowAgentMessages: z.boolean().default(true),
});

export const agentGroupUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  pinned: z.boolean().optional(),
});

export interface AgentGroup {
  id: string;
  name: string;
  agentIds: string[];
  allowAgentMessages: boolean;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export type AgentGroupInput = z.input<typeof agentGroupInputSchema>;
export type AgentGroupUpdate = z.input<typeof agentGroupUpdateSchema>;
