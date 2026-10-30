import type { Agent, AgentGroup, Conversation } from "@groubot/db";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  ScrollArea,
} from "@groubot/ui";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Pin,
  Search,
  Sparkles,
  Store,
  TimerReset,
  UsersRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AgentAvatar } from "./AgentAvatar";

interface ChatSidebarProps {
  conversations: Conversation[];
  agents?: Agent[];
  activeConversationIds?: ReadonlySet<string>;
  activeId?: string;
  collapsed: boolean;
  onToggle: () => void;
  onNew: () => void;
  onSkills: () => void;
  onMarketplace: () => void;
  onNewGroup: () => void;
  onAutomation?: () => void;
  activeSection: "chat" | "skills" | "marketplace" | "group";
  onGroupSelect?: (id: string) => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPin: (id: string, pinned: boolean) => Promise<void>;
  onAgentPin: (id: string, pinned: boolean) => Promise<void>;
}

export function ChatSidebar({
  conversations,
  agents = [],
  activeConversationIds = new Set<string>(),
  activeId,
  collapsed,
  onToggle,
  onNew,
  onSkills,
  onMarketplace,
  onNewGroup,
  onAutomation = () => window.dispatchEvent(new Event("groubot:automation")),
  activeSection,
  onSelect,
  onRename,
  onDelete,
  onPin,
  onAgentPin,
  onGroupSelect,
}: ChatSidebarProps) {
  const [deleteTarget, setDeleteTarget] = useState<Conversation>();
  const [renameTarget, setRenameTarget] = useState<Conversation>();
  const [renameValue, setRenameValue] = useState("");
  const [groups, setGroups] = useState<AgentGroup[]>([]);
  const [groupRenameTarget, setGroupRenameTarget] = useState<AgentGroup>();
  const [groupRenameValue, setGroupRenameValue] = useState("");
  const [groupDeleteTarget, setGroupDeleteTarget] = useState<AgentGroup>();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [latestMessages, setLatestMessages] = useState<Record<string, string>>({});
  const visibleConversations = conversations.filter((conversation) => !conversation.groupId);
  const sortedConversations = [...visibleConversations].sort((left, right) => {
    const leftPinned = agents.find((agent) => agent.id === left.agentId)?.isPinned ? 1 : 0;
    const rightPinned = agents.find((agent) => agent.id === right.agentId)?.isPinned ? 1 : 0;
    return rightPinned - leftPinned;
  });

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      conversations.map(async (conversation) => {
        const detail = await window.groubot.chats.get(conversation.id).catch(() => undefined);
        const latest = detail?.messages.at(-1)?.content;
        return [conversation.id, latest ?? ""] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setLatestMessages(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [conversations]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const matchesSearch = (conversation: Conversation) => {
    if (!normalizedSearch) return true;
    const agent = agents.find((candidate) => candidate.id === conversation.agentId);
    return [agent?.name, agent?.description, conversation.title, latestMessages[conversation.id]]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedSearch));
  };

  function loadGroups() {
    void window.groubot.groups.list().then(setGroups);
  }

  useEffect(() => {
    loadGroups();
    window.addEventListener("groubot:groups-changed", loadGroups);
    return () => window.removeEventListener("groubot:groups-changed", loadGroups);
  }, []);

  return (
    <aside
      className={`chat-sidebar flex shrink-0 flex-col overflow-hidden border-r border-border/60 bg-background transition-[width,background-color] duration-300 ease-out ${collapsed ? "w-12" : "w-72"}`}
    >
      <div
        className={`flex h-14 shrink-0 items-center border-b border-border/40 ${collapsed ? "justify-center px-1" : "justify-between px-3.5"}`}
      >
        {!collapsed &&
          (searchOpen ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Input
                autoFocus
                className="h-8 min-w-0 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setSearchQuery("");
                    setSearchOpen(false);
                  }
                }}
                placeholder="Search agents"
                value={searchQuery}
              />
            </div>
          ) : (
            <span className="text-sm font-semibold tracking-tight">Chats</span>
          ))}
        <div className="flex items-center gap-0.5">
          {!collapsed && (
            <Button
              aria-label={searchOpen ? "Close agent search" : "Search agents"}
              className="size-8 shrink-0 rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => {
                setSearchOpen((value) => !value);
                if (searchOpen) setSearchQuery("");
              }}
              size="icon"
              variant="ghost"
            >
              <Search className="size-4" />
            </Button>
          )}
          <Button
            aria-label={collapsed ? "Expand chat sidebar" : "Collapse chat sidebar"}
            className="size-8 shrink-0 rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={onToggle}
            size="icon"
            variant="ghost"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </Button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="grid gap-1 p-3 pb-2">
            <Button
              className={`h-9 w-full justify-start gap-2 rounded-md px-3 text-xs ${activeSection === "chat" ? "bg-card text-foreground shadow-sm hover:bg-card" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
              onClick={onNew}
              variant={activeSection === "chat" ? "secondary" : "ghost"}
            >
              <Plus className="size-3.5" />
              New chat
            </Button>
            <Button
              className={`h-9 w-full justify-start gap-2 rounded-md px-3 text-xs ${activeSection === "skills" ? "bg-card text-foreground shadow-sm hover:bg-card" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
              onClick={onSkills}
              variant="ghost"
            >
              <Sparkles className="size-3.5" />
              Skills
            </Button>
            <Button
              type="button"
              className={`h-9 w-full justify-start gap-2 rounded-md px-3 text-xs ${activeSection === "marketplace" ? "bg-card text-foreground shadow-sm hover:bg-card" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
              onClick={onMarketplace}
              variant="ghost"
            >
              <Store className="size-3.5" />
              Marketplace Agents
            </Button>
            <Button
              className="h-9 w-full justify-start gap-2 rounded-md px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={onNewGroup}
              variant="ghost"
            >
              <UsersRound className="size-3.5" />
              New Group
            </Button>
            <Button
              className="h-9 w-full justify-start gap-2 rounded-md px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={onAutomation}
              variant="ghost"
            >
              <TimerReset className="size-3.5" />
              Automation Task
            </Button>
          </div>

          <ScrollArea className="min-h-0 flex-1 px-2.5">
            <div className="space-y-2 pb-4">
              {groups.length > 0 && (
                <div className="mb-3 border-t border-border/40 pt-4">
                  {[...groups]
                    .sort((left, right) => Number(right.pinned) - Number(left.pinned))
                    .map((group) => (
                      <button
                        className={`group flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[11px] transition-[background-color,transform] duration-200 ${activeId === group.id && activeSection === "group" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:-translate-y-px hover:bg-accent hover:text-foreground"}`}
                        key={group.id}
                        onClick={() => {
                          if (onGroupSelect) {
                            onGroupSelect(group.id);
                            return;
                          }

                          void window.groubot.browser.navigate(`groubot://group/${group.id}`);
                        }}
                        type="button"
                      >
                        <UsersRound className="size-3.5 shrink-0" />
                        <span
                          className="min-w-0 flex-1 truncate"
                          title={group.name}
                        >
                          {truncateTitle(group.name)}
                        </span>
                        {group.pinned && <Pin className="size-3 shrink-0 text-primary" />}
                      </button>
                    ))}
                </div>
              )}
              {visibleConversations.filter(matchesSearch).length === 0 ? (
                <p className="px-3 py-8 text-center text-xs leading-5 text-muted-foreground">
                  Your conversations will appear here.
                </p>
              ) : (
                sortedConversations.filter(matchesSearch).map((conversation) => {
                  const conversationAgent = agents.find(
                    (agent) => agent.id === conversation.agentId,
                  );
                  return (
                    <div
                      className={`group flex min-h-[72px] items-center gap-3 rounded-2xl px-3 py-2 transition-[background-color,transform,box-shadow] duration-200 ${activeId === conversation.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:-translate-y-px hover:bg-accent hover:text-foreground"}`}
                      key={conversation.id}
                      onContextMenu={(event) => {
                        if (!conversationAgent) return;
                        event.preventDefault();
                        void onAgentPin(conversationAgent.id, !conversationAgent.isPinned);
                      }}
                    >
                      <AgentAvatar
                        agent={conversationAgent}
                        size="lg"
                      />
                      <button
                        className="flex min-w-0 flex-1 flex-col gap-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title={conversation.title}
                        onClick={() => onSelect(conversation.id)}
                        type="button"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-[13px] font-medium text-foreground">
                            {conversationAgent?.name ?? truncateTitle(conversation.title)}
                          </span>
                          <time className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                            {formatTime(conversation.updatedAt)}
                            {activeConversationIds.has(conversation.id) && (
                              <span
                                aria-label="Agent is working"
                                className="size-2 animate-pulse rounded-full bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.14)]"
                                title="Agent is working"
                              />
                            )}
                            {conversationAgent?.isPinned && (
                              <Pin
                                aria-label="Pinned agent"
                                className="size-3 text-primary"
                              />
                            )}
                          </time>
                        </span>
                        <span className="inline-flex w-fit max-w-[12rem] self-start truncate rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                          {conversationAgent?.description || "Your AI companion"}
                        </span>
                        <span className="max-w-[20ch] truncate text-[11px] text-muted-foreground">
                          {truncateMessage(latestMessages[conversation.id] || conversation.title)}
                        </span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
          <AlertDialog
            open={Boolean(deleteTarget)}
            onOpenChange={(open) => {
              if (!open) setDeleteTarget(undefined);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the conversation and its local messages.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={() => {
                    if (!deleteTarget) return;
                    void onDelete(deleteTarget.id).then(() => setDeleteTarget(undefined));
                  }}
                >
                  Delete chat
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Dialog
            open={Boolean(renameTarget)}
            onOpenChange={(open) => {
              if (!open) setRenameTarget(undefined);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Rename chat</DialogTitle>
                <DialogDescription>
                  Give this conversation a short, recognizable name.
                </DialogDescription>
              </DialogHeader>
              <Input
                autoFocus
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || !renameTarget) return;
                  event.preventDefault();
                  if (!renameValue.trim()) return;
                  void onRename(renameTarget.id, renameValue).then(() =>
                    setRenameTarget(undefined),
                  );
                }}
                value={renameValue}
              />
              <DialogFooter>
                <Button
                  onClick={() => setRenameTarget(undefined)}
                  variant="ghost"
                >
                  Cancel
                </Button>
                <Button
                  disabled={!renameValue.trim()}
                  onClick={() => {
                    if (!renameTarget) return;
                    void onRename(renameTarget.id, renameValue).then(() =>
                      setRenameTarget(undefined),
                    );
                  }}
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog
            open={Boolean(groupRenameTarget)}
            onOpenChange={(open) => {
              if (!open) setGroupRenameTarget(undefined);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Rename group</DialogTitle>
                <DialogDescription>Give this group a recognizable name.</DialogDescription>
              </DialogHeader>
              <Input
                autoFocus
                onChange={(event) => setGroupRenameValue(event.target.value)}
                value={groupRenameValue}
              />
              <DialogFooter>
                <Button
                  onClick={() => setGroupRenameTarget(undefined)}
                  variant="ghost"
                >
                  Cancel
                </Button>
                <Button
                  disabled={!groupRenameValue.trim() || !groupRenameTarget}
                  onClick={() => {
                    if (!groupRenameTarget) return;
                    void window.groubot.groups
                      .update(groupRenameTarget.id, { name: groupRenameValue })
                      .then(() => {
                        setGroupRenameTarget(undefined);
                        loadGroups();
                      });
                  }}
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <AlertDialog
            open={Boolean(groupDeleteTarget)}
            onOpenChange={(open) => {
              if (!open) setGroupDeleteTarget(undefined);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this group?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the group from your sidebar. Existing chat history is not affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={() => {
                    if (!groupDeleteTarget) return;
                    void window.groubot.groups.remove(groupDeleteTarget.id).then(() => {
                      setGroupDeleteTarget(undefined);
                      loadGroups();
                    });
                  }}
                >
                  Delete group
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </aside>
  );
}

function truncateTitle(title: string) {
  return title.length > 20 ? `${title.slice(0, 20)}…` : title;
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function truncateMessage(message: string, maxLength = 20) {
  return message.length > maxLength ? `${message.slice(0, maxLength - 1)}…` : message;
}
