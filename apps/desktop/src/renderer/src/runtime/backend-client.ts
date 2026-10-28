import type {
  Agent,
  AgentGroup,
  AgentGroupInput,
  AgentGroupUpdate,
  AgentInput,
  ChatMessage,
  Conversation,
  ConversationWithMessages,
  Memory,
  Skill,
  SkillInput,
} from "@groubot/db";

const backendBaseUrl = "http://127.0.0.1:43127";

export interface BackendRunEvent {
  type:
    | "started"
    | "delta"
    | "completed"
    | "cancelled"
    | "tool_activity"
    | "approval_request"
    | "error";
  delta?: string;
  content?: string;
  code?: string;
  message?: string;
  toolName?: string;
  status?: "started" | "finished";
  approvalId?: string;
  description?: string;
  input?: Record<string, unknown>;
}

export interface BackendRunSnapshot {
  conversationId: string;
  events: BackendRunEvent[];
  done: boolean;
}

export interface BrowserRequest {
  requestId: string;
  operation: string;
  payload: unknown;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backendBaseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let message = `Backend request failed (${response.status}).`;
    try {
      message =
        ((await response.json()) as { error?: string }).error ?? message;
    } catch {}
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const backendClient = {
  agents: {
    list: () => request<Agent[]>("/api/agents"),
    create: (input: AgentInput) =>
      request<Agent>("/api/agents", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    update: (id: string, input: AgentInput) =>
      request<Agent>(`/api/agents/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    duplicate: (id: string) =>
      request<Agent>(`/api/agents/${id}/duplicate`, { method: "POST" }),
    remove: (id: string) =>
      request<void>(`/api/agents/${id}`, { method: "DELETE" }),
    setDefault: (id: string) =>
      request<Agent>(`/api/agents/${id}/default`, { method: "PUT" }),
  },
  groups: {
    list: () => request<AgentGroup[]>("/api/groups"),
    get: (id: string) => request<AgentGroup | undefined>(`/api/groups/${id}`),
    create: (input: AgentGroupInput) =>
      request<AgentGroup>("/api/groups", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    update: (id: string, input: AgentGroupUpdate) =>
      request<AgentGroup>(`/api/groups/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    remove: (id: string) =>
      request<void>(`/api/groups/${id}`, { method: "DELETE" }),
  },
  chats: {
    list: () => request<Conversation[]>("/api/chats"),
    get: (id: string) =>
      request<ConversationWithMessages | undefined>(`/api/chats/${id}`),
    create: (
      agentId?: string | null,
      groupId?: string | null,
      permissionMode?: "ask" | "full",
    ) =>
      request<Conversation>("/api/chats", {
        method: "POST",
        body: JSON.stringify({
          agentId: agentId ?? null,
          groupId: groupId ?? null,
          permissionMode: permissionMode ?? "ask",
        }),
      }),
    sendMessage: (conversationId: string, content: string) =>
      request<{ requestId: string; message: ChatMessage }>(
        `/api/chats/${conversationId}/messages`,
        { method: "POST", body: JSON.stringify({ conversationId, content }) },
      ),
    rename: (id: string, title: string) =>
      request<Conversation>(`/api/chats/${id}`, {
        method: "PUT",
        body: JSON.stringify({ id, title }),
      }),
    attachToGroup: (id: string, groupId: string) =>
      request<Conversation>(`/api/chats/${id}/group`, {
        method: "PUT",
        body: JSON.stringify({ groupId }),
      }),
    setPinned: (id: string, pinned: boolean) =>
      request<Conversation>(`/api/chats/${id}/pin`, {
        method: "PUT",
        body: JSON.stringify({ pinned }),
      }),
    setPermissionMode: (id: string, permissionMode: "ask" | "full") =>
      request<Conversation>(`/api/chats/${id}/permission`, {
        method: "PUT",
        body: JSON.stringify({ permissionMode }),
      }),
    remove: (id: string) =>
      request<void>(`/api/chats/${id}`, { method: "DELETE" }),
    run: (requestId: string) =>
      request<BackendRunSnapshot>(`/api/runs/${requestId}`),
  },
  memories: {
    list: (agentId: string) => request<Memory[]>(`/api/memories/${agentId}`),
    create: (input: { agentId: string; content: string }) =>
      request<Memory>("/api/memories", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    remove: (id: string) =>
      request<void>(`/api/memories/${id}`, { method: "DELETE" }),
  },
  skills: {
    list: () => request<Skill[]>("/api/skills"),
    create: (input: SkillInput) =>
      request<Skill>("/api/skills", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    importGithub: (input: { name: string; description: string; url: string }) =>
      request<Skill>("/api/skills/github", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    remove: (id: string) =>
      request<void>(`/api/skills/${id}`, { method: "DELETE" }),
  },
  ai: {
    config: () =>
      request<{
        model: string;
        apiKeyConfigured: boolean;
        webSearchEnabled: boolean;
        memoryEnabled: boolean;
      }>("/api/ai/config"),
  },
  browser: {
    pending: () => request<BrowserRequest[]>("/api/browser/requests"),
    complete: (
      requestId: string,
      ok: boolean,
      result?: unknown,
      error?: string,
    ) =>
      request<void>("/api/browser/results", {
        method: "POST",
        body: JSON.stringify({ requestId, ok, result, error }),
      }),
    state: (tabs: unknown[]) =>
      request<void>("/api/browser/state", {
        method: "POST",
        body: JSON.stringify(tabs),
      }),
    approve: (approvalId: string, approved: boolean) =>
      request<void>(`/api/browser/approvals/${approvalId}`, {
        method: "POST",
        body: JSON.stringify({ approved }),
      }),
  },
};
