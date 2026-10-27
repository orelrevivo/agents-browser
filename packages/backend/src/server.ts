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
  createChatRepository,
  createMemoryRepository,
  memoryIdSchema,
  memoryInputSchema,
  renameConversationSchema,
  type AgentInput,
} from "@groubot/db";

export interface BackendServerOptions {
  port?: number;
  databasePath: string;
  migrationsFolder: string;
  model?: string;
  apiKeyConfigured?: boolean;
}

type Repositories = ReturnType<typeof createRepositories>;

export function createBackendServer(options: BackendServerOptions) {
  const repositories = createRepositories(options.databasePath, options.migrationsFolder);
  const port = options.port ?? 0;
  const server = createServer((request, response) => {
    void handleRequest(request, response, repositories, options).catch((error: unknown) => {
      writeJson(response, 500, { error: error instanceof Error ? error.message : "Backend request failed" });
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
      repositories.agents.close();
      repositories.chats.close();
      repositories.memories.close();
      server.close();
    },
  };
}

export function startBackendFromEnvironment(): ReturnType<typeof createBackendServer> {
  loadEnv();
  const root = resolve(process.cwd());
  const databasePath = process.env.GROUBOT_DATABASE_PATH ?? resolve(root, ".groubot", "groubot.db");
  const migrationsFolder = process.env.GROUBOT_MIGRATIONS_FOLDER ?? resolve(root, "packages/db/drizzle");
  return createBackendServer({
    port: Number(process.env.GROUBOT_BACKEND_PORT ?? 0),
    databasePath,
    migrationsFolder,
    model: process.env.OPENAI_MODEL ?? "gpt-5.6-luna",
    apiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
  });
}

function createRepositories(databasePath: string, migrationsFolder: string) {
  return {
    agents: createAgentRepository(databasePath, migrationsFolder),
    chats: createChatRepository(databasePath, migrationsFolder),
    memories: createMemoryRepository(databasePath, migrationsFolder),
  };
}

async function handleRequest(request: IncomingMessage, response: ServerResponse, repositories: Repositories, options: BackendServerOptions): Promise<void> {
  response.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1");
  response.setHeader("Access-Control-Allow-Headers", "content-type, x-groubot-session");
  if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const parts = url.pathname.split("/").filter(Boolean);
  if (request.method === "GET" && url.pathname === "/health") { writeJson(response, 200, { ok: true }); return; }
  if (request.method === "GET" && url.pathname === "/api/ai/config") { writeJson(response, 200, { model: options.model ?? "gpt-5.6-luna", apiKeyConfigured: options.apiKeyConfigured ?? false, webSearchEnabled: true, memoryEnabled: true }); return; }

  if (parts[0] === "api" && parts[1] === "agents") return handleAgents(request, response, repositories.agents, parts.slice(2), await readJson(request));
  if (parts[0] === "api" && parts[1] === "memories") return handleMemories(request, response, repositories.memories, parts.slice(2), await readJson(request));
  if (parts[0] === "api" && parts[1] === "chats") return handleChats(request, response, repositories.chats, parts.slice(2), await readJson(request));
  writeJson(response, 404, { error: "Route not found" });
}

async function handleAgents(request: IncomingMessage, response: ServerResponse, repository: ReturnType<typeof createAgentRepository>, parts: string[], body: unknown): Promise<void> {
  const id = parts[0];
  if (request.method === "GET" && !id) { writeJson(response, 200, repository.list()); return; }
  if (request.method === "POST" && !id) { writeJson(response, 201, repository.create(agentInputSchema.parse(body))); return; }
  if (!id) return writeJson(response, 400, { error: "Agent id is required" });
  const validId = agentIdSchema.parse(id);
  if (request.method === "PUT" && parts[1] === "default") { writeJson(response, 200, repository.setDefault(validId)); return; }
  if (request.method === "PUT") { writeJson(response, 200, repository.update(validId, agentInputSchema.parse(body))); return; }
  if (request.method === "POST" && parts[1] === "duplicate") { writeJson(response, 201, repository.duplicate(validId)); return; }
  if (request.method === "DELETE") { repository.remove(validId); response.writeHead(204); response.end(); return; }
  writeJson(response, 404, { error: "Agent route not found" });
}

async function handleMemories(request: IncomingMessage, response: ServerResponse, repository: ReturnType<typeof createMemoryRepository>, parts: string[], body: unknown): Promise<void> {
  const id = parts[0];
  if (request.method === "GET" && id) { writeJson(response, 200, repository.list(agentIdSchema.parse(id))); return; }
  if (request.method === "POST" && !id) { writeJson(response, 201, repository.create(memoryInputSchema.parse(body))); return; }
  if (request.method === "DELETE" && id) { repository.remove(memoryIdSchema.parse(id)); response.writeHead(204); response.end(); return; }
  writeJson(response, 404, { error: "Memory route not found" });
}

async function handleChats(request: IncomingMessage, response: ServerResponse, repository: ReturnType<typeof createChatRepository>, parts: string[], body: unknown): Promise<void> {
  const id = parts[0];
  if (request.method === "GET" && !id) { writeJson(response, 200, repository.list()); return; }
  if (request.method === "POST" && !id) { const value = body as { agentId?: string | null } | undefined; writeJson(response, 201, repository.create(value?.agentId ?? null)); return; }
  if (!id) return writeJson(response, 400, { error: "Conversation id is required" });
  const validId = conversationIdSchema.parse(id);
  if (request.method === "GET") { writeJson(response, 200, repository.get(validId) ?? null); return; }
  if (request.method === "POST" && parts[1] === "messages") { writeJson(response, 201, repository.appendUserMessage(chatMessageInputSchema.parse({ ...(body as object), conversationId: validId }))); return; }
  if (request.method === "PUT") { writeJson(response, 200, repository.rename(renameConversationSchema.parse({ ...(body as object), id: validId }))); return; }
  if (request.method === "DELETE") { repository.remove(validId); response.writeHead(204); response.end(); return; }
  writeJson(response, 404, { error: "Conversation route not found" });
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  if (request.method === "GET" || request.method === "DELETE") return undefined;
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) : undefined;
}

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

if (process.argv[1]?.endsWith("server.ts")) {
  const backend = startBackendFromEnvironment();
  void backend.listen().then((port) => console.log(JSON.stringify({ type: "backend-ready", port, session: randomUUID() })));
}
