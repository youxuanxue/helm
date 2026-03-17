import { readFileSync, existsSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = process.env.HELM_CONFIG_DIR ?? join(homedir(), ".helm");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface HelmConfig {
  apiUrl: string;
  defaultCompanyId?: string;
}

function readConfig(): HelmConfig {
  if (!existsSync(CONFIG_FILE)) {
    return {
      apiUrl: process.env.HELM_API_URL ?? "http://localhost:3000",
    };
  }
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return { ...defaultConfig(), ...JSON.parse(raw) };
  } catch {
    return defaultConfig();
  }
}

function defaultConfig(): HelmConfig {
  return {
    apiUrl: process.env.HELM_API_URL ?? "http://localhost:3000",
  };
}

let _config: HelmConfig | null = null;

export function getConfig(): HelmConfig {
  if (!_config) {
    _config = readConfig();
  }
  return _config;
}

export function writeConfig(updates: Partial<HelmConfig>): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const config = { ...getConfig(), ...updates };
  const tmp = CONFIG_FILE + ".tmp." + Date.now();
  writeFileSync(tmp, JSON.stringify(config, null, 2), "utf-8");
  renameSync(tmp, CONFIG_FILE);
  _config = config;
}
