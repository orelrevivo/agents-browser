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
  isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const agentGroups = sqliteTable("agent_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  allowAgentMessages: integer("allow_agent_messages", { mode: "boolean" }).notNull().default(true),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const agentGroupMembers = sqliteTable("agent_group_members", {
  groupId: text("group_id").notNull(),
  agentId: text("agent_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("New chat"),
  agentId: text("agent_id"),
  groupId: text("group_id"),
  permissionMode: text("permission_mode").notNull().default("ask"),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  agentId: text("agent_id"),
  metadata: text("metadata"),
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

export const automationTasks = sqliteTable("automation_tasks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  task: text("task").notNull(),
  frequency: text("frequency").notNull(),
  timeOfDay: text("time_of_day").notNull(),
  weeklyDay: integer("weekly_day").notNull().default(1),
  timezone: text("timezone").notNull(),
  agentIds: text("agent_ids").notNull(),
  status: text("status").notNull().default("active"),
  nextRunAt: integer("next_run_at", { mode: "timestamp_ms" }).notNull(),
  lastRunAt: integer("last_run_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const skills = sqliteTable("skills", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  content: text("content").notNull(),
  creator: text("creator").notNull().default("You"),
  source: text("source").notNull().default("manual"),
  sourceUrl: text("source_url"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
