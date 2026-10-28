import { useEffect, useMemo, useState } from "react";
import type {
  Agent,
  AgentGroup,
  AgentInput,
  ChatMessage,
  Conversation,
  ConversationWithMessages,
} from "@groubot/db";
import type { BrowserTabState } from "@groubot/browser/types";
import type { Skill } from "@groubot/db";
import { Globe2, MoreHorizontal, Pencil, Pin, PinOff } from "lucide-react";
import type { BrowserTask } from "@groubot/db";
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
} from "@groubot/ui";
import { AgentAvatar } from "./AgentAvatar";
import { ChatComposer } from "./ChatComposer";
import { ChatMessageList } from "./ChatMessageList";
import { ChatSidebar } from "./ChatSidebar";
import { AgentEditorDialog } from "./AgentEditorDialog";
import { HomeAgentStrip } from "./HomeAgentStrip";
import darkBackground from "../../../../public/Background-dark.png";
import lightBackground from "../../../../public/Background-light.png";

type ApprovalRequest = {
  approvalId: string;
  toolName: string;
  description: string;
  input: Record<string, unknown>;
};

export function ChatWorkspace({
  conversationId,
  groupId,
}: {
  conversationId?: string;
  groupId?: string;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeGroup, setActiveGroup] = useState<AgentGroup>();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [browserTabs, setBrowserTabs] = useState<BrowserTabState[]>([]);
  const [conversation, setConversation] = useState<ConversationWithMessages>();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [permissionMode, setPermissionMode] = useState<"ask" | "full">("ask");
  const [agentEditorOpen, setAgentEditorOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(Boolean(conversationId));
  const [busy, setBusy] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string>();
  const [streamingText, setStreamingText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [toolActivity, setToolActivity] = useState<string>();
  const [skillActivity, setSkillActivity] = useState<string>();
  const [thinking, setThinking] = useState(false);
  const [taskActivity, setTaskActivity] = useState<BrowserTask>();
  const [approvalRequest, setApprovalRequest] = useState<ApprovalRequest>();
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>(
    [],
  );
  const [error, setError] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    document.documentElement.classList.contains("light") ? "light" : "dark",
  );
  const [customBackground, setCustomBackground] = useState<string | null>(() =>
    localStorage.getItem("groubot.customBackground"),
  );

  useEffect(() => {
    function handleBackgroundChange() {
      setCustomBackground(localStorage.getItem("groubot.customBackground"));
    }
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.classList.contains("light") ? "light" : "dark");
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    window.addEventListener("groubot:background-changed", handleBackgroundChange);
    return () => {
      observer.disconnect();
      window.removeEventListener("groubot:background-changed", handleBackgroundChange);
    };
  }, []);

  const selectedAgent = useMemo(
    () =>
      agents.find(
        (agent) => agent.id === (conversation?.agentId ?? selectedAgentId),
      ),
    [agents, conversation?.agentId, selectedAgentId],
  );
  const visibleMessages = useMemo(
    () => mergeMessages(conversation?.messages ?? [], optimisticMessages),
    [conversation?.messages, optimisticMessages],
  );

  async function refreshConversations() {
    setConversations(await window.groubot.chats.list());
  }
  async function loadConversation(
    id?: string,
    options: { clearError?: boolean } = {},
  ) {
    if (options.clearError !== false) setError("");
    if (!id) {
      setConversation(undefined);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await window.groubot.chats.get(id);
      if (!result) setError("This chat could not be found.");
      setConversation(result);
      if (result)
        setOptimisticMessages((current) =>
          current.filter(
            (message) =>
              !result.messages.some((saved) => saved.id === message.id),
          ),
        );
    } catch {
      setConversation(undefined);
      setError("This chat link is invalid or no longer available.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.all([
      window.groubot.agents.list(),
      groupId ? window.groubot.groups.get(groupId) : Promise.resolve(undefined),
      window.groubot.skills.list(),
      window.groubot.browser.getState(),
      refreshConversations(),
      loadConversation(conversationId),
    ]).then(([availableAgents, availableGroup, availableSkills, browserState]) => {
      setAgents(availableAgents);
      setActiveGroup(availableGroup);
      setSkills(availableSkills);
      setBrowserTabs(browserState.tabs);
      if (!conversationId)
        setSelectedAgentId(
          availableAgents.find((agent) => agent.isDefault)?.id ??
            availableAgents[0]?.id ??
            null,
        );
    });
  }, [conversationId]);

  useEffect(
    () =>
      window.groubot.browser.onStateChanged((next) =>
        setBrowserTabs(next.tabs),
      ),
    [],
  );

  useEffect(() => {
    if (conversation) {
      setSelectedAgentId(conversation.agentId ?? null);
      setPermissionMode(conversation.permissionMode);
    } else {
      setPermissionMode("ask");
    }
  }, [conversation?.id, conversation?.agentId]);

  useEffect(
    () =>
      window.groubot.chats.onStream((event) => {
        if (conversationId && event.conversationId !== conversationId) return;
        if (event.type === "started") {
          setActiveRequestId(event.requestId);
          setStreamingText("");
          setStreaming(true);
          setToolActivity(undefined);
          setSkillActivity(undefined);
          setThinking(true);
        } else if (event.type === "delta") {
          setActiveRequestId(event.requestId);
          setStreamingText((current) => current + (event.delta ?? ""));
          setStreaming(true);
          setThinking(false);
        } else if (event.type === "tool_activity") {
          const isSkill = event.toolName?.startsWith("skill_");
          if (isSkill) {
            setSkillActivity(formatSkillActivity(event.toolName));
            setToolActivity(undefined);
          } else {
            setToolActivity(
              event.status === "started"
                ? formatToolActivity(event.toolName)
                : undefined,
            );
          }
          setThinking(false);
          setStreaming(true);
          if (event.taskId)
            void window.groubot.browserTasks.get(event.taskId).then((task) => {
              if (task) setTaskActivity(task);
            });
        } else if (event.type === "completed") {
          setStreaming(false);
          setActiveRequestId(undefined);
          setStreamingText("");
          setToolActivity(undefined);
          setThinking(false);
          if (event.taskId)
            void window.groubot.browserTasks.get(event.taskId).then((task) => {
              if (task) setTaskActivity(task);
            });
          setError("");
          void Promise.all([
            loadConversation(event.conversationId),
            refreshConversations(),
          ]);
        } else if (event.type === "cancelled") {
          setStreaming(false);
          setActiveRequestId(undefined);
          setStreamingText("");
          setToolActivity(undefined);
          setThinking(false);
          if (event.taskId)
            void window.groubot.browserTasks.get(event.taskId).then((task) => {
              if (task) setTaskActivity(task);
            });
          void loadConversation(event.conversationId, { clearError: false });
        } else if (event.type === "error") {
          setStreaming(false);
          setActiveRequestId(undefined);
          setStreamingText("");
          setToolActivity(undefined);
          setThinking(false);
          if (event.taskId)
            void window.groubot.browserTasks.get(event.taskId).then((task) => {
              if (task) setTaskActivity(task);
            });
          setError(
            event.message ?? "The agent could not complete this response.",
          );
          void loadConversation(event.conversationId, { clearError: false });
        } else if (event.type === "waiting_for_human") {
          setStreaming(false);
          setActiveRequestId(undefined);
          setStreamingText("");
          setToolActivity(undefined);
          setThinking(false);
          if (event.taskId)
            void window.groubot.browserTasks.get(event.taskId).then((task) => {
              if (task) setTaskActivity(task);
            });
          setError("");
        }
      }),
    [conversationId],
  );

  useEffect(
    () =>
      window.groubot.chats.onApprovalRequest((request) => {
        setToolActivity(
          `Waiting for permission: ${formatToolActivity(request.toolName)}`,
        );
        setStreaming(true);
      }),
    [],
  );

  async function send(content: string) {
    if (!selectedAgentId && !conversation?.agentId) {
      setError("Create or select an agent before starting a chat.");
      return;
    }

    const localMessageId = crypto.randomUUID();
    const optimisticMessage: ChatMessage = {
      id: localMessageId,
      conversationId: conversation?.id ?? "pending",
      role: "user",
      content,
      agentId: null,
      createdAt: Date.now(),
    };
    setOptimisticMessages((current) => [...current, optimisticMessage]);
    setBusy(true);
    setStreaming(true);
    setStreamingText("");
    setToolActivity(undefined);
    setSkillActivity(undefined);
    setThinking(true);
    setError("");
    try {
      if (!conversation) {
        const created = await window.groubot.chats.create(
          selectedAgentId,
          null,
          permissionMode,
        );
        setOptimisticMessages((current) =>
          current.map((message) =>
            message.id === localMessageId
              ? { ...message, conversationId: created.id }
              : message,
          ),
        );
        await window.groubot.browser.navigate(`groubot://chat/${created.id}`);
        const started = await window.groubot.chats.sendMessage({
          conversationId: created.id,
          content,
        });
        if (started.taskId)
          void window.groubot.browserTasks.get(started.taskId).then((task) => {
            if (task) setTaskActivity(task);
          });
        setOptimisticMessages((current) =>
          current.map((message) =>
            message.id === localMessageId ? started.message : message,
          ),
        );
        setActiveRequestId(started.requestId);
        setStreaming(true);
        setStreamingText("");
        await refreshConversations();
        return;
      }
      const started = await window.groubot.chats.sendMessage({
        conversationId: conversation.id,
        content,
      });
      if (started.taskId)
        void window.groubot.browserTasks.get(started.taskId).then((task) => {
          if (task) setTaskActivity(task);
        });
      setOptimisticMessages((current) =>
        current.map((message) =>
          message.id === localMessageId ? started.message : message,
        ),
      );
      setActiveRequestId(started.requestId);
      setStreaming(true);
      setStreamingText("");
    } catch (cause) {
      setStreaming(false);
      setToolActivity(undefined);
      setError(
        cause instanceof Error ? cause.message : "Unable to save this message.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function newChat() {
    setError("");
    await window.groubot.browser.navigate("groubot://");
  }

  async function changePermissionMode(mode: "ask" | "full") {
    setPermissionMode(mode);
    if (!conversation) return;
    try {
      const updated = await window.groubot.chats.setPermissionMode({
        id: conversation.id,
        permissionMode: mode,
      });
      setConversation((current) =>
        current ? { ...current, permissionMode: updated.permissionMode } : current,
      );
    } catch (cause) {
      setPermissionMode(conversation.permissionMode);
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save browser permissions.",
      );
    }
  }

  function openCreateAgent() {
    setEditingAgent(undefined);
    setAgentEditorOpen(true);
  }

  function openEditAgent(agent: Agent) {
    setEditingAgent(agent);
    setAgentEditorOpen(true);
  }

  async function saveAgent(input: AgentInput) {
    const saved = editingAgent
      ? await window.groubot.agents.update(editingAgent.id, input)
      : await window.groubot.agents.create(input);

    setAgents(await window.groubot.agents.list());
    setSelectedAgentId(saved.id);
  }
  async function selectChat(id: string) {
    await window.groubot.browser.navigate(`groubot://chat/${id}`);
  }
  async function renameChat(id: string, title: string) {
    await window.groubot.chats.rename({ id, title });
    await Promise.all([
      refreshConversations(),
      conversationId ? loadConversation(conversationId) : Promise.resolve(),
    ]);
  }
  async function deleteChat(id: string) {
    await window.groubot.chats.remove(id);
    await refreshConversations();
    if (id === conversationId) await newChat();
  }
  async function togglePinChat() {
    if (!conversation) return;
    await setChatPinned(conversation.id, !conversation.pinned);
  }
  async function setChatPinned(id: string, pinned: boolean) {
    await window.groubot.chats.setPinned({ id, pinned });
    await refreshConversations();
    if (id === conversationId) await loadConversation(id);
  }
  async function saveConversationName() {
    if (!conversation || !renameValue.trim()) return;
    await renameChat(conversation.id, renameValue);
    setRenameOpen(false);
  }
  function cancel() {
    if (activeRequestId) void window.groubot.chats.cancel(activeRequestId);
  }
  async function resumeHumanTask() {
    if (!taskActivity) return;
    const result = await window.groubot.browserTasks.resume(taskActivity.id);
    if (!result.resumed) {
      setError(
        result.reason ?? "Complete the human verification before continuing.",
      );
      const task = await window.groubot.browserTasks.get(taskActivity.id);
      if (task) setTaskActivity(task);
    } else {
      setError("");
      setStreaming(true);
    }
  }

  const title = conversation?.title ?? "New chat";
  const isConversation = Boolean(
    (conversationId && conversation) || optimisticMessages.length,
  );
  return (
    <>
      <div className="flex h-full min-h-0 bg-background">
        <ChatSidebar
          activeId={groupId ?? conversationId}
          activeSection={groupId ? "group" : "chat"}
          collapsed={sidebarCollapsed}
          conversations={groupId ? [] : conversations}
          agents={agents}
          onNew={newChat}
          onDelete={deleteChat}
          onPin={setChatPinned}
          onRename={renameChat}
          onSkills={() =>
            void window.groubot.browser.navigate("groubot://skills")
          }
          onMarketplace={() =>
            void window.groubot.browser.navigate("groubot://marketplace")
          }
          onNewGroup={() =>
            window.dispatchEvent(new Event("groubot:new-group"))
          }
          onSelect={selectChat}
          onToggle={() => setSidebarCollapsed((value) => !value)}
        />
        <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {!isConversation && (
            <div
              className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat transition-all duration-300"
              style={{
                backgroundImage: `url(${customBackground || (theme === "light" ? lightBackground : darkBackground)})`,
              }}
            />
          )}
          {isConversation && (
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-4">
              <div className="flex min-w-0 items-center gap-2">
                {activeGroup ? (
                  <div className="flex items-center -space-x-2">
                    {agents
                      .filter((agent) => activeGroup.agentIds.includes(agent.id))
                      .slice(0, 3)
                      .map((agent) => (
                        <div className="rounded-full border-2 border-background" key={agent.id}>
                          <AgentAvatar agent={agent} size="sm" />
                        </div>
                      ))}
                  </div>
                ) : (
                  <AgentAvatar agent={selectedAgent} size="sm" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {activeGroup
                      ? `${activeGroup.agentIds.length} group members`
                      : selectedAgent?.name ?? "Agent unavailable"}
                  </p>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label="Chat options"
                    className="size-8"
                    size="icon"
                    variant="ghost"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="bottom" sideOffset={8}>
                  <DropdownMenuItem
                    onClick={() => {
                      setRenameValue(title);
                      setRenameOpen(true);
                    }}
                  >
                    Rename Chat
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void togglePinChat()}>
                    {conversation?.pinned ? (
                      <PinOff className="size-4" />
                    ) : (
                      <Pin className="size-4" />
                    )}
                    {conversation?.pinned ? "Unpin Chat" : "Pin Chat"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => {
                      if (conversation) void deleteChat(conversation.id);
                    }}
                  >
                    Delete Chat
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </header>
          )}
          {error && (
            <div className="mx-auto mt-4 w-[calc(100%-2rem)] max-w-3xl rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          {!conversationId && (
            <HomeAgentStrip
              agents={agents}
              onAdd={openCreateAgent}
              onSelect={setSelectedAgentId}
              selectedAgentId={selectedAgentId}
            />
          )}
          {taskActivity && (
            <div className="mx-auto mt-3 flex w-[calc(100%-2rem)] max-w-3xl items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-left transition hover:bg-primary/10">
              <button
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                onClick={() => {
                  const tabId = taskActivity.tabIds.at(-1);
                  if (tabId) void window.groubot.browser.selectTab(tabId);
                }}
                type="button"
              >
                <Globe2 className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">
                    {taskActivity.currentStep}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {taskActivity.title}
                  </span>
                </span>
                <span className="text-[10px] capitalize text-muted-foreground">
                  {taskActivity.status.replaceAll("_", " ")}
                </span>
              </button>
              {taskActivity.status === "waiting_for_human" && (
                <Button
                  className="h-7 shrink-0 px-2 text-[11px]"
                  onClick={() => void resumeHumanTask()}
                  size="sm"
                >
                  Continue
                </Button>
              )}
            </div>
          )}
          {conversationId ? (
            loading && !optimisticMessages.length ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Loading conversation…
              </div>
            ) : conversation || optimisticMessages.length ? (
              <ChatMessageList
                agent={selectedAgent}
                agents={agents}
                messages={visibleMessages}
                streaming={streaming}
                streamingText={streamingText}
                skillActivity={skillActivity}
                toolActivity={toolActivity}
                thinking={thinking}
              />
            ) : null
          ) : optimisticMessages.length ? (
            <ChatMessageList
              agent={selectedAgent}
              agents={agents}
              messages={visibleMessages}
              streaming={streaming}
              streamingText={streamingText}
              skillActivity={skillActivity}
              toolActivity={toolActivity}
              thinking={thinking}
            />
          ) : null}
          <div
            className={`chat-composer-shell ${isConversation ? "chat-composer-shell-conversation" : "chat-composer-shell-home"}`}
          >
            {!isConversation && (
              <div className="chat-home-agent">
                <EmptyChatState
                  agent={selectedAgent}
                  onEdit={openEditAgent}
                  onCreate={openCreateAgent}
                />
              </div>
            )}
            <div className={!isConversation ? "chat-home-composer" : undefined}>
              <ChatComposer
                busy={busy || streaming}
                canSend={Boolean(conversation?.agentId ?? selectedAgentId)}
                compact={!isConversation}
                onCancel={cancel}
                onSubmit={send}
                onPermissionModeChange={changePermissionMode}
                permissionMode={permissionMode}
                selectedAgentName={selectedAgent?.name}
                skills={skills}
                tabs={browserTabs}
              />
            </div>
          </div>
        </section>
      </div>
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Chat</DialogTitle>
            <DialogDescription>
              Choose a short name that will appear in your sidebar.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            onChange={(event) => setRenameValue(event.target.value)}
            value={renameValue}
          />
          <DialogFooter>
            <Button onClick={() => setRenameOpen(false)} variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={!renameValue.trim()}
              onClick={() => void saveConversationName()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(approvalRequest)}
        onOpenChange={(open) => {
          if (!open && approvalRequest) {
            void window.groubot.chats.respondToApproval(
              approvalRequest.approvalId,
              false,
            );
            setApprovalRequest(undefined);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Allow browser action?</AlertDialogTitle>
            <AlertDialogDescription>
              {approvalRequest?.description ??
                "The selected agent wants to interact with a website."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {approvalRequest?.toolName}
            </span>
            {approvalRequest?.input.selector
              ? ` · ${String(approvalRequest.input.selector)}`
              : ""}
            {typeof approvalRequest?.input.textLength === "number"
              ? ` · ${approvalRequest.input.textLength} characters`
              : ""}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                if (approvalRequest)
                  void window.groubot.chats.respondToApproval(
                    approvalRequest.approvalId,
                    false,
                  );
                setApprovalRequest(undefined);
              }}
            >
              Deny
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (approvalRequest)
                  void window.groubot.chats.respondToApproval(
                    approvalRequest.approvalId,
                    true,
                  );
                setApprovalRequest(undefined);
              }}
            >
              Allow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AgentEditorDialog
        agent={editingAgent}
        onOpenChange={setAgentEditorOpen}
        onSave={saveAgent}
        open={agentEditorOpen}
      />
    </>
  );
}

function mergeMessages(saved: ChatMessage[], optimistic: ChatMessage[]) {
  const savedIds = new Set(saved.map((message) => message.id));
  return [
    ...saved,
    ...optimistic.filter((message) => !savedIds.has(message.id)),
  ].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

function formatToolActivity(toolName?: string) {
  const labels: Record<string, string> = {
    list_tabs: "Checking open tabs",
    open_tab: "Opening a browser tab",
    navigate: "Navigating the browser",
    get_page_content: "Reading page content",
    get_page_title: "Checking page details",
    click_element: "Preparing to click on the page",
    type_text: "Preparing to enter text",
    scroll_page: "Scrolling the page",
  };
  return labels[toolName ?? ""] ?? "Using browser tools";
}

function formatSkillActivity(toolName?: string) {
  const name = toolName?.replace(/^skill_/, "").replace(/_[a-f0-9]{8}$/, "");
  return name ? `Using skill: ${name.replaceAll("_", " ")}` : "Using a saved skill";
}

function EmptyChatState({
  agent,
  onCreate,
  onEdit,
}: {
  agent?: Agent;
  onCreate: () => void;
  onEdit: (agent: Agent) => void;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-1 px-6 text-center">
      {agent ? (
        <div className="flex flex-col items-center gap-2">
          <AgentAvatar agent={agent} size="xl" />
          <Button
            aria-label={`Edit ${agent.name}`}
            className="size-6"
            onClick={() => onEdit(agent)}
            size="sm"
            title={`Edit ${agent.name}`}
            variant="ghost"
          >
            <Pencil className="size-3.5" />
          </Button>
        </div>
      ) : (
        <Button
          className="h-auto px-2 py-1 text-sm text-muted-foreground"
          onClick={onCreate}
          variant="ghost"
        >
          Create an Agent to Start
        </Button>
      )}
      <span className="sr-only">Start typing below to begin a chat.</span>
    </div>
  );
}
