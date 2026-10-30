import { useEffect, useState } from "react";
import type { Conversation } from "@groubot/db";
import { ChatWorkspace } from "./ChatWorkspace";

const groupConversationRequests = new Map<string, Promise<Conversation>>();

export function GroupPage({ groupId }: { groupId: string }) {
  const [conversation, setConversation] = useState<Conversation>();

  useEffect(() => {
    let cancelled = false;

    async function openGroupChat() {
      const [groups, agents, conversations] = await Promise.all([
        window.groubot.groups.list(),
        window.groubot.agents.list(),
        window.groubot.chats.list(),
      ]);
      const group = groups.find((candidate) => candidate.id === groupId);
      if (!group) return;

      const savedId = localStorage.getItem(`groubot.group-conversation.${groupId}`);
      if (savedId) {
        const saved = await window.groubot.chats.get(savedId);
        if (saved) {
          if (saved.groupId !== groupId) {
            await window.groubot.chats.attachToGroup({
              id: saved.id,
              groupId,
            });
          }
          if (saved.title === "New chat") {
            await window.groubot.chats.rename({
              id: saved.id,
              title: group.name,
            });
          }
          if (!cancelled) setConversation(saved);
          return;
        }
      }

      const groupConversations = conversations.filter(
        (candidate) => candidate.groupId === groupId || candidate.title === group.name,
      );
      const existingConversations = await Promise.all(
        groupConversations.map((candidate) => window.groubot.chats.get(candidate.id)),
      );
      const existing = existingConversations
        .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
        .sort((left, right) => {
          const messageDifference = right.messages.length - left.messages.length;
          return messageDifference || right.updatedAt - left.updatedAt;
        })[0];
      if (existing) {
        if (existing.groupId !== groupId) {
          await window.groubot.chats.attachToGroup({
            id: existing.id,
            groupId,
          });
        }
        localStorage.setItem(`groubot.group-conversation.${groupId}`, existing.id);
        if (existing.title === "New chat") {
          await window.groubot.chats.rename({
            id: existing.id,
            title: group.name,
          });
        }
        if (!cancelled) setConversation(existing);
        return;
      }

      const agentId = agents.find((agent) => group.agentIds.includes(agent.id))?.id;
      let request = groupConversationRequests.get(groupId);
      if (!request) {
        request = window.groubot.chats.create(agentId, groupId);
        groupConversationRequests.set(groupId, request);
      }
      let created: Conversation;
      try {
        created = await request;
      } finally {
        groupConversationRequests.delete(groupId);
      }
      localStorage.setItem(`groubot.group-conversation.${groupId}`, created.id);
      await window.groubot.chats.rename({
        id: created.id,
        title: group.name,
      });
      if (!cancelled) setConversation(created);
    }

    void openGroupChat();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        Opening group chat…
      </div>
    );
  }

  return (
    <ChatWorkspace
      conversationId={conversation.id}
      groupId={groupId}
    />
  );
}
