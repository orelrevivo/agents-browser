import type { Agent } from "@groubot/db";
import { Button } from "@groubot/ui";
import { Plus } from "lucide-react";
import { AgentAvatar } from "./AgentAvatar";

interface HomeAgentStripProps {
  agents: Agent[];
  selectedAgentId: string | null;
  onAdd: () => void;
  onSelect: (agentId: string) => void;
}

export function HomeAgentStrip({
  agents,
  selectedAgentId,
  onAdd,
  onSelect,
}: HomeAgentStripProps) {
  return (
    <div className="relative z-20 mt-[10px] flex shrink-0 justify-center px-4 pointer-events-auto">
      <div className="flex max-w-full min-w-0 items-center gap-1 overflow-x-auto rounded-full bg-card/70 p-1">
        {agents.map((agent) => {
          const selected = agent.id === selectedAgentId;

          return (
            <button
              aria-pressed={selected}
              className={`flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-xs transition-colors ${
                selected
                  ? "bg-muted text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              key={agent.id}
              onClick={() => onSelect(agent.id)}
              type="button"
            >
              <AgentAvatar agent={agent} size="sm" />
              <span className="max-w-32 truncate">{agent.name}</span>
            </button>
          );
        })}

        <Button
          className="h-9 shrink-0 gap-1.5 rounded-full px-3 text-xs"
          onClick={onAdd}
          size="sm"
          variant="ghost"
        >
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>
    </div>
  );
}
