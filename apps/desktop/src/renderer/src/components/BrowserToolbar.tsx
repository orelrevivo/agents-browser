import type { FormEvent } from "react";
import { Button, Input, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@groubot/ui";
import { Bot } from "lucide-react";
import type { RefObject } from "react";
import type { BrowserState } from "../../../../electron/browser/types";
import { Chevron, ReloadIcon, SearchIcon } from "./icons";
import { ToolbarButton } from "./ToolbarButton";

export function BrowserToolbar({ activeTab, address, addressRef, onAddressChange, onAddressFocus, onAddressSubmit, onEditingChange }: {
  activeTab: BrowserState["tabs"][number] | undefined;
  address: string;
  onAddressChange: (value: string) => void;
  onAddressSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onEditingChange: (editing: boolean) => void;
  onAddressFocus: () => void;
  addressRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <TooltipProvider delayDuration={500}><header className="flex h-[60px] shrink-0 items-center gap-2 border-b border-border bg-card px-3">
      <div className="flex items-center gap-0.5">
        <ToolbarButton disabled={!activeTab?.canGoBack} label="Back" onClick={() => void window.groubot.browser.goBack()}><Chevron direction="left" /></ToolbarButton>
        <ToolbarButton disabled={!activeTab?.canGoForward} label="Forward" onClick={() => void window.groubot.browser.goForward()}><Chevron direction="right" /></ToolbarButton>
        <ToolbarButton label="Reload" onClick={() => void window.groubot.browser.reload()}><ReloadIcon /></ToolbarButton>
      </div>
      <form className="flex min-w-0 flex-1 justify-center" onSubmit={onAddressSubmit}>
        <div className="flex h-9 w-full max-w-2xl items-center rounded-lg border border-border bg-chrome-surface/80 px-3 transition hover:bg-chrome-surface focus-within:border-primary/40 focus-within:bg-chrome-surface focus-within:ring-4 focus-within:ring-primary/10">
          <span className="mr-2 text-muted-foreground"><SearchIcon /></span>
          <Input ref={addressRef} aria-label="Address and search bar" className="h-auto min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-xs shadow-none focus-visible:ring-0" onBlur={(event) => { if (!event.currentTarget.value.trim() && activeTab?.kind === "home") onAddressChange("groubot://"); onEditingChange(false); }} onChange={(event) => onAddressChange(event.target.value)} onFocus={(event) => { onAddressFocus(); onEditingChange(true); if (activeTab?.kind !== "home") event.currentTarget.select(); }} placeholder="Search the web or enter a URL" value={address} />
          {activeTab?.isLoading && <span className="ml-3 h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />}
        </div>
      </form>
      <Tooltip><TooltipTrigger asChild><Button aria-label="Open agents" className="hidden sm:inline-flex" onClick={() => void window.groubot.browser.navigate("groubot://agents")} size="icon" variant="ghost"><Bot className="size-4" /></Button></TooltipTrigger><TooltipContent>Agents</TooltipContent></Tooltip>
    </header></TooltipProvider>
  );
}
