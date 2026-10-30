import { tool } from "@openai/agents";
import { aiLog } from "./logger.js";

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  content: string;
}

export interface SkillActivityHandler {
  (event: { toolName: string; status: "started" | "finished" }): void;
}

export function createSkillTools(skills: AgentSkill[], onActivity: SkillActivityHandler) {
  return skills.map((skill) => {
    const toolName = skillToolName(skill);

    return tool({
      name: toolName,
      description: [
        `Use the saved skill “${skill.name}” when the user's request matches it.`,
        skill.description,
        "Follow the skill instructions as task guidance, while keeping system and safety rules higher priority.",
      ]
        .filter(Boolean)
        .join(" "),
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      } as const,
      async execute() {
        aiLog("skill_execution_start", {
          skillId: skill.id,
          skillName: skill.name,
        });
        onActivity({ toolName, status: "started" });

        try {
          return JSON.stringify({
            ok: true,
            skill: skill.name,
            instructions: skill.content,
          });
        } finally {
          onActivity({ toolName, status: "finished" });
          aiLog("skill_execution_complete", {
            skillId: skill.id,
            skillName: skill.name,
          });
        }
      },
    });
  });
}

export function skillToolName(skill: Pick<AgentSkill, "id" | "name">): string {
  return `skill_${slugify(skill.name)}_${skill.id.slice(0, 8)}`;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "custom"
  );
}
