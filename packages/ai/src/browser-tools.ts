import { tool } from "@openai/agents";
import { z } from "zod";
import { aiError, aiLog, summarizeToolInput } from "./logger.js";

export interface BrowserToolHost {
  listTabs(): unknown;
  openTab(input?: string): Promise<string>;
  navigateTab(tabId: string, url: string): Promise<unknown>;
  getPageContent(tabId: string): Promise<unknown>;
  getPageTitle(tabId: string): Promise<unknown>;
  inspectPage(tabId: string): Promise<unknown>;
  captureScreenshot(tabId: string): Promise<unknown>;
  getUserActionRequirement?(tabId: string): string | undefined;
  attachTab?(tabId: string): Promise<unknown>;
  clickElement(tabId: string, selector: string): Promise<unknown>;
  typeText(tabId: string, selector: string, text: string): Promise<unknown>;
  scrollPage(tabId: string, direction: "up" | "down", amount?: number): Promise<unknown>;
}

export interface BrowserToolApprovalRequest {
  toolName: string;
  description: string;
  input: unknown;
}
export type BrowserToolApproval = (request: BrowserToolApprovalRequest) => Promise<boolean>;
export type BrowserToolActivity = (event: {
  toolName: string;
  status: "started" | "finished";
}) => void;

const tabId = z.string().uuid();
const selector = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !/^(javascript|data|file):/i.test(value), "Only CSS selectors are allowed.");
const safeUrl = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .transform(normalizeUrl)
  .refine((value) => {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      !parsed.username &&
      !parsed.password
    );
  }, "Only credential-free HTTP(S) URLs are allowed.");
const openTabInput = z.object({ url: safeUrl.nullable() });
const navigateInput = z.object({ tabId, url: safeUrl });
const tabInput = z.object({ tabId });
const clickInput = z.object({ tabId, selector });
const typeInput = z.object({ tabId, selector, text: z.string().max(10_000) });
const scrollInput = z.object({
  tabId,
  direction: z.enum(["up", "down"]),
  amount: z.number().int().min(50).max(3000),
});

const listTabsParameters = strictObject({}, []);
const openTabParameters = strictObject(
  {
    url: {
      anyOf: [
        { type: "string", description: "Credential-free HTTP(S) URL. Use null for Groubot home." },
        { type: "null" },
      ],
    },
  },
  ["url"],
);
const navigateParameters = strictObject(
  {
    tabId: { type: "string", format: "uuid" },
    url: { type: "string", description: "Credential-free HTTP(S) URL." },
  },
  ["tabId", "url"],
);
const tabParameters = strictObject({ tabId: { type: "string", format: "uuid" } }, ["tabId"]);
const clickParameters = strictObject(
  {
    tabId: { type: "string", format: "uuid" },
    selector: { type: "string", description: "CSS selector for the target element." },
  },
  ["tabId", "selector"],
);
const typeParameters = strictObject(
  {
    tabId: { type: "string", format: "uuid" },
    selector: { type: "string", description: "CSS selector for the target editable element." },
    text: { type: "string", maxLength: 10_000 },
  },
  ["tabId", "selector", "text"],
);
const scrollParameters = strictObject(
  {
    tabId: { type: "string", format: "uuid" },
    direction: { type: "string", enum: ["up", "down"] },
    amount: { type: "integer", minimum: 50, maximum: 3000 },
  },
  ["tabId", "direction", "amount"],
);
const inspectParameters = tabParameters;

export function createBrowserTools(
  host: BrowserToolHost,
  approve: BrowserToolApproval,
  onActivity: BrowserToolActivity,
) {
  const run = async (toolName: string, operation: () => Promise<unknown>) => {
    aiLog("browser_tool_start", { tool: toolName });
    onActivity({ toolName, status: "started" });
    try {
      const result = await operation();
      aiLog("browser_tool_result", {
        tool: toolName,
        ok: true,
        resultSummary: summarizeResult(result),
      });
      return JSON.stringify({ ok: true, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Browser operation failed.";
      aiError("browser_tool_result", { tool: toolName, ok: false, error: message });
      return JSON.stringify({ ok: false, error: message });
    } finally {
      onActivity({ toolName, status: "finished" });
    }
  };
  const requireApproval = async (toolName: string, description: string, input: unknown) => {
    aiLog("browser_tool_approval_requested", { tool: toolName, input: summarizeToolInput(input) });
    const approved = await approve({ toolName, description, input });
    aiLog("browser_tool_approval_result", { tool: toolName, approved });
    return approved
      ? undefined
      : JSON.stringify({ ok: false, error: "The user denied this browser action." });
  };

  const tools = [
    tool({
      name: "list_tabs",
      description:
        "List the tabs currently open in Groubot. Always use this before acting when the user refers to an existing, visible, current, or named tab.",
      parameters: listTabsParameters,
      async execute() {
        return run("list_tabs", async () => host.listTabs());
      },
    }),
    ...(host.attachTab
      ? [
          tool({
            name: "attach_tab",
            description:
              "Attach an existing Groubot website tab to the task without opening, duplicating, navigating, selecting, or modifying it. Use this when the user asks to inspect or read a tab they already have open.",
            parameters: tabParameters,
            async execute(rawInput: unknown) {
              const { tabId: targetTabId } = tabInput.parse(rawInput);
              return run("attach_tab", () => host.attachTab!(targetTabId));
            },
          }),
        ]
      : []),
    tool({
      name: "open_tab",
      description:
        "Open a new Groubot browser tab. Use an HTTP(S) URL, or pass null to open Groubot home.",
      parameters: openTabParameters,
      async execute(rawInput: unknown) {
        const { url } = openTabInput.parse(rawInput);
        return run("open_tab", () => host.openTab(url ?? undefined));
      },
    }),
    tool({
      name: "navigate",
      description: "Navigate an existing Groubot tab to a credential-free HTTP(S) URL.",
      parameters: navigateParameters,
      async execute(rawInput: unknown) {
        const { tabId: targetTabId, url } = navigateInput.parse(rawInput);
        return run("navigate", () => host.navigateTab(targetTabId, url));
      },
    }),
    tool({
      name: "get_page_content",
      description:
        "Read visible text from a website tab. Passwords, cookies, storage, and local files are not exposed.",
      parameters: tabParameters,
      async execute(rawInput: unknown) {
        const { tabId: targetTabId } = tabInput.parse(rawInput);
        return run("get_page_content", () => host.getPageContent(targetTabId));
      },
    }),
    tool({
      name: "get_page_title",
      description: "Get the current title and URL for a website tab.",
      parameters: tabParameters,
      async execute(rawInput: unknown) {
        const { tabId: targetTabId } = tabInput.parse(rawInput);
        return run("get_page_title", () => host.getPageTitle(targetTabId));
      },
    }),
    tool({
      name: "inspect_page",
      description:
        "Inspect visible page text and interactive elements, including accessibility roles, before choosing an action. If the result requires user action, stop and ask the user to complete it manually.",
      parameters: inspectParameters,
      async execute(rawInput: unknown) {
        const { tabId: targetTabId } = tabInput.parse(rawInput);
        return run("inspect_page", async () => ({
          observation: await host.inspectPage(targetTabId),
          requiresUserAction: host.getUserActionRequirement?.(targetTabId),
          instruction: host.getUserActionRequirement?.(targetTabId)
            ? "Stop browser actions and ask the user to complete the verification manually."
            : undefined,
        }));
      },
    }),
    tool({
      name: "capture_screenshot",
      description:
        "Capture a screenshot of a website tab when visual state is needed to understand the page.",
      parameters: inspectParameters,
      async execute(rawInput: unknown) {
        const { tabId: targetTabId } = tabInput.parse(rawInput);
        return run("capture_screenshot", () => host.captureScreenshot(targetTabId));
      },
    }),
    tool({
      name: "click_element",
      description:
        "Click a CSS-selected element on a website tab. This always requires explicit user approval because it may submit or modify something.",
      parameters: clickParameters,
      async execute(rawInput: unknown) {
        const input = clickInput.parse(rawInput);
        const denied = await requireApproval(
          "click_element",
          "Click an element on a website",
          input,
        );
        return denied ?? run("click_element", () => host.clickElement(input.tabId, input.selector));
      },
    }),
    tool({
      name: "type_text",
      description:
        "Type text into a selected input or editable element. This always requires explicit user approval and never reads passwords or tokens.",
      parameters: typeParameters,
      async execute(rawInput: unknown) {
        const input = typeInput.parse(rawInput);
        const denied = await requireApproval("type_text", "Type text into a website field", input);
        return (
          denied ?? run("type_text", () => host.typeText(input.tabId, input.selector, input.text))
        );
      },
    }),
    tool({
      name: "scroll_page",
      description: "Scroll a website tab up or down by a bounded amount.",
      parameters: scrollParameters,
      async execute(rawInput: unknown) {
        const { tabId: targetTabId, direction, amount } = scrollInput.parse(rawInput);
        return run("scroll_page", () => host.scrollPage(targetTabId, direction, amount));
      },
    }),
  ];
  return tools;
}

function strictObject(properties: Record<string, unknown>, required: string[]) {
  return { type: "object", properties, required, additionalProperties: false } as const;
}

function normalizeUrl(value: string): string {
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  const parsed = new URL(candidate);
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("Only credential-free HTTP(S) URLs are allowed.");
  }
  return parsed.toString();
}

function summarizeResult(result: unknown): Record<string, unknown> {
  if (Array.isArray(result)) return { kind: "array", count: result.length };
  if (!result || typeof result !== "object") return { kind: typeof result };
  const value = result as Record<string, unknown>;
  return {
    keys: Object.keys(value),
    contentLength: typeof value.content === "string" ? value.content.length : undefined,
  };
}
