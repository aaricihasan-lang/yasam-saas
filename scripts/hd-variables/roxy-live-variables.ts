/**
 * HD VARIABLES — GERÇEK Roxy doğrulaması (ÜCRETLİ; yalnız açık onayla ve SENTETİK doğum anlarıyla).
 *   HD_VARIABLES_LIVE=1 npx tsx scripts/hd-variables/roxy-live-variables.ts <ham_yanıt_klasörü>
 * • fixtures/live-cases.json içindeki 8 sentetik doğum + 1 bilerek geçersiz saat dilimi (hata sınıflandırması) = 9 çağrı.
 * • Defter: fixtures/roxy-live-ledger.jsonl (zaman, vaka, HTTP durumu, süre — anahtar / ham yanıt YOK).
 *   Defter doluysa betik ÇALIŞMAZ (yanlışlıkla tekrar ücretli çağrı olmasın); HD_VARIABLES_LIVE_FORCE=1 ile bilinçli tekrar.
 * • Ham yanıtlar (sağlayıcı metinleri dahil) repo DIŞINDAKİ klasöre; repoya yalnız sayısal / yapısal sıkıştırılmış fixture
 *   (fixtures/roxy-live-variables.json — metin yerine dil ve uzunluk bilgisi).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readRoxyServerConfig } from "../../lib/human-design/providers/roxy/config";
import { callRoxyVariables, type RoxyVariablesRequest } from "../../lib/human-design/variables/roxyVariablesClient";

const FIX = path.resolve(__dirname, "fixtures");
const LEDGER = path.join(FIX, "roxy-live-ledger.jsonl");

type Case = RoxyVariablesRequest & { id: string; utc: string };

async function main() {
  if (process.env.HD_VARIABLES_LIVE !== "1") throw new Error("Ücretli çağrı: HD_VARIABLES_LIVE=1 gerekli.");
  if (existsSync(LEDGER) && readFileSync(LEDGER, "utf8").trim() && process.env.HD_VARIABLES_LIVE_FORCE !== "1") {
    throw new Error("Defter dolu — bu doğrulama zaten yapıldı. Bilinçli tekrar için HD_VARIABLES_LIVE_FORCE=1.");
  }
  const rawDir = process.argv[2];
  if (!rawDir) throw new Error("Ham yanıt klasörü (repo dışı) gerekli.");
  mkdirSync(rawDir, { recursive: true });
  const config = readRoxyServerConfig();
  if (!config) throw new Error("ROXY_API_KEY yok.");
  const cases = (JSON.parse(readFileSync(path.join(FIX, "live-cases.json"), "utf8")) as { cases: Case[] }).cases;
  const plan: Array<{ id: string; body: RoxyVariablesRequest }> = cases.map((c) => ({
    id: c.id,
    body: { date: c.date, time: c.time, timezone: c.timezone, latitude: c.latitude, longitude: c.longitude, nodeType: c.nodeType },
  }));
  plan.push({ id: "V09-invalid-tz", body: { ...plan[0].body, timezone: "Mars/Olympus" } });
  const compact: Record<string, unknown> = {};
  for (const p of plan) {
    const t0 = Date.now();
    const r = await callRoxyVariables(config, p.body, { lang: "tr" });
    const ms = Date.now() - t0;
    appendFileSync(LEDGER, JSON.stringify({ at: new Date().toISOString(), endpoint: "/human-design/variables", lang: "tr", case: p.id, ok: r.ok, status: r.ok ? 200 : r.status, kind: r.ok ? null : r.kind, ms }) + "\n");
    if (r.ok) writeFileSync(path.join(rawDir, `${p.id}.json`), JSON.stringify(r.raw, null, 1));
    compact[p.id] = r.ok ? compactOf(r.raw) : { error: r.kind, status: r.status };
    console.log(p.id, r.ok ? "200" : `${r.status} ${r.kind}`, `${ms} ms`);
  }
  writeFileSync(path.join(FIX, "roxy-live-variables.json"), JSON.stringify({ note: "GERÇEK Roxy Variables yanıtlarının sayısal/yapısal özeti (sağlayıcı metinleri repoya konmadı; yalnız dil/uzunluk). 2026-10-20, lang=tr, sentetik doğumlar.", results: compact }, null, 1));
}

const TEXT = ["name", "nameLocalized", "layer", "layerLocalized", "position", "positionLocalized", "colorLabel", "colorLabelLocalized", "directionLabel", "directionLabelLocalized", "description", "layerDescription", "colorMeaning", "toneMeaning", "directionMeaning", "baseName", "baseNameLocalized"];
const turkishish = (s: string) => /[çğıöşüÇĞİÖŞÜ]/.test(s);
function compactOf(raw: unknown) {
  const r = raw as Record<string, unknown>;
  const arrows = Array.isArray(r.arrows) ? (r.arrows as Record<string, unknown>[]) : [];
  return {
    topKeys: Object.keys(r).sort(),
    confident: r.confident,
    confidenceMarginDeg: r.confidenceMarginDeg,
    baseDescriptionLen: typeof r.baseDescription === "string" ? r.baseDescription.length : null,
    arrows: arrows.map((a) => {
      const act = (a.activation ?? {}) as Record<string, unknown>;
      const cog = a.cognition as Record<string, unknown> | undefined;
      return {
        keys: Object.keys(a).sort(),
        key: a.key, position: a.position, layer: a.layer, planet: act.planet, side: act.side, planetLocalizedPresent: typeof act.planetLocalized === "string",
        color: a.color, tone: a.tone, base: a.base, direction: a.direction, confident: a.confident,
        colorLabel: a.colorLabel, directionLabel: a.directionLabel, baseName: a.baseName,
        cognitionLabel: cog ? cog.label : null,
        text: Object.fromEntries(TEXT.map((k) => [k, typeof a[k] === "string" ? { len: (a[k] as string).length, tr: turkishish(a[k] as string) } : null])),
      };
    }),
  };
}

main().catch((e) => { console.error(String(e instanceof Error ? e.message : e)); process.exit(1); });
