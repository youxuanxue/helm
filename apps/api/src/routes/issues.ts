import { Hono } from "hono";
import { getDb } from "../lib/db";
import { handleHttpError, parseJsonBody } from "../lib/http";
import { validateSafeId } from "@helm/shared";

const DEFAULT_EXPECTED_STATUSES = ["todo", "backlog", "blocked"] as const;
const ALLOWED_EXPECTED_STATUSES = new Set([
  "todo",
  "backlog",
  "blocked",
  "in_progress",
  "done",
]);

export const issues = new Hono();

issues.post("/:id/checkout", async (c) => {
  try {
    const issueId = c.req.param("id");
    validateSafeId(issueId, "issue id");
    const body = await parseJsonBody<{
      agentId?: string;
      expectedStatuses?: Array<"todo" | "backlog" | "blocked" | "in_progress" | "done">;
    }>(c);
    const agentId = body.agentId?.trim();
    if (!agentId) {
      return c.json({ error: "agentId is required" }, 400);
    }
    validateSafeId(agentId, "agent id");

    const expectedStatusesCandidate = body.expectedStatuses?.length
      ? body.expectedStatuses
      : [...DEFAULT_EXPECTED_STATUSES];
    const expectedStatuses = expectedStatusesCandidate.filter((status) =>
      ALLOWED_EXPECTED_STATUSES.has(status),
    );
    if (expectedStatuses.length !== expectedStatusesCandidate.length) {
      return c.json({ error: "expectedStatuses contains invalid value" }, 400);
    }
    const placeholders = expectedStatuses.map(() => "?").join(", ");
    const now = new Date().toISOString();
    const db = getDb();
    const issue = db
      .prepare("SELECT id, company_id, status, assignee_agent_id FROM issues WHERE id = ?")
      .get(issueId) as
      | {
          id: string;
          company_id: string;
          status: string;
          assignee_agent_id: string | null;
        }
      | undefined;
    if (!issue) {
      return c.json({ error: "Issue not found" }, 404);
    }
    const agent = db
      .prepare("SELECT id, company_id FROM agents WHERE id = ?")
      .get(agentId) as { id: string; company_id: string } | undefined;
    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }
    if (agent.company_id !== issue.company_id) {
      return c.json(
        {
          error: "Cross-company checkout is forbidden",
          current: {
            id: issue.id,
            status: issue.status,
            assignee_agent_id: issue.assignee_agent_id,
          },
        },
        409,
      );
    }
    const result = db
      .prepare(
        `UPDATE issues
         SET assignee_agent_id = ?, status = 'in_progress', updated_at = ?
         WHERE id = ?
         AND company_id = ?
         AND assignee_agent_id IS NULL
         AND status IN (${placeholders})`
      )
      .run(agentId, now, issueId, issue.company_id, ...expectedStatuses);

    if (result.changes === 0) {
      const current = db
        .prepare("SELECT id, status, assignee_agent_id FROM issues WHERE id = ?")
        .get(issueId);
      if (!current) {
        return c.json({ error: "Issue not found" }, 404);
      }
      return c.json({ error: "Issue already claimed or status conflict", current }, 409);
    }

    const updatedIssue = db
      .prepare("SELECT id, status, assignee_agent_id, company_id FROM issues WHERE id = ?")
      .get(issueId) as { id: string; company_id: string } | undefined;
    if (updatedIssue) {
      db.prepare(
        `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
         VALUES (?, 'agent', 'issue_checked_out', 'issue', ?, ?, ?)`
      ).run(updatedIssue.company_id, issueId, JSON.stringify({ agent_id: agentId }), now);
    }

    return c.json(db.prepare("SELECT * FROM issues WHERE id = ?").get(issueId));
  } catch (error) {
    return handleHttpError(error, c);
  }
});
