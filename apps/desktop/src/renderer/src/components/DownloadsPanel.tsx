import { Button, Popover, PopoverContent, PopoverTrigger } from "@groubot/ui";
import type { BrowserDownloadState } from "@groubot/browser/types";
import {
  CheckCircle2,
  Download,
  LoaderCircle,
  Pause,
  Play,
  X,
} from "lucide-react";

interface DownloadsPanelProps {
  downloads?: BrowserDownloadState[];
  onOverlayChange: (open: boolean) => void;
}

export function DownloadsPanel({
  downloads = [],
  onOverlayChange,
}: DownloadsPanelProps) {
  return (
    <Popover onOpenChange={onOverlayChange}>
      <PopoverTrigger asChild>
        <Button
          aria-label="Open downloads"
          className="size-8"
          size="icon"
          variant="ghost"
        >
          <Download className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Downloads</p>
            <p className="text-xs text-muted-foreground">
              Recent browser downloads
            </p>
          </div>
          <Download className="size-4 text-muted-foreground" />
        </div>

        {downloads.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-7 text-center">
            <p className="text-xs text-muted-foreground">No downloads yet.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {downloads.map((download) => (
              <DownloadItem download={download} key={download.id} />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function DownloadItem({ download }: { download: BrowserDownloadState }) {
  const isDownloading = download.status === "downloading";
  const isPaused = download.status === "paused";

  return (
    <div className="rounded-lg border border-border bg-background/50 p-3">
      <div className="flex items-center gap-2">
        {isDownloading ? (
          <LoaderCircle className="size-4 animate-spin text-primary" />
        ) : (
          <CheckCircle2 className="size-4 text-emerald-400" />
        )}
        <p className="min-w-0 flex-1 truncate text-xs font-medium">
          {download.fileName}
        </p>
        <span className="text-[11px] text-muted-foreground">
          {isDownloading
            ? `${download.progress}%`
            : isPaused
              ? "Paused"
              : "Done"}
        </span>
      </div>
      {(isDownloading || isPaused) && (
        <>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${download.progress}%` }}
            />
          </div>
          {download.remainingText && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {download.remainingText} remaining
            </p>
          )}
          <div className="mt-2 flex items-center justify-end gap-1">
            <Button
              className="h-7 px-2 text-[11px]"
              onClick={() => {
                void window.groubot.browser.pauseDownload(download.id);
              }}
              variant="ghost"
            >
              {isPaused ? (
                <Play className="size-3.5" />
              ) : (
                <Pause className="size-3.5" />
              )}
              <span>{isPaused ? "Resume" : "Pause"}</span>
            </Button>
            <Button
              aria-label={`Cancel ${download.fileName}`}
              className="size-7 text-muted-foreground hover:text-destructive"
              onClick={() => {
                void window.groubot.browser.cancelDownload(download.id);
              }}
              size="icon"
              variant="ghost"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
