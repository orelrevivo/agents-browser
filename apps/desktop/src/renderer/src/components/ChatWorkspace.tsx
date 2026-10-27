import { useEffect, useMemo, useState } from "react";
import type { Agent, ChatMessage, Conversation, ConversationWithMessages } from "@groubot/db";
import { Globe2, MessageSquare } from "lucide-react";
import type { BrowserTask } from "@groubot/db";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button } from "@groubot/ui";
import { AgentAvatar } from "./AgentAvatar";
import { ChatComposer } from "./ChatComposer";
import { ChatMessageList } from "./ChatMessageList";
import { ChatSidebar } from "./ChatSidebar";

type ApprovalRequest = { approvalId: string; toolName: string; description: string; input: Record<string, unknown> };

export function ChatWorkspace({ conversationId }: { conversationId?: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [conversation, setConversation] = useState<ConversationWithMessages>();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(Boolean(conversationId));
  const [busy, setBusy] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string>();
  const [streamingText, setStreamingText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [toolActivity, setToolActivity] = useState<string>();
  const [taskActivity, setTaskActivity] = useState<BrowserTask>();
  const [approvalRequest, setApprovalRequest] = useState<ApprovalRequest>();
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState("");

  const selectedAgent = useMemo(() => agents.find((agent) => agent.id === (conversation?.agentId ?? selectedAgentId)), [agents, conversation?.agentId, selectedAgentId]);
  const visibleMessages = useMemo(() => mergeMessages(conversation?.messages ?? [], optimisticMessages), [conversation?.messages, optimisticMessages]);

  async function refreshConversations() { setConversations(await window.groubot.chats.list()); }
  async function loadConversation(id?: string, options: { clearError?: boolean } = {}) {
    if (options.clearError !== false) setError("");
    if (!id) { setConversation(undefined); setLoading(false); return; }
    setLoading(true);
    try {
      const result = await window.groubot.chats.get(id);
      if (!result) setError("This chat could not be found.");
      setConversation(result);
      if (result) setOptimisticMessages((current) => current.filter((message) => !result.messages.some((saved) => saved.id === message.id)));
    } catch { setConversation(undefined); setError("This chat link is invalid or no longer available."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    void Promise.all([window.groubot.agents.list(), refreshConversations(), loadConversation(conversationId)]).then(([availableAgents]) => {
      setAgents(availableAgents);
      if (!conversationId) setSelectedAgentId(availableAgents.find((agent) => agent.isDefault)?.id ?? availableAgents[0]?.id ?? null);
    });
  }, [conversationId]);

  useEffect(() => {
    if (conversation) setSelectedAgentId(conversation.agentId ?? null);
  }, [conversation?.id, conversation?.agentId]);

  useEffect(() => window.groubot.chats.onStream((event) => {
    if (conversationId && event.conversationId !== conversationId) return;
    if (event.type === "started") {
      setActiveRequestId(event.requestId);
      setStreamingText("");
      setStreaming(true);
      setToolActivity(undefined);
    } else if (event.type === "delta") {
      setActiveRequestId(event.requestId);
      setStreamingText((current) => current + (event.delta ?? ""));
      setStreaming(true);
    } else if (event.type === "tool_activity") {
      setToolActivity(event.status === "started" ? formatToolActivity(event.toolName) : undefined);
      setStreaming(true);
      if (event.taskId) void window.groubot.browserTasks.get(event.taskId).then((task) => { if (task) setTaskActivity(task); });
    } else if (event.type === "completed") {
      setStreaming(false);
      setActiveRequestId(undefined);
      setStreamingText("");
      setToolActivity(undefined);
      if (event.taskId) void window.groubot.browserTasks.get(event.taskId).then((task) => { if (task) setTaskActivity(task); });
      setError("");
      void Promise.all([loadConversation(event.conversationId), refreshConversations()]);
    } else if (event.type === "cancelled") {
      setStreaming(false);
      setActiveRequestId(undefined);
      setStreamingText("");
      setToolActivity(undefined);
      if (event.taskId) void window.groubot.browserTasks.get(event.taskId).then((task) => { if (task) setTaskActivity(task); });
      void loadConversation(event.conversationId, { clearError: false });
    } else if (event.type === "error") {
      setStreaming(false);
      setActiveRequestId(undefined);
      setStreamingText("");
      setToolActivity(undefined);
      if (event.taskId) void window.groubot.browserTasks.get(event.taskId).then((task) => { if (task) setTaskActivity(task); });
      setError(event.message ?? "The agent could not complete this response.");
      void loadConversation(event.conversationId, { clearError: false });
    } else if (event.type === "waiting_for_human") {
      setStreaming(false);
      setActiveRequestId(undefined);
      setStreamingText("");
      setToolActivity(undefined);
      if (event.taskId) void window.groubot.browserTasks.get(event.taskId).then((task) => { if (task) setTaskActivity(task); });
      setError("");
    }
  }), [conversationId]);

  useEffect(() => window.groubot.chats.onApprovalRequest(setApprovalRequest), []);

  async function send(content: string) {
    const localMessageId = crypto.randomUUID();
    const optimisticMessage: ChatMessage = { id: localMessageId, conversationId: conversation?.id ?? "pending", role: "user", content, createdAt: Date.now() };
    setOptimisticMessages((current) => [...current, optimisticMessage]);
    setBusy(true); setStreaming(true); setStreamingText(""); setToolActivity(undefined); setError("");
    try {
      if (!conversation) {
        const created = await window.groubot.chats.create(selectedAgentId);
        setOptimisticMessages((current) => current.map((message) => message.id === localMessageId ? { ...message, conversationId: created.id } : message));
        await window.groubot.browser.navigate(`groubot://chat/${created.id}`);
        const started = await window.groubot.chats.sendMessage({ conversationId: created.id, content });
        if (started.taskId) void window.groubot.browserTasks.get(started.taskId).then((task) => { if (task) setTaskActivity(task); });
        setOptimisticMessages((current) => current.map((message) => message.id === localMessageId ? started.message : message));
        setActiveRequestId(started.requestId);
        setStreaming(true);
        setStreamingText("");
        await refreshConversations();
        return;
      }
      const started = await window.groubot.chats.sendMessage({ conversationId: conversation.id, content });
      if (started.taskId) void window.groubot.browserTasks.get(started.taskId).then((task) => { if (task) setTaskActivity(task); });
      setOptimisticMessages((current) => current.map((message) => message.id === localMessageId ? started.message : message));
      setActiveRequestId(started.requestId);
      setStreaming(true);
      setStreamingText("");
    } catch (cause) { setStreaming(false); setToolActivity(undefined); setError(cause instanceof Error ? cause.message : "Unable to save this message."); }
    finally { setBusy(false); }
  }

  async function newChat() { setError(""); await window.groubot.browser.navigate("groubot://"); }
  async function selectChat(id: string) { await window.groubot.browser.navigate(`groubot://chat/${id}`); }
  async function renameChat(id: string, title: string) { await window.groubot.chats.rename({ id, title }); await Promise.all([refreshConversations(), conversationId ? loadConversation(conversationId) : Promise.resolve()]); }
  async function deleteChat(id: string) { await window.groubot.chats.remove(id); await refreshConversations(); if (id === conversationId) await newChat(); }
  function cancel() { if (activeRequestId) void window.groubot.chats.cancel(activeRequestId); }
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
  return <><div className="flex h-full min-h-0 bg-background">
    <ChatSidebar activeId={conversationId} collapsed={sidebarCollapsed} conversations={conversations} onDelete={deleteChat} onNew={newChat} onRename={renameChat} onSelect={selectChat} onToggle={() => setSidebarCollapsed((value) => !value)} />
    <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      {isConversation && <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/70 px-4"><div className="flex min-w-0 items-center gap-2"><AgentAvatar agent={selectedAgent} size="sm" /><div className="min-w-0"><p className="truncate text-sm font-medium">{title}</p><p className="text-[10px] text-muted-foreground">{selectedAgent?.name ?? "Agent unavailable"}</p></div></div><MessageSquare className="size-4 text-muted-foreground" /></header>}
      {error && <div className="mx-auto mt-4 w-[calc(100%-2rem)] max-w-3xl rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      {taskActivity && <div className="mx-auto mt-3 flex w-[calc(100%-2rem)] max-w-3xl items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-left transition hover:bg-primary/10"><button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => { const tabId = taskActivity.tabIds.at(-1); if (tabId) void window.groubot.browser.selectTab(tabId); }} type="button"><Globe2 className="size-4 shrink-0 text-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{taskActivity.currentStep}</span><span className="block truncate text-[10px] text-muted-foreground">{taskActivity.title}</span></span><span className="text-[10px] capitalize text-muted-foreground">{taskActivity.status.replaceAll("_", " ")}</span></button>{taskActivity.status === "waiting_for_human" && <Button className="h-7 shrink-0 px-2 text-[11px]" onClick={() => void resumeHumanTask()} size="sm">Continue</Button>}</div>}
      {conversationId ? loading && !optimisticMessages.length ? <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading conversation…</div> : conversation || optimisticMessages.length ? <ChatMessageList agent={selectedAgent} messages={visibleMessages} streaming={streaming} streamingText={streamingText} toolActivity={toolActivity} /> : null : optimisticMessages.length ? <ChatMessageList agent={selectedAgent} messages={visibleMessages} streaming={streaming} streamingText={streamingText} toolActivity={toolActivity} /> : null}
      <div className={`chat-composer-shell ${isConversation ? "chat-composer-shell-conversation" : "chat-composer-shell-home"}`}>
        {!isConversation && <EmptyChatState />}
        <ChatComposer agents={agents} busy={busy || streaming} compact={!isConversation} onAgentChange={setSelectedAgentId} onCancel={cancel} onSubmit={send} selectedAgentId={conversation?.agentId ?? selectedAgentId} />
      </div>
    </section>
  </div><AlertDialog open={Boolean(approvalRequest)} onOpenChange={(open) => { if (!open && approvalRequest) { void window.groubot.chats.respondToApproval(approvalRequest.approvalId, false); setApprovalRequest(undefined); } }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Allow browser action?</AlertDialogTitle><AlertDialogDescription>{approvalRequest?.description ?? "The selected agent wants to interact with a website."}</AlertDialogDescription></AlertDialogHeader><div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">{approvalRequest?.toolName}</span>{approvalRequest?.input.selector ? ` · ${String(approvalRequest.input.selector)}` : ""}{typeof approvalRequest?.input.textLength === "number" ? ` · ${approvalRequest.input.textLength} characters` : ""}</div><AlertDialogFooter><AlertDialogCancel onClick={() => { if (approvalRequest) void window.groubot.chats.respondToApproval(approvalRequest.approvalId, false); setApprovalRequest(undefined); }}>Deny</AlertDialogCancel><AlertDialogAction onClick={() => { if (approvalRequest) void window.groubot.chats.respondToApproval(approvalRequest.approvalId, true); setApprovalRequest(undefined); }}>Allow</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}

function mergeMessages(saved: ChatMessage[], optimistic: ChatMessage[]) {
  const savedIds = new Set(saved.map((message) => message.id));
  return [...saved, ...optimistic.filter((message) => !savedIds.has(message.id))].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

function formatToolActivity(toolName?: string) {
  const labels: Record<string, string> = { list_tabs: "Checking open tabs", open_tab: "Opening a browser tab", navigate: "Navigating the browser", get_page_content: "Reading page content", get_page_title: "Checking page details", click_element: "Preparing to click on the page", type_text: "Preparing to enter text", scroll_page: "Scrolling the page" };
  return labels[toolName ?? ""] ?? "Using browser tools";
}

function EmptyChatState() {
  return <div className="flex flex-col items-center gap-5 px-6 text-center"><div><h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">What can we explore?</h1><p className="mt-3 w-full text-sm text-muted-foreground">Browse the web, gather context, and make progress from one calm workspace.</p></div><span className="sr-only">Start typing below to begin a chat.</span></div>;
}
