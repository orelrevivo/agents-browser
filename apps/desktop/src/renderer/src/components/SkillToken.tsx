import { Button } from "@groubot/ui";
import { Check, Copy, ExternalLink, Sparkles, X } from "lucide-react";
import { useState, type ReactNode } from "react";

export function SkillToken({
  name,
  removable = false,
  onRemove,
}: {
  name: string;
  removable?: boolean;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-xs text-primary">
      <Sparkles className="size-3" />
      <span className="max-w-40 truncate">/{name}</span>
      {removable && (
        <button
          aria-label={`Remove ${name} skill`}
          className="rounded-sm p-0.5 transition hover:bg-primary/15"
          onClick={onRemove}
          type="button"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

export function TabToken({
  title,
  url,
  removable = false,
  onRemove,
  onClick,
}: {
  title: string;
  url: string;
  removable?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
}) {
  return (
    <span
      className="inline-flex max-w-64 items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-1 text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-accent"
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        onClick();
      }}
      title={`Open ${url} in a new tab`}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
      <span
        className="min-w-0 truncate"
        title={url}
      >
        {title}
      </span>
      {removable && (
        <button
          aria-label={`Remove ${title} tab`}
          className="rounded-sm p-0.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
          onClick={onRemove}
          type="button"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

export function MessageContent({
  content,
  onOpenUrl,
}: {
  content: string;
  onOpenUrl?: (url: string) => void;
}) {
  const openUrl = onOpenUrl ?? ((url: string) => void window.groubot.browser.createTab(url));
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    if (isTableHeader(lines[index], lines[index + 1])) {
      const tableLines = [lines[index], lines[index + 1]];
      index += 2;
      while (index < lines.length && isTableRow(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }
      blocks.push(
        <MessageTable
          key={`table-${index}`}
          lines={tableLines}
        />,
      );
      continue;
    }

    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (/^#{1,3}\s+/.test(line)) {
      blocks.push(
        <h3
          className="mb-2 mt-3 text-sm font-semibold"
          key={`heading-${index}`}
        >
          {line.replace(/^#{1,3}\s+/, "")}
        </h3>,
      );
    } else {
      blocks.push(
        <p
          className="whitespace-pre-wrap break-words"
          key={`line-${index}`}
        >
          <InlineMessageContent
            content={line}
            onOpenUrl={openUrl}
          />
        </p>,
      );
    }
    index += 1;
  }

  return <div className="space-y-2">{blocks}</div>;
}

function InlineMessageContent({
  content,
  onOpenUrl,
}: {
  content: string;
  onOpenUrl: (url: string) => void;
}) {
  const pattern = /\/([\w-]+)|\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let match = pattern.exec(content);

  while (match) {
    if (match.index > cursor) parts.push(content.slice(cursor, match.index));
    if (match[1]) {
      parts.push(
        <SkillToken
          key={`${match.index}-${match[1]}`}
          name={match[1]}
        />,
      );
    } else if (match[2] && match[3]) {
      const url = match[3];
      parts.push(
        <TabToken
          key={`${match.index}-${match[2]}`}
          title={match[2]}
          url={url}
          onClick={() => onOpenUrl(url)}
        />,
      );
    }
    cursor = match.index + match[0].length;
    match = pattern.exec(content);
  }
  if (cursor < content.length) parts.push(content.slice(cursor));
  return <>{parts}</>;
}

function MessageTable({ lines }: { lines: string[] }) {
  const rows = lines.map((line) => splitTableRow(line));
  const headers = rows[0] ?? [];
  const body = rows.slice(2);
  const tableText = lines.join("\n");
  const [copied, setCopied] = useState(false);

  async function copyTable() {
    await navigator.clipboard.writeText(tableText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/80 bg-background/70">
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Table
        </span>
        <button
          aria-label="Copy table"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
          onClick={() => void copyTable()}
          type="button"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-left text-xs">
          <thead className="bg-muted/50">
            <tr>
              {headers.map((header, index) => (
                <th
                  className="px-3 py-2 font-semibold"
                  key={`${header}-${index}`}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr
                className="border-t border-border/60"
                key={rowIndex}
              >
                {headers.map((_, columnIndex) => (
                  <td
                    className="px-3 py-2 align-top text-muted-foreground"
                    key={columnIndex}
                  >
                    {row[columnIndex] || "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function isTableHeader(line?: string, separator?: string): boolean {
  return Boolean(line && separator && isTableRow(line) && /^\s*\|?\s*:?-{2,}/.test(separator));
}

function isTableRow(line?: string): boolean {
  return Boolean(line && line.includes("|") && line.trim().split("|").length >= 3);
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function AttachmentButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <Button
      className="h-auto max-w-full justify-start px-0 py-0 text-left hover:bg-transparent"
      onClick={onClick}
      size="sm"
      variant="ghost"
    >
      {children}
    </Button>
  );
}
