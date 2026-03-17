import { Hono } from "hono";
import { validateSafeId } from "@helm/shared";
import { getDb } from "../lib/db";
import { handleHttpError, HttpError, parseJsonBody } from "../lib/http";
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
  budget_cents?: number;
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
  try {
    validateSafeId(companyId, "company_id");
  } catch {
    return c.json({ error: "Invalid company_id format" }, 400);
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
  try {
    validateSafeId(id, "approval id");
  } catch {
    return c.json({ error: "Invalid approval id" }, 400);
  }
  const db = getDb();
  const row = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id);
  if (!row) return c.json({ error: "Approval not found" }, 404);
  return c.json(row);
});

approvals.post("/:id/approve", async (c) => {
  try {
    const id = c.req.param("id");
    validateSafeId(id, "approval id");
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
        const nodeIdSet = new Set<string>();

        if (issueId) {
          validateSafeId(issueId, "issue id");
          const issue = db
            .prepare("SELECT id, company_id FROM issues WHERE id = ?")
            .get(issueId) as { id: string; company_id: string } | undefined;
          if (!issue) {
            throw new HttpError(404, "Issue not found for task graph approval");
          }
          if (issue.company_id !== approval.company_id) {
            throw new HttpError(409, "Cross-company issue reference is forbidden");
          }
        }

        for (const node of nodes) {
          validateSafeId(node.id, "action node id");
          if (!node.spec_ref?.trim()) {
            throw new HttpError(400, "task_graph node spec_ref is required");
          }
          nodeIdSet.add(node.id);
          const maxRetries =
            typeof node.max_retries === "number" &&
            Number.isInteger(node.max_retries) &&
            node.max_retries >= 0
              ? node.max_retries
              : 1;
          db.prepare(
            `INSERT OR IGNORE INTO action_nodes (
               id, company_id, issue_id, spec_ref, depends_on, status, heartbeat_run_id,
               retry_count, max_retries, last_handoff, last_error, created_at, updated_at
             )
             VALUES (?, ?, ?, ?, ?, 'pending', NULL, 0, ?, NULL, NULL, ?, ?)`
          ).run(
            node.id,
            approval.company_id,
            issueId ?? null,
            node.spec_ref,
            JSON.stringify(node.depends_on ?? []),
            maxRetries,
            now,
            now,
          );
        }

        for (const edge of edges) {
          validateSafeId(edge.from_node_id, "action edge from_node_id");
          validateSafeId(edge.to_node_id, "action edge to_node_id");
          if (!nodeIdSet.has(edge.from_node_id) || !nodeIdSet.has(edge.to_node_id)) {
            throw new HttpError(400, "task_graph edge references unknown node");
          }
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
          if (payload.reports_to) {
            validateSafeId(payload.reports_to, "reports_to");
            const manager = db
              .prepare("SELECT id, company_id FROM agents WHERE id = ?")
              .get(payload.reports_to) as { id: string; company_id: string } | undefined;
            if (!manager || manager.company_id !== companyId) {
              throw new HttpError(409, "reports_to must reference an agent in the same company");
            }
          }
          const agentId = crypto.randomUUID();
          db.prepare(
            `INSERT INTO agents (id, company_id, name, role, reports_to, adapter_type, adapter_config, budget_cents, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
          ).run(
            agentId,
            companyId,
            name,
            payload.role ?? null,
            payload.reports_to ?? null,
            payload.adapter_type ?? "process",
            JSON.stringify(payload.adapter_config ?? {}),
            Number.isInteger(payload.budget_cents) &&
              typeof payload.budget_cents === "number" &&
              payload.budget_cents >= 0
              ? payload.budget_cents
              : null,
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
        validateSafeId(payload.node_id, "decision node id");
        scheduleCompanyId = approval.company_id;
        shouldRunScheduler = true;
        const node = db
          .prepare("SELECT id, company_id FROM action_nodes WHERE id = ?")
          .get(payload.node_id) as { id: string; company_id: string } | undefined;
        if (!node) {
          throw new HttpError(404, "Action node not found for decision escalation");
        }
        if (node.company_id !== approval.company_id) {
          throw new HttpError(409, "Cross-company decision escalation is forbidden");
        }
        db.prepare(
          `UPDATE action_nodes
           SET status = 'pending', updated_at = ?, last_error = NULL
           WHERE id = ? AND company_id = ?`
        ).run(now, payload.node_id, approval.company_id);
        if (payload.issue_id) {
          validateSafeId(payload.issue_id, "decision issue id");
          db.prepare(
            "UPDATE issues SET status = 'in_progress', updated_at = ? WHERE id = ? AND company_id = ?",
          ).run(now, payload.issue_id, approval.company_id);
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
      shouldRunScheduler && scheduleCompanyId ? await runCooCycle(scheduleCompanyId) : null;

    const row = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id);
    return c.json({
      approval: row,
      scheduler: scheduleResult,
    });
  } catch (error) {
    return handleHttpError(error, c);
  }
});

approvals.post("/:id/reject", async (c) => {
  try {
    const id = c.req.param("id");
    validateSafeId(id, "approval id");
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
      validateSafeId(payload.node_id, "decision node id");
      db.prepare(
        `UPDATE action_nodes
         SET status = 'failed', updated_at = ?
         WHERE id = ? AND company_id = ?`
      ).run(now, payload.node_id, approval.company_id);
      if (payload.issue_id) {
        validateSafeId(payload.issue_id, "decision issue id");
        db.prepare("UPDATE issues SET status = 'blocked', updated_at = ? WHERE id = ? AND company_id = ?").run(
          now,
          payload.issue_id,
          approval.company_id,
        );
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
