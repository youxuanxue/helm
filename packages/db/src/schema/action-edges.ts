import { sqliteTable, text, primaryKey } from "drizzle-orm/sqlite-core";

export const actionEdges = sqliteTable(
  "action_edges",
  {
    fromNodeId: text("from_node_id").notNull(),
    toNodeId: text("to_node_id").notNull(),
    companyId: text("company_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.fromNodeId, table.toNodeId] }),
  }),
);
