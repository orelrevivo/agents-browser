import { useId } from "react";
import { cn } from "@groubot/ui";
import { AVATAR_SHAPE_PATHS, avatarColor, avatarIdentitySeed, organicAvatarPath, parseCustomAvatar, type AvatarConfig } from "./avatar-model";

export function AvatarPreview({ value, size = 64, working = false, className }: { value: string; size?: number; working?: boolean; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9-_]/g, "");
  const config = parseCustomAvatar(value) ?? { color: "#3B82F6", motion: "float" as const };
  const colors = avatarColor(config.color);
  const seed = avatarIdentitySeed(`${config.color}:${config.shape ?? "organic"}`);
  const isOrganic = config.shape === undefined;
  const shape = AVATAR_SHAPE_PATHS[(config.shape ?? 0) % AVATAR_SHAPE_PATHS.length] ?? AVATAR_SHAPE_PATHS[0];
  return (
    <div aria-hidden="true" className={cn("rakazo-bot-avatar relative inline-flex shrink-0 select-none", className)} data-working={working} data-shape-family={seed % 10} data-motion={config.motion} style={{ width: size, height: size }}>
      <svg viewBox="-60 -60 120 120" aria-hidden="true" className={cn("rakazo-organic-avatar overflow-visible select-none", working && "custom-avatar-working", className)} data-motion={config.motion} data-working={working} style={{ width: size, height: size }}>
        <defs><linearGradient id={`custom-avatar-${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={colors.light} /><stop offset="100%" stopColor={colors.dark} /></linearGradient></defs>
        {isOrganic ? <><path className="rakazo-organic-avatar-body rakazo-organic-avatar-body-idle" d={organicAvatarPath(seed)} fill={colors.light} /><path className="rakazo-organic-avatar-body rakazo-organic-avatar-body-working" d={organicAvatarPath(seed, .42)} fill={colors.light} /></> : <path className="custom-avatar-body" d={shape} fill={`url(#custom-avatar-${id})`} />}
        <g fill={colors.eye} className="custom-avatar-eyes"><ellipse cx="-10" cy="-8" rx="7" ry="12" /><ellipse cx="10" cy="-8" rx="7" ry="12" /></g>
      </svg>
    </div>
  );
}

export function avatarConfigFromValue(value: string): AvatarConfig {
  return parseCustomAvatar(value) ?? { color: "#3B82F6", motion: "float" };
}
