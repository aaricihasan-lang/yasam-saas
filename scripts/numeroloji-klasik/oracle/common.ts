/** Oracle/normalize harness'leri için ortak: QA klasöründeki ham yanıtları okur (repo DIŞI). */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ClassicEndpointId } from "../../../lib/numeroloji-klasik/endpoints";

export const QA_DIR = process.env.NUM_KLASIK_LIVE_DIR ?? "C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29";
export const RAW_DIR = path.join(QA_DIR, "raw");

export type RawRecord = {
  id: string;
  file: string;
  method: string;
  path: string;
  lang: string;
  body: Record<string, unknown>;
  http: number | null;
  response: unknown;
  endpoint: ClassicEndpointId | null;
  /** normalize/verify için girdi (yol parametresi dahil) */
  input: Record<string, unknown>;
};

const PATH_TO_ID: Record<string, ClassicEndpointId> = {
  chart: "chart",
  "life-path": "life_path",
  expression: "expression",
  "soul-urge": "soul_urge",
  personality: "personality",
  "birth-day": "birth_day",
  maturity: "maturity",
  bridge: "bridge",
  "karmic-lessons": "karmic_lessons",
  "karmic-debt": "karmic_debt",
  "personal-day": "personal_day",
  "personal-month": "personal_month",
  "personal-year": "personal_year",
  compatibility: "compatibility",
  meanings: "meanings",
  daily: "daily",
  chaldean: "chaldean",
  "compound-number": "compound_number",
  dual: "dual",
  "business-name": "business_name",
};

export function endpointOf(p: string): { id: ClassicEndpointId | null; param: number | null } {
  const m = /^\/numerology\/([a-z-]+)(?:\/(\d+))?$/.exec(p);
  if (!m) return { id: null, param: null };
  return { id: PATH_TO_ID[m[1]] ?? null, param: m[2] !== undefined ? Number(m[2]) : null };
}

export function liveDataPresent(): boolean {
  return existsSync(RAW_DIR) && readdirSync(RAW_DIR).some((f) => f.endsWith(".json"));
}

export function loadRaw(): RawRecord[] {
  const out: RawRecord[] = [];
  for (const f of readdirSync(RAW_DIR).filter((x) => x.endsWith(".json")).sort()) {
    const j = JSON.parse(readFileSync(path.join(RAW_DIR, f), "utf8"));
    const c = j.case ?? {};
    const { id, param } = endpointOf(String(c.path ?? ""));
    const body = (c.body ?? {}) as Record<string, unknown>;
    out.push({
      id: String(c.id ?? f.replace(/\.json$/, "")),
      file: f,
      method: String(c.method ?? ""),
      path: String(c.path ?? ""),
      lang: String(c.lang ?? "tr"),
      body,
      http: typeof j.http === "number" ? j.http : null,
      response: j.body,
      endpoint: id,
      input: param !== null ? { ...body, number: param } : body,
    });
  }
  return out;
}
