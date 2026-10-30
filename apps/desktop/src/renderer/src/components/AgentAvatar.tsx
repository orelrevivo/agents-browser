import type { Agent } from "@groubot/db";
import { agentAvatarAssets } from "../generated/agent-assets";
import { marketplaceAgentAvatarAssets } from "../generated/marketplace-agent-assets";
import { AvatarPreview } from "./Customize Avatar/AvatarPreview";
import { parseCustomAvatar } from "./Customize Avatar/avatar-model";

export function AgentAvatar({
  agent,
  size = "md",
  status,
}: {
  agent?: Agent;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  status?: string;
}) {
  const avatarData = agent?.avatarData ?? "";
  const customAvatar = parseCustomAvatar(avatarData);
  const pixelSizes = { xs: 20, sm: 36, md: 32, lg: 40, xl: 70 } as const;
  if (avatarData.startsWith("data:image/")) {
    return (
      <div
        className={`shrink-0 overflow-hidden rounded-full ${size === "xs" ? "size-5" : size === "sm" ? "size-9" : size === "md" ? "size-8" : size === "lg" ? "size-10" : "size-70"}`}
      >
        <img
          alt={agent?.name ?? "Agent"}
          className="size-full object-cover"
          src={avatarData}
        />
      </div>
    );
  }
  if (customAvatar) {
    return (
      <AvatarPreview
        className="shrink-0"
        size={pixelSizes[size]}
        value={avatarData}
        working={status === "working"}
      />
    );
  }
  const asset =
    agentAvatarAssets.find((candidate) => candidate.path === avatarData) ??
    marketplaceAgentAvatarAssets.find((candidate) => candidate.path === avatarData) ??
    agentAvatarAssets[0];
  const sizes = {
    xs: "size-5",
    sm: "size-9",
    md: "size-8",
    lg: "size-10",
    xl: "size-15",
  } as const;
  return (
    <div className={`shrink-0 overflow-hidden rounded-full ${sizes[size]}`}>
      <img
        alt={agent?.name ?? "Agent"}
        className="size-full object-cover"
        src={asset?.src}
      />
    </div>
  );
}
