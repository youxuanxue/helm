import { getDb as _getDb, migrate } from "@helm/db";
import { config } from "./config";

let _initialized = false;

export function getDb(): ReturnType<typeof _getDb> {
  if (!_initialized) {
    const dbPath = config.dataDir ? `${config.dataDir}/helm.db` : undefined;
    migrate(dbPath);
    _initialized = true;
  }
  return _getDb(config.dataDir ? `${config.dataDir}/helm.db` : undefined);
}
