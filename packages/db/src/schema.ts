import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  avatarType: text("avatar_type").notNull().default("icon"),
  avatarData: text("avatar_data").notNull().default("sparkles"),
  provider: text("provider").notNull().default("openai"),
  model: text("model").notNull().default("gpt-4.1-mini"),
  systemInstructions: text("system_instructions").notNull().default(""),
  goals: text("goals").notNull().default(""),
  customInstructions: text("custom_instructions").notNull().default(""),
  temperature: real("temperature"),
  modelSettings: text("model_settings").notNull().default("{}"),
  toolPermissions: text("tool_permissions").notNull().default("{}"),
  memoryPreferences: text("memory_preferences").notNull().default("{}"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("New chat"),
  agentId: text("agent_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const browserTasks = sqliteTable("browser_tasks", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id"),
  agentId: text("agent_id"),
  title: text("title").notNull(),
  status: text("status").notNull(),
  currentStep: text("current_step").notNull().default("Queued"),
  tabIds: text("tab_ids").notNull().default("[]"),
  progress: text("progress").notNull().default("[]"),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
