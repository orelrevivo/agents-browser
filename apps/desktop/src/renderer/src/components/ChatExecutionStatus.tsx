import { BrainCircuit, Sparkles } from "lucide-react";

export function ChatExecutionStatus({
  label,
  kind,
  detail,
}: {
  label: string;
  kind: "thinking" | "skill";
  detail: string;
}) {
  const Icon = kind === "skill" ? Sparkles : BrainCircuit;

  return (
    <details className="mb-2 w-fit max-w-full rounded-lg border border-border/70 bg-background/60 text-xs text-muted-foreground">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50">
        <Icon className="size-3.5 text-primary" />
        <span>{label}</span>
      </summary>
      <p className="border-t border-border/60 px-3 py-2 text-[11px] leading-5">
        {detail}
      </p>
    </details>
  );
}
