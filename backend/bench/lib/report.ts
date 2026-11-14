// SHARED (Phase 0a). Write benchmark CSVs and Markdown summaries to backend/bench/results/.

import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../../src/shared/config";

export const RESULTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "results");

type Row = Record<string, string | number | boolean>;

function csvCell(v: string | number | boolean): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function writeCsv(fileName: string, rows: Row[]): string {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const lines = [headers.join(","), ...rows.map((r) => headers.map((h) => csvCell(r[h] ?? "")).join(","))];
  const file = path.join(RESULTS_DIR, fileName);
  writeFileSync(file, lines.join("\n") + "\n", "utf8");
  console.log(`Wrote ${file}`);
  return file;
}

export function mdTable(rows: Row[]): string {
  if (rows.length === 0) return "_(no rows)_";
  const headers = Object.keys(rows[0]);
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${headers.map((h) => String(r[h] ?? "")).join(" | ")} |`),
  ].join("\n");
}

export function writeSummary(fileName: string, title: string, body: string): string {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const header = [
    `# ${title}`,
    "",
    `- Date: ${new Date().toISOString()}`,
    `- Node: ${process.version}`,
    `- CPU: ${os.cpus()[0]?.model ?? "unknown"} (${os.cpus().length} threads)`,
    `- OS: ${os.type()} ${os.release()}`,
    `- Table: ${config.tableName} @ ${config.dynamoEndpoint ?? "AWS"}`,
    `- MAX_ACTIVE_NOTES: ${config.maxActiveNotes}, READ_RADIUS_M: ${config.readRadiusM}`,
    "",
  ].join("\n");
  const file = path.join(RESULTS_DIR, fileName);
  writeFileSync(file, header + body + "\n", "utf8");
  console.log(`Wrote ${file}`);
  return file;
}
