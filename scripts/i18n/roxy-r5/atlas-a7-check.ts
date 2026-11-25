/**
 * R5 ROXY — Atlas A7 (#858, ASTRO_PROVIDER_LANG_EN altyapısı) GERÇEK EN yanıtlarla ağsız denetim (0 ücretli çağrı).
 * Bu betik #858 dalının dışa aktarılmış ağacında koşturulur (ürün dalına yazılmaz); yalnız roxy/ham/atlas altındaki kayıtlı
 * gerçek TR/EN yanıtları okur.
 *  1) Natal ev atfı süzgeci: sanitizeNatalInterpretationForLocalHouses(tr, "tr") ve (en, "en") — çıkarılan açı/desen/özet sayıları
 *     iki dilde AYNI öğeleri mi hedefliyor (açı kimliği: gezegen çifti + tür).
 *  2) Local Space yer atfı: localSpaceText(…, "en") gerçek EN metinde kaç cümleyi yeniden bağlıyor (TR ile aynı sayı mı).
 *  3) Kimlik: unit.lang = ASTRO_CHART_IDENTITY_LANG; astroProviderLangFor("en") bayrak kapalı/açık.
 */
import fs from "node:fs";
import path from "node:path";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import * as natalLocal from "@/lib/astrology/houses/natalLocal";
import * as lsc from "@/lib/astrology/localSpaceCenter";
import * as cfg from "@/lib/astrology/config";
import { ATLAS_CASES, PERSONAS } from "./atlas-plan";
import { stable, diffLeaves } from "./textcheck";

// #858 imzaları (F1'de 3. parametre yok) — tip kontrolü F1 dalında da geçsin diye gevşek imza.
type Interp = { aspects: { a: string; b: string; type: string }[]; patterns: { kind: string; bodies: string[] }[]; overall: { aspectSummary: string | null } };
const sanitizeNatalInterpretationForLocalHouses = natalLocal.sanitizeNatalInterpretationForLocalHouses as unknown as (i: unknown, lang?: string) => { content: Interp; removed: unknown };
const localSpaceText = lsc.localSpaceText as unknown as (t: string, c: unknown, lang?: string) => string;
const HAM = path.join(process.env.R5_KANIT_DIR ?? "C:/YasamSistemi-Kanit/I18N-F1-R5-2026-11-25", "roxy", "ham", "atlas");
const now = new Date("2026-11-25T12:00:00Z");
const out: Record<string, unknown> = {};
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : " " + JSON.stringify(detail).slice(0, 300)}`);
  (out[name] = { ok, detail });
};

const read = (tag: string, lang: string) => JSON.parse(fs.readFileSync(path.join(HAM, `${tag}-${lang}.json`), "utf8"));

// 3) kimlik / bayrak
const c = cfg as unknown as { ASTRO_CHART_IDENTITY_LANG?: string; astroProviderLangFor?: (l: string, e?: Record<string, string>) => string };
check("kimlik dili sabit tr", c.ASTRO_CHART_IDENTITY_LANG === "tr");
check("bayrak kapalı → en ekranda sağlayıcı dili tr", c.astroProviderLangFor?.("en", {}) === "tr");
check("bayrak açık → en ekranda sağlayıcı dili en", c.astroProviderLangFor?.("en", { ASTRO_PROVIDER_LANG_EN: "true" }) === "en");

// 1) + projeksiyon eşitliği (dal kodu ile, gerçek yanıtlar)
for (const [ci, cs] of ATLAS_CASES.entries()) {
  const def = getTechnique(cs.technique)!;
  for (const p of cs.core ? PERSONAS : PERSONAS.slice(0, 1)) {
    const polar = Math.abs(p.birth.latitude) > 66.5;
    if (polar && cs.technique.startsWith("kp.")) continue;
    const raw = polar && cs.raw.houseSystem === "placidus" ? { ...cs.raw, houseSystem: "whole-sign" } : cs.raw;
    const o = def.parseOptions(raw, now)!;
    const opt = { ...o, ...(cs.extra ?? {}) };
    let units = def.units({ birth: p.birth, birthUtc: p.birthUtc, partner: cs.partner ? { birthDate: "1988-09-10", birthTime: "08:05:00", utcOffsetSeconds: 10800, latitude: 39.9334, longitude: 32.8597 } : null, places: cs.places ? { target: { latitude: 51.5074, longitude: -0.1278 }, reference: { latitude: 51.5074, longitude: -0.1278 } } : {} }, opt);
    if (cs.maxUnits) units = units.slice(0, cs.maxUnits);
    for (const [ui, u] of units.entries()) {
      if (cs.onlyEndpoint && u.endpoint !== cs.onlyEndpoint) continue;
      const tag = `${String(ci).padStart(2, "0")}-${cs.technique}-${u.endpoint.replace(/\//g, "_")}-u${ui}-${p.id}`;
      if (!fs.existsSync(path.join(HAM, `${tag}-en.json`))) continue;
      const tr = read(tag, "tr").response, en = read(tag, "en").response;
      const a = def.project(u, tr, opt) as { ok: boolean; technical?: unknown; interpretation?: unknown };
      const b = def.project(u, en, opt) as { ok: boolean; technical?: unknown; interpretation?: unknown };
      const eq = a.ok && b.ok && stable(a.technical) === stable(b.technical);
      check(`proj ${tag}`, eq, eq ? undefined : a.ok && b.ok ? diffLeaves(a.technical, b.technical, 4) : { a: a.ok, b: b.ok });
      if (cs.technique === "western.natal" && a.ok && b.ok && a.interpretation && b.interpretation) {
        const st = sanitizeNatalInterpretationForLocalHouses(a.interpretation as never, "tr");
        const se = sanitizeNatalInterpretationForLocalHouses(b.interpretation as never, "en");
        const key = (x: Interp) =>
          [...x.aspects.map((q) => `${q.a}|${q.b}|${q.type}`).sort(), "#", ...x.patterns.map((q) => `${q.kind}:${q.bodies.join(",")}`).sort(), "#", x.overall.aspectSummary === null ? "ozet-yok" : "ozet-var"].join(";");
        const keptSame = key(st.content) === key(se.content);
        check(`ev atfı süzgeci ${p.id}: TR ve EN aynı açıları tutuyor`, keptSame, { removedTr: st.removed, removedEn: se.removed });
      }
      if (cs.technique === "western.local_space") {
        const center = { isBirthPlace: false, label: "Londra" } as never;
        const collect = (v: unknown, acc: string[] = []): string[] => {
          if (typeof v === "string") acc.push(v);
          else if (Array.isArray(v)) v.forEach((x) => collect(x, acc));
          else if (v && typeof v === "object") Object.values(v).forEach((x) => collect(x, acc));
          return acc;
        };
        const trT = collect(tr), enT = collect(en);
        const trChanged = trT.filter((s) => localSpaceText(s, center, "tr") !== s).length;
        const enChanged = enT.filter((s) => localSpaceText(s, center, "en") !== s).length;
        check(`local space yer atfı: EN kalıbı gerçek metinde TR ile aynı sayıda eşleşiyor`, trChanged === enChanged && enChanged > 0, { trChanged, enChanged, ornek: enT.map((s) => localSpaceText(s, center, "en")).find((s) => s.includes("selected centre"))?.slice(0, 120) });
      }
    }
  }
}
fs.writeFileSync(path.join(path.dirname(HAM), "..", "atlas-a7-sonuc.json"), JSON.stringify({ zaman: new Date().toISOString(), pass, fail, out }, null, 1));
console.log(`=== atlas A7 gerçek-EN ağsız denetim: ${pass} PASS / ${fail} FAIL ===`);
