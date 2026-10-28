import type { FormEvent } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import {
  Button,
  Input,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@groubot/ui";
import { Bot } from "lucide-react";
import type { RefObject } from "react";
import type {
  BrowserDownloadState,
  BrowserState,
} from "@groubot/browser/types";
import { Chevron, ReloadIcon, SearchIcon } from "./icons";
import { ToolbarButton } from "./ToolbarButton";
import { BrowserMenu } from "./BrowserMenu";
import { DownloadsPanel } from "./DownloadsPanel";
import {
  SearchHistoryPanel,
  type SearchHistoryEntry,
} from "./SearchHistoryPanel";

export function BrowserToolbar({
  activeTab,
  address,
  addressRef,
  onAddressChange,
  onAddressFocus,
  onAddressSubmit,
  onEditingChange,
  onOpenAgents,
  onOpenDownloads,
  onNewTab,
  onNewWindow,
  downloads,
  onOverlayChange,
  history,
  onHistorySelect,
  onClearHistory,
}: {
  activeTab: BrowserState["tabs"][number] | undefined;
  address: string;
  onAddressChange: (value: string) => void;
  onAddressSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onEditingChange: (editing: boolean) => void;
  onAddressFocus: () => void;
  addressRef: RefObject<HTMLInputElement | null>;
  onOpenAgents: () => void;
  onOpenDownloads: () => void;
  onNewTab: () => void;
  onNewWindow: () => void;
  downloads: BrowserDownloadState[];
  onOverlayChange: (
    open: boolean,
    bounds?: { x: number; y: number; width: number; height: number },
  ) => void;
  history: SearchHistoryEntry[];
  onHistorySelect: (entry: SearchHistoryEntry) => void;
  onClearHistory: () => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const searchFieldRef = useRef<HTMLDivElement>(null);
  const onOverlayChangeRef = useRef(onOverlayChange);
  onOverlayChangeRef.current = onOverlayChange;

  function setSearchHistoryOpen(open: boolean) {
    setHistoryOpen(open);
    if (!open || history.length === 0) {
      onOverlayChange(false);
    }
  }

  useLayoutEffect(() => {
    if (!historyOpen || history.length === 0) return;

    // Measure after React has committed the panel. Measuring from the click
    // handler can read the previous DOM, which produced a tiny 70x4 native
    // overlay in sidebar layout and made the panel appear missing.
    const panel = searchFieldRef.current?.querySelector<HTMLElement>(
      "[data-search-history-panel]",
    );
    if (!panel) return;

    let layoutRetries = 0;
    const updateBounds = () => {
      const bounds = panel.getBoundingClientRect();
      if ((bounds.width < 120 || bounds.height < 40) && layoutRetries < 5) {
        // A portal/popover can need one extra layout pass after focus. Do not
        // send a collapsed rectangle to the native window manager.
        layoutRetries += 1;
        window.requestAnimationFrame(updateBounds);
        return;
      }
      console.info("[groubot.overlay] measured search history", {
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        panel: `${bounds.left},${bounds.top} ${bounds.width}x${bounds.height}`,
      });
      onOverlayChangeRef.current(true, {
        x: bounds.left,
        y: bounds.top,
        width: bounds.width,
        height: bounds.height,
      });
    };

    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(panel);
    window.addEventListener("resize", updateBounds);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateBounds);
    };
  }, [historyOpen, history.length]);

  return (
    <TooltipProvider delayDuration={500}>
      <header className="flex h-[60px] shrink-0 items-center gap-2 border-b border-border bg-card px-3">
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            disabled={!activeTab?.canGoBack}
            label="Back"
            onClick={() => void window.groubot.browser.goBack()}
          >
            <Chevron direction="left" />
          </ToolbarButton>
          <ToolbarButton
            disabled={!activeTab?.canGoForward}
            label="Forward"
            onClick={() => void window.groubot.browser.goForward()}
          >
            <Chevron direction="right" />
          </ToolbarButton>
          <ToolbarButton
            label="Reload"
            onClick={() => void window.groubot.browser.reload()}
          >
            <ReloadIcon />
          </ToolbarButton>
        </div>
        <form
          className="relative flex min-w-0 flex-1 justify-center"
          onSubmit={onAddressSubmit}
        >
          <div
            ref={searchFieldRef}
            className={`relative flex h-9 w-full max-w-2xl items-center border border-border bg-card px-3 dark:border-none dark:bg-[#141414]/60 ${historyOpen && history.length > 0 ? "rounded-t-lg rounded-b-none" : "rounded-lg"}`}
          >
            <span className="mr-2 text-muted-foreground">
              <SearchIcon />
            </span>
            <Input
              ref={addressRef}
              aria-label="Address and search bar"
              className="h-auto min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-xs shadow-none focus-visible:ring-0"
              onBlur={(event) => {
                if (
                  !event.currentTarget.value.trim() &&
                  activeTab?.kind === "home"
                )
                  onAddressChange("groubot://");
                onEditingChange(false);
                window.setTimeout(() => setSearchHistoryOpen(false), 120);
              }}
              onChange={(event) => onAddressChange(event.target.value)}
              onFocus={(event) => {
                onAddressFocus();
                onEditingChange(true);
                setSearchHistoryOpen(true);
                if (activeTab?.kind !== "home") event.currentTarget.select();
              }}
              placeholder="Search the web or enter a URL"
              value={address}
            />
            {activeTab?.isLoading && (
              <span className="ml-3 h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
            )}
            {historyOpen && history.length > 0 && (
              <SearchHistoryPanel
                entries={history}
                onClear={() => {
                  setSearchHistoryOpen(false);
                  onClearHistory();
                }}
                onSelect={(entry) => {
                  setSearchHistoryOpen(false);
                  onHistorySelect(entry);
                }}
              />
            )}
          </div>
        </form>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Open agents"
                className="hidden sm:inline-flex"
                onClick={onOpenAgents}
                size="icon"
                variant="ghost"
              >
                <Bot className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Agents</TooltipContent>
          </Tooltip>
          <DownloadsPanel
            downloads={downloads}
            onOverlayChange={onOverlayChange}
          />
          <BrowserMenu
            onNewTab={onNewTab}
            onNewWindow={onNewWindow}
            onOpenAgents={onOpenAgents}
            onOpenDownloads={onOpenDownloads}
            onOverlayChange={onOverlayChange}
          />
        </div>
      </header>
    </TooltipProvider>
  );
}
