import type { Database } from "better-sqlite3";

export type NodeStatus = "pending" | "running" | "succeed" | "failed" | "cancelled" | "timeout";

type ActionNodeRow = {
  id: string;
  company_id: string;
  issue_id: string | null;
  depends_on: string;
  status: NodeStatus;
};

function parseDependsOn(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function isDependencySatisfied(status: NodeStatus | undefined): boolean {
  return status === "succeed" || status === "cancelled";
}

export function selectRunnableNodes(db: Database, companyId: string): ActionNodeRow[] {
  const rows = db
    .prepare("SELECT id, company_id, issue_id, depends_on, status FROM action_nodes WHERE company_id = ?")
    .all(companyId) as ActionNodeRow[];
  const statusMap = new Map<string, NodeStatus>(rows.map((row) => [row.id, row.status]));

  return rows.filter((row) => {
    if (row.status !== "pending") return false;
    const deps = parseDependsOn(row.depends_on);
    return deps.every((depId) => isDependencySatisfied(statusMap.get(depId)));
  });
}

export function scheduleRunnableNodes(
  db: Database,
  companyId: string,
  heartbeatRunId: string,
): { scheduledNodeIds: string[]; touchedIssueIds: string[] } {
  const now = new Date().toISOString();
  const runnable = selectRunnableNodes(db, companyId);
  const scheduledNodeIds: string[] = [];
  const touchedIssueIds = new Set<string>();

  for (const node of runnable) {
    db.prepare(
      `UPDATE action_nodes
       SET status = 'running',
           heartbeat_run_id = ?,
           adapter_run_id = NULL,
           adapter_status = NULL,
           executor_agent_id = NULL,
           invoked_at = NULL,
           completed_at = NULL,
           updated_at = ?
       WHERE id = ? AND status = 'pending'`
    ).run(heartbeatRunId, now, node.id);
    scheduledNodeIds.push(node.id);
    if (node.issue_id) {
      touchedIssueIds.add(node.issue_id);
      db.prepare(
        `UPDATE issues
         SET status = CASE WHEN status IN ('todo','backlog') THEN 'in_progress' ELSE status END,
             updated_at = ?
         WHERE id = ?`
      ).run(now, node.issue_id);
    }
    db.prepare(
      `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
       VALUES (?, 'coo', 'action_node_scheduled', 'action_node', ?, ?, ?)`
    ).run(companyId, node.id, JSON.stringify({ heartbeat_run_id: heartbeatRunId }), now);
  }

  return {
    scheduledNodeIds,
    touchedIssueIds: Array.from(touchedIssueIds),
  };
}

export function summarizeNodeStates(
  db: Database,
  companyId: string,
): Record<NodeStatus, number> {
  const summary: Record<NodeStatus, number> = {
    pending: 0,
    running: 0,
    succeed: 0,
    failed: 0,
    cancelled: 0,
    timeout: 0,
  };
  const rows = db
    .prepare("SELECT status, COUNT(*) AS count FROM action_nodes WHERE company_id = ? GROUP BY status")
    .all(companyId) as Array<{ status: NodeStatus; count: number }>;
  for (const row of rows) {
    summary[row.status] = row.count;
  }
  return summary;
}
