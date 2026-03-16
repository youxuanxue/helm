import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const actionNodes = sqliteTable("action_nodes", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  issueId: text("issue_id"),
  specRef: text("spec_ref").notNull(),
  dependsOn: text("depends_on", { mode: "json" }).notNull(),
  status: text("status", {
    enum: ["pending", "running", "succeed", "failed", "cancelled", "timeout"],
  }).notNull(),
  heartbeatRunId: text("heartbeat_run_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
