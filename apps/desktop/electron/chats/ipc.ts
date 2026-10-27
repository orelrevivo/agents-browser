import { ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import {
  chatMessageInputSchema,
  agentIdSchema,
  browserTaskIdSchema,
  conversationIdSchema,
  renameConversationSchema,
  type ChatMessage,
  type Conversation,
  type ConversationWithMessages,
  type Agent, type BrowserTaskProgress, type BrowserTask,
} from "@groubot/db";
import type { AgentExecutionConfig, GroubotAgentRunner } from "@groubot/ai";
import type { BrowserSession } from "../browser/session";
import { getBrowserSession } from "../browser/ipc";

function chatLog(event: string, details: Record<string, unknown> = {}): void {
  if (process.env.NODE_ENV !== "production") console.info(`[groubot.chat] ${event}`, JSON.stringify(details));
}

export interface ChatRepository {
  list(): Conversation[];
  get(id: string): ConversationWithMessages | undefined;
  create(agentId?: string | null): Conversation;
  appendUserMessage(input: { conversationId: string; content: string }): ChatMessage;
  appendAssistantMessage(input: { conversationId: string; content: string }): ChatMessage;
  rename(input: { id: string; title: string }): Conversation;
  remove(id: string): void;
}

export interface AgentResolver { get(id: string): Agent | undefined; list(): Agent[]; }
export interface MemoryRepository { list(agentId: string): import("@groubot/db").Memory[]; relevant(agentId: string, query: string, limit?: number): import("@groubot/db").Memory[]; create(input: { agentId: string; content: string }): import("@groubot/db").Memory; }
export interface BrowserTaskRepository { list(conversationId?: string): BrowserTask[]; get(id: string): BrowserTask | undefined; create(input: { conversationId?: string | null; agentId?: string | null; title: string }): BrowserTask; update(id: string, input: { status?: BrowserTask["status"]; currentStep?: string; tabIds?: string[]; progress?: BrowserTaskProgress[]; error?: string | null }): BrowserTask; remove(id: string): void; }

export function registerChatIpc(repository: ChatRepository, agentResolver: AgentResolver, memoryRepository: MemoryRepository, taskRepository: BrowserTaskRepository, agentRunner: GroubotAgentRunner): void {
  const activeRuns = new Map<string, AbortController>();
  const activeRequests = new Map<string, AbortController>();
  const pendingApprovals = new Map<string, { senderId: number; resolve: (approved: boolean) => void; taskId?: string }>();
  ipcMain.handle("browser-tasks:list", (_event, conversationId?: string) => taskRepository.list(conversationId));
  ipcMain.handle("browser-tasks:get", (_event, taskId: string) => taskRepository.get(browserTaskIdSchema.parse(taskId)));
  ipcMain.handle("browser-tasks:resume", async (event, taskId: string) => {
    const validTaskId = browserTaskIdSchema.parse(taskId);
    const task = taskRepository.get(validTaskId);
    if (!task || task.status !== "waiting_for_human" || !task.conversationId) return { resumed: false, reason: "This browser task is not waiting for human verification." };
    if (activeRuns.has(task.conversationId)) return { resumed: false, reason: "This conversation is already active." };
    const conversation = repository.get(task.conversationId);
    if (!conversation) return { resumed: false, reason: "The conversation for this task is no longer available." };
    const browserSession = getBrowserSession(event);
    for (const tabId of task.tabIds) {
      const requirement = await browserSession.refreshHumanVerificationState(tabId);
      if (requirement) {
        taskRepository.update(task.id, { status: "waiting_for_human", currentStep: "Waiting for manual verification", error: requirement });
        return { resumed: false, reason: requirement };
      }
    }
    const agentRecord = conversation.agentId ? agentResolver.get(conversation.agentId) : agentResolver.list().find((agent) => agent.isDefault);
    const requestId = randomUUID();
    const controller = new AbortController();
    activeRuns.set(conversation.id, controller);
    activeRequests.set(requestId, controller);
    taskRepository.update(task.id, { status: "running", currentStep: "Resuming browser task", error: null });
    event.sender.send("chats:stream", { requestId, conversationId: conversation.id, type: "started", taskId: task.id });
    void streamResponse(event.sender, browserSession, repository, agentRunner, memoryRepository, taskRepository, conversation, agentRecord, task, requestId, controller, activeRuns, activeRequests, (toolName, description, toolInput) => requestApproval(event.sender, pendingApprovals, taskRepository, task.id, toolName, description, toolInput));
    return { resumed: true, requestId, taskId: task.id };
  });
  ipcMain.handle("chats:list", () => repository.list());
  ipcMain.handle("chats:get", (_event, id: string) => repository.get(conversationIdSchema.parse(id)));
  ipcMain.handle("chats:create", (_event, agentId?: string | null) => {
    if (agentId !== undefined && agentId !== null) agentIdSchema.parse(agentId);
    return repository.create(agentId);
  });
  ipcMain.handle("chats:send-message", async (event, input: { conversationId: string; content: string }) => {
    const valid = chatMessageInputSchema.parse(input);
    if (activeRuns.has(valid.conversationId)) throw new Error("This conversation is already generating a response.");
    const initialConversation = repository.get(valid.conversationId);
    if (!initialConversation) throw new Error("Conversation not found");
    const agentRecord = initialConversation.agentId ? agentResolver.get(initialConversation.agentId) : agentResolver.list().find((agent) => agent.isDefault);
    const userMessage = repository.appendUserMessage(valid);
    const conversation = repository.get(valid.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    const requestId = randomUUID();
    const controller = new AbortController();
    const browserSession = getBrowserSession(event);
    const task = isBrowserTaskRequest(valid.content) ? taskRepository.create({ conversationId: valid.conversationId, agentId: agentRecord?.id ?? null, title: valid.content }) : undefined;
    activeRuns.set(valid.conversationId, controller);
    activeRequests.set(requestId, controller);
    chatLog("execution_start", { requestId, conversationId: valid.conversationId, agentId: agentRecord?.id, browserTools: true });
    event.sender.send("chats:stream", { requestId, conversationId: valid.conversationId, type: "started", userMessage });
    void streamResponse(event.sender, browserSession, repository, agentRunner, memoryRepository, taskRepository, conversation, agentRecord, task, requestId, controller, activeRuns, activeRequests, (toolName, description, toolInput) => requestApproval(event.sender, pendingApprovals, taskRepository, task?.id, toolName, description, toolInput));
    return { requestId, message: userMessage, taskId: task?.id };
  });
  ipcMain.handle("chats:cancel", (_event, requestId: string) => {
    activeRequests.get(requestId)?.abort();
    return requestId;
  });
  ipcMain.handle("ai:approval-response", (event, approvalId: string, approved: boolean) => {
    const pending = pendingApprovals.get(approvalId);
    if (!pending || pending.senderId !== event.sender.id) return false;
    pendingApprovals.delete(approvalId);
    if (pending.taskId) taskRepository.update(pending.taskId, { status: approved ? "running" : "failed", currentStep: approved ? "Resuming browser task" : "Approval denied", error: approved ? null : "The user denied the browser action." });
    pending.resolve(Boolean(approved));
    return true;
  });
  ipcMain.handle("chats:rename", (_event, input: { id: string; title: string }) => repository.rename(renameConversationSchema.parse(input)));
  ipcMain.handle("chats:delete", (_event, id: string) => repository.remove(conversationIdSchema.parse(id)));
}

async function streamResponse(sender: Electron.WebContents, browserSession: BrowserSession, repository: ChatRepository, agentRunner: GroubotAgentRunner, memoryRepository: MemoryRepository, taskRepository: BrowserTaskRepository, conversation: ConversationWithMessages, agentRecord: Agent | undefined, task: BrowserTask | undefined, requestId: string, controller: AbortController, activeRuns: Map<string, AbortController>, activeRequests: Map<string, AbortController>, approveBrowserAction: (toolName: string, description: string, input: unknown) => Promise<boolean>) {
  let executionTimeout: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!agentRecord) throw new Error("The selected agent is no longer available. Choose another agent before continuing.");
    const memoryEnabled = agentRecord.memoryPreferences.memoryEnabled !== false;
    const latestUserMessage = [...conversation.messages].reverse().find((message) => message.role === "user")?.content ?? "";
    if (memoryEnabled) saveExplicitMemory(memoryRepository, agentRecord.id, latestUserMessage);
    const memories = memoryEnabled ? memoryRepository.relevant(agentRecord.id, latestUserMessage).map((memory) => memory.content) : [];
    const now = new Date();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const agent: AgentExecutionConfig = { name: agentRecord.name, description: agentRecord.description, systemInstructions: agentRecord.systemInstructions, goals: agentRecord.goals, model: undefined, memoryEnabled, memories, maxTurns: task ? 20 : 10, runtimeContext: { date: new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(now), time: new Intl.DateTimeFormat(undefined, { timeStyle: "long" }).format(now), timezone } };
    if (task) taskRepository.update(task.id, { status: "running", currentStep: "Inspecting the browser" });
    const browserHost = task ? createTaskBrowserHost(browserSession, task.id, taskRepository) : browserSession;
    executionTimeout = task ? setTimeout(() => controller.abort(), 5 * 60 * 1000) : undefined;
    for await (const event of agentRunner.run(agent, conversation.messages.map((message) => ({ role: message.role, content: message.content })), controller.signal, {
      browserHost,
      approveBrowserAction: ({ toolName, description, input }) => approveBrowserAction(toolName, description, input),
      onBrowserActivity: ({ toolName, status }) => { if (task) updateTaskActivity(taskRepository, task.id, toolName, status, browserSession.listTabs()); sender.send("chats:stream", { requestId, conversationId: conversation.id, type: "tool_activity", toolName, status, taskId: task?.id }); },
    })) {
      chatLog("stream_event", { requestId, conversationId: conversation.id, type: event.type, deltaLength: event.type === "delta" ? event.delta.length : undefined, toolName: event.type === "tool_activity" ? event.toolName : undefined, status: event.type === "tool_activity" ? event.status : undefined });
      if (event.type === "completed" && task?.id && taskRepository.get(task.id)?.status === "waiting_for_human") continue;
      if (event.type === "completed") { repository.appendAssistantMessage({ conversationId: conversation.id, content: event.content }); if (task) taskRepository.update(task.id, { status: "completed", currentStep: "Task completed" }); }
      if (event.type === "cancelled" && task) taskRepository.update(task.id, { status: "cancelled", currentStep: "Task cancelled" });
      if (event.type === "error" && task && taskRepository.get(task.id)?.status !== "waiting_for_human") taskRepository.update(task.id, { status: "failed", currentStep: "Task failed", error: event.message });
      sender.send("chats:stream", { requestId, conversationId: conversation.id, ...event, taskId: task?.id });
    }
    const pausedTask = task ? taskRepository.get(task.id) : undefined;
    if (pausedTask?.status === "waiting_for_human") {
      chatLog("execution_waiting_for_human", { requestId, conversationId: conversation.id, taskId: pausedTask.id });
      sender.send("chats:stream", { requestId, conversationId: conversation.id, type: "waiting_for_human", taskId: pausedTask.id, message: pausedTask.error ?? "Complete human verification in the affected browser tab, then continue the task." });
      return;
    }
    chatLog("execution_complete", { requestId, conversationId: conversation.id });
  } catch (error) {
    if (task && taskRepository.get(task.id)?.status !== "waiting_for_human") taskRepository.update(task.id, { status: controller.signal.aborted ? "cancelled" : "failed", currentStep: controller.signal.aborted ? "Task cancelled" : "Task failed", error: error instanceof Error ? error.message : "The agent could not complete this response." });
    chatLog("execution_error", { requestId, conversationId: conversation.id, error: error instanceof Error ? error.message : "The agent could not complete this response." });
    sender.send("chats:stream", { requestId, conversationId: conversation.id, type: "error", code: "unknown", message: error instanceof Error ? error.message : "The agent could not complete this response." });
  } finally {
    if (executionTimeout) clearTimeout(executionTimeout);
    activeRuns.delete(conversation.id);
    activeRequests.delete(requestId);
  }
}

function requestApproval(sender: Electron.WebContents, pendingApprovals: Map<string, { senderId: number; resolve: (approved: boolean) => void; taskId?: string }>, taskRepository: BrowserTaskRepository, taskId: string | undefined, toolName: string, description: string, input: unknown): Promise<boolean> {
  const approvalId = randomUUID();
  sender.send("ai:approval-request", { approvalId, toolName, description, input: summarizeApprovalInput(input) });
  if (taskId) taskRepository.update(taskId, { status: "waiting_for_approval", currentStep: `Waiting for approval: ${toolName}` });
  return new Promise((resolve) => pendingApprovals.set(approvalId, { senderId: sender.id, resolve, taskId }));
}

function isBrowserTaskRequest(content: string): boolean { return /\b(open|navigate|browse|visit|website|webpage|page|tab|click|type|scroll|read|youtube|github)\b/i.test(content); }

function createTaskBrowserHost(session: BrowserSession, taskId: string, tasks: BrowserTaskRepository) {
  return {
    listTabs: () => session.listTabs(),
    openTab: async (input?: string) => { const id = await session.openTab(input, false, taskId); recordTab(tasks, taskId, id); return id; },
    navigateTab: async (tabId: string, url: string) => { await ensureHumanVerificationCleared(session, tasks, taskId, tabId); session.claimTab(taskId, tabId); recordTab(tasks, taskId, tabId); return session.navigateTab(tabId, url); },
    getPageContent: async (tabId: string) => { await ensureHumanVerificationCleared(session, tasks, taskId, tabId); return session.getPageContent(tabId); },
    getPageTitle: (tabId: string) => session.getPageTitle(tabId),
    inspectPage: async (tabId: string) => { const requirement = await session.refreshHumanVerificationState(tabId); if (requirement) tasks.update(taskId, { status: "waiting_for_human", currentStep: "Waiting for manual verification", error: requirement }); return session.inspectPage(tabId); },
    captureScreenshot: (tabId: string) => session.captureScreenshot(tabId),
    getUserActionRequirement: (tabId: string) => session.getUserActionRequirement(tabId),
    attachTab: async (tabId: string) => { session.claimTab(taskId, tabId); recordTab(tasks, taskId, tabId); return { tabId, attached: true }; },
    clickElement: async (tabId: string, selector: string) => { await ensureHumanVerificationCleared(session, tasks, taskId, tabId); return session.clickElement(tabId, selector); },
    typeText: async (tabId: string, selector: string, text: string) => { await ensureHumanVerificationCleared(session, tasks, taskId, tabId); return session.typeText(tabId, selector, text); },
    scrollPage: async (tabId: string, direction: "up" | "down", amount?: number) => { await ensureHumanVerificationCleared(session, tasks, taskId, tabId); return session.scrollPage(tabId, direction, amount); },
  };
}

async function ensureHumanVerificationCleared(session: BrowserSession, tasks: BrowserTaskRepository, taskId: string, tabId: string): Promise<void> {
  const requirement = await session.refreshHumanVerificationState(tabId);
  if (!requirement) return;
  tasks.update(taskId, { status: "waiting_for_human", currentStep: "Waiting for manual verification", error: requirement });
  throw new Error(requirement);
}

function recordTab(tasks: BrowserTaskRepository, taskId: string, tabId: string) { const task = tasks.get(taskId); if (task && !task.tabIds.includes(tabId)) tasks.update(taskId, { tabIds: [...task.tabIds, tabId] }); }
function updateTaskActivity(tasks: BrowserTaskRepository, taskId: string, toolName: string, status: "started" | "finished", tabs: ReturnType<BrowserSession["listTabs"]>) { const task = tasks.get(taskId); if (!task) return; const tab = tabs.find((item) => item.controlledByTaskId === taskId); const progress = status === "started" ? [...task.progress, { message: toolName.replaceAll("_", " "), site: tab?.title, tabId: tab?.id, createdAt: Date.now() }].slice(-20) : task.progress; const preservedStatus = task.status === "waiting_for_approval" || task.status === "waiting_for_human"; tasks.update(taskId, { status: preservedStatus ? task.status : "running", currentStep: status === "started" ? toolName.replaceAll("_", " ") : "Processing", progress }); }

function summarizeApprovalInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const value = input as Record<string, unknown>;
  return { tabId: typeof value.tabId === "string" ? value.tabId : undefined, selector: typeof value.selector === "string" ? value.selector : undefined, textLength: typeof value.text === "string" ? value.text.length : undefined };
}

function saveExplicitMemory(repository: MemoryRepository, agentId: string, message: string): void {
  const match = message.match(/^\s*(?:remember(?:\s+that)?|save\s+(?:this\s+)?memory)\s*[:,-]?\s+(.+)$/i);
  if (!match || isSensitiveMemory(match[1])) return;
  repository.create({ agentId, content: match[1].trim() });
}

function isSensitiveMemory(content: string): boolean {
  return /\b(password|passcode|api\s*key|secret|token|private\s*key|credit\s*card|social\s*security|ssn)\b/i.test(content);
}
