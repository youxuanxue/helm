import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const companies = sqliteTable("companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mission: text("mission").notNull(),
  targetAudience: text("target_audience").notNull(),
  companySpec: text("company_spec", { mode: "json" }).notNull(),
  outputTypes: text("output_types", { mode: "json" }),
  status: text("status", { enum: ["active", "paused", "archived"] }).notNull(),
  budgetCents: integer("budget_cents"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
