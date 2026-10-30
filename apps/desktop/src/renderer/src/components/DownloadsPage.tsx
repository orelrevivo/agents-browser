import type { BrowserDownloadState } from "@groubot/browser/types";
import { Button, Card, CardContent } from "@groubot/ui";
import { ArrowDownToLine, FolderDown } from "lucide-react";
import { DownloadItem } from "./DownloadsPanel";

interface DownloadsPageProps {
  downloads: BrowserDownloadState[];
}

export function DownloadsPage({ downloads }: DownloadsPageProps) {
  return (
    <main className="h-full overflow-auto bg-background">
      <div className="mx-auto w-full max-w-4xl px-6 py-8 sm:px-10">
        <header className="flex items-start justify-between border-b border-border pb-6">
          <div>
            <div className="mb-3 flex items-center gap-2 text-primary">
              <FolderDown className="size-4" />
              <span className="text-xs font-medium uppercase tracking-[0.18em]">Groubot</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Downloads</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              View and manage files downloaded in Groubot.
            </p>
          </div>
          <Button
            aria-label="Downloads page"
            className="size-9"
            size="icon"
            variant="secondary"
          >
            <ArrowDownToLine className="size-4" />
          </Button>
        </header>

        <section className="mt-6">
          {downloads.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
                <FolderDown className="size-8 text-muted-foreground/60" />
                <div>
                  <p className="text-sm font-medium">No downloads yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Files you download will appear here.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {downloads.map((download) => (
                <DownloadItem
                  download={download}
                  key={download.id}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
