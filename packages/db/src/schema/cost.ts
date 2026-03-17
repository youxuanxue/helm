import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const costEvents = sqliteTable("cost_events", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  agentId: text("agent_id").notNull(),
  issueId: text("issue_id"),
  billingCode: text("billing_code"),
  inputTokens: integer("input_tokens").default(0),
  outputTokens: integer("output_tokens").default(0),
  costCents: integer("cost_cents").default(0),
  createdAt: text("created_at").notNull(),
});
