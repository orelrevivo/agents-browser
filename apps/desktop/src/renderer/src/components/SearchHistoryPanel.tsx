import { Clock3, Globe2, Search, Trash2 } from "lucide-react";
import { Button } from "@groubot/ui";

export interface SearchHistoryEntry {
  id: string;
  value: string;
  label: string;
  kind: "search" | "site";
}

interface SearchHistoryPanelProps {
  entries: SearchHistoryEntry[];
  onSelect: (entry: SearchHistoryEntry) => void;
  onClear: () => void;
}

export function SearchHistoryPanel({
  entries,
  onSelect,
  onClear,
}: SearchHistoryPanelProps) {
  return (
    <div
      className="absolute left-0 right-0 top-full z-[100] overflow-hidden rounded-b-xl border border-t-0 border-border bg-popover"
      data-search-history-panel
    >
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Recent searches and sites
        </span>
        <Button
          aria-label="Clear search history"
          className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
          onClick={onClear}
          size="sm"
          variant="ghost"
        >
          <Trash2 className="size-3" />
          Clear
        </Button>
      </div>
      <div className="max-h-72 overflow-y-auto p-1.5">
        {entries.map((entry) => (
          <button
            className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent"
            key={entry.id}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(entry)}
            type="button"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              {entry.kind === "site" ? (
                <Globe2 className="size-3.5" />
              ) : (
                <Search className="size-3.5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-foreground">
                {entry.label}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {entry.value}
              </span>
            </span>
            <Clock3 className="size-3.5 shrink-0 text-muted-foreground/60" />
          </button>
        ))}
      </div>
    </div>
  );
}
