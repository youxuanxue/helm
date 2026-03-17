import { getDb } from "@helm/db";
import { finishHeartbeatRun, startHeartbeatRun } from "./heartbeat";
import { scheduleRunnableNodes, summarizeNodeStates } from "./dag-scheduler";

export interface CooCycleResult {
  run_id: string;
  company_id: string;
  status: "succeed" | "failed";
  scheduled_node_ids: string[];
  touched_issue_ids: string[];
  node_state_summary: {
    pending: number;
    running: number;
    succeed: number;
    failed: number;
    cancelled: number;
    timeout: number;
  };
  message?: string;
}

export function runCooCycle(companyId: string, dbPath?: string): CooCycleResult {
  const db = getDb(dbPath);
  const company = db
    .prepare("SELECT id, status, budget_cents FROM companies WHERE id = ?")
    .get(companyId) as { id: string; status: string; budget_cents: number | null } | undefined;
  if (!company) {
    throw new Error("Company not found");
  }

  const { runId } = startHeartbeatRun(db, companyId);
  try {
    if (company.status !== "active") {
      finishHeartbeatRun(db, runId, "failed");
      return {
        run_id: runId,
        company_id: companyId,
        status: "failed",
        scheduled_node_ids: [],
        touched_issue_ids: [],
        node_state_summary: summarizeNodeStates(db, companyId),
        message: `Company is ${company.status}`,
      };
    }

    if (typeof company.budget_cents === "number") {
      const totalCost = db
        .prepare("SELECT COALESCE(SUM(cost_cents), 0) AS total FROM cost_events WHERE company_id = ?")
        .get(companyId) as { total: number };
      if (totalCost.total >= company.budget_cents) {
        const now = new Date().toISOString();
        db.prepare("UPDATE companies SET status = 'paused', updated_at = ? WHERE id = ?").run(now, companyId);
        db.prepare(
          `UPDATE action_nodes
           SET status = CASE WHEN status IN ('pending','running') THEN 'cancelled' ELSE status END,
               updated_at = ?
           WHERE company_id = ?`
        ).run(now, companyId);
        db.prepare(
          `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
           VALUES (?, 'coo', 'budget_auto_paused', 'company', ?, ?, ?)`
        ).run(
          companyId,
          companyId,
          JSON.stringify({ budget_cents: company.budget_cents, total_cost_cents: totalCost.total }),
          now,
        );
        finishHeartbeatRun(db, runId, "failed");
        return {
          run_id: runId,
          company_id: companyId,
          status: "failed",
          scheduled_node_ids: [],
          touched_issue_ids: [],
          node_state_summary: summarizeNodeStates(db, companyId),
          message: "Budget exceeded, company auto-paused",
        };
      }
    }

    const tx = db.transaction(() => scheduleRunnableNodes(db, companyId, runId));
    const scheduled = tx();
    finishHeartbeatRun(db, runId, "succeed");
    return {
      run_id: runId,
      company_id: companyId,
      status: "succeed",
      scheduled_node_ids: scheduled.scheduledNodeIds,
      touched_issue_ids: scheduled.touchedIssueIds,
      node_state_summary: summarizeNodeStates(db, companyId),
    };
  } catch (error) {
    finishHeartbeatRun(db, runId, "failed");
    return {
      run_id: runId,
      company_id: companyId,
      status: "failed",
      scheduled_node_ids: [],
      touched_issue_ids: [],
      node_state_summary: summarizeNodeStates(db, companyId),
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
