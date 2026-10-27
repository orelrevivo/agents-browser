import type { ChatMessage } from "@groubot/db";
import { useEffect, useRef } from "react";
import { AgentAvatar } from "./AgentAvatar";
import type { Agent } from "@groubot/db";
import { Globe2 } from "lucide-react";

export function ChatMessageList({ messages, agent, streamingText, streaming, toolActivity }: { messages: ChatMessage[]; agent?: Agent; streamingText?: string; streaming?: boolean; toolActivity?: string }) {
  const listRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 160;
    if (nearBottom) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, toolActivity]);
  return <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-auto px-4 py-8 pb-36 sm:px-8" ref={listRef}><div className="space-y-6">{messages.map((message) => <article className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`} key={message.id}>{message.role === "assistant" && <AgentAvatar agent={agent} size="sm" />}<div className={`max-w-[78%] ${message.role === "user" ? "items-end" : "items-start"}`}><div className={`rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border/80 bg-card text-foreground"}`}><p className="whitespace-pre-wrap break-words">{message.content}</p></div><time className="mt-1 block px-1 text-[10px] text-muted-foreground">{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div></article>)}{streaming && <>{toolActivity && <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground"><Globe2 className="size-3.5 animate-pulse" />{toolActivity}</div>}<article className="flex gap-3"><AgentAvatar agent={agent} size="sm" /><div className="max-w-[78%]"><div className="rounded-2xl rounded-bl-md border border-border/80 bg-card px-4 py-3 text-sm leading-6"><p className="whitespace-pre-wrap break-words">{streamingText || <span className="inline-flex items-center gap-1" aria-label="Agent is typing"><i className="chat-typing-dot" /><i className="chat-typing-dot chat-typing-dot-delay-1" /><i className="chat-typing-dot chat-typing-dot-delay-2" /></span>}</p></div></div></article></>}<div ref={endRef} /></div></div>;
}
