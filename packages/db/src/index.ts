import Database from "better-sqlite3";
import { asc, desc, eq, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { randomUUID } from "node:crypto";
import {
  agents,
  agentGroupMembers,
  agentGroups,
  browserTasks,
  conversations,
  memories,
  messages,
  skills,
} from "./schema.js";
import { agentInputSchema, type Agent, type AgentInput } from "./agents.js";
import {
  chatMessageInputSchema,
  conversationIdSchema,
  renameConversationSchema,
  permissionModeSchema,
  type ChatMessage,
  type Conversation,
  type ConversationWithMessages,
} from "./chats.js";
import {
  memoryIdSchema,
  memoryInputSchema,
  type Memory,
  type MemoryInput,
} from "./memories.js";
import {
  browserTaskCreateSchema,
  browserTaskIdSchema,
  browserTaskProgressSchema,
  browserTaskStatusSchema,
  type BrowserTask,
  type BrowserTaskCreate,
  type BrowserTaskProgress,
  type BrowserTaskStatus,
} from "./tasks.js";
import {
  skillIdSchema,
  skillInputSchema,
  type Skill,
  type SkillInput,
} from "./skills.js";
import {
  agentGroupInputSchema,
  agentGroupUpdateSchema,
  groupIdSchema,
  type AgentGroup,
  type AgentGroupInput,
  type AgentGroupUpdate,
} from "./groups.js";

export { agentIdSchema, agentInputSchema } from "./agents.js";
export type { Agent, AgentInput } from "./agents.js";
export {
  chatMessageInputSchema,
  conversationIdSchema,
  renameConversationSchema,
  permissionModeSchema,
} from "./chats.js";
export type {
  ChatMessage,
  Conversation,
  ConversationWithMessages,
} from "./chats.js";
export { memoryIdSchema, memoryInputSchema } from "./memories.js";
export type { Memory, MemoryInput } from "./memories.js";
export {
  browserTaskCreateSchema,
  browserTaskIdSchema,
  browserTaskProgressSchema,
  browserTaskStatusSchema,
} from "./tasks.js";
export type {
  BrowserTask,
  BrowserTaskCreate,
  BrowserTaskProgress,
  BrowserTaskStatus,
} from "./tasks.js";
export { skillIdSchema, skillInputSchema } from "./skills.js";
export type { Skill, SkillInput } from "./skills.js";
export { agentGroupInputSchema, agentGroupUpdateSchema, groupIdSchema } from "./groups.js";
export type { AgentGroup, AgentGroupInput, AgentGroupUpdate } from "./groups.js";

export function createAgentGroupRepository(
  databasePath: string,
  migrationsFolder: string,
) {
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder });

  const toGroup = (row: typeof agentGroups.$inferSelect): AgentGroup => ({
    id: row.id,
    name: row.name,
    allowAgentMessages: row.allowAgentMessages,
    pinned: row.pinned,
    agentIds: db
      .select({ agentId: agentGroupMembers.agentId })
      .from(agentGroupMembers)
      .where(eq(agentGroupMembers.groupId, row.id))
      .all()
      .map((member) => member.agentId),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  });

  return {
    list(): AgentGroup[] {
      return db
        .select()
        .from(agentGroups)
        .orderBy(desc(agentGroups.updatedAt))
        .all()
        .map(toGroup);
    },
    get(id: string): AgentGroup | undefined {
      const row = db
        .select()
        .from(agentGroups)
        .where(eq(agentGroups.id, groupIdSchema.parse(id)))
        .get();
      return row ? toGroup(row) : undefined;
    },
    create(input: AgentGroupInput): AgentGroup {
      const valid = agentGroupInputSchema.parse(input);
      const id = randomUUID();
      const now = new Date();
      db.transaction((tx) => {
        tx.insert(agentGroups)
          .values({
            id,
            name: valid.name,
            allowAgentMessages: valid.allowAgentMessages,
            pinned: false,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        tx.insert(agentGroupMembers)
          .values(
            valid.agentIds.map((agentId) => ({
              groupId: id,
              agentId,
              createdAt: now,
            })),
          )
          .run();
      });
      return this.get(id)!;
    },
    update(id: string, input: AgentGroupUpdate): AgentGroup {
      const valid = agentGroupUpdateSchema.parse(input);
      const groupId = groupIdSchema.parse(id);
      if (!this.get(groupId)) throw new Error("Group not found");
      db.update(agentGroups)
        .set({
          ...(valid.name === undefined ? {} : { name: valid.name }),
          ...(valid.pinned === undefined ? {} : { pinned: valid.pinned }),
          updatedAt: new Date(),
        })
        .where(eq(agentGroups.id, groupId))
        .run();
      return this.get(groupId)!;
    },
    remove(id: string): void {
      const groupId = groupIdSchema.parse(id);
      db.delete(agentGroupMembers)
        .where(eq(agentGroupMembers.groupId, groupId))
        .run();
      db.delete(agentGroups).where(eq(agentGroups.id, groupId)).run();
    },
    close(): void {
      sqlite.close();
    },
  };
}

export function createAgentRepository(
  databasePath: string,
  migrationsFolder: string,
) {
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  migrate(drizzle(sqlite), { migrationsFolder });
  const db = drizzle(sqlite);

  return {
    list(): Agent[] {
      return db
        .select()
        .from(agents)
        .orderBy(desc(agents.isDefault), asc(agents.name))
        .all()
        .map(toAgent);
    },
    create(input: AgentInput): Agent {
      const valid = agentInputSchema.parse(input);
      const now = Date.now();
      const id = randomUUID();
      const isFirstAgent =
        db.select({ id: agents.id }).from(agents).limit(1).get() === undefined;
      db.insert(agents)
        .values(toRow(id, valid, isFirstAgent, now))
        .run();
      return this.get(id)!;
    },
    get(id: string): Agent | undefined {
      const row = db.select().from(agents).where(eq(agents.id, id)).get();
      return row ? toAgent(row) : undefined;
    },
    update(id: string, input: AgentInput): Agent {
      const valid = agentInputSchema.parse(input);
      const existing = db.select().from(agents).where(eq(agents.id, id)).get();
      if (!existing) throw new Error("Agent not found");
      db.update(agents)
        .set(
          toRow(
            id,
            valid,
            existing.isDefault,
            existing.createdAt.getTime(),
            Date.now(),
          ),
        )
        .where(eq(agents.id, id))
        .run();
      return this.get(id)!;
    },
    duplicate(id: string): Agent {
      const source = this.get(id);
      if (!source) throw new Error("Agent not found");
      return this.create({
        name: `${source.name} copy`,
        description: source.description,
        avatarType: source.avatarType,
        avatarData: source.avatarData,
        provider: source.provider,
        model: source.model,
        systemInstructions: source.systemInstructions,
        goals: source.goals,
        customInstructions: source.customInstructions,
        temperature: source.temperature,
        modelSettings: source.modelSettings,
        toolPermissions: source.toolPermissions,
        memoryPreferences: source.memoryPreferences,
      });
    },
    remove(id: string): void {
      const target = db
        .select({ isDefault: agents.isDefault })
        .from(agents)
        .where(eq(agents.id, id))
        .get();
      db.transaction((tx) => {
        tx.delete(agents).where(eq(agents.id, id)).run();
        if (target?.isDefault) {
          const replacement = tx
            .select({ id: agents.id })
            .from(agents)
            .orderBy(asc(agents.createdAt))
            .limit(1)
            .get();
          if (replacement)
            tx.update(agents)
              .set({ isDefault: true, updatedAt: new Date() })
              .where(eq(agents.id, replacement.id))
              .run();
        }
      });
    },
    setDefault(id: string): Agent {
      const target = this.get(id);
      if (!target) throw new Error("Agent not found");
      db.transaction((tx) => {
        tx.update(agents)
          .set({ isDefault: false })
          .where(ne(agents.id, id))
          .run();
        tx.update(agents)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(eq(agents.id, id))
          .run();
      });
      return this.get(id)!;
    },
    close(): void {
      sqlite.close();
    },
  };
}

export function createChatRepository(
  databasePath: string,
  migrationsFolder: string,
) {
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  migrate(drizzle(sqlite), { migrationsFolder });
  const db = drizzle(sqlite);

  return {
    list(): Conversation[] {
      return db
        .select()
        .from(conversations)
        .orderBy(desc(conversations.pinned), desc(conversations.updatedAt))
        .all()
        .map(toConversation);
    },
    get(id: string): ConversationWithMessages | undefined {
      const validId = conversationIdSchema.parse(id);
      const conversation = db
        .select()
        .from(conversations)
        .where(eq(conversations.id, validId))
        .get();
      if (!conversation) return undefined;
      return {
        ...toConversation(conversation),
        messages: db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, validId))
          .orderBy(asc(messages.createdAt))
          .all()
          .map(toMessage),
      };
    },
    create(
      agentId?: string | null,
      groupId?: string | null,
      permissionMode: "ask" | "full" = "ask",
    ): Conversation {
      if (groupId) {
        const existing = db
          .select()
          .from(conversations)
          .where(eq(conversations.groupId, groupId))
          .get();
        if (existing) return toConversation(existing);
      }
      const id = randomUUID();
      const now = new Date();
      db.insert(conversations)
        .values({
          id,
          title: "New chat",
          agentId: agentId ?? null,
          groupId: groupId ?? null,
          permissionMode,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return this.get(id)!;
    },
    appendUserMessage(input: {
      conversationId: string;
      content: string;
    }): ChatMessage {
      const valid = chatMessageInputSchema.parse(input);
      const conversation = db
        .select()
        .from(conversations)
        .where(eq(conversations.id, valid.conversationId))
        .get();
      if (!conversation) throw new Error("Conversation not found");
      const message = {
        id: randomUUID(),
        conversationId: valid.conversationId,
        role: "user",
        content: valid.content,
        agentId: null,
        createdAt: new Date(),
      } as const;
      db.transaction((tx) => {
        tx.insert(messages).values(message).run();
        tx.update(conversations)
          .set({
            title:
              conversation.title === "New chat"
                ? createConversationTitle(valid.content)
                : conversation.title,
            updatedAt: new Date(),
          })
          .where(eq(conversations.id, valid.conversationId))
          .run();
      });
      return toMessage(message);
    },
    appendAssistantMessage(input: {
      conversationId: string;
      content: string;
      agentId?: string | null;
    }): ChatMessage {
      const valid = chatMessageInputSchema.parse(input);
      const conversation = db
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.id, valid.conversationId))
        .get();
      if (!conversation) throw new Error("Conversation not found");
      const message = {
        id: randomUUID(),
        conversationId: valid.conversationId,
        role: "assistant",
        content: valid.content,
        agentId: input.agentId ?? null,
        createdAt: new Date(),
      } as const;
      db.transaction((tx) => {
        tx.insert(messages).values(message).run();
        tx.update(conversations)
          .set({ updatedAt: new Date() })
          .where(eq(conversations.id, valid.conversationId))
          .run();
      });
      return toMessage(message);
    },
    rename(input: { id: string; title: string }): Conversation {
      const valid = renameConversationSchema.parse(input);
      db.update(conversations)
        .set({ title: valid.title, updatedAt: new Date() })
        .where(eq(conversations.id, valid.id))
        .run();
      const conversation = db
        .select()
        .from(conversations)
        .where(eq(conversations.id, valid.id))
        .get();
      if (!conversation) throw new Error("Conversation not found");
      return toConversation(conversation);
    },
    setPermissionMode(
      id: string,
      permissionMode: "ask" | "full",
    ): Conversation {
      const validId = conversationIdSchema.parse(id);
      const validMode = permissionModeSchema.parse(permissionMode);
      db.update(conversations)
        .set({ permissionMode: validMode, updatedAt: new Date() })
        .where(eq(conversations.id, validId))
        .run();
      const conversation = db
        .select()
        .from(conversations)
        .where(eq(conversations.id, validId))
        .get();
      if (!conversation) throw new Error("Conversation not found");
      return toConversation(conversation);
    },
    attachToGroup(id: string, groupId: string): Conversation {
      const validId = conversationIdSchema.parse(id);
      const validGroupId = groupIdSchema.parse(groupId);
      db.update(conversations)
        .set({ groupId: validGroupId, updatedAt: new Date() })
        .where(eq(conversations.id, validId))
        .run();
      return this.get(validId)!;
    },
    setPinned(id: string, pinned: boolean): Conversation {
      const validId = conversationIdSchema.parse(id);
      db.update(conversations)
        .set({ pinned, updatedAt: new Date() })
        .where(eq(conversations.id, validId))
        .run();
      const conversation = db
        .select()
        .from(conversations)
        .where(eq(conversations.id, validId))
        .get();
      if (!conversation) throw new Error("Conversation not found");
      return toConversation(conversation);
    },
    remove(id: string): void {
      const validId = conversationIdSchema.parse(id);
      db.transaction((tx) => {
        tx.delete(messages).where(eq(messages.conversationId, validId)).run();
        tx.delete(conversations).where(eq(conversations.id, validId)).run();
      });
    },
    close(): void {
      sqlite.close();
    },
  };
}

export function createMemoryRepository(
  databasePath: string,
  migrationsFolder: string,
) {
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  migrate(drizzle(sqlite), { migrationsFolder });
  const db = drizzle(sqlite);

  return {
    list(agentId: string): Memory[] {
      return db
        .select()
        .from(memories)
        .where(eq(memories.agentId, agentId))
        .orderBy(desc(memories.updatedAt))
        .all()
        .map(toMemory);
    },
    create(input: MemoryInput): Memory {
      const valid = memoryInputSchema.parse(input);
      const now = new Date();
      const row = {
        id: randomUUID(),
        agentId: valid.agentId,
        content: valid.content,
        createdAt: now,
        updatedAt: now,
      };
      db.insert(memories).values(row).run();
      return toMemory(row);
    },
    remove(id: string): void {
      db.delete(memories)
        .where(eq(memories.id, memoryIdSchema.parse(id)))
        .run();
    },
    clear(agentId: string): void {
      db.delete(memories).where(eq(memories.agentId, agentId)).run();
    },
    relevant(agentId: string, query: string, limit = 6): Memory[] {
      const terms = query
        .toLowerCase()
        .split(/\W+/)
        .filter((term) => term.length > 2);
      const candidates = this.list(agentId);
      if (terms.length === 0) return candidates.slice(0, limit);
      return candidates
        .map((memory) => ({
          memory,
          score: terms.reduce(
            (score, term) =>
              score + (memory.content.toLowerCase().includes(term) ? 1 : 0),
            0,
          ),
        }))
        .filter((entry) => entry.score > 0)
        .sort(
          (left, right) =>
            right.score - left.score ||
            right.memory.updatedAt - left.memory.updatedAt,
        )
        .slice(0, limit)
        .map((entry) => entry.memory);
    },
    close(): void {
      sqlite.close();
    },
  };
}

export function createBrowserTaskRepository(
  databasePath: string,
  migrationsFolder: string,
) {
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  migrate(drizzle(sqlite), { migrationsFolder });
  const db = drizzle(sqlite);
  return {
    list(conversationId?: string): BrowserTask[] {
      const rows = db
        .select()
        .from(browserTasks)
        .orderBy(desc(browserTasks.updatedAt))
        .all();
      return rows
        .filter(
          (row) => !conversationId || row.conversationId === conversationId,
        )
        .map(toBrowserTask);
    },
    get(id: string): BrowserTask | undefined {
      const row = db
        .select()
        .from(browserTasks)
        .where(eq(browserTasks.id, browserTaskIdSchema.parse(id)))
        .get();
      return row ? toBrowserTask(row) : undefined;
    },
    create(input: BrowserTaskCreate): BrowserTask {
      const valid = browserTaskCreateSchema.parse(input);
      const now = new Date();
      const id = randomUUID();
      db.insert(browserTasks)
        .values({
          id,
          conversationId: valid.conversationId ?? null,
          agentId: valid.agentId ?? null,
          title: valid.title,
          status: "queued",
          currentStep: "Queued",
          tabIds: "[]",
          progress: "[]",
          error: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return this.get(id)!;
    },
    update(
      id: string,
      input: {
        status?: BrowserTaskStatus;
        currentStep?: string;
        tabIds?: string[];
        progress?: BrowserTaskProgress[];
        error?: string | null;
      },
    ): BrowserTask {
      const validId = browserTaskIdSchema.parse(id);
      const current = this.get(validId);
      if (!current) throw new Error("Browser task not found");
      if (input.status) browserTaskStatusSchema.parse(input.status);
      if (input.progress)
        input.progress.forEach((item) => browserTaskProgressSchema.parse(item));
      db.update(browserTasks)
        .set({
          status: input.status ?? current.status,
          currentStep: input.currentStep ?? current.currentStep,
          tabIds: JSON.stringify(input.tabIds ?? current.tabIds),
          progress: JSON.stringify(input.progress ?? current.progress),
          error: input.error === undefined ? current.error : input.error,
          updatedAt: new Date(),
        })
        .where(eq(browserTasks.id, validId))
        .run();
      return this.get(validId)!;
    },
    remove(id: string): void {
      db.delete(browserTasks)
        .where(eq(browserTasks.id, browserTaskIdSchema.parse(id)))
        .run();
    },
    close(): void {
      sqlite.close();
    },
  };
}

export function createSkillRepository(
  databasePath: string,
  migrationsFolder: string,
) {
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  migrate(drizzle(sqlite), { migrationsFolder });
  const db = drizzle(sqlite);

  return {
    list(): Skill[] {
      return db
        .select()
        .from(skills)
        .orderBy(desc(skills.updatedAt))
        .all()
        .map(toSkill);
    },
    create(input: SkillInput): Skill {
      const valid = skillInputSchema.parse(input);
      const now = new Date();
      const id = randomUUID();
      db.insert(skills)
        .values({
          id,
          name: valid.name,
          description: valid.description,
          content: valid.content,
          creator: valid.creator ?? "You",
          source: valid.source,
          sourceUrl: valid.sourceUrl || null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return this.get(id)!;
    },
    get(id: string): Skill | undefined {
      const row = db
        .select()
        .from(skills)
        .where(eq(skills.id, skillIdSchema.parse(id)))
        .get();
      return row ? toSkill(row) : undefined;
    },
    remove(id: string): void {
      db.delete(skills)
        .where(eq(skills.id, skillIdSchema.parse(id)))
        .run();
    },
    close(): void {
      sqlite.close();
    },
  };
}

function toConversation(row: typeof conversations.$inferSelect): Conversation {
  return {
    id: row.id,
    title: row.title,
    agentId: row.agentId,
    groupId: row.groupId,
    permissionMode: permissionModeSchema.parse(row.permissionMode),
    pinned: row.pinned,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}
function toMessage(row: typeof messages.$inferSelect): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    agentId: row.agentId ?? null,
    createdAt: row.createdAt.getTime(),
  };
}
function toMemory(row: typeof memories.$inferSelect): Memory {
  return {
    id: row.id,
    agentId: row.agentId,
    content: row.content,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}
function toBrowserTask(row: typeof browserTasks.$inferSelect): BrowserTask {
  return {
    id: row.id,
    conversationId: row.conversationId,
    agentId: row.agentId,
    title: row.title,
    status: browserTaskStatusSchema.parse(row.status),
    currentStep: row.currentStep,
    tabIds: parseJsonArray(row.tabIds),
    progress: parseProgress(row.progress),
    error: row.error,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}
function toSkill(row: typeof skills.$inferSelect): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    content: row.content,
    creator: row.creator,
    source: row.source as Skill["source"],
    sourceUrl: row.sourceUrl ?? undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}
function createConversationTitle(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length > 56
    ? `${normalized.slice(0, 56).trimEnd()}…`
    : normalized;
}

function toRow(
  id: string,
  input: AgentInput,
  isDefault: boolean,
  createdAt: Date | number,
  updatedAt = Date.now(),
) {
  return {
    id,
    name: input.name,
    description: input.description,
    avatarType: input.avatarType,
    avatarData: input.avatarData,
    provider: input.provider,
    model: input.model,
    systemInstructions: input.systemInstructions,
    goals: input.goals,
    customInstructions: input.customInstructions,
    temperature: input.temperature,
    modelSettings: JSON.stringify(input.modelSettings),
    toolPermissions: JSON.stringify(input.toolPermissions),
    memoryPreferences: JSON.stringify(input.memoryPreferences),
    isDefault,
    createdAt: typeof createdAt === "number" ? new Date(createdAt) : createdAt,
    updatedAt: new Date(updatedAt),
  };
}

function toAgent(row: typeof agents.$inferSelect): Agent {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    avatarType: row.avatarType as AgentInput["avatarType"],
    avatarData: row.avatarData,
    provider: row.provider as AgentInput["provider"],
    model: row.model as AgentInput["model"],
    systemInstructions: row.systemInstructions,
    goals: row.goals,
    customInstructions: row.customInstructions,
    temperature: row.temperature ?? 0.2,
    modelSettings: parseRecord(row.modelSettings),
    toolPermissions: parseBooleanRecord(row.toolPermissions),
    memoryPreferences: parseBooleanRecord(row.memoryPreferences),
    isDefault: row.isDefault,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

function parseRecord(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseBooleanRecord(value: string): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(parseRecord(value)).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
    ),
  );
}
function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}
function parseProgress(value: string): BrowserTaskProgress[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.flatMap((item) => {
          const result = browserTaskProgressSchema.safeParse(item);
          return result.success ? [result.data] : [];
        })
      : [];
  } catch {
    return [];
  }
}
