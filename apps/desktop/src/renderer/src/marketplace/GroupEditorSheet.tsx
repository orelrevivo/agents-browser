import { useState } from "react";
import type { Agent, AgentGroupInput } from "@groubot/db";
import {
  Button,
  Checkbox,
  Input,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@groubot/ui";

export function GroupEditorSheet({
  agents,
  onCreate,
  onOpenChange,
  open,
}: {
  agents: Agent[];
  onCreate: (input: AgentGroupInput) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [allowAgentMessages, setAllowAgentMessages] = useState(true);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim() || selected.length < 2) return;
    setSaving(true);
    try {
      await onCreate({ name, agentIds: selected, allowAgentMessages });
      setName("");
      setSelected([]);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      onOpenChange={onOpenChange}
      open={open}
    >
      <SheetContent className="w-full sm:max-w-lg">
        <div className="px-6 pt-6">
          <SheetTitle>Create agent group</SheetTitle>
          <SheetDescription>
            Bring at least two agents together as a collaborative team.
          </SheetDescription>
        </div>
        <div className="grid gap-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-2">
            <Label htmlFor="group-name">Group name</Label>
            <Input
              id="group-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="Product launch team"
              value={name}
            />
          </div>
          <div className="grid gap-3">
            <div>
              <Label>Members</Label>
              <p className="mt-1 text-xs text-muted-foreground">Select at least two agents.</p>
            </div>
            <div className="grid gap-2">
              {agents.map((agent) => (
                <label
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                  key={agent.id}
                >
                  <Checkbox
                    checked={selected.includes(agent.id)}
                    onCheckedChange={(checked) =>
                      setSelected((current) =>
                        checked ? [...current, agent.id] : current.filter((id) => id !== agent.id),
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-border p-3">
            <Checkbox
              checked={allowAgentMessages}
              onCheckedChange={(checked) => setAllowAgentMessages(checked === true)}
            />
            <span>
              <span className="block text-sm font-medium">Allow agents to post</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                When disabled, agents can observe group messages but only you can post.
              </span>
            </span>
          </label>
        </div>
        <div className="flex justify-end border-t border-border px-6 py-4">
          <Button
            disabled={!name.trim() || selected.length < 2 || saving}
            onClick={() => void submit()}
          >
            {saving ? "Creating…" : "Create group"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
