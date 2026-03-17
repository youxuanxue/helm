import { Hono } from "hono";
import { getDb } from "../lib/db";

export const heartbeatRuns = new Hono();

heartbeatRuns.get("/:id/status", (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const row = db.prepare("SELECT * FROM heartbeat_runs WHERE id = ?").get(id);
  if (!row) {
    return c.json({ error: "Heartbeat run not found" }, 404);
  }
  return c.json(row);
});
