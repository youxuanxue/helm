import { Hono } from "hono";
import { getDb } from "../lib/db";

export const approvals = new Hono();

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
  const result = db
    .prepare(
      `UPDATE approvals SET status = 'approved', resolved_at = ?, resolved_by = 'board', updated_at = ? WHERE id = ? AND status = 'pending'`
    )
    .run(now, now, id);
  if (result.changes === 0) {
    return c.json({ error: "Approval not found or already resolved" }, 404);
  }
  const row = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id);
  return c.json(row);
});

approvals.post("/:id/reject", (c) => {
  const id = c.req.param("id");
  const now = new Date().toISOString();
  const db = getDb();
  const result = db
    .prepare(
      `UPDATE approvals SET status = 'rejected', resolved_at = ?, resolved_by = 'board', updated_at = ? WHERE id = ? AND status = 'pending'`
    )
    .run(now, now, id);
  if (result.changes === 0) {
    return c.json({ error: "Approval not found or already resolved" }, 404);
  }
  const row = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id);
  return c.json(row);
});
