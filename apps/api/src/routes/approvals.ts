import { Hono } from "hono";
import { getDb } from "../lib/db";
import { handleHttpError, parseJsonBody } from "../lib/http";
import { runCooCycle } from "@helm/scheduler";

export const approvals = new Hono();

type TaskGraphPayload = {
  issue_id?: string;
  task_graph?: {
    nodes?: Array<{ id: string; spec_ref: string; depends_on?: string[]; max_retries?: number }>;
    edges?: Array<{ from_node_id: string; to_node_id: string }>;
  };
};

type HireAgentPayload = {
  company_id: string;
  name: string;
  role?: string;
  reports_to?: string;
  adapter_type?: string;
  adapter_config?: Record<string, unknown>;
};

type DecisionEscalationPayload = {
  node_id: string;
  issue_id?: string;
  reason?: string;
};

approvals.get("/", (c) => {
  const companyId = c.req.query("company_id");
  if (!companyId) {
    return c.json({ error: "company_id is required" }, 400);
  }
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, company_id, type, status, payload, created_at FROM approvals 
       WHERE company_id = ? AND status = 'pending' ORDER BY created_at DESC`
    )
    .all(companyId);
  return c.json(rows);
});

approvals.get("/:id", (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const row = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id);
  if (!row) return c.json({ error: "Approval not found" }, 404);
  return c.json(row);
});

approvals.post("/:id/approve", (c) => {
  const id = c.req.param("id");
  const now = new Date().toISOString();
  const db = getDb();
  const approval = db
    .prepare("SELECT * FROM approvals WHERE id = ? AND status = 'pending'")
    .get(id) as
    | {
        id: string;
        company_id: string;
        type: string;
        payload: string;
      }
    | undefined;
  if (!approval) {
    return c.json({ error: "Approval not found or already resolved" }, 404);
  }

  let shouldRunScheduler = false;
  let scheduleCompanyId: string | null = null;
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE approvals SET status = 'approved', resolved_at = ?, resolved_by = 'board', updated_at = ? WHERE id = ?`
    ).run(now, now, id);

    if (approval.type === "task_graph") {
      shouldRunScheduler = true;
      scheduleCompanyId = approval.company_id;
      const payload = JSON.parse(approval.payload) as TaskGraphPayload;
      const issueId = payload.issue_id;
      const nodes = payload.task_graph?.nodes ?? [];
      const edges = payload.task_graph?.edges ?? [];

      for (const node of nodes) {
        db.prepare(
          `INSERT OR IGNORE INTO action_nodes (
             id, company_id, issue_id, spec_ref, depends_on, status, heartbeat_run_id,
             retry_count, max_retries, last_handoff, last_error, created_at, updated_at
           )
           VALUES (?, ?, ?, ?, ?, 'pending', NULL, 0, 1, NULL, NULL, ?, ?)`
        ).run(
          node.id,
          approval.company_id,
          issueId ?? null,
          node.spec_ref,
          JSON.stringify(node.depends_on ?? []),
          now,
          now,
        );
        if (typeof node.max_retries === "number" && Number.isInteger(node.max_retries) && node.max_retries >= 0) {
          db.prepare("UPDATE action_nodes SET max_retries = ? WHERE id = ?").run(node.max_retries, node.id);
        }
      }

      for (const edge of edges) {
        db.prepare(
          `INSERT OR IGNORE INTO action_edges (from_node_id, to_node_id, company_id, created_at)
           VALUES (?, ?, ?, ?)`
        ).run(edge.from_node_id, edge.to_node_id, approval.company_id, now);
      }

    }

    if (approval.type === "hire_agent") {
      const payload = JSON.parse(approval.payload) as HireAgentPayload;
      const companyId = payload.company_id || approval.company_id;
      const name = payload.name?.trim();
      if (name) {
        const agentId = crypto.randomUUID();
        db.prepare(
          `INSERT INTO agents (id, company_id, name, role, reports_to, adapter_type, adapter_config, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
        ).run(
          agentId,
          companyId,
          name,
          payload.role ?? null,
          payload.reports_to ?? null,
          payload.adapter_type ?? "process",
          JSON.stringify(payload.adapter_config ?? {}),
          now,
          now,
        );
        db.prepare(
          `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
           VALUES (?, 'board', 'agent_hired', 'agent', ?, ?, ?)`
        ).run(companyId, agentId, JSON.stringify({ name, role: payload.role ?? null }), now);
      }
    }

    if (approval.type === "decision_escalation") {
      const payload = JSON.parse(approval.payload) as DecisionEscalationPayload;
      scheduleCompanyId = approval.company_id;
      shouldRunScheduler = true;
      db.prepare(
        `UPDATE action_nodes
         SET status = 'pending', updated_at = ?, last_error = NULL
         WHERE id = ? AND company_id = ?`
      ).run(now, payload.node_id, approval.company_id);
      if (payload.issue_id) {
        db.prepare("UPDATE issues SET status = 'in_progress', updated_at = ? WHERE id = ?").run(now, payload.issue_id);
      }
      db.prepare(
        `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
         VALUES (?, 'board', 'decision_escalation_resolved', 'action_node', ?, ?, ?)`
      ).run(
        approval.company_id,
        payload.node_id,
        JSON.stringify({ resolution: "approved" }),
        now,
      );
    }

    db.prepare(
      `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
       VALUES (?, 'board', 'approval_approved', 'approval', ?, ?, ?)`
    ).run(approval.company_id, id, JSON.stringify({ type: approval.type }), now);
  });
  tx();
  const scheduleResult =
    shouldRunScheduler && scheduleCompanyId ? runCooCycle(scheduleCompanyId) : null;

  const row = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id);
  return c.json({
    approval: row,
    scheduler: scheduleResult,
  });
});

approvals.post("/:id/reject", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await parseJsonBody<{ reason?: string }>(c);
    const now = new Date().toISOString();
    const db = getDb();
    const approval = db
      .prepare("SELECT * FROM approvals WHERE id = ? AND status = 'pending'")
      .get(id) as { id: string; company_id: string; type: string } | undefined;
    if (!approval) {
      return c.json({ error: "Approval not found or already resolved" }, 404);
    }

    db.prepare(
      `UPDATE approvals SET status = 'rejected', resolved_at = ?, resolved_by = 'board', updated_at = ? WHERE id = ?`
    ).run(now, now, id);

    if (approval.type === "decision_escalation") {
      const payload = JSON.parse(
        (db.prepare("SELECT payload FROM approvals WHERE id = ?").get(id) as { payload: string }).payload,
      ) as DecisionEscalationPayload;
      db.prepare(
        `UPDATE action_nodes
         SET status = 'failed', updated_at = ?
         WHERE id = ? AND company_id = ?`
      ).run(now, payload.node_id, approval.company_id);
      if (payload.issue_id) {
        db.prepare("UPDATE issues SET status = 'blocked', updated_at = ? WHERE id = ?").run(now, payload.issue_id);
      }
    }
    db.prepare(
      `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
       VALUES (?, 'board', 'approval_rejected', 'approval', ?, ?, ?)`
    ).run(approval.company_id, id, JSON.stringify({ reason: body.reason ?? null, type: approval.type }), now);

    const row = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id);
    return c.json(row);
  } catch (error) {
    return handleHttpError(error, c);
  }
});
