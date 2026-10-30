import { Button } from "@groubot/ui";
import { Plus } from "lucide-react";
import { agentAvatarAssets } from "../generated/agent-assets";
import { AvatarPreview } from "./Customize Avatar/AvatarPreview";
import {
  AVATAR_SHAPES,
  defaultCustomAvatar,
  parseCustomAvatar,
  serializeCustomAvatar,
} from "./Customize Avatar/avatar-model";

const avatars = [...agentAvatarAssets];

export function AgentAvatarRail({
  selected,
  onSelect,
  onCustomize,
}: {
  selected: string;
  onSelect: (path: string) => void;
  onCustomize: () => void;
}) {
  const selectedCustom = parseCustomAvatar(selected);
  const base = selectedCustom ?? parseCustomAvatar(defaultCustomAvatar())!;
  return (
    <aside
      aria-label="Agent characters"
      className="absolute left-0 top-24 z-20 flex max-h-[calc(100vh-12rem)] w-[72px] -translate-x-full flex-col items-center gap-2 overflow-y-auto rounded-l-2xl border border-r-0 border-border bg-card/95 p-2 shadow-xl backdrop-blur"
    >
      {AVATAR_SHAPES.map((shape) => {
        const value = serializeCustomAvatar({ ...base, shape: shape.id });
        return (
          <Button
            aria-label={`Use ${shape.label} avatar`}
            aria-pressed={selectedCustom?.shape === shape.id}
            className={`size-[52px] shrink-0 rounded-xl border p-0 transition-all ${selectedCustom?.shape === shape.id ? "border-primary bg-primary/15 ring-2 ring-primary/30" : "border-border bg-background hover:border-primary/50 hover:bg-primary/10"}`}
            key={shape.id}
            onClick={() => onSelect(value)}
            size="icon"
            variant="ghost"
          >
            <AvatarPreview
              size={42}
              value={value}
            />
          </Button>
        );
      })}
      <Button
        aria-label="Customize avatar"
        className="size-[52px] shrink-0 rounded-xl border border-dashed border-primary/60 text-primary hover:bg-primary/10"
        onClick={onCustomize}
        size="icon"
        variant="ghost"
      >
        <Plus className="size-5" />
      </Button>
      <div
        aria-hidden
        className="my-1 h-px w-8 bg-border"
      />
      {avatars.map((avatar) => (
        <Button
          aria-label={`Use ${avatar.name}`}
          aria-pressed={selected === avatar.path}
          className={`size-[52px] shrink-0 overflow-hidden rounded-xl border p-0 transition-all ${selected === avatar.path ? "border-primary bg-primary/15 ring-2 ring-primary/30" : "border-border bg-background hover:border-primary/50 hover:bg-primary/10"}`}
          key={avatar.path}
          onClick={() => onSelect(avatar.path)}
          size="icon"
          variant="ghost"
        >
          <img
            alt={avatar.name}
            className="h-full w-full object-contain"
            src={avatar.src}
          />
        </Button>
      ))}
      {avatars.length === 0 && (
        <p className="px-1 py-3 text-center text-[10px] text-muted-foreground">
          Add PNGs to public/agents
        </p>
      )}
    </aside>
  );
}
