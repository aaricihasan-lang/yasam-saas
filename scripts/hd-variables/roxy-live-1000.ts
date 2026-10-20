/**
 * HD VARIABLES — GERÇEK Roxy doğrulaması, 1 000 çağrı bütçesi (ÜCRETLİ; owner izni 20.10.2026; yalnız SENTETİK doğum anları).
 *
 *   HD_VARIABLES_LIVE=1 npx tsx scripts/hd-variables/roxy-live-1000.ts <vakalar.json> <ham_yanıt_klasörü (repo dışı)> <toplam_bütçe_tavanı>
 *
 * • Vakalar ve BEKLENEN sonuçlar (Swiss Ephemeris) Roxy'den ÖNCE üretilip sabitlenir (make-live-1000-cases.py); burada değiştirilmez.
 * • Ürünün kendi istemcisi kullanılır (callRoxyVariables); yalnız kota başlıklarını okumak için `fetchImpl` gerçek fetch'i sarar.
 * • Defter (fixtures/roxy-live-1000-ledger.jsonl): her HTTP denemesinden ÖNCE "intent", sonra "result". Önceki 9 çağrı
 *   (roxy-live-ledger.jsonl) dahil toplam deneme sayısı tavanı aşamaz. Intent'i olan vaka bir daha ÇAĞRILMAZ (yanıt kaybolduysa
 *   "lost" raporlanır — körlemesine tekrar yok). Otomatik retry YOK.
 * • Durma: 429 (Retry-After kaydedilir) · 401/403 · art arda 3 sunucu/zaman aşımı hatası · kalan aylık hak < 20 000 ·
 *   bağımsız referansla > 2″ (ofseti saniyeli tarihsel LMT anlarında > 3″) güvenli payda Color/Tone/Base uyuşmazlığı (önce incelenir).
 * • Hız: çağrılar arası ≥ 200 ms (≤ 300/dk; sağlayıcı sınırı ≥ 600/dk). Anahtar hiçbir dosyaya / loga yazılmaz.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readRoxyServerConfig } from "../../lib/human-design/providers/roxy/config";
import { callRoxyVariables, type RoxyVariablesRequest } from "../../lib/human-design/variables/roxyVariablesClient";
import { resolveBirthLocalTime } from "../../lib/human-design/api/birthTimeResolution";

const FIX = path.resolve(__dirname, "fixtures");
const OLD_LEDGER = path.join(FIX, "roxy-live-ledger.jsonl");
const LEDGER = path.join(FIX, "roxy-live-1000-ledger.jsonl");
const FLOOR_REMAINING = 20_000;
const STOP_MARGIN_ARCSEC = 2;
/** Ofsetinde saniye olan tarihsel LMT anları: sağlayıcının ofset saniyesini attığı ölçüldü (≤ 59 sn ⇒ Güneş ≤ 2,6″) — bu vakalarda eşik 3″. */
const STOP_MARGIN_LMT_ARCSEC = 3;
const KEYS = ["determination", "environment", "motivation", "perspective"] as const;

type Exp = { color: number; tone: number; base: number; colorMarginArcsec: number; toneMarginArcsec: number; baseMarginArcsec: number };
type Case = RoxyVariablesRequest & { id: string; stage: number; utc: string; expected: { arrows: Record<string, Exp> } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lines = (f: string) => (existsSync(f) ? readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as Record<string, unknown>) : []);

async function main() {
  if (process.env.HD_VARIABLES_LIVE !== "1") throw new Error("Ücretli çağrı: HD_VARIABLES_LIVE=1 gerekli.");
  const [casesFile, rawDir, capArg] = process.argv.slice(2);
  const cap = Number(capArg);
  if (!casesFile || !rawDir || !Number.isInteger(cap) || cap < 1 || cap > 1000) throw new Error("kullanım: <vakalar.json> <ham_klasör> <tavan 1–1000>");
  if (path.resolve(rawDir).startsWith(path.resolve(__dirname, "../.."))) throw new Error("Ham yanıt klasörü repo DIŞINDA olmalı.");
  mkdirSync(rawDir, { recursive: true });
  const config = readRoxyServerConfig();
  if (!config) throw new Error("ROXY_API_KEY yok.");
  const cases = (JSON.parse(readFileSync(casesFile, "utf8")) as { cases: Case[] }).cases;

  const oldCalls = lines(OLD_LEDGER).length;
  const prior = lines(LEDGER);
  const intents = new Set(prior.filter((e) => e.type === "intent").map((e) => String(e.case)));
  const results = new Set(prior.filter((e) => e.type === "result").map((e) => String(e.case)));
  const lost = [...intents].filter((c) => !results.has(c));
  let used = oldCalls + intents.size;
  console.log(`bütçe: önceki ${oldCalls} + bu defter ${intents.size} = ${used} / tavan ${cap}; kayıp yanıt ${lost.length}${lost.length ? ` (${lost.join(", ")})` : ""}`);

  let consecutiveFail = 0;
  let lastRemaining: number | null = null;
  let stop: string | null = null;
  let done = 0;
  for (const c of cases) {
    if (intents.has(c.id)) continue; // daha önce denenmiş — tekrar ÇAĞRILMAZ
    if (used >= cap) { stop = `tavan ${cap} doldu`; break; }
    if (lastRemaining !== null && lastRemaining < FLOOR_REMAINING) { stop = `kalan aylık hak ${lastRemaining} < ${FLOOR_REMAINING}`; break; }
    const body: RoxyVariablesRequest = { date: c.date, time: c.time, timezone: c.timezone, latitude: c.latitude, longitude: c.longitude, nodeType: c.nodeType };
    appendFileSync(LEDGER, JSON.stringify({ type: "intent", at: new Date().toISOString(), case: c.id, stage: c.stage, utc: c.utc }) + "\n");
    used++;
    let hdr: Record<string, string | null> = {};
    const t0 = Date.now();
    const r = await callRoxyVariables(config, body, {
      lang: "tr",
      fetchImpl: async (u, i) => {
        const res = await fetch(u, i);
        hdr = { limit: res.headers.get("x-ratelimit-limit"), remaining: res.headers.get("x-ratelimit-remaining"), used: res.headers.get("x-ratelimit-used"), reset: res.headers.get("x-ratelimit-reset"), retryAfter: res.headers.get("retry-after") };
        return res;
      },
    });
    const ms = Date.now() - t0;
    if (hdr.remaining != null && hdr.remaining !== "") lastRemaining = Number(hdr.remaining);
    let quick: string | null = null;
    if (r.ok) {
      writeFileSync(path.join(rawDir, `${c.id}.json`), JSON.stringify(r.raw, null, 1));
      // Hızlı güvenlik denetimi: bağımsız referansla açık-paylı uyuşmazlık → dur ve incele.
      const arrows = Array.isArray((r.raw as { arrows?: unknown }).arrows) ? ((r.raw as { arrows: Array<Record<string, unknown>> }).arrows) : [];
      const rs = resolveBirthLocalTime(c.date, c.time, c.timezone);
      const lmt = rs.kind === "ok" && rs.offsetSeconds % 60 !== 0;
      const stopAt = lmt ? STOP_MARGIN_LMT_ARCSEC : STOP_MARGIN_ARCSEC;
      for (const k of KEYS) {
        const a = arrows.find((x) => x.key === k);
        const e = c.expected.arrows[k];
        if (!a) { quick = `${k} yok`; break; }
        if (a.color !== e.color && e.colorMarginArcsec > stopAt) quick = `${k} Color ${String(a.color)}≠${e.color} (pay ${e.colorMarginArcsec.toFixed(2)}″)`;
        else if (a.tone !== e.tone && e.toneMarginArcsec > stopAt) quick = `${k} Tone ${String(a.tone)}≠${e.tone} (pay ${e.toneMarginArcsec.toFixed(2)}″)`;
        else if (a.base !== e.base && e.baseMarginArcsec > stopAt) quick = `${k} Base ${String(a.base)}≠${e.base} (pay ${e.baseMarginArcsec.toFixed(2)}″)`;
        if (quick) break;
      }
      consecutiveFail = 0;
    } else if (r.kind === "server_error" || r.kind === "timeout" || r.kind === "network") consecutiveFail++;
    appendFileSync(LEDGER, JSON.stringify({ type: "result", at: new Date().toISOString(), case: c.id, ok: r.ok, status: r.ok ? 200 : r.status, kind: r.ok ? null : r.kind, ms, rate: hdr, quick }) + "\n");
    done++;
    if (done % 25 === 0 || !r.ok || quick) console.log(`${c.id} ${r.ok ? 200 : `${r.status} ${r.kind}`} ${ms} ms · kalan ${hdr.remaining ?? "?"} · toplam deneme ${used}${quick ? ` · UYUŞMAZLIK ${quick}` : ""}`);
    if (!r.ok && r.kind === "rate_limited") { stop = `429 — Retry-After ${hdr.retryAfter ?? "?"} sn; durduruldu (aşılmaya çalışılmaz)`; break; }
    if (!r.ok && r.kind === "unauthorized") { stop = "401/403 — durduruldu"; break; }
    if (consecutiveFail >= 3) { stop = "art arda 3 sunucu / zaman aşımı hatası — durduruldu"; break; }
    if (quick) { stop = `açık-paylı uyuşmazlık (${c.id}: ${quick}) — yeni ücretli çağrı durduruldu, inceleme gerekli`; break; }
    await sleep(200);
  }
  console.log(`\nBİTTİ: bu koşuda ${done} çağrı · toplam deneme ${used} / ${cap} · son kalan aylık hak ${lastRemaining ?? "?"}${stop ? ` · DURMA: ${stop}` : ""}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
