import { z } from "zod";

export const skillIdSchema = z.string().uuid();

export const skillInputSchema = z.object({
  name: z.string().trim().min(1, "Give the skill a name.").max(80),
  description: z.string().trim().max(240, "Keep the description under 240 characters."),
  content: z.string().trim().min(1, "Add the skill instructions."),
  creator: z.string().trim().min(1).max(80).default("You"),
  source: z.enum(["manual", "file", "github"]),
  sourceUrl: z.string().url().optional().or(z.literal("")),
});

export type SkillInput = z.input<typeof skillInputSchema>;

export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  creator: string;
  source: "manual" | "file" | "github";
  sourceUrl?: string;
  createdAt: number;
  updatedAt: number;
}
