/**
 * R5 ROXY — ATLAS dil doğrulaması (ÜCRETLİ, sayaçlı). Ürünün KENDİ teknik tanımları (parseOptions → units → project) ve
 * gövde üreticileri kullanılır; yalnız birimin `lang` alanı TR/EN olarak değiştirilir. DB yok, ürün ölçer (trialMeteredFetch) yok.
 *
 * Her birim için: TR ve EN ham yanıt (roxy/ham/atlas/…), ürün projeksiyonu (technical) kanonik eşitliği, sağlayıcı yorumunun
 * (interpretation) dili, ham yanıt sayısal/kod alanı eşitliği.
 * Ham yanıt dosyası zaten varsa ÇAĞRI YAPILMAZ (yeniden koşu ücretsiz).
 *
 *   npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/i18n/roxy-r5/atlas-probe.ts --confirm-paid --max 130 [--only natal,kp.]
 */
import fs from "node:fs";
import path from "node:path";
import { getTechnique, type CalcUnit } from "@/lib/astrology/engine/techniques";
const POLAR_HOUSE_LATITUDE = 66.5; // = lib/astrology/engine/service.ts POLAR_HOUSE_LATITUDE (ağır içe aktarım yerine sabit)
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { ATLAS_CASES, PARTNER, PERSONAS, PLACE_LONDON } from "./atlas-plan";
import { BudgetError, KANIT, argMax, meteredFetch, runCallCount, saveRaw, setCtx, setRunMax } from "./meter";
import { compareRaw, diffLeaves, stable, textLang } from "./textcheck";

const args = process.argv.slice(2);
const CONFIRM = args.includes("--confirm-paid");
const ONLY = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
setRunMax(argMax(130));
const now = new Date("2026-11-25T12:00:00Z");

type Row = Record<string, unknown>;
const rows: Row[] = [];

async function getRaw(file: string, unit: CalcUnit, lang: "tr" | "en", amac: string, kisi: string): Promise<{ ok: true; raw: unknown; cached: boolean } | { ok: false; error: string }> {
  const full = path.join(KANIT, "roxy", "ham", file);
  if (fs.existsSync(full)) return { ok: true, raw: JSON.parse(fs.readFileSync(full, "utf8")).response, cached: true };
  if (!CONFIRM) return { ok: false, error: "ücretli çağrı onayı yok (--confirm-paid)" };
  const cfg = readAstroRoxyConfig();
  if (!cfg) return { ok: false, error: "ENGELLENDİ: ROXY_API_KEY yok" };
  setCtx({ modul: "atlas", amac, kisi });
  const r = await callRoxy(cfg, unit.endpoint, unit.body, { lang, maxRetries: 0, fetchImpl: meteredFetch, ...(unit.query ? { query: unit.query } : {}) });
  if (!r.ok) return { ok: false, error: `${r.kind} ${r.status ?? "-"}` };
  saveRaw(file, { endpoint: unit.endpoint, lang, query: unit.query ?? null, body: unit.body, response: r.raw });
  return { ok: true, raw: r.raw, cached: false };
}

async function main() {
  for (const [ci, c] of ATLAS_CASES.entries()) {
    if (ONLY && !ONLY.some((o) => c.technique.includes(o))) continue;
    const def = getTechnique(c.technique)!;
    for (const p of c.core ? PERSONAS : PERSONAS.slice(0, 1)) {
      const polar = Math.abs(p.birth.latitude) > POLAR_HOUSE_LATITUDE;
      if (polar && c.technique.startsWith("kp.")) {
        rows.push({ technique: c.technique, persona: p.id, skipped: "ürün kutup engeli (KP Placidus) — sağlayıcıya istek gitmez; çağrı yapılmadı" });
        continue;
      }
      const raw = polar && c.raw.houseSystem === "placidus" ? { ...c.raw, houseSystem: "whole-sign" } : c.raw;
      const o = def.parseOptions(raw, now);
      if (!o) {
        rows.push({ technique: c.technique, persona: p.id, error: "parseOptions null" });
        continue;
      }
      const opt = { ...o, ...(c.extra ?? {}) };
      let units = def.units({ birth: p.birth, birthUtc: p.birthUtc, partner: c.partner ? PARTNER : null, places: c.places ? { target: PLACE_LONDON, reference: PLACE_LONDON } : {} }, opt);
      if (c.maxUnits) units = units.slice(0, c.maxUnits);
      for (const [ui, u] of units.entries()) {
        if (c.onlyEndpoint && u.endpoint !== c.onlyEndpoint) continue;
        const tag = `${String(ci).padStart(2, "0")}-${c.technique}-${u.endpoint.replace(/\//g, "_")}-u${ui}-${p.id}`;
        const amac = `TR/EN eşitlik ${c.technique} ${u.endpoint}`;
        const tr = await getRaw(`atlas/${tag}-tr.json`, { ...u, lang: "tr" }, "tr", amac, p.id);
        const en = await getRaw(`atlas/${tag}-en.json`, { ...u, lang: "en" }, "en", amac, p.id);
        const row: Row = { technique: c.technique, persona: p.id, endpoint: u.endpoint, unit: ui, tag, cached: tr.ok && en.ok ? (tr as { cached: boolean }).cached && (en as { cached: boolean }).cached : null };
        if (!tr.ok || !en.ok) {
          row.error = `tr=${tr.ok ? "ok" : (tr as { error: string }).error} en=${en.ok ? "ok" : (en as { error: string }).error}`;
          rows.push(row);
          console.log(tag, row.error);
          continue;
        }
        const trRaw = (tr as { raw: unknown }).raw, enRaw = (en as { raw: unknown }).raw;
        const pt = def.project({ ...u, lang: "tr" }, trRaw, opt);
        const pe = def.project({ ...u, lang: "en" }, enRaw, opt);
        row.projTr = pt.ok ? "ok" : `HATA: ${(pt as { errors: string[] }).errors.slice(0, 3).join(" ; ")}`;
        row.projEn = pe.ok ? "ok" : `HATA: ${(pe as { errors: string[] }).errors.slice(0, 3).join(" ; ")}`;
        if (pt.ok && pe.ok) {
          const a = pt as unknown as { technical: unknown; interpretation: unknown; unmappedFields: string[]; droppedValues: string[] };
          const b = pe as unknown as { technical: unknown; interpretation: unknown; unmappedFields: string[]; droppedValues: string[] };
          row.technicalEqual = stable(a.technical) === stable(b.technical);
          if (!row.technicalEqual) row.technicalDiffs = diffLeaves(a.technical, b.technical);
          row.unmappedTr = a.unmappedFields.length + a.droppedValues.length;
          row.unmappedEn = b.unmappedFields.length + b.droppedValues.length;
          row.interpTr = textLang(a.interpretation);
          row.interpEn = textLang(b.interpretation);
          row.technicalTextTr = textLang(a.technical);
          row.technicalTextEn = textLang(b.technical);
        }
        row.raw = compareRaw(trRaw, enRaw);
        rows.push(row);
        console.log(tag, `proj tr=${row.projTr} en=${row.projEn} techEq=${row.technicalEqual} num=${(row.raw as { numSame: number; numDiff: number }).numSame}/${(row.raw as { numDiff: number }).numDiff}`);
      }
    }
  }
  const out = path.join(KANIT, "roxy", "atlas-sonuc.json");
  fs.writeFileSync(out, JSON.stringify({ zaman: new Date().toISOString(), buKosudakiCagri: runCallCount(), rows }, null, 1));
  console.log(`\nbu koşudaki ücretli çağrı: ${runCallCount()} · satır ${rows.length} · ${out}`);
}

main().catch((e) => {
  console.error(e instanceof BudgetError ? `BÜTÇE DURDURDU: ${e.message}` : e);
  const out = path.join(KANIT, "roxy", "atlas-sonuc.partial.json");
  fs.writeFileSync(out, JSON.stringify({ zaman: new Date().toISOString(), buKosudakiCagri: runCallCount(), rows, durdu: String(e) }, null, 1));
  process.exit(1);
});
