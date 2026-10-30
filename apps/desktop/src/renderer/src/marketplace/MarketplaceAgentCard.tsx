import type { MarketplaceAgentDefinition } from "./marketplace-agents";
import { Button, Card, CardContent } from "@groubot/ui";
import { Check, Sparkles } from "lucide-react";

interface MarketplaceAgentCardProps {
  agent: MarketplaceAgentDefinition;
  hired: boolean;
  onHire: () => void;
}

export function MarketplaceAgentCard({ agent, hired, onHire }: MarketplaceAgentCardProps) {
  return (
    <Card className="overflow-hidden border-0 bg-[#fbf8f4] text-[#171717] shadow-none dark:bg-[#252321] dark:text-[#f7f3ee]">
      <CardContent className="p-0">
        <div className="relative mx-0 overflow-hidden rounded-[1.35rem] border border-black/10 bg-[#f5eee8] shadow-[0_5px_14px_rgba(0,0,0,0.09)] dark:border-white/10 dark:bg-[#302d2a] dark:shadow-[0_5px_14px_rgba(0,0,0,0.2)]">
          <div className="marketplace-agent-pattern absolute inset-0 opacity-70" />
          <div className="relative flex h-56 items-end justify-center px-8 pt-5">
            <img
              alt={`${agent.name}, ${agent.role}`}
              className="h-full w-full object-contain object-bottom drop-shadow-[0_10px_8px_rgba(0,0,0,0.12)]"
              src={agent.avatarSrc}
            />
            <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-white/85 px-3 py-1.5 text-sm font-semibold text-[#6f4941] shadow-sm backdrop-blur-sm dark:bg-black/35 dark:text-[#f1c9bc]">
              <Sparkles className="size-3.5" />
              {agent.badge} {agent.name}
            </div>
          </div>
        </div>
        <div className="space-y-3 px-5 pb-5 pt-4">
          <p className="text-sm font-medium text-black/60 dark:text-white/60">
            What to expect from {agent.name}
          </p>
          <ul className="space-y-2 text-sm leading-6">
            {agent.benefits.map((benefit) => (
              <li
                className="flex items-start gap-2"
                key={benefit}
              >
                <Check className="mt-1 size-3.5 shrink-0 text-[#7c5b51] dark:text-[#e7ae9d]" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm leading-6 text-black/60 dark:text-white/60">{agent.description}</p>
          <div className="flex items-center gap-4 pt-1">
            <Button
              className="rounded-full bg-[#292725] px-4 text-white hover:bg-[#3b3835] dark:bg-[#f7f3ee] dark:text-[#292725] dark:hover:bg-white"
              disabled={hired}
              onClick={onHire}
              size="sm"
            >
              {hired ? <Check className="size-4" /> : null}
              {hired ? "Hired" : `Hire ${agent.name}`}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
