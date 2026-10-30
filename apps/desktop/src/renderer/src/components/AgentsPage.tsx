import { useEffect, useMemo, useState } from "react";
import type { Agent, AgentInput } from "@groubot/db";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
  Skeleton,
} from "@groubot/ui";
import { Bot, Plus, Search, Sparkles } from "lucide-react";
import { AgentCard } from "./AgentCard";
import { AgentEditorDialog } from "./AgentEditorDialog";

export function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent>();
  const [deletingAgent, setDeletingAgent] = useState<Agent>();
  const [error, setError] = useState("");

  async function refresh() {
    setAgents(await window.groubot.agents.list());
  }
  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, []);

  const filteredAgents = useMemo(
    () =>
      agents.filter((agent) =>
        `${agent.name} ${agent.description} ${agent.systemInstructions}`
          .toLowerCase()
          .includes(query.toLowerCase().trim()),
      ),
    [agents, query],
  );

  function openCreate() {
    setEditingAgent(undefined);
    setEditorOpen(true);
  }
  function openEdit(agent: Agent) {
    setEditingAgent(agent);
    setEditorOpen(true);
  }
  async function saveAgent(input: AgentInput) {
    setError("");
    if (editingAgent) await window.groubot.agents.update(editingAgent.id, input);
    else await window.groubot.agents.create(input);
    await refresh();
  }
  async function deleteAgent() {
    if (!deletingAgent) return;
    setError("");
    await window.groubot.agents.remove(deletingAgent.id);
    setDeletingAgent(undefined);
    await refresh();
  }
  async function duplicateAgent(agent: Agent) {
    setError("");
    await window.groubot.agents.duplicate(agent.id);
    await refresh();
  }
  async function setDefault(agent: Agent) {
    setError("");
    await window.groubot.agents.setDefault(agent.id);
    await refresh();
  }

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto w-full max-w-5xl px-6 py-8 sm:px-10">
        <header className="flex flex-col gap-5 pb-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Agents</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Create and configure the companions you’ll use across Groubot.
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="size-4" /> Create agent
          </Button>
        </header>
        <div className="flex items-center gap-3 py-5">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search agents"
              value={query}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {agents.length} {agents.length === 1 ? "agent" : "agents"}
          </span>
        </div>
        {error && (
          <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
        ) : agents.length === 0 ? (
          <EmptyState onCreate={openCreate} />
        ) : filteredAgents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <Search className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No matching agents</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Try a different name, description, or instruction.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            {filteredAgents.map((agent) => (
              <AgentCard
                agent={agent}
                key={agent.id}
                onDelete={() => setDeletingAgent(agent)}
                onDuplicate={() => void duplicateAgent(agent)}
                onEdit={() => openEdit(agent)}
                onSetDefault={() => void setDefault(agent)}
              />
            ))}
          </div>
        )}
      </div>
      <AgentEditorDialog
        agent={editingAgent}
        onOpenChange={setEditorOpen}
        onSave={saveAgent}
        open={editorOpen}
      />
      <AlertDialog
        open={Boolean(deletingAgent)}
        onOpenChange={(open) => {
          if (!open) setDeletingAgent(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deletingAgent?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the local configuration permanently. Future chats using this agent will
              need another selection.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void deleteAgent()}
            >
              Delete agent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
        <Sparkles className="size-5" />
      </div>
      <h2 className="mt-4 text-base font-semibold">Create your first agent</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Give a companion its own personality, instructions, model, and future capabilities.
      </p>
      <Button
        className="mt-5"
        onClick={onCreate}
      >
        <Plus className="size-4" /> Create agent
      </Button>
    </div>
  );
}
