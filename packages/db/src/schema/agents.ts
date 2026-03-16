import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  name: text("name").notNull(),
  role: text("role"),
  reportsTo: text("reports_to"),
  adapterType: text("adapter_type").notNull(),
  adapterConfig: text("adapter_config", { mode: "json" }).notNull(),
  status: text("status", { enum: ["active", "paused"] }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
