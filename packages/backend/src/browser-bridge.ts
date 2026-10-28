import { randomUUID } from "node:crypto";

export type BrowserRequestOperation =
  | "list_tabs"
  | "attach_tab"
  | "open_tab"
  | "navigate"
  | "get_page_content"
  | "get_page_title"
  | "inspect_page"
  | "capture_screenshot"
  | "click_element"
  | "type_text"
  | "scroll_page";

interface PendingRequest {
  operation: BrowserRequestOperation;
  payload: unknown;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}
interface PendingApproval {
  resolve: (approved: boolean) => void;
  timer: NodeJS.Timeout;
}

export class BrowserRequestBridge {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly approvals = new Map<string, PendingApproval>();
  private latestState: unknown[] = [];

  enqueue(
    operation: BrowserRequestOperation,
    payload: unknown,
    timeoutMs = 30_000,
  ): { requestId: string; promise: Promise<unknown> } {
    const requestId = randomUUID();
    const promise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Browser operation timed out: ${operation}`));
      }, timeoutMs);
      this.pending.set(requestId, {
        operation,
        payload,
        resolve,
        reject,
        timer,
      });
    });
    return { requestId, promise };
  }

  pendingRequests(): Array<{
    requestId: string;
    operation: BrowserRequestOperation;
    payload: unknown;
  }> {
    return [...this.pending.entries()].map(([requestId, value]) => ({
      requestId,
      operation: value.operation,
      payload: value.payload,
    }));
  }

  complete(
    requestId: string,
    ok: boolean,
    result?: unknown,
    error?: string,
  ): boolean {
    const request = this.pending.get(requestId);
    if (!request) return false;
    clearTimeout(request.timer);
    this.pending.delete(requestId);
    if (ok) request.resolve(result);
    else request.reject(new Error(error || "Browser operation failed."));
    return true;
  }

  requestApproval(timeoutMs = 120_000): {
    approvalId: string;
    promise: Promise<boolean>;
  } {
    const approvalId = randomUUID();
    const promise = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.approvals.delete(approvalId);
        resolve(false);
      }, timeoutMs);
      this.approvals.set(approvalId, { resolve, timer });
    });
    return { approvalId, promise };
  }
  pendingApprovals(): string[] {
    return [...this.approvals.keys()];
  }
  respondApproval(approvalId: string, approved: boolean): boolean {
    const approval = this.approvals.get(approvalId);
    if (!approval) return false;
    clearTimeout(approval.timer);
    this.approvals.delete(approvalId);
    approval.resolve(approved);
    return true;
  }

  setState(tabs: unknown[]): void {
    this.latestState = tabs;
  }
  state(): unknown[] {
    return this.latestState;
  }
  rejectAll(reason = "Browser bridge disconnected."): void {
    for (const id of [...this.pending.keys()])
      this.complete(id, false, undefined, reason);
    for (const approval of this.approvals.values()) {
      clearTimeout(approval.timer);
      approval.resolve(false);
    }
    this.approvals.clear();
  }
}

export function requestIdOf(promise: Promise<unknown>): string | undefined {
  return (promise as unknown as { requestId?: string }).requestId;
}
