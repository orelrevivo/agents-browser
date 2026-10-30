import { Button, Popover, PopoverContent, PopoverTrigger } from "@groubot/ui";
import { ExternalLink, FolderDown, Menu, Settings, Sparkles, SquarePlus } from "lucide-react";
import { useBrowserOverlay, type BrowserOverlayBounds } from "./useBrowserOverlay";

interface BrowserMenuProps {
  onOpenAgents: () => void;
  onOpenDownloads: () => void;
  onNewTab: () => void;
  onNewWindow: () => void;
  onOverlayChange: (open: boolean, bounds?: BrowserOverlayBounds) => void;
}

export function BrowserMenu({
  onOpenAgents,
  onOpenDownloads,
  onNewTab,
  onNewWindow,
  onOverlayChange,
}: BrowserMenuProps) {
  const overlay = useBrowserOverlay(onOverlayChange);

  return (
    <Popover
      open={overlay.open}
      onOpenChange={overlay.onOpenChange}
    >
      <PopoverTrigger asChild>
        <Button
          aria-label="Open Groubot menu"
          className="size-8"
          size="icon"
          variant="ghost"
        >
          <Menu className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-56 p-2"
      >
        <div ref={overlay.surfaceRef}>
          <div className="mb-2 px-2 py-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Groubot
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Browser workspace</p>
          </div>

          <div className="grid gap-1">
            <MenuAction
              icon={<Sparkles className="size-4" />}
              label="Agents"
              onClick={onOpenAgents}
            />
            <MenuAction
              icon={<SquarePlus className="size-4" />}
              label="New tab"
              onClick={onNewTab}
              shortcut="Ctrl T"
            />
            <MenuAction
              icon={<ExternalLink className="size-4" />}
              label="New window"
              onClick={onNewWindow}
            />
            <div className="my-1 border-t border-border" />
            <MenuAction
              icon={<FolderDown className="size-4" />}
              label="Downloads"
              onClick={onOpenDownloads}
            />
            <MenuAction
              icon={<Settings className="size-4" />}
              label="Settings"
              onClick={() => {
                window.groubot.browser.navigate("about:preferences");
              }}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface MenuActionProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  shortcut?: string;
}

function MenuAction({ icon, label, onClick, shortcut }: MenuActionProps) {
  return (
    <Button
      className="h-9 w-full justify-start gap-3 px-2.5 text-xs"
      onClick={onClick}
      variant="ghost"
    >
      <span className="flex size-5 items-center justify-center text-muted-foreground">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {shortcut && <span className="text-[10px] text-muted-foreground">{shortcut}</span>}
    </Button>
  );
}
