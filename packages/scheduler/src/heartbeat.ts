import type { Database } from "better-sqlite3";

export type HeartbeatRunStatus = "running" | "succeed" | "failed";

const DEFAULT_COO_ROLE = "coo";
const DEFAULT_COO_ADAPTER = "process";

export function ensureCooAgent(db: Database, companyId: string): string {
  const existing = db
    .prepare("SELECT id FROM agents WHERE company_id = ? AND role = ?")
    .get(companyId, DEFAULT_COO_ROLE) as { id: string } | undefined;
  if (existing) {
    return existing.id;
  }

  const now = new Date().toISOString();
  const id = `coo-${companyId}`;
  db.prepare(
    `INSERT OR IGNORE INTO agents (id, company_id, name, role, reports_to, adapter_type, adapter_config, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, 'active', ?, ?)`
  ).run(id, companyId, "COO", DEFAULT_COO_ROLE, DEFAULT_COO_ADAPTER, JSON.stringify({}), now, now);
  return id;
}

export function startHeartbeatRun(db: Database, companyId: string): { runId: string; agentId: string } {
  const agentId = ensureCooAgent(db, companyId);
  const runId = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO heartbeat_runs (id, agent_id, company_id, status, started_at, finished_at)
     VALUES (?, ?, ?, 'running', ?, NULL)`
  ).run(runId, agentId, companyId, now);
  return { runId, agentId };
}

export function finishHeartbeatRun(db: Database, runId: string, status: HeartbeatRunStatus): void {
  const now = new Date().toISOString();
  db.prepare("UPDATE heartbeat_runs SET status = ?, finished_at = ? WHERE id = ?").run(status, now, runId);
}
