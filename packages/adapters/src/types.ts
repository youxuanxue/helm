/**
 * Agent Adapter types - aligned with AgentSpec Handoff Protocol
 */

export interface Agent {
  id: string;
  company_id: string;
  name: string;
  adapter_type: string;
  adapter_config: Record<string, unknown>;
}

export interface Part {
  type: "text" | "file" | "data" | "json";
  text?: string;
  url?: string;
  data?: unknown;
}

export interface InvocationContext {
  task_id: string;
  company_id: string;
  message: {
    role: "user" | "system";
    parts: Part[];
  };
  metadata?: {
    billing_code?: string;
    parent_task_id?: string;
    workspace_path?: string;
  };
}

export interface InvokeResult {
  run_id: string;
  status: "submitted" | "working";
}

export interface Artifact {
  name?: string;
  parts: Part[];
  index: number;
}

export interface RunStatus {
  state:
    | "submitted"
    | "working"
    | "input_required"
    | "succeed"
    | "failed"
    | "cancelled"
    | "timeout";
  message?: Part[];
  artifacts?: Artifact[];
  error?: { code: string; message: string };
}

export interface AgentAdapter {
  readonly type: string;
  invoke(agent: Agent, context: InvocationContext): Promise<InvokeResult>;
  status(runId: string, agent: Agent): Promise<RunStatus>;
  cancel(runId: string, agent: Agent): Promise<void>;
}
