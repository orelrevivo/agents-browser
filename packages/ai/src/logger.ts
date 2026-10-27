type LogValue = string | number | boolean | null | undefined | Record<string, unknown> | string[];

export function aiLog(event: string, details: Record<string, LogValue> = {}): void {
  if (process.env.NODE_ENV === "production") return;
  console.info(`[groubot.ai] ${event}`, JSON.stringify(details));
}

export function aiError(event: string, details: Record<string, LogValue> = {}): void {
  console.error(`[groubot.ai] ${event}`, JSON.stringify(details));
}

export function summarizeToolInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const value = input as Record<string, unknown>;
  return {
    tabId: typeof value.tabId === "string" ? value.tabId : undefined,
    selector: typeof value.selector === "string" ? value.selector : undefined,
    url: typeof value.url === "string" ? value.url : undefined,
    direction: typeof value.direction === "string" ? value.direction : undefined,
    amount: typeof value.amount === "number" ? value.amount : undefined,
    textLength: typeof value.text === "string" ? value.text.length : undefined,
  };
}
