import { useEffect, useMemo, useState } from "react";
import type { Agent, AgentGroup, Conversation } from "@groubot/db";
import { Button, Skeleton } from "@groubot/ui";
import { Plus, Store } from "lucide-react";
import { ChatSidebar } from "../components/ChatSidebar";
import { MarketplaceAgentCard } from "./MarketplaceAgentCard";
import {
  marketplaceAgents,
  toAgentInput,
} from "./marketplace-agents";

export function MarketplacePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [groups, setGroups] = useState<AgentGroup[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hiring, setHiring] = useState<string>();
  const [error, setError] = useState("");

  async function refresh() {
    const [nextAgents, nextConversations, nextGroups] = await Promise.all([
      window.groubot.agents.list(),
      window.groubot.chats.list(),
      window.groubot.groups.list(),
    ]);
    setAgents(nextAgents);
    setConversations(nextConversations);
    setGroups(nextGroups);
  }

  useEffect(() => {
    void refresh()
      .catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load marketplace.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleGroupsChanged() {
      void refresh().catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not refresh agent groups.",
        ),
      );
    }

    window.addEventListener("groubot:groups-changed", handleGroupsChanged);
    return () =>
      window.removeEventListener("groubot:groups-changed", handleGroupsChanged);
  }, []);

  const hiredNames = useMemo(
    () => new Set(agents.map((agent) => agent.name.toLowerCase())),
    [agents],
  );

  async function hire(name: string) {
    const definition = marketplaceAgents.find((agent) => agent.name === name);
    if (!definition) return;
    setHiring(name);
    setError("");
    try {
      await window.groubot.agents.create(toAgentInput(definition));
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not hire agent.",
      );
    } finally {
      setHiring(undefined);
    }
  }

  return (
    <div className="flex h-full min-h-0 bg-background">
      <ChatSidebar
        activeId={undefined}
        activeSection="marketplace"
        agents={agents}
        collapsed={sidebarCollapsed}
        conversations={conversations}
        onDelete={async (id) => {
          await window.groubot.chats.remove(id);
          await refresh();
        }}
        onMarketplace={() => undefined}
        onNew={() => void window.groubot.browser.navigate("groubot://")}
        onNewGroup={() =>
          window.dispatchEvent(new Event("groubot:new-group"))
        }
        onPin={async (id, pinned) => {
          await window.groubot.chats.setPinned({ id, pinned });
          await refresh();
        }}
        onRename={async (id, title) => {
          await window.groubot.chats.rename({ id, title });
          await refresh();
        }}
        onSelect={(id) =>
          void window.groubot.browser.navigate(`groubot://chat/${id}`)
        }
        onSkills={() =>
          void window.groubot.browser.navigate("groubot://skills")
        }
        onToggle={() => setSidebarCollapsed((value) => !value)}
      />
      <main className="min-w-0 flex-1 overflow-auto bg-background">
        <div className="mx-auto w-full max-w-5xl px-6 py-8 sm:px-10">
          <header className="flex flex-col gap-2 border-b border-border pb-6">
            <h1 className="text-3xl font-semibold tracking-tight">
              Marketplace Agents
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Hire focused companions for sales, support, development,
              research, marketing, and operations.
            </p>
          </header>

          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Agent teams</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Assemble agents into collaborative groups.
                </p>
              </div>
              <Button
                onClick={() =>
                  window.dispatchEvent(new Event("groubot:new-group"))
                }
                size="sm"
              >
                <Plus className="size-4" /> New group
              </Button>
            </div>
            {groups.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {groups.map((group) => (
                  <div className="rounded-2xl border border-border bg-card p-4" key={group.id}>
                    <p className="font-medium">{group.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {group.agentIds.length} agents · {group.allowAgentMessages ? "Members can post" : "Owner only"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {error ? (
            <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="mt-8 grid gap-6 xl:grid-cols-2">
              {marketplaceAgents.map((agent) => (
                <Skeleton className="h-72" key={agent.name} />
              ))}
            </div>
          ) : (
            <div className="mt-8 grid gap-6 xl:grid-cols-2">
              {marketplaceAgents.map((agent) => (
                <MarketplaceAgentCard
                  agent={agent}
                  hired={
                    hiredNames.has(agent.name.toLowerCase()) ||
                    hiring === agent.name
                  }
                  key={agent.name}
                  onHire={() => void hire(agent.name)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
