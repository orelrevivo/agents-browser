import type { AgentInput } from "@groubot/db";
import { agentAvatarAssets } from "../generated/agent-assets";

const firstAvatar = agentAvatarAssets[0]?.path ?? "";

export const defaultAgentInput: AgentInput = {
  name: "",
  description: "",
  avatarType: "image",
  avatarData: firstAvatar,
  provider: "openai",
  model: "gpt-5.6-luna",
  systemInstructions: "You are a thoughtful, precise, and helpful browser companion.",
  goals: "",
  customInstructions: "",
  temperature: 0.2,
  modelSettings: {},
  toolPermissions: {},
  memoryPreferences: { memoryEnabled: true },
};
