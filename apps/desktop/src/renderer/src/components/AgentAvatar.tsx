import type { Agent } from "@groubot/db";
import { agentAvatarAssets } from "../generated/agent-assets";
import { marketplaceAgentAvatarAssets } from "../generated/marketplace-agent-assets";

export function AgentAvatar({
  agent,
  size = "md",
}: {
  agent?: Agent;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}) {
  const avatarData = agent?.avatarData ?? "";
  const asset =
    agentAvatarAssets.find((candidate) => candidate.path === avatarData) ??
    marketplaceAgentAvatarAssets.find(
      (candidate) => candidate.path === avatarData,
    ) ??
    agentAvatarAssets[0];
  const sizes = {
    xs: "size-5",
    sm: "size-9",
    md: "size-8",
    lg: "size-10",
    xl: "size-70",
  } as const;
  return (
    <div className={`shrink-0 overflow-hidden ${sizes[size]}`}>
      <img
        alt={agent?.name ?? "Agent"}
        className="size-full object-cover"
        src={asset?.src}
      />
    </div>
  );
}
