import type { Agent } from "@groubot/db";
import { Badge, Button, Card, CardContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@groubot/ui";
import { Copy, MoreHorizontal, Pencil, Star, Trash2 } from "lucide-react";
import { agentAvatarAssets } from "../generated/agent-assets";

export function AgentCard({ agent, onDelete, onDuplicate, onEdit, onSetDefault }: { agent: Agent; onDelete: () => void; onDuplicate: () => void; onEdit: () => void; onSetDefault: () => void }) {
  return (
    <Card className="group transition-colors hover:border-primary/40">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-primary/10 text-primary"><img alt="" className="h-full w-full object-cover" src={resolveAvatar(agent.avatarData)} /></div>
            <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-foreground">{agent.name}</h3><p className="mt-0.5 truncate text-xs text-muted-foreground">{agent.description || "No description yet"}</p></div>
          </div>
          <DropdownMenu><DropdownMenuTrigger asChild><Button aria-label={`Actions for ${agent.name}`} className="opacity-70 group-hover:opacity-100" size="icon" variant="ghost"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={onEdit}><Pencil className="size-4" /> Edit settings</DropdownMenuItem><DropdownMenuItem onClick={onDuplicate}><Copy className="size-4" /> Duplicate</DropdownMenuItem><DropdownMenuItem onClick={onDelete}><Trash2 className="size-4" /> Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3"><div>{agent.isDefault && <Badge><Star className="mr-1 size-3" /> Default</Badge>}</div>{!agent.isDefault && <Button className="h-7 px-2 text-xs" onClick={onSetDefault} variant="ghost">Set default</Button>}</div>
      </CardContent>
    </Card>
  );
}

function resolveAvatar(value: string) {
  if (value.startsWith("data:image/")) return value;
  const stablePath = value.replace(/^\.\/agents\//, "/agents/");
  return agentAvatarAssets.find((asset) => asset.path === stablePath)?.src ?? agentAvatarAssets[0]?.src ?? "";
}
