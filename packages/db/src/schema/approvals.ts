import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const approvals = sqliteTable("approvals", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  type: text("type", {
    enum: ["task_graph", "hire_agent", "decision_escalation"],
  }).notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull(),
  payload: text("payload", { mode: "json" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  resolvedAt: text("resolved_at"),
  resolvedBy: text("resolved_by"),
});
