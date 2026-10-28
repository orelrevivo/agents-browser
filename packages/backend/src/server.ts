import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import {
  agentIdSchema,
  agentInputSchema,
  chatMessageInputSchema,
  conversationIdSchema,
  createAgentRepository,
  createAgentGroupRepository,
  createChatRepository,
  createMemoryRepository,
  createSkillRepository,
  memoryIdSchema,
  memoryInputSchema,
  renameConversationSchema,
  permissionModeSchema,
  type AgentInput,
  type AgentGroupInput,
  type AgentGroupUpdate,
  skillInputSchema,
  type SkillInput,
} from "@groubot/db";
import { GroubotAgentRunner, type AgentStreamEvent } from "@groubot/ai";
import {
  BrowserRequestBridge,
  type BrowserRequestOperation,
} from "./browser-bridge.js";

export interface BackendServerOptions {
  port?: number;
  databasePath: string;
  migrationsFolder: string;
  model?: string;
  apiKey?: string;
  apiKeyConfigured?: boolean;
}

const BACKEND_API_VERSION = 4;

type Repositories = ReturnType<typeof createRepositories>;

export function createBackendServer(options: BackendServerOptions) {
  const repositories = createRepositories(
    options.databasePath,
    options.migrationsFolder,
  );
  const runner = new GroubotAgentRunner(
    options.apiKey,
    options.model ?? "gpt-5.6-luna",
  );
  const browserBridge = new BrowserRequestBridge();
  const runs = new Map<
    string,
    { conversationId: string; events: AgentStreamEvent[]; done: boolean }
  >();
  const port = options.port ?? 0;
  const server = createServer((request, response) => {
    void handleRequest(
      request,
      response,
      repositories,
      options,
      runner,
      runs,
      browserBridge,
    ).catch((error: unknown) => {
      writeJson(response, 500, {
        error:
          error instanceof Error ? error.message : "Backend request failed",
      });
    });
  });

  return {
    server,
    listen(): Promise<number> {
      return new Promise((resolvePort, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          server.removeListener("error", reject);
          const address = server.address();
          resolvePort(
            typeof address === "object" && address ? address.port : port,
          );
        });
      });
    },
    close(): void {
      browserBridge.rejectAll();
      repositories.agents.close();
      repositories.chats.close();
      repositories.memories.close();
      repositories.skills.close();
      server.close();
    },
  };
}

export function startBackendFromEnvironment(): ReturnType<
  typeof createBackendServer
> {
  loadEnv();
  const root = resolve(process.cwd());
  const databasePath =
    process.env.GROUBOT_DATABASE_PATH ??
    resolve(root, ".groubot", "groubot.db");
  const migrationsFolder =
    process.env.GROUBOT_MIGRATIONS_FOLDER ??
    resolve(root, "packages/db/drizzle");
  return createBackendServer({
    port: Number(process.env.GROUBOT_BACKEND_PORT ?? 0),
    databasePath,
    migrationsFolder,
    model: process.env.OPENAI_MODEL ?? "gpt-5.6-luna",
    apiKey: process.env.OPENAI_API_KEY,
    apiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
  });
}

function createRepositories(databasePath: string, migrationsFolder: string) {
  return {
    agents: createAgentRepository(databasePath, migrationsFolder),
    groups: createAgentGroupRepository(databasePath, migrationsFolder),
    chats: createChatRepository(databasePath, migrationsFolder),
    memories: createMemoryRepository(databasePath, migrationsFolder),
    skills: createSkillRepository(databasePath, migrationsFolder),
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  repositories: Repositories,
  options: BackendServerOptions,
  runner: GroubotAgentRunner,
  runs: Map<
    string,
    { conversationId: string; events: AgentStreamEvent[]; done: boolean }
  >,
  browserBridge: BrowserRequestBridge,
): Promise<void> {
  const origin = request.headers.origin;
  if (origin && /^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(origin))
    response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader(
    "Access-Control-Allow-Headers",
    "content-type, x-groubot-session",
  );
  response.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  response.setHeader("Vary", "Origin");
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const parts = url.pathname.split("/").filter(Boolean);
  if (request.method === "GET" && url.pathname === "/health") {
    writeJson(response, 200, {
      ok: true,
      apiVersion: BACKEND_API_VERSION,
      groupFanout: true,
    });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/ai/config") {
    writeJson(response, 200, {
      model: options.model ?? "gpt-5.6-luna",
      apiKeyConfigured: options.apiKeyConfigured ?? false,
      webSearchEnabled: true,
      memoryEnabled: true,
    });
    return;
  }
  if (
    request.method === "GET" &&
    parts[0] === "api" &&
    parts[1] === "runs" &&
    parts[2]
  ) {
    const run = runs.get(parts[2]);
    if (!run) {
      writeJson(response, 404, { error: "Run not found" });
      return;
    }
    writeJson(response, 200, run);
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/browser/requests") {
    writeJson(response, 200, browserBridge.pendingRequests());
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/browser/state") {
    writeJson(response, 200, browserBridge.state());
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/browser/approvals") {
    writeJson(response, 200, browserBridge.pendingApprovals());
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/browser/state") {
    const body = await readJson(request);
    browserBridge.setState(Array.isArray(body) ? body : []);
    writeJson(response, 204, undefined);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/browser/results") {
    const body = (await readJson(request)) as {
      requestId?: string;
      ok?: boolean;
      result?: unknown;
      error?: string;
    };
    if (!body?.requestId) {
      writeJson(response, 400, { error: "requestId is required" });
      return;
    }
    writeJson(
      response,
      browserBridge.complete(
        body.requestId,
        body.ok === true,
        body.result,
        body.error,
      )
        ? 204
        : 404,
      undefined,
    );
    return;
  }
  if (
    request.method === "POST" &&
    parts[0] === "api" &&
    parts[1] === "browser" &&
    parts[2] === "approvals" &&
    parts[3]
  ) {
    const body = (await readJson(request)) as { approved?: boolean };
    writeJson(
      response,
      browserBridge.respondApproval(parts[3], body?.approved === true)
        ? 204
        : 404,
      undefined,
    );
    return;
  }

  if (parts[0] === "api" && parts[1] === "agents")
    return handleAgents(
      request,
      response,
      repositories.agents,
      parts.slice(2),
      await readJson(request),
    );
  if (parts[0] === "api" && parts[1] === "groups")
    return handleGroups(
      request,
      response,
      repositories.groups,
      parts.slice(2),
      await readJson(request),
    );
  if (parts[0] === "api" && parts[1] === "memories")
    return handleMemories(
      request,
      response,
      repositories.memories,
      parts.slice(2),
      await readJson(request),
    );
  if (parts[0] === "api" && parts[1] === "skills")
    return handleSkills(
      request,
      response,
      repositories.skills,
      parts.slice(2),
      await readJson(request),
    );
  if (parts[0] === "api" && parts[1] === "chats")
    return handleChats(
      request,
      response,
      repositories,
      parts.slice(2),
      await readJson(request),
      runner,
      runs,
      browserBridge,
    );
  writeJson(response, 404, { error: "Route not found" });
}

async function handleSkills(
  request: IncomingMessage,
  response: ServerResponse,
  repository: ReturnType<typeof createSkillRepository>,
  parts: string[],
  body: unknown,
): Promise<void> {
  const id = parts[0];
  if (request.method === "GET" && !id) {
    writeJson(response, 200, repository.list());
    return;
  }
  if (request.method === "POST" && id === "github") {
    const url = String((body as { url?: unknown })?.url ?? "");
    if (!/^https:\/\/github\.com\/.+\/blob\/.+\.md(?:\?.*)?$/i.test(url)) {
      throw new Error("Use a direct HTTPS GitHub Markdown file URL.");
    }
    const rawUrl = url
      .replace("github.com/", "raw.githubusercontent.com/")
      .replace("/blob/", "/");
    const githubResponse = await fetch(rawUrl, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!githubResponse.ok)
      throw new Error(`GitHub returned ${githubResponse.status}.`);
    const content = await githubResponse.text();
    if (content.length > 200_000)
      throw new Error("The skill file is too large.");
    const input = skillInputSchema.parse({
      name: (body as { name?: unknown })?.name,
      description: (body as { description?: unknown })?.description,
      content,
      creator: "GitHub",
      source: "github",
      sourceUrl: url,
    });
    writeJson(response, 201, repository.create(input));
    return;
  }
  if (request.method === "POST" && !id) {
    writeJson(
      response,
      201,
      repository.create(skillInputSchema.parse(body) as SkillInput),
    );
    return;
  }
  if (request.method === "DELETE" && id) {
    repository.remove(id);
    response.writeHead(204);
    response.end();
    return;
  }
  writeJson(response, 404, { error: "Skill route not found" });
}

async function handleGroups(
  request: IncomingMessage,
  response: ServerResponse,
  repository: ReturnType<typeof createAgentGroupRepository>,
  parts: string[],
  body: unknown,
): Promise<void> {
  const id = parts[0];
  if (request.method === "GET" && !id) {
    writeJson(response, 200, repository.list());
    return;
  }
  if (request.method === "POST" && !id) {
    writeJson(response, 201, repository.create(body as AgentGroupInput));
    return;
  }
  if (!id) {
    writeJson(response, 400, { error: "Group id is required" });
    return;
  }
  if (request.method === "GET") {
    writeJson(response, 200, repository.get(id) ?? null);
    return;
  }
  if (request.method === "PUT") {
    writeJson(response, 200, repository.update(id, body as AgentGroupUpdate));
    return;
  }
  if (request.method === "DELETE") {
    repository.remove(id);
    response.writeHead(204);
    response.end();
    return;
  }
  writeJson(response, 404, { error: "Group route not found" });
}

async function handleAgents(
  request: IncomingMessage,
  response: ServerResponse,
  repository: ReturnType<typeof createAgentRepository>,
  parts: string[],
  body: unknown,
): Promise<void> {
  const id = parts[0];
  if (request.method === "GET" && !id) {
    writeJson(response, 200, repository.list());
    return;
  }
  if (request.method === "POST" && !id) {
    writeJson(response, 201, repository.create(agentInputSchema.parse(body)));
    return;
  }
  if (!id) return writeJson(response, 400, { error: "Agent id is required" });
  const validId = agentIdSchema.parse(id);
  if (request.method === "PUT" && parts[1] === "default") {
    writeJson(response, 200, repository.setDefault(validId));
    return;
  }
  if (request.method === "PUT") {
    writeJson(
      response,
      200,
      repository.update(validId, agentInputSchema.parse(body)),
    );
    return;
  }
  if (request.method === "POST" && parts[1] === "duplicate") {
    writeJson(response, 201, repository.duplicate(validId));
    return;
  }
  if (request.method === "DELETE") {
    repository.remove(validId);
    response.writeHead(204);
    response.end();
    return;
  }
  writeJson(response, 404, { error: "Agent route not found" });
}

async function handleMemories(
  request: IncomingMessage,
  response: ServerResponse,
  repository: ReturnType<typeof createMemoryRepository>,
  parts: string[],
  body: unknown,
): Promise<void> {
  const id = parts[0];
  if (request.method === "GET" && id) {
    writeJson(response, 200, repository.list(agentIdSchema.parse(id)));
    return;
  }
  if (request.method === "POST" && !id) {
    writeJson(response, 201, repository.create(memoryInputSchema.parse(body)));
    return;
  }
  if (request.method === "DELETE" && id) {
    repository.remove(memoryIdSchema.parse(id));
    response.writeHead(204);
    response.end();
    return;
  }
  writeJson(response, 404, { error: "Memory route not found" });
}

async function handleChats(
  request: IncomingMessage,
  response: ServerResponse,
  repositories: Repositories,
  parts: string[],
  body: unknown,
  runner: GroubotAgentRunner,
  runs: Map<
    string,
    { conversationId: string; events: AgentStreamEvent[]; done: boolean }
  >,
  browserBridge: BrowserRequestBridge,
): Promise<void> {
  const repository = repositories.chats;
  const id = parts[0];
  if (request.method === "GET" && !id) {
    writeJson(response, 200, repository.list());
    return;
  }
  if (request.method === "POST" && !id) {
    const value = body as
      | {
          agentId?: string | null;
          groupId?: string | null;
          permissionMode?: "ask" | "full";
        }
      | undefined;
    writeJson(
      response,
      201,
      repository.create(
        value?.agentId ?? null,
        value?.groupId ?? null,
        permissionModeSchema.parse(value?.permissionMode ?? "ask"),
      ),
    );
    return;
  }
  if (!id)
    return writeJson(response, 400, { error: "Conversation id is required" });
  const validId = conversationIdSchema.parse(id);
  if (request.method === "GET") {
    writeJson(response, 200, repository.get(validId) ?? null);
    return;
  }
  if (request.method === "POST" && parts[1] === "messages") {
    const message = repository.appendUserMessage(
      chatMessageInputSchema.parse({
        ...(body as object),
        conversationId: validId,
      }),
    );
    const requestId = randomUUID();
    const run = {
      conversationId: validId,
      events: [{ type: "started" } as unknown as AgentStreamEvent],
      done: false,
    };
    runs.set(requestId, run);
    void executeChatRun(
      requestId,
      validId,
      message.content,
      repositories,
      runner,
      runs,
      browserBridge,
    );
    writeJson(response, 201, { requestId, message });
    return;
  }
  if (request.method === "PUT") {
    if (parts[1] === "permission") {
      const value = body as { permissionMode?: unknown } | undefined;
      writeJson(
        response,
        200,
        repository.setPermissionMode(
          validId,
          permissionModeSchema.parse(value?.permissionMode),
        ),
      );
      return;
    }
    if (parts[1] === "group") {
      const value = body as { groupId?: string } | undefined;
      if (!value?.groupId) {
        return writeJson(response, 400, { error: "groupId is required" });
      }
      writeJson(response, 200, repository.attachToGroup(validId, value.groupId));
      return;
    }
    if (parts[1] === "pin") {
      const value = body as { pinned?: boolean } | undefined;
      if (typeof value?.pinned !== "boolean") {
        return writeJson(response, 400, { error: "pinned must be a boolean" });
      }
      writeJson(response, 200, repository.setPinned(validId, value.pinned));
      return;
    }
    writeJson(
      response,
      200,
      repository.rename(
        renameConversationSchema.parse({ ...(body as object), id: validId }),
      ),
    );
    return;
  }
  if (request.method === "DELETE") {
    repository.remove(validId);
    response.writeHead(204);
    response.end();
    return;
  }
  writeJson(response, 404, { error: "Conversation route not found" });
}

async function executeChatRun(
  requestId: string,
  conversationId: string,
  content: string,
  repositories: Repositories,
  runner: GroubotAgentRunner,
  runs: Map<
    string,
    { conversationId: string; events: AgentStreamEvent[]; done: boolean }
  >,
  browserBridge: BrowserRequestBridge,
): Promise<void> {
  const run = runs.get(requestId);
  if (!run) return;
  try {
    const conversation = repositories.chats.get(conversationId);
    if (!conversation)
      throw new Error("Conversation not found.");

    const group = conversation.groupId
      ? repositories.groups.get(conversation.groupId)
      : undefined;
    const agents = resolveAgentsForMessage(
      conversation,
      group,
      content,
      repositories,
    );
    if (agents.length === 0)
      throw new Error("Select an agent before sending a message.");

    const history = conversation.messages.map(
      (message) => ({ role: message.role, content: message.content }) as const,
    );
    const activeSkills = repositories.skills
      .list()
      .filter((skill) => content.includes(`/${skill.name}`))
      .map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        content: skill.content,
      }));
    const browserHost = createBrowserToolHost(browserBridge);
    for (const agent of agents) {
      const memories = agent.memoryPreferences.enabled
        ? repositories.memories
            .relevant(agent.id, content)
            .map((memory) => memory.content)
        : [];

      for await (const event of runner.run(
        {
          name: agent.name,
          description: agent.description,
          systemInstructions: [agent.systemInstructions, agent.customInstructions]
            .filter(Boolean)
            .join("\n\n"),
          goals: agent.goals,
          model: agent.model,
          memoryEnabled: agent.memoryPreferences.enabled,
          memories,
          runtimeContext: {
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          skills: activeSkills,
        },
        history,
        new AbortController().signal,
        {
          browserHost,
          approveBrowserAction: async (approval) => {
            if (conversation.permissionMode === "full") return true;
            const pending = browserBridge.requestApproval();
            run.events.push({
              type: "approval_request",
              approvalId: pending.approvalId,
              toolName: approval.toolName,
              description: approval.description,
              input: approval.input,
            } as never);
            return pending.promise;
          },
          onBrowserActivity: (activity) =>
            run.events.push({ type: "tool_activity", ...activity }),
        },
      )) {
        run.events.push(event);
        if (event.type === "completed") {
          repositories.chats.appendAssistantMessage({
            conversationId,
            content: event.content,
            agentId: agent.id,
          });
        }
      }
    }
  } catch (error) {
    run.events.push({
      type: "error",
      code: "unknown",
      message:
        error instanceof Error
          ? error.message
          : "The chat could not be completed.",
    });
  } finally {
    run.done = true;
  }
}

function resolveAgentsForMessage(
  conversation: {
    agentId: string | null;
    groupId: string | null;
  },
  group: ReturnType<Repositories["groups"]["get"]>,
  content: string,
  repositories: Repositories,
) {
  if (!group) {
    const agent = conversation.agentId
      ? repositories.agents.get(conversation.agentId)
      : undefined;
    return agent ? [agent] : [];
  }

  const everyoneMentioned = /(^|\s)@(everyone|all)(?=\s|$)/i.test(content);
  const groupAgents = group.agentIds
    .map((agentId) => repositories.agents.get(agentId))
    .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent));

  if (everyoneMentioned) return groupAgents;

  const namedAgents = groupAgents.filter((agent) => {
    const mention = new RegExp(
      `(^|\\s)@${escapeRegExp(agent.name)}(?=\\s|$)`,
      "i",
    );
    return mention.test(content);
  });
  if (namedAgents.length > 0) return namedAgents;

  const defaultAgent = conversation.agentId
    ? groupAgents.find((agent) => agent.id === conversation.agentId)
    : groupAgents[0];
  return defaultAgent ? [defaultAgent] : groupAgents.slice(0, 1);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
}

function createBrowserToolHost(bridge: BrowserRequestBridge) {
  const call = (operation: BrowserRequestOperation, payload: unknown) =>
    bridge.enqueue(operation, payload).promise;
  return {
    listTabs: () => call("list_tabs", {}),
    attachTab: (tabId: string) => call("attach_tab", { tabId }),
    openTab: async (url?: string) => {
      const result = await call("open_tab", { url: url ?? null });
      if (
        !result ||
        typeof result !== "object" ||
        typeof (result as { tabId?: unknown }).tabId !== "string"
      )
        throw new Error("Browser did not return the new tab id.");
      return (result as { tabId: string }).tabId;
    },
    navigateTab: (tabId: string, url: string) =>
      call("navigate", { tabId, url }),
    getPageContent: (tabId: string) => call("get_page_content", { tabId }),
    getPageTitle: (tabId: string) => call("get_page_title", { tabId }),
    inspectPage: (tabId: string) => call("inspect_page", { tabId }),
    captureScreenshot: (tabId: string) => call("capture_screenshot", { tabId }),
    clickElement: (tabId: string, selector: string) =>
      call("click_element", { tabId, selector }),
    typeText: (tabId: string, selector: string, text: string) =>
      call("type_text", { tabId, selector, text }),
    scrollPage: (tabId: string, direction: "up" | "down", amount = 600) =>
      call("scroll_page", { tabId, direction, amount }),
  };
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  if (request.method === "GET" || request.method === "DELETE") return undefined;
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) : undefined;
}

function writeJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

if (process.argv[1]?.endsWith("server.ts")) {
  const backend = startBackendFromEnvironment();
  void backend
    .listen()
    .then((port) =>
      console.log(
        JSON.stringify({ type: "backend-ready", port, session: randomUUID() }),
      ),
    );
}
