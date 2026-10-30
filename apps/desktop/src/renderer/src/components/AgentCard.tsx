import type { Agent } from "@groubot/db";
import {
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@groubot/ui";
import { Check, Copy, MoreHorizontal, Pencil, Star, Trash2 } from "lucide-react";
import { AgentAvatar } from "./AgentAvatar";

interface AgentCardProps {
  agent: Agent;
  onDelete: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onSetDefault: () => void;
}

export function AgentCard({ agent, onDelete, onDuplicate, onEdit, onSetDefault }: AgentCardProps) {
  return (
    <Card className="overflow-hidden border-0 bg-[#fbf8f4] text-[#171717] shadow-none dark:bg-[#252321] dark:text-[#f7f3ee]">
      <CardContent className="p-0">
        <div className="relative overflow-hidden rounded-[1.35rem] border border-black/10 bg-[#f5eee8] shadow-[0_5px_14px_rgba(0,0,0,0.09)] dark:border-white/10 dark:bg-[#302d2a] dark:shadow-[0_5px_14px_rgba(0,0,0,0.2)]">
          <div className="marketplace-agent-pattern absolute inset-0 opacity-70" />
          <div className="relative flex h-52 items-end justify-center px-8 pt-5">
            <AgentAvatar
              agent={agent}
              size="xl"
            />
            <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-white/85 px-3 py-1.5 text-sm font-semibold text-[#6f4941] shadow-sm backdrop-blur-sm dark:bg-black/35 dark:text-[#f1c9bc]">
              {agent.isDefault ? <Star className="size-3.5" /> : null}
              {agent.isDefault ? "Default" : "Your agent"} · {agent.name}
            </div>
          </div>
        </div>

        <div className="space-y-3 px-5 pb-5 pt-4">
          <p className="text-sm font-medium text-black/60 dark:text-white/60">
            What to expect from {agent.name}
          </p>
          <ul className="space-y-2 text-sm leading-6">
            <li className="flex items-start gap-2">
              <Check className="mt-1 size-3.5 shrink-0 text-[#7c5b51] dark:text-[#e7ae9d]" />
              <span>{agent.description || "A companion configured for your workflow."}</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-1 size-3.5 shrink-0 text-[#7c5b51] dark:text-[#e7ae9d]" />
              <span>{agent.goals || "Works with your instructions and preferences."}</span>
            </li>
          </ul>

          <div className="flex items-center gap-3 pt-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={`More options for ${agent.name}`}
                  className="rounded-full bg-[#292725] text-white hover:bg-[#3b3835] dark:bg-[#f7f3ee] dark:text-[#292725] dark:hover:bg-white"
                  size="icon"
                  title="More options"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side="bottom"
                sideOffset={8}
              >
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="size-4" />
                  Edit agent
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDuplicate}>
                  <Copy className="size-4" />
                  Duplicate
                </DropdownMenuItem>
                {!agent.isDefault && (
                  <DropdownMenuItem onClick={onSetDefault}>
                    <Star className="size-4" />
                    Set as default
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="size-4" />
                  Delete agent
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
