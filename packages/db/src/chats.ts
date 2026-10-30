import { z } from "zod";

export const conversationIdSchema = z.string().uuid();
export const permissionModeSchema = z.enum(["ask", "full"]);
export const chatMessageInputSchema = z.object({
  conversationId: conversationIdSchema,
  content: z
    .string()
    .trim()
    .min(1, "Message cannot be empty.")
    .max(100_000, "Message is too long."),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export const renameConversationSchema = z.object({
  id: conversationIdSchema,
  title: z
    .string()
    .trim()
    .min(1, "Give this chat a title.")
    .max(120, "Keep chat titles under 120 characters."),
});

export interface Conversation {
  id: string;
  title: string;
  agentId: string | null;
  groupId: string | null;
  permissionMode: "ask" | "full";
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  agentId: string | null;
  metadata?: ChatMessageMetadata;
  createdAt: number;
}

export interface ConversationWithMessages extends Conversation {
  messages: ChatMessage[];
}

export interface ChatQuestionOption {
  id: string;
  label: string;
}

export interface ChatQuestionItem {
  id: string;
  prompt: string;
  options: ChatQuestionOption[];
}

export interface ChatQuestion {
  id: string;
  title: string;
  prompt: string;
  questions: ChatQuestionItem[];
}

export interface ChatMessageReference {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface ChatMessageMetadataBase {
  reactions?: Record<string, number>;
  unread?: boolean;
}

export type ChatMessageMetadata =
  | ({ type: "question"; question: ChatQuestion } & ChatMessageMetadataBase)
  | ({
      type: "question_answer";
      questionId: string;
      answers: Record<string, string>;
    } & ChatMessageMetadataBase)
  | ({ type: "reply"; replyTo: ChatMessageReference } & ChatMessageMetadataBase)
  | ({ type: "message" } & ChatMessageMetadataBase);
