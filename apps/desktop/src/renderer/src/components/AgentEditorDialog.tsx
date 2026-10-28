import { useEffect, useState } from "react";
import { z } from "zod";
import type { Agent, AgentInput, Memory } from "@groubot/db";
import { Button, Input, Label, Sheet, SheetContent, SheetDescription, SheetTitle, Switch, Textarea } from "@groubot/ui";
import { Brain, Globe2, Trash2 } from "lucide-react";
import { AgentAvatarRail } from "./AgentAvatarRail";
import { defaultAgentInput } from "./agent-defaults";
import { AvatarStudioDialog } from "./Customize Avatar/AvatarStudioDialog";
import { parseCustomAvatar } from "./Customize Avatar/avatar-model";

const firstAvatar = defaultAgentInput.avatarData;
const formSchema = z.object({
  name: z.string().trim().min(1, "Give your agent a name.").max(80, "Keep the name under 80 characters."),
  description: z.string().trim().max(240, "Keep the description under 240 characters."),
  systemInstructions: z.string().trim().min(1, "Add personality and system instructions."),
  goals: z.string().trim().max(2000, "Keep goals under 2,000 characters."),
  avatarData: z.string().min(1, "Select a character avatar."),
});

interface AgentEditorDialogProps {
  agent?: Agent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: AgentInput) => Promise<void>;
}

export function AgentEditorDialog({ agent, open, onOpenChange, onSave }: AgentEditorDialogProps) {
  const [form, setForm] = useState<AgentInput>(defaultAgentInput);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [aiConfig, setAIConfig] = useState<{ model: string; apiKeyConfigured: boolean; webSearchEnabled: boolean; memoryEnabled: boolean }>();
  const [studioOpen, setStudioOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(agent ? toInput(agent) : { ...defaultAgentInput });
      setErrors({});
      setMemoryDraft("");
      setMemories([]);
      void window.groubot.ai.getConfig().then(setAIConfig);
      if (agent) void window.groubot.memories.list(agent.id).then(setMemories);
    }
  }, [agent, open]);

  function update<K extends keyof AgentInput>(key: K, value: AgentInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "", form: "" }));
  }

  async function submit() {
    const result = formSchema.safeParse(form);
    if (!result.success) {
      setErrors(Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0]), issue.message])));
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      onOpenChange(false);
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : "Could not save this agent." });
    } finally {
      setSaving(false);
    }
  }

  async function addMemory() {
    if (!agent || !memoryDraft.trim()) return;
    const memory = await window.groubot.memories.create({ agentId: agent.id, content: memoryDraft.trim() });
    setMemories((current) => [memory, ...current]);
    setMemoryDraft("");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full min-w-0 gap-0 overflow-visible p-0 sm:w-1/2" side="right">
        <div className="relative flex min-h-0 flex-1 flex-col">
          <AgentAvatarRail onCustomize={() => setStudioOpen(true)} onSelect={(value) => { update("avatarType", parseCustomAvatar(value) ? "icon" : "image"); update("avatarData", value); }} selected={form.avatarData} />
          <header className="sticky top-0 z-10 shrink-0 border-b border-border bg-card/95 px-8 py-5 pr-16 backdrop-blur sm:pl-16">
            <SheetTitle className="text-lg">{agent ? "Edit agent" : "Create an agent"}</SheetTitle>
            <SheetDescription className="mt-1 max-w-xl text-xs">Shape a focused companion for future Groubot conversations.</SheetDescription>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6 sm:pl-16">
            <div className="grid gap-6">
              <section className="grid gap-4"><SectionHeading eyebrow="Identity" title="Give your agent a clear role" /><Field error={errors.name} label="Name"><Input autoFocus={!agent} value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Research companion" /></Field><Field error={errors.description} label="Description and role"><Textarea className="min-h-24 resize-y" value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="What is this agent especially good at?" /></Field></section>
              <section className="grid gap-4"><SectionHeading eyebrow="Behavior" title="Set the personality" /><Field error={errors.systemInstructions} label="Personality and system instructions"><Textarea className="min-h-40 resize-y" value={form.systemInstructions} onChange={(event) => update("systemInstructions", event.target.value)} placeholder="Describe how this agent should think, communicate, and behave." /></Field><Field error={errors.goals} label="Goals (optional)"><Textarea className="min-h-28 resize-y" value={form.goals} onChange={(event) => update("goals", event.target.value)} placeholder="What outcomes should this agent optimize for?" /></Field></section>
              <section className="grid gap-4 rounded-xl border border-border/70 bg-background/35 p-4"><SectionHeading eyebrow="Settings" title="Runtime and memory" /><div className="flex items-start justify-between gap-4"><div className="flex gap-3"><Brain className="mt-0.5 size-4 text-primary" /><div><p className="text-sm font-medium">Persistent memory</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Store only explicit, useful long-term context for this agent.</p></div></div><Switch aria-label="Enable persistent memory" checked={form.memoryPreferences.memoryEnabled !== false} onCheckedChange={(checked) => update("memoryPreferences", { ...form.memoryPreferences, memoryEnabled: checked })} /></div>{agent && <div className="grid gap-2 border-t border-border/60 pt-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-foreground">Stored memories</p><Button className="h-7 text-xs" disabled={memories.length === 0} onClick={() => void (async () => { await window.groubot.memories.clear(agent.id); setMemories([]); })()} variant="ghost">Clear all</Button></div>{memories.length === 0 ? <p className="text-xs text-muted-foreground">No memories stored for this agent.</p> : <div className="grid gap-2">{memories.map((memory) => <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-card/60 p-2.5" key={memory.id}><p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">{memory.content}</p><Button aria-label="Delete memory" className="size-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => void (async () => { await window.groubot.memories.remove(memory.id); setMemories((current) => current.filter((item) => item.id !== memory.id)); })()} size="icon" variant="ghost"><Trash2 className="size-3.5" /></Button></div>)}</div>}<div className="flex gap-2"><Input className="h-8 text-xs" disabled={form.memoryPreferences.memoryEnabled === false} onChange={(event) => setMemoryDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addMemory(); } }} placeholder="Add a useful memory" value={memoryDraft} /><Button className="h-8 shrink-0 text-xs" disabled={form.memoryPreferences.memoryEnabled === false || !memoryDraft.trim()} onClick={() => void addMemory()}>Add</Button></div></div>}<div className="grid gap-2 border-t border-border/60 pt-4 text-xs text-muted-foreground"><p className="flex items-center gap-2"><span className="font-medium text-foreground">Model</span> {aiConfig?.model ?? "Loading…"} {aiConfig?.apiKeyConfigured ? "· configured" : "· API key missing"}</p><p className="flex items-center gap-2"><Globe2 className="size-3.5 text-primary" /> Web search available when current external information is needed.</p></div></section>
              <p className="text-xs leading-5 text-muted-foreground">Date, time, timezone, web search, and memory context are supplied securely by the desktop process for each execution.</p>
            </div>
          </div>
          <footer className="sticky bottom-0 z-10 flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card/95 px-8 py-4 pl-16 backdrop-blur"><span className="text-xs text-destructive">{errors.form}</span><div className="ml-auto flex gap-2"><Button onClick={() => onOpenChange(false)} variant="ghost">Cancel</Button><Button disabled={saving} onClick={() => void submit()}>{saving ? "Saving…" : agent ? "Save changes" : "Create agent"}</Button></div></footer>
        </div>
      </SheetContent>
      <AvatarStudioDialog open={studioOpen} onOpenChange={setStudioOpen} value={form.avatarData} onChange={(value) => { update("avatarType", value.startsWith("data:image/") ? "image" : "icon"); update("avatarData", value); }} />
    </Sheet>
  );
}

function Field({ error, label, children }: { error?: string; label: string; children: React.ReactNode }) { return <div className="grid gap-2"><Label>{label}</Label>{children}{error && <p className="text-xs text-destructive">{error}</p>}</div>; }
function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) { return <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p><h2 className="mt-1 text-sm font-medium text-foreground">{title}</h2></div>; }
function toInput(agent: Agent): AgentInput { const custom = parseCustomAvatar(agent.avatarData); const image = agent.avatarData.startsWith("data:image/") || agent.avatarData.startsWith("/agents/") || agent.avatarData.startsWith("./agents/"); return { name: agent.name, description: agent.description, avatarType: custom ? "icon" : "image", avatarData: custom || image ? agent.avatarData.replace(/^\.\/agents\//, "/agents/") : firstAvatar, provider: agent.provider, model: agent.model, systemInstructions: agent.systemInstructions, goals: agent.goals, customInstructions: agent.customInstructions, temperature: agent.temperature, modelSettings: agent.modelSettings, toolPermissions: agent.toolPermissions, memoryPreferences: agent.memoryPreferences }; }
