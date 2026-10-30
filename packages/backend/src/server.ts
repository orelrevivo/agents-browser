import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
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
  type AutomationInput,
  type AutomationUpdate,
  createAutomationRepository,
  type ChatMessageMetadata,
  type ChatQuestion,
  skillInputSchema,
  type SkillInput,
} from "@groubot/db";
import { GroubotAgentRunner, type AgentStreamEvent } from "@groubot/ai";
import { BrowserRequestBridge, type BrowserRequestOperation } from "./browser-bridge.js";

export interface BackendServerOptions {
  port?: number;
  databasePath: string;
  migrationsFolder: string;
  model?: string;
  apiKey?: string;
  apiKeyConfigured?: boolean;
}

const BACKEND_API_VERSION = 9;

type Repositories = ReturnType<typeof createRepositories>;

type ActiveRun = {
  conversationId: string;
  events: AgentStreamEvent[];
  done: boolean;
  status: "queued" | "running";
  agentIds: string[];
};

export function createBackendServer(options: BackendServerOptions) {
  const repositories = createRepositories(options.databasePath, options.migrationsFolder);
  const runner = new GroubotAgentRunner(options.apiKey, options.model ?? "gpt-5.6-luna");
  const browserBridge = new BrowserRequestBridge();
  const runs = new Map<string, ActiveRun>();
  const activeAgentRuns = new Map<string, string>();
  const runningAutomationIds = new Set<string>();
  const scheduler = setInterval(
    () =>
      void runDueAutomationTasks(
        repositories,
        runner,
        runs,
        browserBridge,
        activeAgentRuns,
        runningAutomationIds,
      ),
    15_000,
  );
  void runDueAutomationTasks(
    repositories,
    runner,
    runs,
    browserBridge,
    activeAgentRuns,
    runningAutomationIds,
  );
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
      activeAgentRuns,
    ).catch((error: unknown) => {
      writeJson(response, 500, {
        error: error instanceof Error ? error.message : "Backend request failed",
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
          resolvePort(typeof address === "object" && address ? address.port : port);
        });
      });
    },
    close(): void {
      clearInterval(scheduler);
      browserBridge.rejectAll();
      repositories.agents.close();
      repositories.chats.close();
      repositories.memories.close();
      repositories.skills.close();
      repositories.automations.close();
      server.close();
    },
  };
}

export function startBackendFromEnvironment(): ReturnType<typeof createBackendServer> {
  loadEnv();
  const root = resolve(process.cwd());
  const databasePath = process.env.GROUBOT_DATABASE_PATH ?? resolve(root, ".groubot", "groubot.db");
  const migrationsFolder =
    process.env.GROUBOT_MIGRATIONS_FOLDER ?? resolve(root, "packages/db/drizzle");
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
    automations: createAutomationRepository(databasePath, migrationsFolder),
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  repositories: Repositories,
  options: BackendServerOptions,
  runner: GroubotAgentRunner,
  runs: Map<string, ActiveRun>,
  browserBridge: BrowserRequestBridge,
  activeAgentRuns: Map<string, string>,
): Promise<void> {
  const origin = request.headers.origin;
  if (origin && /^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(origin))
    response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Headers", "content-type, x-groubot-session");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
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
  if (request.method === "GET" && parts[0] === "api" && parts[1] === "runs" && parts[2]) {
    const run = runs.get(parts[2]);
    if (!run) {
      writeJson(response, 404, { error: "Run not found" });
      return;
    }
    writeJson(response, 200, run);
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/runs") {
    const activeOnly = url.searchParams.get("active") === "true";
    writeJson(
      response,
      200,
      [...runs.entries()]
        .filter(([, run]) => !activeOnly || (!run.done && run.status === "running"))
        .map(([requestId, run]) => ({
          requestId,
          conversationId: run.conversationId,
          done: run.done,
          status: run.status,
        })),
    );
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
  if (request.method === "POST" && url.pathname === "/api/browser/computer") {
    const body = (await readJson(request)) as { conversationId?: string; tabId?: string | null };
    if (!body?.conversationId) {
      writeJson(response, 400, { error: "conversationId is required" });
      return;
    }
    browserBridge.setComputerTab(body.conversationId, body.tabId ?? null);
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
      browserBridge.complete(body.requestId, body.ok === true, body.result, body.error) ? 204 : 404,
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
      browserBridge.respondApproval(parts[3], body?.approved === true) ? 204 : 404,
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
  if (parts[0] === "api" && parts[1] === "automations")
    return handleAutomations(
      request,
      response,
      repositories,
      parts.slice(2),
      await readJson(request),
      runner,
      runs,
      browserBridge,
      activeAgentRuns,
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
      activeAgentRuns,
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
    const rawUrl = url.replace("github.com/", "raw.githubusercontent.com/").replace("/blob/", "/");
    const githubResponse = await fetch(rawUrl, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!githubResponse.ok) throw new Error(`GitHub returned ${githubResponse.status}.`);
    const content = await githubResponse.text();
    if (content.length > 200_000) throw new Error("The skill file is too large.");
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
    writeJson(response, 201, repository.create(skillInputSchema.parse(body) as SkillInput));
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

async function handleAutomations(
  request: IncomingMessage,
  response: ServerResponse,
  repositories: Repositories,
  parts: string[],
  body: unknown,
  runner: GroubotAgentRunner,
  runs: Map<string, ActiveRun>,
  browserBridge: BrowserRequestBridge,
  activeAgentRuns: Map<string, string>,
): Promise<void> {
  const id = parts[0];
  if (request.method === "GET" && !id) {
    writeJson(response, 200, repositories.automations.list());
    return;
  }
  if (request.method === "POST" && !id) {
    const input = body as AutomationInput;
    writeJson(
      response,
      201,
      repositories.automations.create(
        input,
        nextAutomationRunAt({ ...input, weeklyDay: input.weeklyDay ?? 1 }, Date.now()),
      ),
    );
    return;
  }
  if (!id) {
    writeJson(response, 400, { error: "Automation task id is required" });
    return;
  }
  if (request.method === "GET") {
    writeJson(response, 200, repositories.automations.get(id) ?? null);
    return;
  }
  if (request.method === "PUT" && parts[1] === "status") {
    const status = (body as { status?: unknown })?.status;
    if (status !== "active" && status !== "paused") {
      writeJson(response, 400, { error: "status must be active or paused" });
      return;
    }
    writeJson(response, 200, repositories.automations.setStatus(id, status));
    return;
  }
  if (request.method === "POST" && parts[1] === "run") {
    const task = repositories.automations.get(id);
    if (!task) {
      writeJson(response, 404, { error: "Automation task not found" });
      return;
    }
    const now = Date.now();
    repositories.automations.markRun(id, now, nextAutomationRunAt(task, now));
    await triggerAutomationTask(task, repositories, runner, runs, browserBridge, activeAgentRuns);
    writeJson(response, 202, { started: true });
    return;
  }
  if (request.method === "PUT") {
    const current = repositories.automations.get(id);
    if (!current) {
      writeJson(response, 404, { error: "Automation task not found" });
      return;
    }
    const input = body as AutomationUpdate;
    const merged = {
      ...current,
      ...input,
      agentIds: input.agentIds ?? current.agentIds,
    };
    writeJson(
      response,
      200,
      repositories.automations.update(id, input, nextAutomationRunAt(merged, Date.now())),
    );
    return;
  }
  if (request.method === "DELETE") {
    repositories.automations.remove(id);
    response.writeHead(204);
    response.end();
    return;
  }
  writeJson(response, 404, { error: "Automation route not found" });
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
  if (request.method === "PUT" && parts[1] === "pinned") {
    const value = body as { pinned?: unknown } | undefined;
    if (typeof value?.pinned !== "boolean") {
      writeJson(response, 400, { error: "pinned must be a boolean" });
      return;
    }
    writeJson(response, 200, repository.setPinned(validId, value.pinned));
    return;
  }
  if (request.method === "PUT" && parts[1] === "default") {
    writeJson(response, 200, repository.setDefault(validId));
    return;
  }
  if (request.method === "PUT") {
    writeJson(response, 200, repository.update(validId, agentInputSchema.parse(body)));
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
  runs: Map<string, ActiveRun>,
  browserBridge: BrowserRequestBridge,
  activeAgentRuns: Map<string, string>,
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
  if (!id) return writeJson(response, 400, { error: "Conversation id is required" });
  const validId = conversationIdSchema.parse(id);
  if (request.method === "GET") {
    writeJson(response, 200, repository.get(validId) ?? null);
    return;
  }
  if (request.method === "PATCH" && parts[1] === "messages" && parts[2]) {
    const value = body as { metadata?: ChatMessageMetadata } | undefined;
    if (!value?.metadata) {
      writeJson(response, 400, { error: "metadata is required" });
      return;
    }
    writeJson(
      response,
      200,
      repository.updateMessageMetadata({
        conversationId: validId,
        messageId: parts[2],
        metadata: value.metadata,
      }),
    );
    return;
  }
  if (request.method === "POST" && parts[1] === "messages") {
    const parsedMessage = chatMessageInputSchema.parse({
      ...(body as object),
      conversationId: validId,
    }) as { conversationId: string; content: string; metadata?: ChatMessageMetadata };
    const message = repository.appendUserMessage(parsedMessage);
    const requestId = randomUUID();
    const run = {
      conversationId: validId,
      events: [{ type: "started" } as unknown as AgentStreamEvent],
      done: false,
      status: "queued" as const,
      agentIds: [],
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
      activeAgentRuns,
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
        repository.setPermissionMode(validId, permissionModeSchema.parse(value?.permissionMode)),
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
      repository.rename(renameConversationSchema.parse({ ...(body as object), id: validId })),
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
  runs: Map<string, ActiveRun>,
  browserBridge: BrowserRequestBridge,
  activeAgentRuns: Map<string, string>,
): Promise<void> {
  const run = runs.get(requestId);
  if (!run) return;
  try {
    const conversation = repositories.chats.get(conversationId);
    if (!conversation) throw new Error("Conversation not found.");

    const group = conversation.groupId ? repositories.groups.get(conversation.groupId) : undefined;
    const agents = resolveAgentsForMessage(conversation, group, content, repositories);
    if (agents.length === 0) throw new Error("Select an agent before sending a message.");

    const agentIds = agents.map((agent) => agent.id).sort();
    run.agentIds = agentIds;
    while (agentIds.some((agentId) => activeAgentRuns.has(agentId))) {
      run.status = "queued";
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    agentIds.forEach((agentId) => activeAgentRuns.set(agentId, requestId));
    run.status = "running";

    const activeConversation = repositories.chats.get(conversationId);
    if (!activeConversation) throw new Error("Conversation not found.");

    const history = activeConversation.messages.map((message) => {
      const replyTo = message.metadata?.type === "reply" ? message.metadata.replyTo : undefined;
      const content = replyTo
        ? `Replying to ${replyTo.role === "assistant" ? "the assistant" : "the user"}:\n> ${replyTo.content}\n\n${message.content}`
        : message.content;
      return { role: message.role, content } as const;
    });
    const activeSkills = repositories.skills
      .list()
      .filter((skill) => content.includes(`/${skill.name}`))
      .map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        content: skill.content,
      }));
    const browserHost = createBrowserToolHost(browserBridge, conversationId);
    const workspaceHost = createWorkspaceToolHost(browserBridge);
    for (const agent of agents) {
      const memories = agent.memoryPreferences.enabled
        ? repositories.memories.relevant(agent.id, content).map((memory) => memory.content)
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
          workspaceHost,
          approveBrowserAction: async (approval) => {
            if (activeConversation.permissionMode === "full") return true;
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
          onBrowserActivity: (activity) => run.events.push({ type: "tool_activity", ...activity }),
        },
      )) {
        if (event.type === "question") {
          repositories.chats.appendAssistantMessage({
            conversationId,
            content: formatQuestionMessage(event.question),
            agentId: agent.id,
            metadata: { type: "question", question: event.question },
          });
          run.events.push(event);
          continue;
        }
        if (event.type === "completed") {
          const question = extractQuestionResponse(event.content);
          if (question) {
            repositories.chats.appendAssistantMessage({
              conversationId,
              content: formatQuestionMessage(question),
              agentId: agent.id,
              metadata: { type: "question", question },
            });
            run.events.push({ type: "question", question });
          } else {
            run.events.push(event);
            repositories.chats.appendAssistantMessage({
              conversationId,
              content: event.content,
              agentId: agent.id,
            });
          }
        } else {
          run.events.push(event);
        }
      }
    }
  } catch (error) {
    run.events.push({
      type: "error",
      code: "unknown",
      message: error instanceof Error ? error.message : "The chat could not be completed.",
    });
  } finally {
    for (const agentId of run.agentIds) {
      if (activeAgentRuns.get(agentId) === requestId) activeAgentRuns.delete(agentId);
    }
    run.done = true;
  }
}

async function runDueAutomationTasks(
  repositories: Repositories,
  runner: GroubotAgentRunner,
  runs: Map<string, ActiveRun>,
  browserBridge: BrowserRequestBridge,
  activeAgentRuns: Map<string, string>,
  runningAutomationIds: Set<string>,
): Promise<void> {
  const now = Date.now();
  for (const task of repositories.automations.due(now)) {
    if (runningAutomationIds.has(task.id)) continue;
    runningAutomationIds.add(task.id);
    const nextRunAt = nextAutomationRunAt(task, now);
    repositories.automations.markRun(task.id, now, nextRunAt);
    void triggerAutomationTask(task, repositories, runner, runs, browserBridge, activeAgentRuns)
      .catch(() => undefined)
      .finally(() => runningAutomationIds.delete(task.id));
  }
}

async function triggerAutomationTask(
  task: {
    id: string;
    name: string;
    task: string;
    agentIds: string[];
  },
  repositories: Repositories,
  runner: GroubotAgentRunner,
  runs: Map<string, ActiveRun>,
  browserBridge: BrowserRequestBridge,
  activeAgentRuns: Map<string, string>,
): Promise<void> {
  for (const agentId of task.agentIds) {
    const conversation = repositories.chats.create(agentId, null, "full");
    const content = `[Automation: ${task.name}]\n${task.task}`;
    repositories.chats.appendUserMessage({
      conversationId: conversation.id,
      content,
      metadata: { type: "message" },
    });
    const requestId = randomUUID();
    runs.set(requestId, {
      conversationId: conversation.id,
      events: [{ type: "started" } as unknown as AgentStreamEvent],
      done: false,
      status: "queued",
      agentIds: [agentId],
    });
    void executeChatRun(
      requestId,
      conversation.id,
      content,
      repositories,
      runner,
      runs,
      browserBridge,
      activeAgentRuns,
    );
  }
}

function nextAutomationRunAt(
  task: {
    frequency: "hourly" | "daily" | "weekly";
    timeOfDay: string;
    weeklyDay: number;
    timezone: string;
  },
  from: number,
): number {
  if (task.frequency === "hourly") {
    return Math.floor(from / 3_600_000 + 1) * 3_600_000;
  }
  const [hour, minute] = task.timeOfDay.split(":").map(Number);
  const localNow = getTimeZoneParts(new Date(from), task.timezone);
  for (let dayOffset = 0; dayOffset <= 8; dayOffset += 1) {
    const day = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day + dayOffset));
    if (task.frequency === "weekly" && day.getUTCDay() !== task.weeklyDay) continue;
    const candidate = fromLocalTime(
      {
        year: day.getUTCFullYear(),
        month: day.getUTCMonth() + 1,
        day: day.getUTCDate(),
        hour,
        minute,
      },
      task.timezone,
    );
    if (candidate > from) return candidate;
  }
  return from + 86_400_000;
}

function getTimeZoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function fromLocalTime(
  local: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
): number {
  const utcGuess = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(utcGuess));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const represented = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
  );
  return utcGuess + (utcGuess - represented);
}

function formatQuestionMessage(question: ChatQuestion): string {
  return [question.title, question.prompt].filter(Boolean).join("\n\n");
}

function extractQuestionResponse(content: string): ChatQuestion | undefined {
  const normalized = content.replace(/\*\*/g, "").trim();
  const optionPrefix = /^\s*(?:[-*•]|[A-Z][.)]|\d+[.)]|[⚪○◯🔘])\s*/u;
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const options = lines
    .map((line) => (line.match(optionPrefix)?.[0] ? line.replace(optionPrefix, "") : undefined))
    .map((label) =>
      label
        ?.replace(/\*\*/g, "")
        .replace(/^[⚪○◯🔘🔴🟢🔵]\s*/u, "")
        .trim(),
    )
    .filter((label): label is string => Boolean(label))
    .map((label, index) => ({ id: `option-${index + 1}`, label }));
  if (options.length < 2) return undefined;

  const questionMatch = normalized.match(/([^\n.!?]{5,}\?)/);
  const nonOptionLines = lines.filter((line) => !optionPrefix.test(line));
  const prompt = questionMatch?.[1]?.trim() ?? nonOptionLines.at(-1) ?? "Choose an option.";

  return {
    id: `question-${randomUUID()}`,
    title: "A quick question",
    prompt,
    questions: [
      {
        id: "question-1",
        prompt,
        options,
      },
    ],
  };
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
    const agent = conversation.agentId ? repositories.agents.get(conversation.agentId) : undefined;
    return agent ? [agent] : [];
  }

  const everyoneMentioned = /(^|\s)@(everyone|all)(?=\s|$)/i.test(content);
  const groupAgents = group.agentIds
    .map((agentId) => repositories.agents.get(agentId))
    .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent));

  if (everyoneMentioned) return groupAgents;

  const namedAgents = groupAgents.filter((agent) => {
    const mention = new RegExp(`(^|\\s)@${escapeRegExp(agent.name)}(?=\\s|$)`, "i");
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

function createBrowserToolHost(bridge: BrowserRequestBridge, conversationId?: string) {
  const call = (operation: BrowserRequestOperation, payload: unknown) =>
    bridge.enqueue(operation, payload).promise;
  const computerTab = () => bridge.computerTab(conversationId);
  const scopedTab = (tabId: string) => computerTab() ?? tabId;
  return {
    listTabs: async () => {
      const tabs = await call("list_tabs", {});
      const id = computerTab();
      return id && Array.isArray(tabs)
        ? tabs.filter(
            (tab) => tab && typeof tab === "object" && (tab as { id?: unknown }).id === id,
          )
        : tabs;
    },
    attachTab: (tabId: string) => call("attach_tab", { tabId: scopedTab(tabId) }),
    openTab: async (url?: string) => {
      const existing = computerTab();
      if (existing) {
        await call("navigate", { tabId: existing, url: url ?? "https://www.google.com/" });
        return existing;
      }
      const result = await call("open_tab", { url: url ?? null });
      if (
        !result ||
        typeof result !== "object" ||
        typeof (result as { tabId?: unknown }).tabId !== "string"
      )
        throw new Error("Browser did not return the new tab id.");
      return (result as { tabId: string }).tabId;
    },
    navigateTab: (tabId: string, url: string) => call("navigate", { tabId: scopedTab(tabId), url }),
    getPageContent: (tabId: string) => call("get_page_content", { tabId: scopedTab(tabId) }),
    getPageTitle: (tabId: string) => call("get_page_title", { tabId: scopedTab(tabId) }),
    inspectPage: (tabId: string) => call("inspect_page", { tabId: scopedTab(tabId) }),
    captureScreenshot: (tabId: string) => call("capture_screenshot", { tabId: scopedTab(tabId) }),
    clickElement: (tabId: string, selector: string) =>
      call("click_element", { tabId: scopedTab(tabId), selector }),
    typeText: (tabId: string, selector: string, text: string) =>
      call("type_text", { tabId: scopedTab(tabId), selector, text }),
    scrollPage: (tabId: string, direction: "up" | "down", amount = 600) =>
      call("scroll_page", { tabId: scopedTab(tabId), direction, amount }),
  };
}

function createWorkspaceToolHost(bridge: BrowserRequestBridge) {
  const call = (operation: BrowserRequestOperation, payload: unknown) =>
    bridge.enqueue(operation, payload, 60_000).promise;
  return {
    listFiles: () => call("workspace_list_files", {}),
    readFile: (path: string) => call("workspace_read_file", { path }),
    writeFile: (path: string, content: string) => call("workspace_write_file", { path, content }),
  };
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  if (request.method === "GET" || request.method === "DELETE") return undefined;
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) : undefined;
}

function writeJson(response: ServerResponse, status: number, value: unknown): void {
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
      console.log(JSON.stringify({ type: "backend-ready", port, session: randomUUID() })),
    );
}
