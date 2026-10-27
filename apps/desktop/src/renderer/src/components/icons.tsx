import { ArrowUp, ChevronLeft, ChevronRight, Globe2, LayoutGrid, Plus, RotateCw, Search, Sparkles, Workflow, X } from "lucide-react";

export { ArrowUp, Globe2, LayoutGrid, Plus, RotateCw, Search, Sparkles, Workflow, X };

export function Chevron({ direction }: { direction: "left" | "right" }) {
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;
  return <Icon className="size-4" strokeWidth={1.8} />;
}

export function ReloadIcon() {
  return <RotateCw className="size-4" strokeWidth={1.8} />;
}

export function SearchIcon() {
  return <Search className="size-4" strokeWidth={1.8} />;
}
