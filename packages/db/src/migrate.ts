/**
 * Migration script. Run at app entry or via: pnpm --filter @helm/db run migrate
 * Creates tables if not exist. Safe to run multiple times.
 */
import { initDb, migrate } from "./client.js";

const dataDir = process.env.HELM_DATA_DIR || "";
const dbPath = dataDir ? `${dataDir}/helm.db` : ":memory:";

initDb(dbPath);
migrate();
console.log("Migration complete.");
