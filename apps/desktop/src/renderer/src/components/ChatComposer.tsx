import { useEffect, useRef, useState } from "react";
import type { Agent } from "@groubot/db";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@groubot/ui";
import { ArrowUp, Bot } from "lucide-react";
import { AgentAvatar } from "./AgentAvatar";

export function ChatComposer({ agents, selectedAgentId, onAgentChange, onSubmit, onCancel, compact = false, busy = false }: {
  agents: Agent[];
  selectedAgentId: string | null;
  onAgentChange: (id: string) => void;
  onSubmit: (content: string) => Promise<void>;
  onCancel: () => void;
  compact?: boolean;
  busy?: boolean;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId);

  useEffect(() => {
    if (!compact) textareaRef.current?.focus();
  }, [compact]);

  async function submit() {
    const content = value.trim();
    if (!content || busy) return;
    setValue("");
    await onSubmit(content);
  }

  return <div className={compact ? "w-full" : "border-t border-border/70 bg-background/95 p-4 backdrop-blur"}>
    <div className={`mx-auto rounded-2xl border border-border/80 bg-card/90 transition-colors focus-within:border-primary/50 ${compact ? "max-w-2xl shadow-none" : "max-w-3xl"}`}>
      <Textarea ref={textareaRef} aria-label="Chat message" className="min-h-16 resize-none border-0 bg-transparent px-4 pb-2 pt-4 text-sm leading-6 shadow-none focus-visible:ring-0" disabled={busy} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} placeholder="Ask Groubot anything..." value={value} />
      <div className="flex items-center justify-between gap-2 px-3 pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <Bot className="size-4 shrink-0 text-muted-foreground" />
          <Select onValueChange={onAgentChange} value={selectedAgentId ?? undefined}>
            <SelectTrigger className="h-8 max-w-44 gap-2 border-0 bg-transparent px-1 text-xs shadow-none focus:ring-0"><SelectValue placeholder="Choose an agent" /></SelectTrigger>
            <SelectContent>{agents.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}</SelectContent>
          </Select>
          {selectedAgent && <AgentAvatar agent={selectedAgent} size="sm" />}
        </div>
        <Button aria-label={busy ? "Cancel response" : "Send message"} className="size-8 rounded-lg" disabled={!busy && !value.trim()} onClick={() => { if (busy) onCancel(); else void submit(); }} size="icon"><ArrowUp className={`size-4 ${busy ? "rotate-45" : ""}`} /></Button>
      </div>
    </div>
  </div>;
}
