import type { BrowserState } from "./types.js";

export type BrowserBridgeMethod =
  | "browser.getState"
  | "browser.createTab"
  | "browser.selectTab"
  | "browser.closeTab"
  | "browser.navigate"
  | "browser.goBack"
  | "browser.goForward"
  | "browser.reload";

export interface BrowserBridgeRequest<T = unknown> {
  id: string;
  method: BrowserBridgeMethod;
  input?: T;
}

export interface BrowserBridgeResponse<T = unknown> {
  id: string;
  ok: boolean;
  result?: T;
  error?: { code: string; message: string };
}

export interface BrowserBridgeEvents {
  type: "browser.stateChanged";
  state: BrowserState;
}

export interface BrowserBridgeApi {
  request<TInput, TResult>(method: BrowserBridgeMethod, input?: TInput): Promise<TResult>;
  subscribe(listener: (event: BrowserBridgeEvents) => void): () => void;
}
