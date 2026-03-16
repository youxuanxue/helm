/**
 * Shared types for Helm (Handoff, CompanySpec, AgentSpec)
 * @see docs/opc_agentspec_integrated.md
 * @see docs/opc_companyspec_integrated.md
 */

export type CheckState =
  | "pending"
  | "running"
  | "succeed"
  | "failed"
  | "cancelled"
  | "timeout";

export type TaskState = CheckState;

export interface Part {
  type: "text" | "file" | "data" | "json";
  text?: string;
  url?: string;
  inline_base64?: string;
  mimeType?: string;
  data?: unknown;
}

export interface HandoffRequest {
  task_id: string;
  session_id?: string;
  message: {
    role: "user" | "system";
    parts: Part[];
  };
  metadata?: {
    company_id: string;
    request_depth?: number;
    billing_code?: string;
    parent_task_id?: string;
  };
}

export interface Artifact {
  name?: string;
  description?: string;
  parts: Part[];
  index: number;
  append?: boolean;
}

export interface HandoffResponse {
  task_id: string;
  status: {
    state:
      | "submitted"
      | "working"
      | "input_required"
      | "succeed"
      | "failed"
      | "cancelled"
      | "timeout";
    message?: Part[];
    timestamp: string;
  };
  artifacts?: Artifact[];
  error?: {
    code: string;
    message: string;
    details?: object;
  };
}

export interface Company {
  id: string;
  name: string;
  mission: string;
  target_audience?: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface Issue {
  id: string;
  title: string;
  description?: string;
  status: string;
  assignee_agent_id?: string;
  created_at?: string;
}

export interface Approval {
  id: string;
  company_id: string;
  type: string;
  status: string;
  payload: object | string;
  created_at?: string;
}

export interface CompanySpecIdentity {
  id?: string;
  name: string;
  version?: string;
}

export interface CompanySpecMission {
  statement: string;
  vision?: string;
}

export interface CompanySpec {
  identity: CompanySpecIdentity;
  mission: CompanySpecMission;
  target_audience?: {
    summary: string;
    segments?: Array<{
      id: string;
      name: string;
      description?: string;
      attributes?: Record<string, string>;
    }>;
    geographic?: string;
    language?: string;
  };
  goals?: unknown[];
  deliverables?: unknown[];
  quality_standards?: unknown;
}
