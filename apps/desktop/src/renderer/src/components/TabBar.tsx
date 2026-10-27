import type { BrowserState } from "@groubot/browser/types";
import { Button } from "@groubot/ui";
import { Globe2, Plus, Sparkles, X } from "./icons";
import { AlertTriangle, Bot } from "lucide-react";

export function TabBar({ state }: { state: BrowserState }) {
  return (
    <nav className="flex h-11 shrink-0 items-end gap-1 border-b border-border bg-background px-3 pt-1">
      <div className="flex min-w-0 flex-1 items-end gap-1 overflow-hidden">
        {state.tabs.map((tab, index) => <div className="flex items-end gap-1" key={tab.id}>
          <button className={`group flex h-10 min-w-48 max-w-64 items-center gap-2 rounded-t-xl border border-b-0 px-3.5 text-left text-[13px] transition-all ${tab.active ? "border-border bg-card text-foreground shadow-[0_-4px_18px_rgba(0,0,0,0.14)]" : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"}`} onClick={() => void window.groubot.browser.selectTab(tab.id)} type="button">
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] ${tab.kind === "home" ? "bg-primary/15 text-primary" : "bg-accent text-muted-foreground"}`}>
              {tab.kind === "home" ? <Sparkles className="size-3.5" /> : tab.kind === "agents" ? <Bot className="size-3.5" /> : <Globe2 className="size-3.5" />}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{tab.title || "New tab"}</span>
            {tab.controlledByTaskId && <span aria-label="Agent-controlled tab" className="flex size-4 items-center justify-center rounded-full bg-primary/15 text-primary" title="Agent-controlled tab"><Bot className="size-2.5" /></span>}
            {tab.requiresUserAction && <span aria-label="Manual verification required" className="flex size-4 items-center justify-center rounded-full bg-amber-500/15 text-amber-400" title={tab.userActionMessage}><AlertTriangle className="size-2.5" /></span>}
            {tab.lastError && !tab.requiresUserAction && <span aria-label="Tab error" className="flex size-4 items-center justify-center rounded-full bg-destructive/15 text-destructive" title={tab.lastError}><AlertTriangle className="size-2.5" /></span>}
            {tab.isLoading && <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />}
            <span aria-label={`Close ${tab.title || "tab"}`} className="rounded-md px-1 text-base leading-none text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground group-hover:opacity-100" onClick={(event) => { event.stopPropagation(); void window.groubot.browser.closeTab(tab.id); }} role="button" tabIndex={0}><X className="size-3.5" /></span>
          </button>
          {index === 0 && <Button aria-label="New tab" className="mb-1" onClick={() => void window.groubot.browser.createTab()} size="icon" variant="ghost"><Plus className="size-4" /></Button>}
        </div>)}
      </div>
    </nav>
  );
}
