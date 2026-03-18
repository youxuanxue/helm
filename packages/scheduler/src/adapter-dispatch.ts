import type { Database } from "better-sqlite3";
import {
  claudeCliAdapter,
  cursorCliAdapter,
  getAdapter,
  processAdapter,
  registerAdapter,
  type Agent,
  type AgentAdapter,
  type InvocationContext,
  type RunStatus,
} from "@helm/adapters";
import { ensureCooAgent } from "./heartbeat";

type NodeRow = {
  id: string;
  company_id: string;
  issue_id: string | null;
  spec_ref: string;
  status: string;
  adapter_run_id: string | null;
  executor_agent_id: string | null;
  retry_count: number;
  max_retries: number;
};

type AgentRow = {
  id: string;
  company_id: string;
  name: string;
  adapter_type: string;
  adapter_config: string;
  budget_cents: number | null;
  status: string;
};

let adaptersRegistered = false;

function ensureAdaptersRegistered(): void {
  if (adaptersRegistered) {
    return;
  }
  registerAdapter(processAdapter);
  registerAdapter(cursorCliAdapter);
  registerAdapter(claudeCliAdapter);
  adaptersRegistered = true;
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function toAdapterAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    company_id: row.company_id,
    name: row.name,
    adapter_type: row.adapter_type,
    adapter_config: parseJson<Record<string, unknown>>(row.adapter_config) ?? {},
  };
}

function resolveAdapter(type: string): AgentAdapter | undefined {
  ensureAdaptersRegistered();
  return getAdapter(type);
}

function findAgentByRole(db: Database, companyId: string, role: string): AgentRow | null {
  const row = db
    .prepare(
      `SELECT id, company_id, name, adapter_type, adapter_config, budget_cents, status
       FROM agents
       WHERE company_id = ? AND role = ? AND status = 'active'
       ORDER BY created_at ASC
       LIMIT 1`,
    )
    .get(companyId, role) as AgentRow | undefined;
  return row ?? null;
}

function findFirstActiveAgent(db: Database, companyId: string): AgentRow | null {
  const row = db
    .prepare(
      `SELECT id, company_id, name, adapter_type, adapter_config, budget_cents, status
       FROM agents
       WHERE company_id = ? AND status = 'active'
       ORDER BY created_at ASC
       LIMIT 1`,
    )
    .get(companyId) as AgentRow | undefined;
  return row ?? null;
}

function resolveExecutorAgent(db: Database, node: NodeRow): AgentRow | null {
  if (node.issue_id) {
    const issueAssignee = db
      .prepare(
        `SELECT a.id, a.company_id, a.name, a.adapter_type, a.adapter_config, a.budget_cents, a.status
         FROM issues i
         JOIN agents a ON a.id = i.assignee_agent_id
         WHERE i.id = ? AND i.company_id = ? AND a.status = 'active'
         LIMIT 1`,
      )
      .get(node.issue_id, node.company_id) as AgentRow | undefined;
    if (issueAssignee) {
      return issueAssignee;
    }
  }

  const specRole = node.spec_ref.startsWith("agent.") ? node.spec_ref.slice("agent.".length) : null;
  if (specRole) {
    const roleAgent = findAgentByRole(db, node.company_id, specRole);
    if (roleAgent) {
      return roleAgent;
    }
  }

  const cooId = ensureCooAgent(db, node.company_id);
  const coo = db
    .prepare(
      `SELECT id, company_id, name, adapter_type, adapter_config, budget_cents, status
       FROM agents WHERE id = ? LIMIT 1`,
    )
    .get(cooId) as AgentRow | undefined;
  if (coo && coo.status === "active") {
    return coo;
  }

  return findFirstActiveAgent(db, node.company_id);
}

function buildInvocationContext(
  db: Database,
  node: NodeRow,
  billingCode: string,
): InvocationContext {
  const contextRow = db
    .prepare(
      `SELECT n.id AS node_id, n.issue_id, i.title, i.description, i.demand_payload, c.company_spec
       FROM action_nodes n
       LEFT JOIN issues i ON i.id = n.issue_id
       LEFT JOIN companies c ON c.id = n.company_id
       WHERE n.id = ? AND n.company_id = ?`,
    )
    .get(node.id, node.company_id) as
    | {
        node_id: string;
        issue_id: string | null;
        title: string | null;
        description: string | null;
        demand_payload: string | null;
        company_spec: string | null;
      }
    | undefined;

  const objective = [
    `Action node ${node.id}`,
    `Spec: ${node.spec_ref}`,
    contextRow?.title ? `Issue: ${contextRow.title}` : "",
    contextRow?.description ? `Description: ${contextRow.description}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const parts: InvocationContext["message"]["parts"] = [{ type: "text", text: objective }];
  const demandPayload = parseJson<Record<string, unknown>>(contextRow?.demand_payload ?? null);
  if (demandPayload) {
    parts.push({ type: "json", data: demandPayload });
  }
  const companySpec = parseJson<Record<string, unknown>>(contextRow?.company_spec ?? null);
  if (companySpec) {
    parts.push({ type: "json", data: companySpec });
  }

  return {
    task_id: node.id,
    company_id: node.company_id,
    message: {
      role: "system",
      parts,
    },
    metadata: {
      billing_code: billingCode,
      parent_task_id: node.issue_id ?? undefined,
    },
  };
}

function applyIssueStateForNode(db: Database, node: NodeRow, nextState: string, now: string): void {
  if (!node.issue_id) {
    return;
  }
  if (nextState === "failed" || nextState === "timeout" || nextState === "cancelled") {
    db.prepare("UPDATE issues SET status = 'blocked', updated_at = ? WHERE id = ? AND company_id = ?").run(
      now,
      node.issue_id,
      node.company_id,
    );
    return;
  }
  if (nextState === "succeed") {
    const remaining = db
      .prepare(
        `SELECT COUNT(*) AS count FROM action_nodes
         WHERE issue_id = ? AND status NOT IN ('succeed','cancelled')`,
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

export async function dispatchScheduledNodes(
  db: Database,
  companyId: string,
  nodeIds: string[],
): Promise<{ invoked_node_ids: string[]; failed_node_ids: string[] }> {
  const invokedNodeIds: string[] = [];
  const failedNodeIds: string[] = [];

  for (const nodeId of nodeIds) {
    const node = db
      .prepare(
        `SELECT id, company_id, issue_id, spec_ref, status, adapter_run_id, executor_agent_id, retry_count, max_retries
         FROM action_nodes WHERE id = ? AND company_id = ?`,
      )
      .get(nodeId, companyId) as NodeRow | undefined;
    if (!node || node.status !== "running") {
      continue;
    }

    const executor = resolveExecutorAgent(db, node);
    const now = new Date().toISOString();
    if (!executor) {
      failedNodeIds.push(node.id);
      db.prepare(
        `UPDATE action_nodes
         SET status = 'failed', adapter_status = 'failed', last_error = ?, completed_at = ?, updated_at = ?
         WHERE id = ? AND company_id = ?`,
      ).run("No active executor agent available", now, now, node.id, companyId);
      applyIssueStateForNode(db, node, "failed", now);
      continue;
    }

    const adapter = resolveAdapter(executor.adapter_type);
    if (!adapter) {
      failedNodeIds.push(node.id);
      db.prepare(
        `UPDATE action_nodes
         SET status = 'failed', adapter_status = 'failed', executor_agent_id = ?, last_error = ?, completed_at = ?, updated_at = ?
         WHERE id = ? AND company_id = ?`,
      ).run(executor.id, `Adapter not found: ${executor.adapter_type}`, now, now, node.id, companyId);
      applyIssueStateForNode(db, node, "failed", now);
      continue;
    }

    if (typeof executor.budget_cents === "number") {
      const spent = db
        .prepare(
          `SELECT COALESCE(SUM(cost_cents), 0) AS total
           FROM cost_events
           WHERE company_id = ? AND agent_id = ?`,
        )
        .get(companyId, executor.id) as { total: number };
      if (spent.total >= executor.budget_cents) {
        db.prepare(
          `UPDATE agents
           SET status = CASE WHEN status = 'active' THEN 'paused' ELSE status END,
               updated_at = ?
           WHERE id = ? AND company_id = ?`,
        ).run(now, executor.id, companyId);
        db.prepare(
          `UPDATE action_nodes
           SET status = 'pending',
               adapter_status = 'budget_blocked',
               adapter_run_id = NULL,
               executor_agent_id = NULL,
               invoked_at = NULL,
               completed_at = NULL,
               last_error = ?,
               updated_at = ?
           WHERE id = ? AND company_id = ?`,
        ).run(
          `Agent budget exceeded: ${executor.id}`,
          now,
          node.id,
          companyId,
        );
        db.prepare(
          `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
           VALUES (?, 'coo', 'agent_budget_auto_paused', 'agent', ?, ?, ?)`,
        ).run(
          companyId,
          executor.id,
          JSON.stringify({
            budget_cents: executor.budget_cents,
            total_cost_cents: spent.total,
            blocked_node_id: node.id,
          }),
          now,
        );
        if (node.issue_id) {
          db.prepare("UPDATE issues SET status = 'blocked', updated_at = ? WHERE id = ? AND company_id = ?").run(
            now,
            node.issue_id,
            companyId,
          );
        }
        continue;
      }
    }

    const invocation = buildInvocationContext(db, node, `node:${node.id}`);
    const run = await adapter.invoke(toAdapterAgent(executor), invocation);
    db.prepare(
      `UPDATE action_nodes
       SET executor_agent_id = ?, adapter_run_id = ?, adapter_status = ?, invoked_at = ?, updated_at = ?
       WHERE id = ? AND company_id = ?`,
    ).run(executor.id, run.run_id, run.status, now, now, node.id, companyId);
    db.prepare(
      `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
       VALUES (?, 'coo', 'action_node_invoked', 'action_node', ?, ?, ?)`,
    ).run(
      companyId,
      node.id,
      JSON.stringify({
        run_id: run.run_id,
        adapter_type: executor.adapter_type,
        executor_agent_id: executor.id,
        invocation_status: run.status,
      }),
      now,
    );
    invokedNodeIds.push(node.id);
  }

  return { invoked_node_ids: invokedNodeIds, failed_node_ids: failedNodeIds };
}

function mapRuntimeStateToNodeState(state: RunStatus["state"]): "succeed" | "failed" | "cancelled" | "timeout" {
  switch (state) {
    case "succeed":
      return "succeed";
    case "cancelled":
      return "cancelled";
    case "timeout":
      return "timeout";
    default:
      return "failed";
  }
}

export async function pollRunningNodeExecutions(
  db: Database,
  companyId: string,
): Promise<{ completed_node_ids: string[]; running_node_ids: string[] }> {
  const rows = db
    .prepare(
      `SELECT id, company_id, issue_id, spec_ref, status, adapter_run_id, executor_agent_id, retry_count, max_retries
       FROM action_nodes
       WHERE company_id = ? AND status = 'running' AND adapter_run_id IS NOT NULL AND executor_agent_id IS NOT NULL`,
    )
    .all(companyId) as NodeRow[];

  const completedNodeIds: string[] = [];
  const runningNodeIds: string[] = [];
  for (const node of rows) {
    const agent = db
      .prepare(
        `SELECT id, company_id, name, adapter_type, adapter_config, budget_cents, status
         FROM agents WHERE id = ? AND company_id = ?`,
      )
      .get(node.executor_agent_id, companyId) as AgentRow | undefined;
    const now = new Date().toISOString();
    if (!agent || agent.status !== "active") {
      db.prepare(
        `UPDATE action_nodes
         SET status = 'failed', adapter_status = 'failed', last_error = ?, completed_at = ?, updated_at = ?
         WHERE id = ? AND company_id = ?`,
      ).run("Executor agent unavailable", now, now, node.id, companyId);
      applyIssueStateForNode(db, node, "failed", now);
      completedNodeIds.push(node.id);
      continue;
    }

    const adapter = resolveAdapter(agent.adapter_type);
    if (!adapter) {
      db.prepare(
        `UPDATE action_nodes
         SET status = 'failed', adapter_status = 'failed', last_error = ?, completed_at = ?, updated_at = ?
         WHERE id = ? AND company_id = ?`,
      ).run(`Adapter not found: ${agent.adapter_type}`, now, now, node.id, companyId);
      applyIssueStateForNode(db, node, "failed", now);
      completedNodeIds.push(node.id);
      continue;
    }

    const runtime = await adapter.status(node.adapter_run_id as string, toAdapterAgent(agent));
    if (runtime.state === "working" || runtime.state === "submitted") {
      db.prepare(
        "UPDATE action_nodes SET adapter_status = ?, updated_at = ? WHERE id = ? AND company_id = ?",
      ).run(runtime.state, now, node.id, companyId);
      runningNodeIds.push(node.id);
      continue;
    }

    if (runtime.state === "input_required") {
      const escalationApprovalId = crypto.randomUUID();
      const reasonText =
        runtime.message
          ?.filter((part) => part.type === "text" && part.text)
          .map((part) => part.text)
          .join("\n") ?? "Decision required";
      const handoffPayload = {
        task_id: node.id,
        status: {
          state: runtime.state,
          message: runtime.message ?? [],
          timestamp: now,
        },
        artifacts: runtime.artifacts ?? [],
        error: runtime.error,
        metadata: {
          agent_id: agent.id,
        },
      };
      db.prepare(
        `INSERT INTO approvals (id, company_id, type, status, payload, created_at, updated_at)
         VALUES (?, ?, 'decision_escalation', 'pending', ?, ?, ?)`,
      ).run(
        escalationApprovalId,
        companyId,
        JSON.stringify({
          node_id: node.id,
          issue_id: node.issue_id,
          reason: reasonText,
          message_parts: runtime.message ?? [],
          context_snapshot: {
            latest_handoff: handoffPayload,
            adapter_run_id: node.adapter_run_id,
          },
        }),
        now,
        now,
      );
      db.prepare(
        `UPDATE action_nodes
         SET status = 'pending',
             adapter_status = ?,
             adapter_run_id = NULL,
             completed_at = NULL,
             last_handoff = ?,
             last_error = ?,
             updated_at = ?
         WHERE id = ? AND company_id = ?`,
      ).run(
        runtime.state,
        JSON.stringify(handoffPayload),
        "Decision escalation pending board approval",
        now,
        node.id,
        companyId,
      );
      if (node.issue_id) {
        db.prepare("UPDATE issues SET status = 'blocked', updated_at = ? WHERE id = ? AND company_id = ?").run(
          now,
          node.issue_id,
          node.company_id,
        );
      }
      db.prepare(
        `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
         VALUES (?, 'coo', 'decision_escalation_requested', 'approval', ?, ?, ?)`,
      ).run(
        companyId,
        escalationApprovalId,
        JSON.stringify({ node_id: node.id, issue_id: node.issue_id }),
        now,
      );
      completedNodeIds.push(node.id);
      continue;
    }

    const nextState = mapRuntimeStateToNodeState(runtime.state);
    const retryableFailure =
      (nextState === "failed" || nextState === "timeout") && node.retry_count < node.max_retries;
    const nextRetryCount = retryableFailure ? node.retry_count + 1 : node.retry_count;
    const handoffPayload = {
      task_id: node.id,
      status: {
        state: runtime.state,
        message: runtime.message ?? [],
        timestamp: now,
      },
      artifacts: runtime.artifacts ?? [],
      error: runtime.error,
      metadata: {
        agent_id: agent.id,
      },
    };
    if (retryableFailure) {
      db.prepare(
        `UPDATE action_nodes
         SET status = 'pending',
             retry_count = ?,
             adapter_status = ?,
             adapter_run_id = NULL,
             completed_at = NULL,
             last_handoff = ?,
             last_error = ?,
             updated_at = ?
         WHERE id = ? AND company_id = ?`,
      ).run(
        nextRetryCount,
        runtime.state,
        JSON.stringify(handoffPayload),
        runtime.error?.message ?? `Runtime returned ${runtime.state}`,
        now,
        node.id,
        companyId,
      );
      db.prepare(
        `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
         VALUES (?, 'coo', 'action_node_retry_scheduled', 'action_node', ?, ?, ?)`,
      ).run(
        companyId,
        node.id,
        JSON.stringify({
          retry_count: nextRetryCount,
          max_retries: node.max_retries,
          previous_state: nextState,
        }),
        now,
      );
      completedNodeIds.push(node.id);
      continue;
    }
    db.prepare(
      `UPDATE action_nodes
       SET status = ?, adapter_status = ?, completed_at = ?, last_handoff = ?, last_error = ?, updated_at = ?
       WHERE id = ? AND company_id = ?`,
    ).run(
      nextState,
      runtime.state,
      now,
      JSON.stringify(handoffPayload),
      runtime.error?.message ?? null,
      now,
      node.id,
      companyId,
    );
    db.prepare(
      `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
       VALUES (?, 'coo', 'action_node_runtime_polled', 'action_node', ?, ?, ?)`,
    ).run(
      companyId,
      node.id,
      JSON.stringify({
        runtime_state: runtime.state,
        next_state: nextState,
        error: runtime.error ?? null,
      }),
      now,
    );
    applyIssueStateForNode(db, node, nextState, now);
    completedNodeIds.push(node.id);
  }

  return { completed_node_ids: completedNodeIds, running_node_ids: runningNodeIds };
}
