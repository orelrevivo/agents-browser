import { useEffect, useRef, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@groubot/ui";
import { Check, Upload } from "lucide-react";
import { AvatarPreview, avatarConfigFromValue } from "./AvatarPreview";
import {
  BOT_AVATAR_COLORS,
  AVATAR_MOTIONS,
  AVATAR_SHAPES,
  serializeCustomAvatar,
  type AvatarConfig,
} from "./avatar-model";

export function AvatarStudioDialog({
  open,
  value,
  onOpenChange,
  onChange,
}: {
  open: boolean;
  value: string;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(() => avatarConfigFromValue(value));
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) setDraft(avatarConfigFromValue(value));
  }, [open, value]);
  function update(next: Partial<AvatarConfig>) {
    setDraft((current) => ({ ...current, ...next }));
  }
  function importImage(file: File | undefined) {
    if (!file?.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onChange(reader.result);
        onOpenChange(false);
      }
    };
    reader.readAsDataURL(file);
  }
  function save() {
    onChange(serializeCustomAvatar(draft));
    onOpenChange(false);
  }
  const currentValue = serializeCustomAvatar(draft);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-3xl p-0">
        <DialogHeader className="border-b border-border/70 px-7 py-5 sm:px-8">
          <DialogTitle>Customize agent avatar</DialogTitle>
          <DialogDescription>
            Choose a color, shape, and motion style. The same avatar will appear throughout Groubot.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-8 px-7 py-7 sm:grid-cols-2 sm:px-8 sm:py-8">
          <div className="min-w-0 space-y-6">
            <section className="grid gap-3">
              <p className="text-xs font-medium text-foreground">Shape</p>
              <div className="grid grid-cols-4 gap-2">
                <button
                  aria-label="Use organic avatar"
                  aria-pressed={draft.shape === undefined}
                  className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border p-2 transition ${draft.shape === undefined ? "border-primary bg-primary/10 ring-2 ring-primary/20" : "border-border hover:border-primary/50"}`}
                  onClick={() => update({ shape: undefined })}
                  type="button"
                >
                  <AvatarPreview
                    value={serializeCustomAvatar({ ...draft, shape: undefined })}
                    size={42}
                  />
                  <span className="text-[10px] text-muted-foreground">Organic</span>
                </button>
                {AVATAR_SHAPES.map((shape) => {
                  const selected = draft.shape === shape.id;
                  return (
                    <button
                      aria-label={shape.label}
                      aria-pressed={selected}
                      className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border p-2 transition ${selected ? "border-primary bg-primary/10 ring-2 ring-primary/20" : "border-border hover:border-primary/50"}`}
                      key={shape.id}
                      onClick={() => update({ shape: shape.id })}
                      type="button"
                    >
                      <AvatarPreview
                        value={serializeCustomAvatar({ ...draft, shape: shape.id })}
                        size={42}
                      />
                      <span className="text-[10px] text-muted-foreground">{shape.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
            <section className="grid gap-3">
              <p className="text-xs font-medium text-foreground">Color</p>
              <div className="flex flex-wrap gap-3">
                {BOT_AVATAR_COLORS.map((color) => (
                  <button
                    aria-label={`Use ${color}`}
                    aria-pressed={draft.color === color}
                    className={`size-8 rounded-full border transition hover:scale-110 ${draft.color === color ? "border-foreground ring-2 ring-primary ring-offset-2 ring-offset-card" : "border-border"}`}
                    key={color}
                    onClick={() => update({ color })}
                    style={{ backgroundColor: color }}
                    type="button"
                  />
                ))}
              </div>
            </section>
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <div className="flex min-h-48 items-center justify-center rounded-2xl border border-border/70 bg-background/60 p-8">
              <AvatarPreview
                value={currentValue}
                size={148}
                working
              />
            </div>
            <section className="grid gap-3">
              <p className="text-xs font-medium text-foreground">Motion</p>
              <div className="grid grid-cols-2 gap-2">
                {AVATAR_MOTIONS.map((motion) => (
                  <button
                    aria-pressed={draft.motion === motion.id}
                    className={`rounded-lg border px-3 py-2.5 text-xs transition ${draft.motion === motion.id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/50"}`}
                    key={motion.id}
                    onClick={() => update({ motion: motion.id })}
                    type="button"
                  >
                    {motion.label}
                  </button>
                ))}
              </div>
            </section>
            <section className="grid gap-3 border-t border-border/70 pt-5">
              <p className="text-xs font-medium text-foreground">Upload</p>
              <input
                ref={fileRef}
                accept="image/*"
                className="hidden"
                onChange={(event) => importImage(event.target.files?.[0])}
                type="file"
              />
              <Button
                onClick={() => fileRef.current?.click()}
                type="button"
                variant="outline"
              >
                <Upload className="size-4" /> Choose an image
              </Button>
            </section>
            <DialogFooter className="mt-auto border-t border-border/70 pt-5">
              <Button
                onClick={() => onOpenChange(false)}
                variant="ghost"
              >
                Cancel
              </Button>
              <Button onClick={save}>
                <Check className="size-4" /> Use avatar
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
