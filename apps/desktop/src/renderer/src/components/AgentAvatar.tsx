import type { Agent } from "@groubot/db";
import { agentAvatarAssets } from "../generated/agent-assets";

export function AgentAvatar({ agent, size = "md" }: { agent?: Agent; size?: "sm" | "md" | "lg" }) {
  const asset = agentAvatarAssets.find((candidate) => candidate.path === agent?.avatarData) ?? agentAvatarAssets[0];
  const sizes = { sm: "size-6", md: "size-8", lg: "size-10" } as const;
  return <div className={`shrink-0 overflow-hidden rounded-lg border border-border/70 bg-muted ${sizes[size]}`}><img alt={agent?.name ?? "Agent"} className="size-full object-cover" src={asset?.src} /></div>;
}
