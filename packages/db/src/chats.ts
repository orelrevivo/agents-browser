import { z } from "zod";

export const conversationIdSchema = z.string().uuid();
export const chatMessageInputSchema = z.object({
  conversationId: conversationIdSchema,
  content: z.string().trim().min(1, "Message cannot be empty.").max(100_000, "Message is too long."),
});
export const renameConversationSchema = z.object({
  id: conversationIdSchema,
  title: z.string().trim().min(1, "Give this chat a title.").max(120, "Keep chat titles under 120 characters."),
});

export interface Conversation {
  id: string;
  title: string;
  agentId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface ConversationWithMessages extends Conversation {
  messages: ChatMessage[];
}
