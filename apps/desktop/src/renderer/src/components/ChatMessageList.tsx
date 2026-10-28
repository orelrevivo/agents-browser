import type { ChatMessage, ChatQuestion } from "@groubot/db";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  LoaderCircle,
  MoreHorizontal,
  Reply,
  Smile,
} from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@groubot/ui";
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
  onQuestionAnswer,
  onReply,
  onReaction,
}: {
  messages: ChatMessage[];
  agent?: Agent;
  agents?: Agent[];
  streamingText?: string;
  streaming?: boolean;
  toolActivity?: string;
  skillActivity?: string;
  thinking?: boolean;
  onQuestionAnswer?: (question: ChatQuestion, answers: Record<string, string>) => Promise<boolean>;
  onReply?: (message: ChatMessage) => void;
  onReaction?: (message: ChatMessage, emoji: string) => Promise<void>;
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
        {messages.map((message) => {
          const question = getQuestionForMessage(message);
          return (
            <article
              className={`group relative flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
              key={message.id}
            >
              {message.role === "assistant" && (
                <AgentAvatar
                  agent={
                    agents.find((candidate) => candidate.id === message.agentId) ??
                    agent
                  }
                  size="sm"
                  status={streaming ? "working" : undefined}
                />
              )}
              <div
                className={`relative max-w-[78%] ${message.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "rounded-br-md bg-primary/20 dark:text-primary-foreground" : "bg-card dark:bg-[#1F1F1F] text-foreground"}`}
                >
                  {message.metadata?.type === "reply" && (
                    <div className="mb-3 border-l-2 border-current/35 pl-3 text-xs opacity-75">
                      <p className="font-medium">Replying to {message.metadata.replyTo.role === "assistant" ? "the assistant" : "your message"}</p>
                      <p className="mt-0.5 line-clamp-2">{message.metadata.replyTo.content}</p>
                    </div>
                  )}
                  {question ? (
                    <>
                      <MessageContent content={getQuestionMessageContent(message)} />
                      <QuestionCard
                        question={question}
                        onSubmit={onQuestionAnswer}
                        answered={messages.find(
                          (candidate) =>
                            candidate.metadata?.type === "question_answer" &&
                            candidate.metadata.questionId === question.id,
                        )}
                      />
                    </>
                  ) : (
                    <MessageContent content={message.content} />
                  )}
                </div>
                <time className="mt-1 flex items-center gap-1 px-1 text-[10px] text-muted-foreground">
                  {new Date(message.createdAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
                {Object.entries(message.metadata?.reactions ?? {}).length > 0 && (
                  <div className={`mt-1 flex flex-wrap gap-1 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    {Object.entries(message.metadata?.reactions ?? {}).map(([emoji, count]) => (
                      <span
                        className="rounded-full border border-border/70 bg-card px-2 py-0.5 text-xs shadow-sm"
                        key={emoji}
                      >
                        {emoji} {count > 1 && <span className="text-[10px] text-muted-foreground">{count}</span>}
                      </span>
                    ))}
                  </div>
                )}
                <MessageActions
                  message={message}
                  onReaction={onReaction}
                  onReply={onReply}
                />
              </div>
            </article>
          );
        })}
        {streaming && (
          <>
            {toolActivity && (
              <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
                <Globe2 className="size-3.5 animate-pulse" />
                {toolActivity}
              </div>
            )}
            <article className="flex gap-3">
              <div className="max-w-[78%]">
                <div
                  aria-label="Agent is working"
                  className="mt-2 flex items-center gap-2 px-1 text-[15px] text-muted-foreground"
                  role="status"
                >
                  <LoaderCircle className="size-3.5 animate-spin text-primary" />
                  <span>Working</span>
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

const reactionChoices = ["👍", "👎", "❤️", "😂", "🎉", "😮"];

function MessageActions({
  message,
  onReply,
  onReaction,
}: {
  message: ChatMessage;
  onReply?: (message: ChatMessage) => void;
  onReaction?: (message: ChatMessage, emoji: string) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [reactionOpen, setReactionOpen] = useState(false);
  const isUser = message.role === "user";

  async function copyMessage() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div
      className={`pointer-events-none absolute top-1/2 z-10 flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 ${isUser ? "right-[calc(100%+20px)]" : "left-[calc(100%+20px)]"}`}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label="More message actions" className="size-7 rounded-md bg-transparent p-0 text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground" size="icon" variant="ghost">
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={isUser ? "start" : "end"} side="bottom" sideOffset={5}>
          <DropdownMenuItem onClick={() => onReply?.(message)}>
            <Reply className="size-3.5" /> Reply
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void copyMessage()}>
            <Copy className="size-3.5" /> {copied ? "Copied" : "Copy message"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        aria-label="Reply to message"
        className="size-7 rounded-md bg-transparent p-0 text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground"
        onClick={() => onReply?.(message)}
        size="icon"
        variant="ghost"
      >
        <Reply className="size-3.5" />
      </Button>
      <Popover onOpenChange={setReactionOpen} open={reactionOpen}>
        <PopoverTrigger asChild>
          <Button aria-label="Add emoji reaction" className="size-7 rounded-md bg-transparent p-0 text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground" size="icon" variant="ghost">
            <Smile className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align={isUser ? "start" : "end"} className="w-auto rounded-xl p-2" side="top" sideOffset={8}>
          <div className="flex items-center gap-1">
            {reactionChoices.map((emoji) => (
              <button
                aria-label={`React with ${emoji}`}
                className="flex size-9 items-center justify-center rounded-lg text-xl transition-transform hover:scale-110 hover:bg-accent"
                key={emoji}
                onClick={async () => {
                  await onReaction?.(message, emoji);
                  setReactionOpen(false);
                }}
                type="button"
              >
                {emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function QuestionCard({
  question,
  answered,
  onSubmit,
}: {
  question: ChatQuestion;
  answered?: ChatMessage;
  onSubmit?: (question: ChatQuestion, answers: Record<string, string>) => Promise<boolean>;
}) {
  const savedAnswers = answered?.metadata?.type === "question_answer"
    ? answered.metadata.answers
    : undefined;
  const [answers, setAnswers] = useState<Record<string, string>>(savedAnswers ?? {});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const complete = Boolean(savedAnswers) || submitted;

  useEffect(() => {
    if (savedAnswers) setAnswers(savedAnswers);
  }, [savedAnswers]);

  if (complete) {
    return (
      <div className="flex min-w-[min(22rem,70vw)] items-center gap-2 rounded-lg border px-3 py-3 text-xs">
        <Check className="size-3.5 text-green-500" />
        <span>The answer has been submitted.</span>
        {answered && (
          <time className="ml-auto text-[10px] text-muted-foreground">
            {formatTime(answered.createdAt)}
          </time>
        )}
      </div>
    );
  }

  const canSubmit = question.questions.every((item) => answers[item.id]);

  async function submitAnswer() {
    if (!onSubmit || !canSubmit || submitting) return;
    setSubmitting(true);
    const saved = await onSubmit(question, answers);
    setSubmitting(false);
    if (saved) setSubmitted(true);
  }

  return (
    <div className="mt-4 min-w-[min(22rem,70vw)] space-y-4 border-t border-border/60 pt-4">
      <div className="space-y-3">
        {question.questions.map((item, index) => (
          <fieldset className="space-y-2" key={item.id}>
            {question.questions.length > 1 && <legend className="text-xs font-medium text-foreground">
              {question.questions.length > 1 ? `${index + 1}. ` : ""}{item.prompt}
            </legend>}
            <div className="grid gap-1.5">
              {item.options.map((option) => {
                const selected = answers[item.id] === option.id;
                return (
                  <button
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${selected ? "border-primary bg-primary/10 text-foreground" : "border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground"} ${complete ? "cursor-default" : ""}`}
                    disabled={complete}
                    key={option.id}
                    onClick={() => setAnswers((current) => ({ ...current, [item.id]: option.id }))}
                    type="button"
                  >
                    <span className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}>
                      {selected && <Check className="size-2.5" />}
                    </span>
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      <Button
        className="w-full"
        disabled={!canSubmit || !onSubmit || submitting}
        onClick={() => void submitAnswer()}
        size="sm"
      >
        {submitting ? "Submitting…" : "Submit answer"}
      </Button>
    </div>
  );
}

function QuestionPreparingCard() {
  return (
    <div
      aria-live="polite"
      className="flex min-w-56 items-center gap-2 text-xs text-muted-foreground"
    >
      <LoaderCircle className="size-4 animate-spin text-primary" />
      <span>Preparing an interactive question…</span>
    </div>
  );
}

function getQuestionForMessage(message: ChatMessage): ChatQuestion | undefined {
  if (message.metadata?.type === "question") return message.metadata.question;
  if (message.role !== "assistant") return undefined;
  const question = getQuestionFromText(message.content);
  return question ? { ...question, id: `question-${message.id}` } : undefined;
}

function getQuestionMessageContent(message: ChatMessage): string {
  if (message.metadata?.type === "question") return message.content;
  const optionPrefix = /^\s*(?:[-*•]|[A-Z][.)]|\d+[.)]|[⚪○◯🔘🔴🟢🔵])\s*/u;
  return message.content
    .split(/\r?\n/)
    .filter((line) => !optionPrefix.test(line.trim()))
    .join("\n")
    .trim();
}

function getQuestionFromText(content: string): Omit<ChatQuestion, "id"> | undefined {
  const normalized = content.trim();
  const optionPrefix = /^\s*(?:[-*•]|[A-Z][.)]|\d+[.)]|[⚪○◯🔘🔴🟢🔵])\s*/u;
  const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const options = lines
    .map((line) => (optionPrefix.test(line) ? line.replace(optionPrefix, "") : undefined))
    .map((label) => label?.replace(/\*\*/g, "").replace(/^[⚪○◯🔘🔴🟢🔵]\s*/u, "").trim())
    .filter((label): label is string => Boolean(label))
    .map((label, index) => ({ id: `option-${index + 1}`, label }));
  if (options.length < 2) return undefined;

  const questionMatch = normalized.match(/([^\n.!?]{5,}\?)/);
  const nonOptionLines = lines.filter((line) => !optionPrefix.test(line));
  const prompt = questionMatch?.[1]?.replace(/\*\*/g, "").trim() ?? nonOptionLines.at(-1) ?? "Choose an option.";
  const firstLine = nonOptionLines[0];
  const title = firstLine && !firstLine.includes("?")
    ? firstLine.replace(/\*\*/g, "").trim()
    : "A quick question";
  return {
    title,
    prompt,
    questions: [{ id: "question-1", prompt, options }],
  };
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}
