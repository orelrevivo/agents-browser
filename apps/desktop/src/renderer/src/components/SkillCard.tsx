import type { Skill } from "@groubot/db";
import { Button, Card, CardContent } from "@groubot/ui";
import { Check, FileCode2, Github, Trash2 } from "lucide-react";

export function SkillCard({ skill, onDelete }: { skill: Skill; onDelete: () => void }) {
  return (
    <Card className="overflow-hidden border-0 bg-[#fbf8f4] text-[#171717] shadow-none dark:bg-[#252321] dark:text-[#f7f3ee]">
      <CardContent className="p-0">
        <div className="relative mx-0 overflow-hidden rounded-[1.35rem] border border-black/10 bg-[#f5eee8] shadow-[0_5px_14px_rgba(0,0,0,0.07)] dark:border-white/10 dark:bg-[#302d2a] dark:shadow-[0_5px_14px_rgba(0,0,0,0.16)]">
          <div className="marketplace-agent-pattern absolute inset-0 opacity-70" />
          <div className="relative flex h-44 items-center justify-center px-8 pt-4">
            <span className="flex size-24 items-center justify-center rounded-[2rem] bg-white/70 text-[#7c5b51] shadow-[0_10px_24px_rgba(0,0,0,0.08)] dark:bg-black/20 dark:text-[#e7ae9d]">
              {skill.source === "github" ? (
                <Github className="size-12" />
              ) : (
                <FileCode2 className="size-12" />
              )}
            </span>
            <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-white/85 px-3 py-1.5 text-sm font-semibold text-[#6f4941] shadow-sm backdrop-blur-sm dark:bg-black/35 dark:text-[#f1c9bc]">
              {skill.source === "github" ? (
                <Github className="size-3.5" />
              ) : (
                <FileCode2 className="size-3.5" />
              )}
              Skill
            </div>
          </div>
        </div>
        <div className="space-y-3 px-5 pb-5 pt-4">
          <div>
            <h3 className="truncate text-lg font-semibold">{skill.name}</h3>
            <p className="mt-1 text-sm font-medium text-black/60 dark:text-white/60">
              Created by {skill.creator}
            </p>
          </div>
          <div className="flex items-start gap-2 text-sm leading-6">
            <Check className="mt-1 size-3.5 shrink-0 text-[#7c5b51] dark:text-[#e7ae9d]" />
            <p className="line-clamp-3 text-black/70 dark:text-white/70">
              {skill.description || "A reusable interaction for your agents."}
            </p>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-black/50 dark:text-white/50">Reusable interaction</span>
            <Button
              aria-label={`Delete ${skill.name}`}
              className="size-8 rounded-full text-black/60 hover:text-destructive dark:text-white/60"
              onClick={onDelete}
              size="icon"
              variant="ghost"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
