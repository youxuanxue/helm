import { Hono } from "hono";
import { getDb } from "../lib/db";
import type { HandoffResponse, Part } from "@helm/shared";
import { handleHttpError, parseJsonBody } from "../lib/http";
import { validateSafeId } from "@helm/shared";
import { ensureCooAgent, runCooCycle } from "@helm/scheduler";

type NodeState = "pending" | "running" | "succeed" | "failed" | "cancelled" | "timeout";

function mapToNodeState(state: HandoffResponse["status"]["state"]): NodeState {
  switch (state) {
    case "working":
      return "running";
    case "succeed":
      return "succeed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "timeout":
      return "timeout";
    default:
      return "pending";
  }
}

export const actionNodes = new Hono();

function safeJsonParse<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

actionNodes.post("/:id/pause", (c) => {
  const nodeId = c.req.param("id");
  try {
    validateSafeId(nodeId, "action node id");
  } catch {
    return c.json({ error: "Invalid action node id" }, 400);
  }
  const now = new Date().toISOString();
  const db = getDb();
  const node = db
    .prepare("SELECT id, company_id FROM action_nodes WHERE id = ?")
    .get(nodeId) as { id: string; company_id: string } | undefined;
  if (!node) {
    return c.json({ error: "Action node not found" }, 404);
  }

  db.prepare(
    `UPDATE action_nodes SET status = 'cancelled', updated_at = ?
     WHERE id = ? AND company_id = ? AND status IN ('pending','running')`
  ).run(now, nodeId, node.company_id);
  db.prepare(
    `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
     VALUES (?, 'board', 'action_node_paused', 'action_node', ?, ?, ?)`
  ).run(node.company_id, nodeId, JSON.stringify({}), now);

  return c.json(db.prepare("SELECT * FROM action_nodes WHERE id = ? AND company_id = ?").get(nodeId, node.company_id));
});

actionNodes.post("/:id/resume", (c) => {
  const nodeId = c.req.param("id");
  try {
    validateSafeId(nodeId, "action node id");
  } catch {
    return c.json({ error: "Invalid action node id" }, 400);
  }
  const now = new Date().toISOString();
  const db = getDb();
  const node = db
    .prepare("SELECT id, company_id FROM action_nodes WHERE id = ?")
    .get(nodeId) as { id: string; company_id: string } | undefined;
  if (!node) {
    return c.json({ error: "Action node not found" }, 404);
  }

  db.prepare(
    `UPDATE action_nodes SET status = 'pending', updated_at = ?
     WHERE id = ? AND company_id = ? AND status IN ('cancelled','failed','timeout')`
  ).run(now, nodeId, node.company_id);
  db.prepare(
    `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
     VALUES (?, 'board', 'action_node_resumed', 'action_node', ?, ?, ?)`
  ).run(node.company_id, nodeId, JSON.stringify({}), now);

  return c.json(db.prepare("SELECT * FROM action_nodes WHERE id = ? AND company_id = ?").get(nodeId, node.company_id));
});

actionNodes.get("/:id/context", (c) => {
  const nodeId = c.req.param("id");
  try {
    validateSafeId(nodeId, "action node id");
  } catch {
    return c.json({ error: "Invalid action node id" }, 400);
  }
  const db = getDb();
  const row = db
    .prepare(
      `SELECT n.id AS node_id, n.issue_id, n.company_id, n.spec_ref, n.depends_on,
              i.title, i.description, i.demand_payload, cp.company_spec
       FROM action_nodes n
       LEFT JOIN issues i ON i.id = n.issue_id
       LEFT JOIN companies cp ON cp.id = n.company_id
       WHERE n.id = ?`
    )
    .get(nodeId) as
    | {
        node_id: string;
        issue_id: string | null;
        company_id: string;
        spec_ref: string;
        depends_on: string;
        title: string | null;
        description: string | null;
        demand_payload: string | null;
        company_spec: string | null;
      }
    | undefined;
  if (!row) {
    return c.json({ error: "Action node not found" }, 404);
  }

  const parts: Part[] = [];
  if (row.title) {
    parts.push({ type: "text", text: `Issue: ${row.title}` });
  }
  if (row.description) {
    parts.push({ type: "text", text: row.description });
  }
  if (row.demand_payload) {
    const demandPayload = safeJsonParse<Record<string, unknown>>(row.demand_payload);
    if (demandPayload) {
      parts.push({ type: "json", data: demandPayload });
    }
  }
  if (row.company_spec) {
    const companySpec = safeJsonParse<Record<string, unknown>>(row.company_spec);
    if (companySpec) {
      parts.push({ type: "json", data: companySpec });
    }
  }
  const deps = safeJsonParse<string[]>(row.depends_on) ?? [];
  if (deps.length > 0) {
    const placeholders = deps.map(() => "?").join(", ");
    const upstreamRows = db
      .prepare(
        `SELECT id, status, spec_ref, last_handoff
         FROM action_nodes WHERE company_id = ? AND id IN (${placeholders})`
      )
      .all(row.company_id, ...deps) as Array<{
      id: string;
      status: string;
      spec_ref: string;
      last_handoff: string | null;
    }>;
    parts.push({
      type: "json",
      data: {
        upstream_outputs: upstreamRows.map((item) => ({
          node_id: item.id,
          spec_ref: item.spec_ref,
          status: item.status,
          handoff: safeJsonParse<HandoffResponse>(item.last_handoff),
        })),
      },
    });
  }

  return c.json({
    task_id: row.node_id,
    message: {
      role: "system",
      parts,
    },
    metadata: {
      company_id: row.company_id,
      parent_task_id: row.issue_id,
    },
  });
});

actionNodes.post("/:id/handoff", async (c) => {
  try {
    const nodeId = c.req.param("id");
    validateSafeId(nodeId, "action node id");
    const body = await parseJsonBody<HandoffResponse>(c);
    if (!body.task_id || body.task_id !== nodeId) {
      return c.json({ error: "task_id must match action node id" }, 400);
    }
    const state = mapToNodeState(body.status.state);
    const now = new Date().toISOString();
    const db = getDb();
    const node = db
      .prepare(
        "SELECT id, issue_id, company_id, retry_count, max_retries, adapter_run_id FROM action_nodes WHERE id = ?",
      )
      .get(nodeId) as
      | {
          id: string;
          issue_id: string | null;
          company_id: string;
          retry_count: number;
          max_retries: number;
          adapter_run_id: string | null;
        }
      | undefined;
    if (!node) {
      return c.json({ error: "Action node not found" }, 404);
    }

    const usage = ((body as unknown as { usage?: { input_tokens?: number; output_tokens?: number; cost_cents?: number } }).usage ??
      {}) as {
      input_tokens?: number;
      output_tokens?: number;
      cost_cents?: number;
    };
    const inputTokens = Math.max(0, Math.trunc(usage.input_tokens ?? 0));
    const outputTokens = Math.max(0, Math.trunc(usage.output_tokens ?? 0));
    const costCents = Math.max(
      0,
      Math.trunc(
        usage.cost_cents ??
          Math.ceil((inputTokens + outputTokens) * 0.01),
      ),
    );
    const metadata = (body as unknown as {
      metadata?: { agent_id?: string; billing_code?: string };
    }).metadata;
    let agentId = metadata?.agent_id;
    if (agentId) {
      validateSafeId(agentId, "agent id");
      const exists = db
        .prepare("SELECT id, company_id FROM agents WHERE id = ?")
        .get(agentId) as { id: string; company_id: string } | undefined;
      if (!exists || exists.company_id !== node.company_id) {
        agentId = undefined;
      }
    }
    if (!agentId) {
      agentId = ensureCooAgent(db, node.company_id);
    }
    const billingCode = metadata?.billing_code ?? null;

    db.prepare(
      `INSERT INTO cost_events (id, company_id, agent_id, issue_id, billing_code, input_tokens, output_tokens, cost_cents, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      node.company_id,
      agentId,
      node.issue_id,
      billingCode,
      inputTokens,
      outputTokens,
      costCents,
      now,
    );

    let nextState = state;
    let nextRetryCount = node.retry_count;
    let lastError: string | null = body.error?.message ?? null;
    let escalationApprovalId: string | null = null;
    if (body.status.state === "input_required") {
      nextState = "pending";
      escalationApprovalId = crypto.randomUUID();
      const reasonText =
        body.status.message
          ?.filter((part) => part.type === "text" && part.text)
          .map((part) => part.text)
          .join("\n") ?? "Decision required";
      db.prepare(
        `INSERT INTO approvals (id, company_id, type, status, payload, created_at, updated_at)
         VALUES (?, ?, 'decision_escalation', 'pending', ?, ?, ?)`
      ).run(
        escalationApprovalId,
        node.company_id,
        JSON.stringify({
          node_id: node.id,
          issue_id: node.issue_id,
          reason: reasonText,
          message_parts: body.status.message ?? [],
          context_snapshot: {
            latest_handoff: body,
            adapter_run_id: node.adapter_run_id,
          },
        }),
        now,
        now,
      );
      lastError = "Decision escalation pending board approval";
      if (node.issue_id) {
        db.prepare("UPDATE issues SET status = 'blocked', updated_at = ? WHERE id = ? AND company_id = ?").run(
          now,
          node.issue_id,
          node.company_id,
        );
      }
      db.prepare(
        `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
         VALUES (?, 'coo', 'decision_escalation_requested', 'approval', ?, ?, ?)`
      ).run(
        node.company_id,
        escalationApprovalId,
        JSON.stringify({ node_id: node.id, issue_id: node.issue_id }),
        now,
      );
    }
    if ((state === "failed" || state === "timeout") && node.retry_count < node.max_retries) {
      nextState = "pending";
      nextRetryCount = node.retry_count + 1;
      db.prepare(
        `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
         VALUES (?, 'coo', 'action_node_retry_scheduled', 'action_node', ?, ?, ?)`
      ).run(
        node.company_id,
        nodeId,
        JSON.stringify({
          retry_count: nextRetryCount,
          max_retries: node.max_retries,
          previous_state: state,
        }),
        now,
      );
    }

    const completedAt = nextState === "pending" || nextState === "running" ? null : now;
    const nextAdapterRunId = nextState === "pending" ? null : node.adapter_run_id;
    db.prepare(
      `UPDATE action_nodes
       SET status = ?,
           retry_count = ?,
           adapter_status = ?,
           adapter_run_id = ?,
           completed_at = ?,
           last_handoff = ?,
           last_error = ?,
           updated_at = ?
       WHERE id = ? AND company_id = ?`
    ).run(
      nextState,
      nextRetryCount,
      body.status.state,
      nextAdapterRunId,
      completedAt,
      JSON.stringify(body),
      lastError,
      now,
      nodeId,
      node.company_id,
    );
    db.prepare(
      `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
       VALUES (?, 'agent', 'handoff_reported', 'action_node', ?, ?, ?)`
    ).run(
      node.company_id,
      nodeId,
      JSON.stringify({
        state: body.status.state,
        error: body.error ?? null,
        artifacts: body.artifacts?.length ?? 0,
        billed_cost_cents: costCents,
        billing_code: billingCode,
        escalation_approval_id: escalationApprovalId,
      }),
      now,
    );

    if (node.issue_id) {
      if (nextState === "failed" || nextState === "timeout" || nextState === "cancelled") {
        db.prepare("UPDATE issues SET status = 'blocked', updated_at = ? WHERE id = ? AND company_id = ?").run(
          now,
          node.issue_id,
          node.company_id,
        );
      } else if (nextState === "succeed") {
        const remaining = db
          .prepare(
            `SELECT COUNT(*) AS count FROM action_nodes
             WHERE issue_id = ? AND status NOT IN ('succeed','cancelled')`
          )
          .get(node.issue_id) as { count: number };
        if (remaining.count === 0) {
          db.prepare("UPDATE issues SET status = 'done', updated_at = ? WHERE id = ? AND company_id = ?").run(
            now,
            node.issue_id,
            node.company_id,
          );
        }
      }
    }

    const schedulerResult =
      escalationApprovalId === null && (nextState === "succeed" || nextState === "pending")
        ? await runCooCycle(node.company_id)
        : null;
    return c.json({
      id: nodeId,
      status: nextState,
      updated_at: now,
      scheduler: schedulerResult,
      escalation_approval_id: escalationApprovalId,
    });
  } catch (error) {
    return handleHttpError(error, c);
  }
});
