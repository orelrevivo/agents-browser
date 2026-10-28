import type { ChatMessage } from "@groubot/db";
import { useEffect, useRef } from "react";
import { AgentAvatar } from "./AgentAvatar";
import { ChatExecutionStatus } from "./ChatExecutionStatus";
import { MessageContent } from "./SkillToken";
import { Globe2 } from "lucide-react";
import type { Agent } from "@groubot/db";

export function ChatMessageList({
  messages,
  agent,
  agents = [],
  streamingText,
  streaming,
  toolActivity,
  skillActivity,
  thinking,
}: {
  messages: ChatMessage[];
  agent?: Agent;
  agents?: Agent[];
  streamingText?: string;
  streaming?: boolean;
  toolActivity?: string;
  skillActivity?: string;
  thinking?: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 160;
    if (nearBottom) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, toolActivity]);
  return (
    <div
      className="flex w-full flex-1 flex-col overflow-auto py-8 pb-36"
      ref={listRef}
    >
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 sm:px-8">
        {messages.map((message) => (
          <article
            className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
            key={message.id}
          >
            {message.role === "assistant" && (
              <AgentAvatar
                agent={
                  agents.find((candidate) => candidate.id === message.agentId) ??
                  agent
                }
                size="sm"
              />
            )}
            <div
              className={`max-w-[78%] ${message.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border/80 bg-card text-foreground"}`}
              >
                <MessageContent content={message.content} />
              </div>
              <time className="mt-1 block px-1 text-[10px] text-muted-foreground">
                {new Date(message.createdAt).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
            </div>
          </article>
        ))}
        {streaming && (
          <>
            {toolActivity && (
              <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
                <Globe2 className="size-3.5 animate-pulse" />
                {toolActivity}
              </div>
            )}
            <article className="flex gap-3">
              <AgentAvatar agent={agent} size="sm" />
              <div className="max-w-[78%]">
                {skillActivity && (
                  <ChatExecutionStatus
                    detail="This saved skill was enabled for the current request. Its instructions are being applied as task guidance."
                    kind="skill"
                    label={skillActivity}
                  />
                )}
                {thinking && !skillActivity && (
                  <ChatExecutionStatus
                    detail="The agent is preparing a response and deciding whether a saved skill or browser tool is needed. Private hidden reasoning is not displayed."
                    kind="thinking"
                    label="Thinking"
                  />
                )}
                <div className="rounded-2xl rounded-bl-md border border-border/80 bg-card px-4 py-3 text-sm leading-6">
                  {streamingText ? (
                    <MessageContent content={streamingText} />
                  ) : (
                    <span
                      aria-label="Agent is typing"
                      className="inline-flex items-center gap-1"
                    >
                      <i className="chat-typing-dot" />
                      <i className="chat-typing-dot chat-typing-dot-delay-1" />
                      <i className="chat-typing-dot chat-typing-dot-delay-2" />
                    </span>
                  )}
                </div>
              </div>
            </article>
          </>
        )}
        {!streaming && skillActivity && (
          <div className="flex gap-3">
            <AgentAvatar agent={agent} size="sm" />
            <ChatExecutionStatus
              detail="This saved skill was used for the completed request. Private hidden reasoning is not displayed."
              kind="skill"
              label={skillActivity}
            />
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
