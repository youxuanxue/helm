/**
 * Helm constants
 */

export const COMPANY_STATUS = ["active", "paused", "archived"] as const;
export type CompanyStatus = (typeof COMPANY_STATUS)[number];

export const ISSUE_STATUS = [
  "todo",
  "backlog",
  "blocked",
  "in_progress",
  "done",
] as const;
export type IssueStatus = (typeof ISSUE_STATUS)[number];

export const APPROVAL_TYPE = [
  "task_graph",
  "hire_agent",
  "decision_escalation",
] as const;
export type ApprovalType = (typeof APPROVAL_TYPE)[number];

export const APPROVAL_STATUS = ["pending", "approved", "rejected"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUS)[number];

export const NODE_STATUS = [
  "pending",
  "running",
  "succeed",
  "failed",
  "cancelled",
  "timeout",
] as const;
export type NodeStatus = (typeof NODE_STATUS)[number];
