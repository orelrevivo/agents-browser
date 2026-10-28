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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  ScrollArea,
} from "@groubot/ui";
import {
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Pin,
  PinOff,
  Pencil,
  Sparkles,
  Store,
  UsersRound,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AgentAvatar } from "./AgentAvatar";

interface ChatSidebarProps {
  conversations: Conversation[];
  agents?: Agent[];
  activeId?: string;
  collapsed: boolean;
  onToggle: () => void;
  onNew: () => void;
  onSkills: () => void;
  onMarketplace: () => void;
  onNewGroup: () => void;
  activeSection: "chat" | "skills" | "marketplace" | "group";
  onGroupSelect?: (id: string) => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPin: (id: string, pinned: boolean) => Promise<void>;
}

export function ChatSidebar({
  conversations,
  agents = [],
  activeId,
  collapsed,
  onToggle,
  onNew,
  onSkills,
  onMarketplace,
  onNewGroup,
  activeSection,
  onSelect,
  onRename,
  onDelete,
  onPin,
  onGroupSelect,
}: ChatSidebarProps) {
  const [deleteTarget, setDeleteTarget] = useState<Conversation>();
  const [renameTarget, setRenameTarget] = useState<Conversation>();
  const [renameValue, setRenameValue] = useState("");
  const [groups, setGroups] = useState<AgentGroup[]>([]);
  const [groupRenameTarget, setGroupRenameTarget] = useState<AgentGroup>();
  const [groupRenameValue, setGroupRenameValue] = useState("");
  const [groupDeleteTarget, setGroupDeleteTarget] = useState<AgentGroup>();
  const visibleConversations = conversations.filter(
    (conversation) => !conversation.groupId,
  );

  function loadGroups() {
    void window.groubot.groups.list().then(setGroups);
  }

  useEffect(() => {
    loadGroups();
    window.addEventListener("groubot:groups-changed", loadGroups);
    return () =>
      window.removeEventListener("groubot:groups-changed", loadGroups);
  }, []);

  return (
    <aside
      className={`flex shrink-0 flex-col overflow-hidden border-r border-border/70 bg-card/20 transition-[width] duration-200 ease-out ${collapsed ? "w-12" : "w-64"}`}
    >
      <div
        className={`flex h-12 shrink-0 items-center border-b border-border/60 ${collapsed ? "justify-center px-1" : "justify-between px-3"}`}
      >
        {!collapsed && <span className="text-sm">Chats</span>}
        <Button
          aria-label={
            collapsed ? "Expand chat sidebar" : "Collapse chat sidebar"
          }
          className="size-7 shrink-0"
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

      {!collapsed && (
        <>
          <div className="grid gap-1 p-2 pb-1">
            <Button
              className={`h-8 w-full justify-start gap-2 px-2.5 text-xs ${activeSection === "chat" ? "bg-primary/10 text-foreground hover:bg-primary/15" : "text-muted-foreground"}`}
              onClick={onNew}
              variant={activeSection === "chat" ? "secondary" : "ghost"}
            >
              <Plus className="size-3.5" />
              New chat
            </Button>
            <Button
              className={`h-8 w-full justify-start gap-2 px-2.5 text-xs ${activeSection === "skills" ? "bg-primary/10 text-foreground hover:bg-primary/15" : "text-muted-foreground"}`}
              onClick={onSkills}
              variant="ghost"
            >
              <Sparkles className="size-3.5" />
              Skills
            </Button>
            <Button
              type="button"
              className={`h-8 w-full justify-start gap-2 px-2.5 text-xs ${activeSection === "marketplace" ? "bg-primary/10 text-foreground hover:bg-primary/15" : "text-muted-foreground"}`}
              onClick={onMarketplace}
              variant="ghost"
            >
              <Store className="size-3.5" />
              Marketplace Agents
            </Button>
            <Button
              className="h-8 w-full justify-start gap-2 px-2.5 text-xs text-muted-foreground"
              onClick={onNewGroup}
              variant="ghost"
            >
              <UsersRound className="size-3.5" />
              New Group
            </Button>
          </div>

          <ScrollArea className="min-h-0 flex-1 px-2">
            <div className="space-y-1 pb-3">
              {groups.length > 0 && (
                <div className="mb-2 border-t border-border/50 pt-3">
                  <p className="px-3 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Groups
                  </p>
                  {[...groups]
                    .sort((left, right) => Number(right.pinned) - Number(left.pinned))
                    .map((group) => (
                    <button
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[11px] transition-colors ${activeId === group.id && activeSection === "group" ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
                      key={group.id}
                      onClick={() => {
                        if (onGroupSelect) {
                          onGroupSelect(group.id);
                          return;
                        }

                        void window.groubot.browser.navigate(
                          `groubot://group/${group.id}`,
                        );
                      }}
                      type="button"
                    >
                      <UsersRound className="size-3.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate" title={group.name}>
                        {truncateTitle(group.name)}
                      </span>
                      {group.pinned && <Pin className="size-3 shrink-0 text-primary" />}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <span
                            aria-label={`Options for ${group.name}`}
                            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={(event) => event.stopPropagation()}
                            role="button"
                            tabIndex={0}
                          >
                            <MoreHorizontal className="size-3.5" />
                          </span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" side="right" sideOffset={6}>
                          <DropdownMenuItem
                            onClick={() =>
                              void window.groubot.groups
                                .update(group.id, { pinned: !group.pinned })
                                .then(() => loadGroups())
                            }
                          >
                            {group.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                            {group.pinned ? "Unpin" : "Pin"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setGroupRenameTarget(group);
                              setGroupRenameValue(group.name);
                            }}
                          >
                            <Pencil className="size-4" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setGroupDeleteTarget(group)}
                          >
                            <Trash2 className="size-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </button>
                  ))}
                </div>
              )}
              {visibleConversations.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs leading-5 text-muted-foreground">
                  Your conversations will appear here.
                </p>
              ) : (
                visibleConversations.map((conversation) => (
                  <div
                    className={`group flex items-center gap-1 rounded-md px-1.5 py-0.5 ${activeId === conversation.id ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
                    key={conversation.id}
                  >
                    <AgentAvatar
                      agent={agents.find((agent) => agent.id === conversation.agentId)}
                      size="xs"
                    />
                    <button
                      className="min-w-0 flex-1 truncate py-1.5 text-left text-[11px]"
                      title={conversation.title}
                      onClick={() => onSelect(conversation.id)}
                      type="button"
                    >
                      {truncateTitle(conversation.title)}
                    </button>
                    {conversation.pinned && (
                      <Pin className="size-3 shrink-0 text-primary" />
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label={`Options for ${conversation.title}`}
                          className="size-6 shrink-0 opacity-60 transition-opacity hover:opacity-100 group-hover:opacity-100"
                          size="icon"
                          variant="ghost"
                        >
                          <MoreHorizontal className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" side="right" sideOffset={6}>
                        <DropdownMenuItem
                          onClick={() =>
                            void onPin(conversation.id, !conversation.pinned)
                          }
                        >
                          {conversation.pinned ? (
                            <PinOff className="size-4" />
                          ) : (
                            <Pin className="size-4" />
                          )}
                          {conversation.pinned ? "Unpin" : "Pin"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setRenameTarget(conversation);
                            setRenameValue(conversation.title);
                          }}
                        >
                          <Pencil className="size-4" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(conversation)}
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))
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
                  This permanently removes the conversation and its local
                  messages.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={() => {
                    if (!deleteTarget) return;
                    void onDelete(deleteTarget.id).then(() =>
                      setDeleteTarget(undefined),
                    );
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
                <Button onClick={() => setGroupRenameTarget(undefined)} variant="ghost">Cancel</Button>
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
