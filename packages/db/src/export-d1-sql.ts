import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { SQL_MIGRATIONS } from "./client";

function outputPathFromArgs(): string {
  const argPath = process.argv[2];
  if (!argPath) {
    return resolve(process.cwd(), "d1-migrations.sql");
  }
  return resolve(process.cwd(), argPath);
}

function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  writeFileSync(temp, content, "utf-8");
  renameSync(temp, path);
}

const outputPath = outputPathFromArgs();
const sql = `${SQL_MIGRATIONS.join(";\n\n")};\n`;
writeAtomic(outputPath, sql);
console.log(`D1 migration SQL exported to ${outputPath}`);
