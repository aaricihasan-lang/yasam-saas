/**
 * KM-3 — Gökyüzü Atlası ücretli teknikleri (Roxy). MEVCUT teknik kaydı (lib/astrology/engine/techniques) değişmeden
 * kullanılır: parseOptions → units → (her birim = 1 sağlayıcı isteği, guardedFetch ile) → project. Kayıtlı doğum profili,
 * tenant veya sonuç tablosu KULLANILMAZ; sonuç yalnız bu yanıtta döner. Yalnız-önbellek bağlam birimleri çağrılmaz.
 *
 * Görünüm: teknik katmanın ortak yapıları (gök cisimleri / grahalar, evler, açılar, lagna, temel alanlar) güvenli biçimde
 * tabloya çevrilir. Sağlayıcının yorum katmanı YALNIZ Owner yorum anahtarları açıksa eklenir. Uzman notları, Bilgi Bankası
 * ve horary soru kayıtları bu dosyaya hiç alınmaz. Atlas modülü genel anahtarı kapalıysa (ASTROLOGY_MODULE_ENABLED) çalışmaz.
 */
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { getTechnique, type CalcUnit } from "@/lib/astrology/engine/techniques";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { isAstrologyModuleEnabled, readAstroRoxyConfig } from "@/lib/astrology/config";
import { resolveAstroBirthTime } from "@/lib/astrology/birth/timeResolution";
import { guardedFetch, type GuardDenial } from "../roxyGuard";
import type { ResultBlock, VisitorField } from "../types";
import { F, deg, done, istanbulToday, notFuture, onlyKeys, parseDate, parsePlace, parseTime, trDate, trPlanet, trSign, type FieldErrors, type Place, type RunOutcome, type VisitorRunner } from "./shared";

assertServerOnly("lib/campaign/visitor/runners/atlas");

type AtlasIn = { birth: { year: number; month: number; day: number; iso: string }; time: string; place: Place; extra: Record<string, unknown> };

const ASPECT_TR: Record<string, string> = { conjunction: "Kavuşum", opposition: "Karşıt", trine: "Üçgen", square: "Kare", sextile: "Altmışlık", quincunx: "Yüzellilik", semisextile: "Otuzluk", semisquare: "Yarım kare", sesquiquadrate: "Bir buçuk kare", quintile: "Beşlik", biquintile: "Çift beşlik" };
const POINT_TR: Record<string, string> = { north_node: "Kuzey Ay Düğümü", south_node: "Güney Ay Düğümü", lilith: "Kara Ay Lilith", chiron: "Kiron", ascendant: "Yükselen", midheaven: "Tepe Noktası", rahu: "Rahu", ketu: "Ketu" };
const pt = (s: unknown) => POINT_TR[String(s)] ?? trPlanet(s);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const prim = (v: unknown) => typeof v === "string" || typeof v === "number" || typeof v === "boolean";
const fmtPrim = (v: unknown) => (typeof v === "boolean" ? (v ? "Evet" : "Hayır") : typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v));
const LABEL: Record<string, string> = { asOf: "Tarih", present: "Etkin", phase: "Evre", severity: "Şiddet", atUtc: "An (UTC)", age: "Yaş", activeHouse: "Aktif ev", lordOfYear: "Yılın yöneticisi", returnYear: "Dönüş yılı", targetDate: "Hedef tarih", houseSystem: "Ev sistemi", zodiac: "Zodyak" };

/** Teknik katman → güvenli tablolar (yalnız bilinen ortak yapılar; bilinmeyen alanlar gösterilmez). */
export function atlasBlocks(technical: unknown): ResultBlock[] {
  if (!isObj(technical)) return [];
  const out: ResultBlock[] = [];
  const top = Object.entries(technical).filter(([k, v]) => prim(v) && k !== "schema" && LABEL[k]);
  if (top.length) out.push({ type: "kv", title: "Temel bilgiler", rows: top.map(([k, v]) => [LABEL[k], k === "zodiac" ? (v === "sidereal" ? "Sidereal (Vedik)" : "Tropikal") : fmtPrim(v)]) });
  const lagna = technical.lagna;
  if (isObj(lagna)) out.push({ type: "kv", title: "Lagna (yükselen)", rows: [["Burç", trSign(lagna.rashi)], ["Derece", deg(lagna.longitude)]] });
  const bodies = (Array.isArray(technical.bodies) ? technical.bodies : Array.isArray(technical.grahas) ? technical.grahas : null) as Record<string, unknown>[] | null;
  if (bodies?.length) {
    out.push({
      type: "table",
      title: Array.isArray(technical.grahas) ? "Grahalar (gezegenler)" : "Gök cisimleri",
      head: ["Gök cismi", "Burç", "Derece", "Ev", "Hareket"],
      rows: bodies.filter(isObj).map((b) => [pt(b.id), trSign(b.sign ?? b.rashi), deg(b.longitude), b.house === undefined || b.house === null ? "—" : String(b.house), b.retrograde === true ? "Geri" : "İleri"]),
    });
  }
  const houses = Array.isArray(technical.houses) ? (technical.houses as Record<string, unknown>[]).filter(isObj) : [];
  if (houses.length) out.push({ type: "table", title: "Ev başlangıçları", head: ["Ev", "Burç", "Derece"], rows: houses.map((h) => [String(h.number), trSign(h.sign), deg(h.longitude)]) });
  const aspects = Array.isArray(technical.aspects) ? (technical.aspects as Record<string, unknown>[]).filter(isObj) : [];
  if (aspects.length) {
    out.push({
      type: "table",
      title: `Açılar (en sıkı ${Math.min(25, aspects.length)})`,
      head: ["Gök cismi", "Açı", "Gök cismi", "Orb"],
      rows: [...aspects].sort((x, y) => Number(x.orb ?? 99) - Number(y.orb ?? 99)).slice(0, 25).map((a) => [pt(a.a ?? a.transit), ASPECT_TR[String(a.type)] ?? String(a.type), pt(a.b ?? a.natal), typeof a.orb === "number" ? `${a.orb.toFixed(2)}°` : "—"]),
    });
  }
  return out;
}

/** Yorum katmanı → metin blokları (yalnız metin alanları; sayı sınırlı). Çağıran yalnız yorumlar açıksa çağırır. */
export function atlasInterpretationBlocks(interp: unknown): ResultBlock[] {
  if (!isObj(interp)) return [];
  const out: ResultBlock[] = [];
  const TEXT_KEYS = ["summary", "description", "general", "phaseEffect", "impact", "result", "rashi", "nakshatra", "detailed"];
  for (const k of ["description", "general", "phaseEffect"]) if (typeof interp[k] === "string" && interp[k]) out.push({ type: "text", title: k === "general" ? "Genel" : k === "phaseEffect" ? "Evrenin etkisi" : "Açıklama", text: interp[k] as string, kind: "yorum" });
  for (const [k, title] of [["bodies", "Gök cisimleri"], ["grahas", "Grahalar"], ["aspects", "Açılar"], ["houses", "Evler"]] as const) {
    const arr = interp[k];
    if (!Array.isArray(arr)) continue;
    const items = arr.filter(isObj).slice(0, 14).map((x) => {
      const head = x.number !== undefined ? `${x.number}. ev` : x.a ? `${pt(x.a)} – ${pt(x.b)}` : x.transit ? `${pt(x.transit)} → ${pt(x.natal)}` : pt(x.id);
      const text = TEXT_KEYS.map((t) => x[t]).find((v) => typeof v === "string" && v.trim()) as string | undefined;
      return text ? `${head}: ${text}` : null;
    }).filter((s): s is string => !!s);
    if (items.length) out.push({ type: "list", title: `Yorum — ${title}`, items, kind: "yorum" });
  }
  return out;
}

const DEF: Record<string, { title: string; extraFields: VisitorField[]; options: (extra: Record<string, unknown>, now: Date) => Record<string, unknown> }> = {
  "western.natal": { title: "Doğum Haritası (Natal)", extraFields: [], options: () => ({}) },
  "western.transit": {
    title: "Transitler",
    extraFields: [{ k: "atDate", label: "Bakılacak tarih", type: "date", hint: "Boş bırakılırsa bugün." }],
    options: (x) => (x.atDate ? { date: x.atDate, time: "12:00", timezone: "Europe/Istanbul" } : { now: true }),
  },
  "western.progression": { title: "İlerletilmiş Harita (Progresyon)", extraFields: [{ k: "targetDate", label: "Hedef tarih", type: "date", hint: "Boş bırakılırsa bugün." }], options: (x, now) => ({ targetDate: x.targetDate ?? istanbulToday(now).iso }) },
  "western.solar_arc": { title: "Solar Ark", extraFields: [{ k: "targetDate", label: "Hedef tarih", type: "date", hint: "Boş bırakılırsa bugün." }], options: (x, now) => ({ targetDate: x.targetDate ?? istanbulToday(now).iso }) },
  "western.solar_return": { title: "Solar Return (Güneş Dönüşü)", extraFields: [{ k: "returnYear", label: "Dönüş yılı", type: "number", min: 1900, max: 2100, hint: "Boş bırakılırsa bu yıl." }], options: (x, now) => ({ returnYear: x.returnYear ?? istanbulToday(now).year }) },
  "western.profections": { title: "Yıllık Profeksiyon", extraFields: [{ k: "age", label: "Yaş", type: "number", min: 0, max: 120, hint: "Boş bırakılırsa şimdiki yaşınız." }], options: (x) => ({ age: x.age }) },
  "vedic.d1": { title: "Vedik Doğum Haritası (D1)", extraFields: [], options: () => ({}) },
  "vedic.sade_sati": { title: "Sade Sati", extraFields: [], options: () => ({}) },
};

function ageAt(birth: { year: number; month: number; day: number }, now: Date): number {
  const t = istanbulToday(now);
  return t.year - birth.year - (t.month < birth.month || (t.month === birth.month && t.day < birth.day) ? 1 : 0);
}

function atlasRunner(id: keyof typeof DEF): VisitorRunner<AtlasIn> {
  const d = DEF[id];
  const extraKeys = d.extraFields.map((f) => f.k);
  return {
    key: `atlas:${id}`,
    kind: "provider",
    formLabel: d.extraFields.length ? "Doğum bilgileri ve hedef" : "Doğum tarihi, saati ve yeri",
    fields: [F.birthDate, F.birthTime, F.birthPlace, ...d.extraFields],
    parse(input, now) {
      const bad = onlyKeys(input, ["birthDate", "birthTime", "birthPlace", ...extraKeys]);
      if (bad) return { ok: false, errors: bad };
      const errors: FieldErrors = {};
      const birth = parseDate(input, "birthDate", errors, { min: 1800, max: 2100 });
      notFuture(birth, "birthDate", errors, istanbulToday(now).iso);
      const time = parseTime(input, "birthTime", errors);
      const place = parsePlace(input, "birthPlace", errors);
      const extra: Record<string, unknown> = {};
      for (const f of d.extraFields) {
        const raw = input[f.k];
        if (raw === undefined || raw === null || raw === "") continue;
        if (f.type === "date") {
          const x = parseDate(input, f.k, errors, { min: 1900, max: 2100 }, false);
          if (x) extra[f.k] = x.iso;
        } else {
          const num = Number(raw);
          if (!Number.isInteger(num) || num < (f.min ?? 0) || num > (f.max ?? 9999)) errors[f.k] = `${f.min}–${f.max} arası bir sayı girin.`;
          else extra[f.k] = num;
        }
      }
      if (id === "western.profections" && extra.age === undefined && birth) extra.age = ageAt(birth, now);
      return done(errors, { birth: birth!, time: time ?? "", place: place!, extra });
    },
    async run(ctx, v): Promise<RunOutcome> {
      const config = readAstroRoxyConfig(ctx.env as NodeJS.ProcessEnv);
      if (!config || !isAstrologyModuleEnabled(ctx.env as NodeJS.ProcessEnv)) return { ok: false, code: "saglayici", message: "Bu analiz şu anda kullanılamıyor." };
      const def = getTechnique(id);
      if (!def) return { ok: false, code: "hesap", message: "Bu analiz şu anda kullanılamıyor." };
      const t = resolveAstroBirthTime(v.birth.iso, v.time, v.place.timezone, "auto");
      if (t.kind !== "ok") {
        const msg = t.kind === "gap" ? "Bu saat yaz saati geçişi nedeniyle o gün yaşanmadı." : t.kind === "ambiguous" ? "Bu saat yaz/kış saati geçişinde iki kez yaşandı; bu analizde kullanılamıyor." : "Doğum tarihi/saati geçersiz.";
        return { ok: false, code: "girdi", message: msg, errors: { birthTime: msg } };
      }
      const opts = def.parseOptions(d.options(v.extra, ctx.now), ctx.now);
      if (!opts) return { ok: false, code: "girdi", message: "Seçenekler geçersiz." };
      const birth = { birthDate: v.birth.iso, birthTime: `${v.time}:00`, utcOffsetSeconds: t.offsetSeconds, latitude: v.place.latitude, longitude: v.place.longitude };
      let units: CalcUnit[];
      try {
        units = def.units({ birth, birthUtc: t.utcIso, partner: null }, opts);
      } catch {
        return { ok: false, code: "hesap", message: "Bu bilgilerle hesap yapılamadı." };
      }
      if (!units.length) return { ok: false, code: "hesap", message: def.noUnitsReason?.({ birth, birthUtc: t.utcIso, partner: null }, opts) ?? "Bu bilgilerle hesap yapılamadı." };
      const denials: GuardDenial[] = [];
      const fetchImpl = guardedFetch(ctx.guard, ctx.db, config.baseUrl, `astrology/${id}`.replace(/[^A-Za-z0-9_./-]/g, "_"), { fetchImpl: ctx.fetchImpl, denials });
      const parts: { technical: unknown; interpretation: unknown }[] = [];
      for (const unit of units) {
        const r = await callRoxy(config, unit.endpoint, unit.body, { lang: unit.lang, query: unit.query, fetchImpl, maxRetries: 0 });
        if (!r.ok) return { ok: false, code: denials.length ? "kota" : "saglayici", message: "Hesaplama şu anda yapılamadı. Lütfen daha sonra tekrar deneyin." };
        const p = def.project(unit, r.raw, opts);
        if (!p.ok) return { ok: false, code: "saglayici", message: "Hesaplama sonucu doğrulanamadı; sonuç gösterilmedi." };
        parts.push({ technical: p.technical, interpretation: p.interpretation });
      }
      const technical = parts.length > 1 && def.combineTechnical ? def.combineTechnical(parts.map((p) => p.technical), opts) : parts[0].technical;
      const blocks = atlasBlocks(technical);
      let commentsShown = false;
      if (ctx.commentsEnabled && parts.length === 1) {
        const ib = atlasInterpretationBlocks(parts[0].interpretation);
        if (ib.length) { blocks.push(...ib); commentsShown = true; }
      }
      return {
        ok: true,
        result: {
          title: d.title,
          subtitle: `${trDate(v.birth)} ${v.time} · ${v.place.label}`,
          blocks,
          notes: commentsShown ? ["Yorumlar hesaplama altyapısının genel metinleridir; kişiye özel uzman değerlendirmesi değildir."] : ctx.commentsEnabled ? [] : ["Yorumlar bu kampanyada kapalı. Yorumlu çalışma profesyonel üyelikte."],
          commentsShown,
        },
      };
    },
  };
}

export const ATLAS_RUNNERS: VisitorRunner<never>[] = (Object.keys(DEF) as (keyof typeof DEF)[]).map((id) => atlasRunner(id)) as unknown as VisitorRunner<never>[];
