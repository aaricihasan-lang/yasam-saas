/**
 * Klasik Numeroloji — GERÇEK sağlayıcı doğrulama koşucusu (owner yetkisi 29.10.2026: oturum tavanı 500 istek).
 *
 * Güvenlik / bütçe kuralları (değiştirmeden önce owner onayı):
 *   • Tavan HARD: defterdeki TÜM "attempt" satırları (başarılı, başarısız, zaman aşımı) 1 kredi sayılır.
 *     attempt sayısı CAP'e ulaştıysa hiçbir istek gönderilmez.
 *   • Her istekten ÖNCE deftere "attempt" (fsync) yazılır; sonra "result". Yanıt kaybolsa bile kredi sayılmış olur.
 *   • Aynı vaka kimliği ikinci kez ÇAĞRILMAZ (attempt kaydı varsa atlanır).
 *   • Yeniden deneme YOK, paralellik YOK (sıralı + bekleme).
 *   • Anahtar yalnız process.env.ROXY_API_KEY'den okunur; loga, deftere, ham dosyaya yazılmaz.
 *   • Defter ve ham yanıtlar repo DIŞINDA tutulur (sağlayıcı metni herkese açık repoya girmez).
 *   • Vakalarda yalnız SENTETİK ad/tarih kullanılır.
 *
 * Kullanım: npx tsx scripts/numeroloji-klasik/live/runner.ts <cases.json> [--dry]
 */
import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";

export const SESSION_CAP = 500;
export const OUT_DIR = process.env.NUM_KLASIK_LIVE_DIR ?? "C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29";
const LEDGER = path.join(OUT_DIR, "ledger.jsonl");
const RAW = path.join(OUT_DIR, "raw");
const BASE = "https://roxyapi.com/api/v2";
const DELAY_MS = 350;
const TIMEOUT_MS = 25_000;

export type LiveCase = {
  id: string;
  method: "GET" | "POST";
  /** /numerology/... , /crystals/... veya /usage */
  path: string;
  body?: Record<string, unknown>;
  lang?: string;
  purpose: string;
};

type LedgerRow = {
  at: string;
  event: "attempt" | "result";
  id: string;
  endpoint: string;
  purpose?: string;
  http?: number | null;
  kind?: string;
  credit?: number;
  totalAttempts?: number;
  remainingSession?: number;
  rl?: Record<string, string>;
  ms?: number;
};

function readLedger(): LedgerRow[] {
  if (!existsSync(LEDGER)) return [];
  return readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as LedgerRow);
}

function appendDurable(row: LedgerRow): void {
  const fd = openSync(LEDGER, "a");
  try {
    writeSync(fd, JSON.stringify(row) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Uç kimliği: yol parametrelerini maskeler (defterde kişisel veri olmasın). */
function endpointLabel(c: LiveCase): string {
  return `${c.method} ${c.path.replace(/\/\d+$/, "/{n}")}`;
}

export function attemptsSoFar(): number {
  return readLedger().filter((r) => r.event === "attempt").length;
}

async function main(): Promise<void> {
  const file = process.argv[2];
  const dry = process.argv.includes("--dry");
  if (!file) throw new Error("vaka dosyası gerekli");
  const cases = JSON.parse(readFileSync(file, "utf8")) as LiveCase[];
  mkdirSync(RAW, { recursive: true });
  const key = (process.env.ROXY_API_KEY ?? "").trim();
  if (!key && !dry) throw new Error("ROXY_API_KEY yok");

  const ids = new Set<string>();
  for (const c of cases) {
    if (!/^[a-z0-9][a-z0-9._-]{1,80}$/.test(c.id)) throw new Error(`geçersiz vaka kimliği: ${c.id}`);
    if (ids.has(c.id)) throw new Error(`yinelenen vaka: ${c.id}`);
    ids.add(c.id);
    if (!/^\/(numerology|crystals)(\/[A-Za-z0-9-]+)*$|^\/usage$/.test(c.path)) throw new Error(`izinsiz yol: ${c.path}`);
  }

  const done = new Set(readLedger().filter((r) => r.event === "attempt").map((r) => r.id));
  const todo = cases.filter((c) => !done.has(c.id));
  let total = attemptsSoFar();
  console.log(`vaka=${cases.length} önceden=${cases.length - todo.length} yeni=${todo.length} defter=${total}/${SESSION_CAP}`);
  if (total + todo.length > SESSION_CAP) {
    console.log(`UYARI: bu dosya tavanı aşar; yalnız ${Math.max(0, SESSION_CAP - total)} vaka çalışır.`);
  }
  if (dry) return;

  let pass = 0;
  let fail = 0;
  for (const c of todo) {
    total = attemptsSoFar();
    if (total >= SESSION_CAP) {
      console.log(`TAVAN DOLDU (${total}/${SESSION_CAP}) — durduruldu.`);
      break;
    }
    const endpoint = endpointLabel(c);
    appendDurable({ at: new Date().toISOString(), event: "attempt", id: c.id, endpoint, purpose: c.purpose, credit: 1, totalAttempts: total + 1, remainingSession: SESSION_CAP - total - 1 });
    const url = `${BASE}${c.path}?lang=${encodeURIComponent(c.lang ?? "tr")}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    const t0 = Date.now();
    let http: number | null = null;
    let kind = "ok";
    const rl: Record<string, string> = {};
    try {
      const res = await fetch(url, {
        method: c.method,
        headers: { Accept: "application/json", "X-API-Key": key, ...(c.method === "POST" ? { "Content-Type": "application/json" } : {}) },
        body: c.method === "POST" ? JSON.stringify(c.body ?? {}) : undefined,
        signal: ac.signal,
        cache: "no-store",
      });
      http = res.status;
      for (const h of ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-used", "x-ratelimit-reset", "retry-after"]) {
        const v = res.headers.get(h);
        if (v !== null) rl[h] = v;
      }
      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        kind = "malformed_json";
      }
      if (!res.ok) kind = `http_${res.status}`;
      writeFileSync(path.join(RAW, `${c.id}.json`), JSON.stringify({ case: c, http, rl, body: parsed ?? text }, null, 2));
    } catch (e) {
      kind = ac.signal.aborted ? "timeout" : "network";
      void e;
    } finally {
      clearTimeout(timer);
    }
    const ok = kind === "ok";
    if (ok) pass++;
    else fail++;
    appendDurable({ at: new Date().toISOString(), event: "result", id: c.id, endpoint, http, kind, credit: 1, totalAttempts: total + 1, remainingSession: SESSION_CAP - total - 1, rl, ms: Date.now() - t0 });
    console.log(`${ok ? "OK " : "ERR"} ${c.id} ${endpoint} http=${http} kalan_kota=${rl["x-ratelimit-remaining"] ?? "?"} oturum=${total + 1}/${SESSION_CAP}`);
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  console.log(`bitti: ok=${pass} hata=${fail} defter=${attemptsSoFar()}/${SESSION_CAP}`);
  appendFileSync(path.join(OUT_DIR, "runs.log"), `${new Date().toISOString()} ${path.basename(file)} ok=${pass} err=${fail} total=${attemptsSoFar()}\n`);
}

if (process.argv[1] && /runner\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error("koşucu hatası:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
