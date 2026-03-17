import { Hono } from "hono";
import { getDb } from "../lib/db";
import { handleHttpError, parseJsonBody } from "../lib/http";

const DEFAULT_EXPECTED_STATUSES = ["todo", "backlog", "blocked"] as const;

export const issues = new Hono();

issues.post("/:id/checkout", async (c) => {
  try {
    const issueId = c.req.param("id");
    const body = await parseJsonBody<{
      agentId?: string;
      expectedStatuses?: Array<"todo" | "backlog" | "blocked" | "in_progress" | "done">;
    }>(c);
    const agentId = body.agentId?.trim();
    if (!agentId) {
      return c.json({ error: "agentId is required" }, 400);
    }

    const expectedStatuses = body.expectedStatuses?.length
      ? body.expectedStatuses
      : [...DEFAULT_EXPECTED_STATUSES];
    const placeholders = expectedStatuses.map(() => "?").join(", ");
    const now = new Date().toISOString();
    const db = getDb();
    const agent = db.prepare("SELECT id FROM agents WHERE id = ?").get(agentId);
    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }
    const result = db
      .prepare(
        `UPDATE issues
         SET assignee_agent_id = ?, status = 'in_progress', updated_at = ?
         WHERE id = ?
         AND assignee_agent_id IS NULL
         AND status IN (${placeholders})`
      )
      .run(agentId, now, issueId, ...expectedStatuses);

    if (result.changes === 0) {
      const current = db
        .prepare("SELECT id, status, assignee_agent_id FROM issues WHERE id = ?")
        .get(issueId);
      if (!current) {
        return c.json({ error: "Issue not found" }, 404);
      }
      return c.json({ error: "Issue already claimed or status conflict", current }, 409);
    }

    const issue = db
      .prepare("SELECT id, status, assignee_agent_id, company_id FROM issues WHERE id = ?")
      .get(issueId) as { id: string; company_id: string } | undefined;
    if (issue) {
      db.prepare(
        `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
         VALUES (?, 'agent', 'issue_checked_out', 'issue', ?, ?, ?)`
      ).run(issue.company_id, issueId, JSON.stringify({ agent_id: agentId }), now);
    }

    return c.json(db.prepare("SELECT * FROM issues WHERE id = ?").get(issueId));
  } catch (error) {
    return handleHttpError(error, c);
  }
});
