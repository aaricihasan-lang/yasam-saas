/** Vaka üreticileri için ortak yardımcılar (repo DIŞINA yazar; sentetik veri). */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export type GenCase = {
  id: string;
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
  lang?: string;
  purpose: string;
};

export const QA_DIR = process.env.NUM_KLASIK_LIVE_DIR ?? "C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29";

export function writeCases(file: string, cases: GenCase[]): void {
  const ids = new Set<string>();
  for (const c of cases) {
    if (ids.has(c.id)) throw new Error(`yinelenen vaka: ${c.id}`);
    ids.add(c.id);
  }
  const dir = path.join(QA_DIR, "cases");
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, file);
  writeFileSync(out, JSON.stringify(cases, null, 1));
  console.log(`${out}: ${cases.length} vaka`);
}
