import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const heartbeatRuns = sqliteTable("heartbeat_runs", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  companyId: text("company_id").notNull(),
  status: text("status").notNull(), // pending | running | succeed | failed
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
});
