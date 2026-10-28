import type { BrowserState } from "@groubot/browser/types";
import { Button } from "@groubot/ui";
import { Plus, Sparkles, X } from "./icons";
import { AlertTriangle, Bot } from "lucide-react";
import { TabIcon } from "./TabIcon";

export function TabBar({
  state,
  orientation = "top",
}: {
  state: BrowserState;
  orientation?: "top" | "sidebar";
}) {
  const isSidebar = orientation === "sidebar";

  return (
    <nav
      className={
        isSidebar
          ? "flex w-56 shrink-0 flex-col gap-2 bg-transparent mr-3"
          : "flex h-12 shrink-0 items-end gap-1 border-b border-border bg-background px-1 pt-1"
      }
    >
      <div
        className={
          isSidebar
            ? "flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto"
            : "flex min-w-0 flex-1 items-end gap-1 overflow-hidden"
        }
      >
        {state.tabs.map((tab) => (
          <div
            className={
              isSidebar
                ? "flex w-full items-center gap-1"
                : "flex items-end gap-1"
            }
            key={tab.id}
          >
            <button
              className={`group browser-tab flex items-center gap-2 text-left text-[13px] transition-all ${isSidebar ? "h-10 min-w-0 flex-1 rounded-md border px-2.5" : "h-10 min-w-48 max-w-64 mb-1 rounded-xl border border-b-0 px-3.5"} ${tab.active ? "border-border bg-card text-foreground" : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"} ${tab.controlledByTaskId ? "browser-tab-agent-active" : ""}`}
              onClick={() => void window.groubot.browser.selectTab(tab.id)}
              type="button"
            >
              {tab.kind === "home" ? (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <Sparkles className="size-3.5" />
                </span>
              ) : tab.kind === "agents" ? (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent text-muted-foreground">
                  <Bot className="size-3.5" />
                </span>
              ) : (
                <TabIcon faviconUrl={tab.faviconUrl} kind={tab.kind} />
              )}
              <span className="min-w-0 flex-1 truncate font-medium">
                {tab.title || "New tab"}
              </span>
              {tab.controlledByTaskId && (
                <span
                  aria-label="Agent-controlled tab"
                  className="flex size-4 items-center justify-center rounded-full bg-primary/15 text-primary"
                  title="Agent-controlled tab"
                >
                  <Bot className="size-2.5" />
                </span>
              )}
              {tab.requiresUserAction && (
                <span
                  aria-label="Manual verification required"
                  className="flex size-4 items-center justify-center rounded-full bg-amber-500/15 text-amber-400"
                  title={tab.userActionMessage}
                >
                  <AlertTriangle className="size-2.5" />
                </span>
              )}
              {tab.lastError && !tab.requiresUserAction && (
                <span
                  aria-label="Tab error"
                  className="flex size-4 items-center justify-center rounded-full bg-destructive/15 text-destructive"
                  title={tab.lastError}
                >
                  <AlertTriangle className="size-2.5" />
                </span>
              )}
              {tab.isLoading && (
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
              )}
              <span
                aria-label={`Close ${tab.title || "tab"}`}
                className="rounded-md px-1 text-base leading-none text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground group-hover:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  void window.groubot.browser.closeTab(tab.id);
                }}
                role="button"
                tabIndex={0}
              >
                <X className="size-3.5" />
              </span>
            </button>
          </div>
        ))}
        {!isSidebar && (
          <Button
            aria-label="New tab"
            className="mb-1 size-9 shrink-0 mb-1.5 border-none text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => void window.groubot.browser.createTab()}
            size="icon"
            variant="outline"
          >
            <Plus className="size-4" />
          </Button>
        )}
      </div>
      {isSidebar && (
        <Button
          aria-label="New tab"
          className="w-full justify-start gap-2"
          onClick={() => void window.groubot.browser.createTab()}
          variant="ghost"
        >
          <Plus className="size-4" />
          New tab
        </Button>
      )}
    </nav>
  );
}
