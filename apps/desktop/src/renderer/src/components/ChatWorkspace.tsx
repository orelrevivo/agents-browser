import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Agent,
  AgentGroup,
  AgentInput,
  ChatMessage,
  ChatMessageReference,
  Conversation,
  ConversationWithMessages,
  ChatMessageMetadata,
  ChatQuestion,
} from "@groubot/db";
import type { BrowserTabState } from "@groubot/browser/types";
import type { Skill } from "@groubot/db";
import { FileText, Globe2, Laptop, MoreHorizontal, Pencil, Pin, PinOff, X } from "lucide-react";
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
import { WorkspaceFilesPanel } from "./WorkspaceFilesPanel";
import { AgentEditorDialog } from "./AgentEditorDialog";
import { HomeAgentStrip } from "./HomeAgentStrip";
import { avatarColorHsl, parseCustomAvatar } from "./Customize Avatar/avatar-model";
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
  const [activeConversationIds, setActiveConversationIds] = useState<Set<string>>(() => new Set());
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
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([]);
  const [replyingTo, setReplyingTo] = useState<ChatMessage>();
  const [error, setError] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    document.documentElement.classList.contains("light") ? "light" : "dark",
  );
  const [customBackground, setCustomBackground] = useState<string | null>(() =>
    localStorage.getItem("groubot.customBackground"),
  );
  const [computerOpen, setComputerOpen] = useState(false);
  const [computerChooserOpen, setComputerChooserOpen] = useState(false);
  const [computerMode, setComputerMode] = useState<"browser" | "files">("browser");
  const [workspaceFolderName, setWorkspaceFolderName] = useState<string>();
  const [computerTabId, setComputerTabId] = useState<string>();
  const [computerConversationId, setComputerConversationId] = useState<string>();
  const computerPanelRef = useRef<HTMLDivElement>(null);
  const nativeComputerTab = useRef<string | undefined>(undefined);

  useEffect(() => {
    return () => {
      const tabId = nativeComputerTab.current;
      if (!tabId || !conversationId) return;
      nativeComputerTab.current = undefined;
      void window.groubot.browser.closeComputer(conversationId, tabId);
    };
  }, [conversationId]);

  useEffect(() => {
    if (!computerConversationId || computerConversationId === conversationId) return;
    const previousConversationId = computerConversationId;
    const previousTabId = computerTabId;
    if (previousTabId) {
      void window.groubot.browser.closeComputer(previousConversationId, previousTabId);
    }
    setComputerOpen(false);
    setComputerTabId(undefined);
    setComputerConversationId(undefined);
    nativeComputerTab.current = undefined;
  }, [computerConversationId, computerTabId, conversationId]);

  useEffect(() => {
    if (!computerOpen || !conversationId) return;
    const updateBounds = () => {
      const panel = computerPanelRef.current;
      if (!panel || !computerTabId) return;
      const rect = panel.getBoundingClientRect();
      const width = Math.max(1, Math.min(Math.round(rect.width), window.innerWidth));
      const height = Math.max(1, Math.min(Math.round(rect.height), window.innerHeight));
      if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return;
      void window.groubot.browser.resizeComputer({
        x: Math.max(0, Math.round(rect.left)),
        y: Math.max(0, Math.round(rect.top)),
        width,
        height,
      });
    };
    updateBounds();
    const settleTimer = window.setTimeout(updateBounds, 220);
    const observer = new ResizeObserver(updateBounds);
    if (computerPanelRef.current) observer.observe(computerPanelRef.current);
    window.addEventListener("resize", updateBounds);
    return () => {
      window.clearTimeout(settleTimer);
      observer.disconnect();
      window.removeEventListener("resize", updateBounds);
    };
  }, [computerOpen, computerTabId, conversationId]);

  useEffect(() => {
    if (
      !computerOpen ||
      !conversationId ||
      !computerTabId ||
      nativeComputerTab.current === computerTabId
    )
      return;
    const panel = computerPanelRef.current;
    if (!panel) {
      console.error("[groubot.computer] panel ref unavailable; native browser was not attached", {
        conversationId,
        tabId: computerTabId,
      });
      return;
    }
    const rect = panel.getBoundingClientRect();
    const savedComputerUrl = localStorage.getItem(`groubot.computer.url.${conversationId}`);
    nativeComputerTab.current = computerTabId;
    void window.groubot.browser
      .openComputer(conversationId, computerTabId, savedComputerUrl || "https://www.google.com/", {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      })
      .catch((error) => {
        console.error("[groubot.computer] open failed", error);
        nativeComputerTab.current = undefined;
        setComputerOpen(false);
        setComputerTabId(undefined);
        setComputerConversationId(undefined);
        localStorage.removeItem("groubot.computer.open");
        localStorage.removeItem("groubot.computer.conversation");
        localStorage.removeItem(`groubot.computer.url.${conversationId}`);
      });
  }, [computerOpen, computerTabId, conversationId]);

  const autoOpenedComputer = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!conversationId || autoOpenedComputer.current === conversationId) return;
    autoOpenedComputer.current = conversationId;
    if (
      localStorage.getItem("groubot.computer.open") === "true" &&
      localStorage.getItem("groubot.computer.conversation") === conversationId
    ) {
      window.setTimeout(() => void openComputer("browser"), 0);
    }
  }, [conversationId]);

  async function closeComputer() {
    if (!conversationId) return;
    if (computerTabId) {
      await window.groubot.browser.closeComputer(conversationId, computerTabId);
    }
    localStorage.removeItem("groubot.computer.open");
    localStorage.removeItem("groubot.computer.conversation");
    setComputerChooserOpen(false);
    setComputerOpen(false);
    setComputerTabId(undefined);
    setComputerConversationId(undefined);
    nativeComputerTab.current = undefined;
  }

  async function openComputer(mode: "browser" | "files") {
    if (!conversationId) return;
    setComputerChooserOpen(false);
    setComputerMode(mode);
    setComputerConversationId(conversationId);
    setComputerOpen(true);
    if (mode === "files") return;

    const tabId = crypto.randomUUID();
    localStorage.setItem("groubot.computer.open", "true");
    localStorage.setItem("groubot.computer.conversation", conversationId);
    setComputerTabId(tabId);
  }

  function toggleComputerChooser() {
    if (!conversationId) return;
    if (computerOpen) {
      void closeComputer();
      return;
    }
    setComputerChooserOpen((open) => !open);
  }

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
    () => agents.find((agent) => agent.id === (conversation?.agentId ?? selectedAgentId)),
    [agents, conversation?.agentId, selectedAgentId],
  );

  useEffect(() => {
    const root = document.documentElement;
    const customAvatar = selectedAgent?.avatarData
      ? parseCustomAvatar(selectedAgent.avatarData)
      : undefined;
    if (!customAvatar) {
      root.style.removeProperty("--groubot-agent-primary");
      root.style.removeProperty("--primary");
      root.style.removeProperty("--ring");
      return;
    }
    const primary = avatarColorHsl(customAvatar.color);
    root.style.setProperty("--groubot-agent-primary", `hsl(${primary})`);
    root.style.setProperty("--primary", primary);
    root.style.setProperty("--ring", primary);
    return () => {
      root.style.removeProperty("--groubot-agent-primary");
      root.style.removeProperty("--primary");
      root.style.removeProperty("--ring");
    };
  }, [selectedAgent?.avatarData]);
  const visibleMessages = useMemo(
    () => mergeMessages(conversation?.messages ?? [], optimisticMessages),
    [conversation?.messages, optimisticMessages],
  );

  async function refreshConversations() {
    setConversations(await window.groubot.chats.list());
  }

  useEffect(() => {
    const handleConversationsChanged = () => void refreshConversations();
    window.addEventListener("groubot:conversations-changed", handleConversationsChanged);
    return () =>
      window.removeEventListener("groubot:conversations-changed", handleConversationsChanged);
  }, []);

  async function loadConversation(id?: string, options: { clearError?: boolean } = {}) {
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
          current.filter((message) => !result.messages.some((saved) => saved.id === message.id)),
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
          availableAgents.find((agent) => agent.isDefault)?.id ?? availableAgents[0]?.id ?? null,
        );
    });
  }, [conversationId]);

  useEffect(() => window.groubot.browser.onStateChanged((next) => setBrowserTabs(next.tabs)), []);

  useEffect(() => {
    let mounted = true;
    const refreshActiveRuns = async () => {
      try {
        const runs = await window.groubot.chats.active();
        if (mounted)
          setActiveConversationIds(
            new Set(runs.filter((run) => !run.done).map((run) => run.conversationId)),
          );
      } catch {
        /* The backend may still be starting. */
      }
    };
    void refreshActiveRuns();
    const interval = window.setInterval(() => void refreshActiveRuns(), 800);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

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
        if (conversationId && event.conversationId !== conversationId) {
          if (event.type === "completed" || event.type === "error" || event.type === "cancelled")
            void refreshConversations();
          return;
        }
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
              event.status === "started" ? formatToolActivity(event.toolName) : undefined,
            );
          }
          setThinking(false);
          setStreaming(true);
          if (event.taskId)
            void window.groubot.browserTasks.get(event.taskId).then((task) => {
              if (task) setTaskActivity(task);
            });
        } else if (event.type === "question") {
          setStreaming(false);
          setActiveRequestId(undefined);
          setStreamingText("");
          setToolActivity(undefined);
          setThinking(false);
          void loadConversation(event.conversationId, { clearError: false });
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
          void Promise.all([loadConversation(event.conversationId), refreshConversations()]);
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
          setError(event.message ?? "The agent could not complete this response.");
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
        setToolActivity(`Waiting for permission: ${formatToolActivity(request.toolName)}`);
        setStreaming(true);
      }),
    [],
  );

  async function send(content: string, metadata?: ChatMessageMetadata): Promise<boolean> {
    if (!selectedAgentId && !conversation?.agentId) {
      setError("Create or select an agent before starting a chat.");
      return false;
    }

    const localMessageId = crypto.randomUUID();
    const outgoingMetadata =
      metadata ??
      (replyingTo
        ? ({ type: "reply", replyTo: toMessageReference(replyingTo) } satisfies ChatMessageMetadata)
        : undefined);
    const optimisticMessage: ChatMessage = {
      id: localMessageId,
      conversationId: conversation?.id ?? "pending",
      role: "user",
      content,
      agentId: null,
      metadata: outgoingMetadata,
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
        const created = await window.groubot.chats.create(selectedAgentId, null, permissionMode);
        setOptimisticMessages((current) =>
          current.map((message) =>
            message.id === localMessageId ? { ...message, conversationId: created.id } : message,
          ),
        );
        await window.groubot.browser.navigate(`groubot://chat/${created.id}`);
        const started = await window.groubot.chats.sendMessage({
          conversationId: created.id,
          content,
          metadata: outgoingMetadata,
        });
        if (started.taskId)
          void window.groubot.browserTasks.get(started.taskId).then((task) => {
            if (task) setTaskActivity(task);
          });
        setOptimisticMessages((current) =>
          current.map((message) => (message.id === localMessageId ? started.message : message)),
        );
        setActiveRequestId(started.requestId);
        setStreaming(true);
        setStreamingText("");
        setReplyingTo(undefined);
        await refreshConversations();
        return true;
      }
      const started = await window.groubot.chats.sendMessage({
        conversationId: conversation.id,
        content,
        metadata: outgoingMetadata,
      });
      if (started.taskId)
        void window.groubot.browserTasks.get(started.taskId).then((task) => {
          if (task) setTaskActivity(task);
        });
      setOptimisticMessages((current) =>
        current.map((message) => (message.id === localMessageId ? started.message : message)),
      );
      setActiveRequestId(started.requestId);
      setStreaming(true);
      setStreamingText("");
      setReplyingTo(undefined);
      return true;
    } catch (cause) {
      setStreaming(false);
      setToolActivity(undefined);
      setError(cause instanceof Error ? cause.message : "Unable to save this message.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function submitQuestion(question: ChatQuestion, answers: Record<string, string>) {
    const answerText = question.questions
      .map((item) => {
        const selected = item.options.find((option) => option.id === answers[item.id]);
        return `- ${item.prompt}: ${selected?.label ?? answers[item.id]}`;
      })
      .join("\n");
    return send(`Answers to “${question.title}”:\n${answerText}`, {
      type: "question_answer",
      questionId: question.id,
      answers,
    });
  }

  async function updateMessageMetadata(message: ChatMessage, metadata: ChatMessageMetadata) {
    const updated = await window.groubot.chats.updateMessageMetadata({
      conversationId: message.conversationId,
      messageId: message.id,
      metadata,
    });
    setConversation((current) =>
      current
        ? {
            ...current,
            messages: current.messages.map((item) => (item.id === updated.id ? updated : item)),
          }
        : current,
    );
    return updated;
  }

  async function addReaction(message: ChatMessage, emoji: string) {
    const current = message.metadata;
    const reactions = { ...(current?.reactions ?? {}) };
    reactions[emoji] = (reactions[emoji] ?? 0) + 1;
    await updateMessageMetadata(message, {
      ...(current ?? { type: "message" }),
      reactions,
    } as ChatMessageMetadata);
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
      setError(cause instanceof Error ? cause.message : "Unable to save browser permissions.");
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

  async function setAgentPinned(id: string, pinned: boolean) {
    const updated = await window.groubot.agents.setPinned(id, pinned);
    setAgents((current) => current.map((agent) => (agent.id === updated.id ? updated : agent)));
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
      setError(result.reason ?? "Complete the human verification before continuing.");
      const task = await window.groubot.browserTasks.get(taskActivity.id);
      if (task) setTaskActivity(task);
    } else {
      setError("");
      setStreaming(true);
    }
  }

  const title = conversation?.title ?? "New chat";
  const isConversation = Boolean((conversationId && conversation) || optimisticMessages.length);
  return (
    <>
      <div className="flex h-full min-h-0 bg-background dark:bg-[#161616]">
        <ChatSidebar
          activeId={groupId ?? conversationId}
          activeSection={groupId ? "group" : "chat"}
          collapsed={sidebarCollapsed}
          conversations={groupId ? [] : conversations}
          agents={agents}
          activeConversationIds={activeConversationIds}
          onNew={newChat}
          onDelete={deleteChat}
          onPin={setChatPinned}
          onAgentPin={setAgentPinned}
          onRename={renameChat}
          onSkills={() => void window.groubot.browser.navigate("groubot://skills")}
          onMarketplace={() => void window.groubot.browser.navigate("groubot://marketplace")}
          onNewGroup={() => window.dispatchEvent(new Event("groubot:new-group"))}
          onAutomation={() => window.dispatchEvent(new Event("groubot:automation"))}
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
            <header className="relative flex h-14 shrink-0 items-center justify-between border-b border-border/40 px-3.5">
              <div className="flex min-w-0 items-center gap-2">
                {activeGroup ? (
                  <div className="flex items-center -space-x-2">
                    {agents
                      .filter((agent) => activeGroup.agentIds.includes(agent.id))
                      .slice(0, 3)
                      .map((agent) => (
                        <div
                          className="rounded-full border-2 border-background"
                          key={agent.id}
                        >
                          <AgentAvatar
                            agent={agent}
                            size="sm"
                            status={
                              activeConversationIds.has(conversationId ?? "")
                                ? "working"
                                : undefined
                            }
                          />
                        </div>
                      ))}
                  </div>
                ) : (
                  <AgentAvatar
                    agent={selectedAgent}
                    size="sm"
                    status={activeConversationIds.has(conversationId ?? "") ? "working" : undefined}
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {activeGroup
                      ? `${activeGroup.agentIds.length} group members`
                      : (selectedAgent?.name ?? "Agent unavailable")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  aria-label={computerOpen ? "Close computer" : "Choose computer tool"}
                  className={
                    computerOpen || computerChooserOpen
                      ? "size-8 bg-primary/15 text-primary"
                      : "size-8"
                  }
                  onClick={toggleComputerChooser}
                  size="icon"
                  variant="ghost"
                  title={computerOpen ? "Close computer" : "Choose Browser or Files"}
                >
                  {computerOpen ? <X className="size-4" /> : <Laptop className="size-4" />}
                </Button>
                {computerChooserOpen && !computerOpen && (
                  <div className="absolute right-12 top-11 z-40 flex w-40 flex-col gap-1 rounded-lg border border-border bg-popover p-1.5 shadow-xl">
                    <button
                      className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-foreground transition-colors hover:bg-accent"
                      onClick={() => void openComputer("browser")}
                      type="button"
                    >
                      <Globe2 className="size-3.5 shrink-0 text-muted-foreground" />
                      Browser
                    </button>
                    <button
                      aria-disabled="true"
                      className="flex cursor-not-allowed items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-muted-foreground/60"
                      onClick={(event) => event.preventDefault()}
                      type="button"
                    >
                      <FileText className="size-3.5 shrink-0" />
                      <span className="min-w-0 flex-1">Files</span>
                      <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[9px] leading-none text-muted-foreground">
                        Coming Soon
                      </span>
                    </button>
                  </div>
                )}
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
                  <DropdownMenuContent
                    align="end"
                    side="bottom"
                    sideOffset={8}
                  >
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
              </div>
            </header>
          )}
          <div
            className={`relative flex min-h-0 flex-1 flex-col overflow-hidden ${computerOpen && conversationId ? "pr-[min(46vw,42rem)]" : ""}`}
          >
            {computerOpen && conversationId && computerConversationId === conversationId && (
              <div
                ref={computerPanelRef}
                className={`absolute inset-y-0 right-0 z-20 w-[min(46vw,42rem)] border-l border-border bg-transparent shadow-2xl transition-[width,transform] duration-300 ease-out ${computerMode === "files" ? "pointer-events-auto" : "pointer-events-none"}`}
                aria-label="Computer browser"
              >
                {computerMode === "files" && (
                  <WorkspaceFilesPanel
                    initialFolderName={workspaceFolderName}
                    onClose={() => setComputerMode("browser")}
                  />
                )}
              </div>
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
                  streaming={streaming || activeConversationIds.has(conversationId)}
                  streamingText={streamingText}
                  skillActivity={skillActivity}
                  toolActivity={toolActivity}
                  thinking={thinking}
                  onQuestionAnswer={submitQuestion}
                  onReply={setReplyingTo}
                  onReaction={addReaction}
                />
              ) : null
            ) : optimisticMessages.length ? (
              <ChatMessageList
                agent={selectedAgent}
                agents={agents}
                messages={visibleMessages}
                streaming={streaming || activeConversationIds.has(conversationId ?? "")}
                streamingText={streamingText}
                skillActivity={skillActivity}
                toolActivity={toolActivity}
                thinking={thinking}
                onQuestionAnswer={submitQuestion}
                onReply={setReplyingTo}
                onReaction={addReaction}
              />
            ) : null}
            <div
              className={`chat-composer-shell ${isConversation ? "chat-composer-shell-conversation" : "chat-composer-shell-home"}`}
              style={computerOpen && conversationId ? { right: "min(46vw, 42rem)" } : undefined}
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
                  onClearReply={() => setReplyingTo(undefined)}
                  onFolderSelect={setWorkspaceFolderName}
                  onSubmit={async (content) => {
                    await send(content);
                  }}
                  onPermissionModeChange={changePermissionMode}
                  permissionMode={permissionMode}
                  replyingTo={replyingTo}
                  selectedAgentName={selectedAgent?.name}
                  skills={skills}
                  tabs={browserTabs}
                />
              </div>
            </div>
          </div>
        </section>
      </div>
      <Dialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
      >
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
            <Button
              onClick={() => setRenameOpen(false)}
              variant="ghost"
            >
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
            void window.groubot.chats.respondToApproval(approvalRequest.approvalId, false);
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
            <span className="font-medium text-foreground">{approvalRequest?.toolName}</span>
            {approvalRequest?.input.selector ? ` · ${String(approvalRequest.input.selector)}` : ""}
            {typeof approvalRequest?.input.textLength === "number"
              ? ` · ${approvalRequest.input.textLength} characters`
              : ""}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                if (approvalRequest)
                  void window.groubot.chats.respondToApproval(approvalRequest.approvalId, false);
                setApprovalRequest(undefined);
              }}
            >
              Deny
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (approvalRequest)
                  void window.groubot.chats.respondToApproval(approvalRequest.approvalId, true);
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
  return [...saved, ...optimistic.filter((message) => !savedIds.has(message.id))].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
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

function toMessageReference(message: ChatMessage): ChatMessageReference {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  };
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
          <AgentAvatar
            agent={agent}
            size="xl"
          />
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
