import type { AgentAdapter } from "./types";

const adapters = new Map<string, AgentAdapter>();

export function registerAdapter(adapter: AgentAdapter): void {
  adapters.set(adapter.type, adapter);
}

export function getAdapter(type: string): AgentAdapter | undefined {
  return adapters.get(type);
}

export function listAdapterTypes(): string[] {
  return Array.from(adapters.keys());
}
