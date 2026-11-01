/**
 * KM-3 — Gökyüzü Atlası ücretli teknikleri (Roxy). MEVCUT motor değişmeden kullanılır:
 *   parseSelections (seçenek doğrulama) → resolveSelectionContexts (saat kuralı, kutup engeli, dönüş / taşınma / gözlem yeri —
 *   uzman akışıyla BİREBİR; tek kişilik tekniklerde DB'ye HİÇ gidilmez, gidilmeye kalkılırsa hata) → units → (her birim = 1
 *   sağlayıcı isteği, guardedFetch) → project. Kayıtlı doğum profili / tenant / sonuç tablosu KULLANILMAZ.
 *
 * İki kişilik teknikler (sinastri, composite, Vedik eşleştirme): eş bilgisi YALNIZ bellekte (ctx.partner); motorun seçenek
 * şeması bir eş profil kimliği ister → sabit "satır içi eş" belirteci verilir. Bu kimlik hiçbir kayda karşılık gelmez,
 * DB'ye yazılmaz / okunmaz; hesap gövdesi ctx.partner doğum verisinden kurulur.
 *
 * Görünüm: teknik katmanın ortak yapıları + genel güvenli tablolar; sağlayıcı yorumu YALNIZ Owner yorum anahtarları açıksa.
 * Uzman notları, Bilgi Bankası, horary soru kayıtları bu dosyaya alınmaz. ASTROLOGY_MODULE_ENABLED kapalıysa çalışmaz.
 */
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { getTechnique, type CalcUnit, type UnitContext } from "@/lib/astrology/engine/techniques";
import { parseSelections } from "@/lib/astrology/engine/planner";
import { resolveSelectionContexts, polarHouseBlock, revisionToBirth, type EngineCtx } from "@/lib/astrology/engine/service";
import type { RevisionRow } from "@/lib/astrology/persistence/repo";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { isAstrologyModuleEnabled, readAstroRoxyConfig } from "@/lib/astrology/config";
import { resolveAstroBirthTime } from "@/lib/astrology/birth/timeResolution";
import { guardedFetch, type GuardDenial } from "../roxyGuard";
import type { ResultBlock, VisitorField } from "../types";
import { F, deg, done, istanbulToday, notFuture, onlyKeys, parseDate, parsePlace, parseTime, trDate, trPlanet, trSign, type FieldErrors, type Place, type RunOutcome, type VisitorRunner } from "./shared";

assertServerOnly("lib/campaign/visitor/runners/atlas");

/** Motorun eş seçeneği için satır içi belirteç (kayıt DEĞİL). */
export const INLINE_PARTNER_ID = "00000000-0000-4000-8000-0000000000e5";

type Person = { birth: { year: number; month: number; day: number; iso: string }; time: string; place: Place };
type AtlasIn = { me: Person; partner: Person | null; extra: Record<string, unknown> };

const ASPECT_TR: Record<string, string> = { conjunction: "Kavuşum", opposition: "Karşıt", trine: "Üçgen", square: "Kare", sextile: "Altmışlık", quincunx: "Yüzellilik", semisextile: "Otuzluk", semisquare: "Yarım kare", sesquiquadrate: "Bir buçuk kare", quintile: "Beşlik", biquintile: "Çift beşlik", parallel: "Paralel", contraparallel: "Kontraparalel" };
const POINT_TR: Record<string, string> = { north_node: "Kuzey Ay Düğümü", south_node: "Güney Ay Düğümü", lilith: "Kara Ay Lilith", chiron: "Kiron", ascendant: "Yükselen", midheaven: "Tepe Noktası", rahu: "Rahu", ketu: "Ketu", true_node: "Kuzey Ay Düğümü", mean_node: "Kuzey Ay Düğümü (ortalama)" };
const pt = (s: unknown) => POINT_TR[String(s)] ?? trPlanet(s);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const prim = (v: unknown) => typeof v === "string" || typeof v === "number" || typeof v === "boolean";
const fmtPrim = (v: unknown) => (typeof v === "boolean" ? (v ? "Evet" : "Hayır") : typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v));
const LABEL: Record<string, string> = {
  asOf: "Tarih", present: "Etkin", phase: "Evre", severity: "Şiddet", atUtc: "An (UTC)", age: "Yaş", activeHouse: "Aktif ev", lordOfYear: "Yılın yöneticisi",
  returnYear: "Dönüş yılı", targetDate: "Hedef tarih", houseSystem: "Ev sistemi", zodiac: "Zodyak", ayanamsa: "Ayanamsa", division: "Bölüm (varga)",
  totalScore: "Toplam puan", maxScore: "En yüksek puan", score: "Puan", verdict: "Sonuç", compatible: "Uyumlu", month: "Ay", startDate: "Başlangıç", days: "Gün",
  name: "Ad", planet: "Gezegen", sign: "Burç", rashi: "Burç (rashi)", house: "Ev", longitude: "Boylam", degree: "Derece", start: "Başlangıç", end: "Bitiş",
  lord: "Yönetici", nakshatra: "Nakshatra", type: "Tür", orb: "Orb", id: "Kod", value: "Değer", total: "Toplam", strength: "Güç", line: "Hat", city: "Yer",
  number: "No", date: "Tarih", body: "Gök cismi", label: "Ad", kind: "Tür", from: "Başlangıç", to: "Bitiş", dasha: "Dasha", mahadasha: "Mahadasha", antardasha: "Antardasha",
};
const SKIP_TOP = new Set(["schema", "echo", "variants", "frame", "nodeType"]);
const cell = (k: string, v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (k === "sign" || k === "rashi") return trSign(v);
  if ((k === "planet" || k === "body" || k === "id" || k === "a" || k === "b" || k === "lord") && typeof v === "string") return pt(v);
  if (k === "type" && typeof v === "string") return ASPECT_TR[v] ?? v;
  if ((k === "longitude" || k === "degree") && typeof v === "number") return deg(v);
  return prim(v) ? fmtPrim(v) : Array.isArray(v) ? v.filter(prim).slice(0, 6).map((x) => cell(k, x)).join(", ") : "…";
};

/** Teknik katman → güvenli tablolar: bilinen yapılar + genel (ilkel alanlı) diziler. Bilinmeyen iç içe yapı gösterilmez. */
export function atlasBlocks(technical: unknown): ResultBlock[] {
  if (!isObj(technical)) return [];
  const out: ResultBlock[] = [];
  const top = Object.entries(technical).filter(([k, v]) => prim(v) && !SKIP_TOP.has(k) && LABEL[k]);
  if (top.length) out.push({ type: "kv", title: "Temel bilgiler", rows: top.map(([k, v]) => [LABEL[k], k === "zodiac" ? (v === "sidereal" ? "Sidereal (Vedik)" : "Tropikal") : cell(k, v)]) });
  const lagna = technical.lagna;
  if (isObj(lagna)) out.push({ type: "kv", title: "Lagna (yükselen)", rows: [["Burç", trSign(lagna.rashi)], ["Derece", deg(lagna.longitude)]] });
  const handled = new Set(["bodies", "grahas", "houses", "aspects"]);
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
  if (houses.length) out.push({ type: "table", title: "Ev başlangıçları", head: ["Ev", "Burç", "Derece"], rows: houses.map((h) => [String(h.number ?? h.house ?? "—"), trSign(h.sign ?? h.rashi), deg(h.longitude)]) });
  const aspects = Array.isArray(technical.aspects) ? (technical.aspects as Record<string, unknown>[]).filter(isObj) : [];
  if (aspects.length) {
    out.push({
      type: "table",
      title: `Açılar (en sıkı ${Math.min(25, aspects.length)})`,
      head: ["Gök cismi", "Açı", "Gök cismi", "Orb"],
      rows: [...aspects].sort((x, y) => Number(x.orb ?? 99) - Number(y.orb ?? 99)).slice(0, 25).map((a) => [pt(a.a ?? a.transit ?? a.from ?? a.planet), cell("type", a.type ?? a.aspect), pt(a.b ?? a.natal ?? a.to ?? a.target), typeof a.orb === "number" ? `${a.orb.toFixed(2)}°` : "—"]),
    });
  }
  // Genel diziler (dasha dönemleri, hatlar, yogalar, puan tabloları…): ilkel alanlar → en çok 6 sütun, 40 satır.
  for (const [k, v] of Object.entries(technical)) {
    if (handled.has(k) || SKIP_TOP.has(k) || !Array.isArray(v) || !v.length || !isObj(v[0])) continue;
    const rows = (v as Record<string, unknown>[]).filter(isObj).slice(0, 40);
    const keys = Object.keys(rows[0]).filter((c) => rows.some((r) => prim(r[c]) || (Array.isArray(r[c]) && (r[c] as unknown[]).every(prim)))).slice(0, 6);
    if (!keys.length) continue;
    out.push({ type: "table", title: LABEL[k] ?? k.replace(/([a-z])([A-Z])/g, "$1 $2"), head: keys.map((c) => LABEL[c] ?? c), rows: rows.map((r) => keys.map((c) => cell(c, r[c]))) });
  }
  // İç içe nesnelerdeki ilkel alanlar (özet / puan / dosha durumu…)
  for (const [k, v] of Object.entries(technical)) {
    if (!isObj(v) || SKIP_TOP.has(k) || k === "lagna") continue;
    const rows = Object.entries(v).filter(([, x]) => prim(x)).slice(0, 12).map(([c, x]) => [LABEL[c] ?? c, cell(c, x)] as const);
    if (rows.length) out.push({ type: "kv", title: LABEL[k] ?? k.replace(/([a-z])([A-Z])/g, "$1 $2"), rows });
  }
  return out;
}

/** Yorum katmanı → metin blokları (yalnız metin alanları; sayı sınırlı). Çağıran YALNIZ yorumlar açıksa çağırır. */
export function atlasInterpretationBlocks(interp: unknown): ResultBlock[] {
  if (!isObj(interp)) return [];
  const out: ResultBlock[] = [];
  const TEXT_KEYS = ["summary", "description", "general", "phaseEffect", "impact", "result", "rashi", "nakshatra", "detailed", "text", "interpretation", "meaning"];
  for (const k of ["description", "general", "phaseEffect", "summary", "overall"]) {
    const v = interp[k];
    if (typeof v === "string" && v.trim()) out.push({ type: "text", title: k === "general" ? "Genel" : k === "phaseEffect" ? "Evrenin etkisi" : "Açıklama", text: v, kind: "yorum" });
  }
  for (const [k, arr] of Object.entries(interp)) {
    if (!Array.isArray(arr)) continue;
    const items = arr.filter(isObj).slice(0, 14).map((x) => {
      const head = x.number !== undefined ? `${x.number}. ev` : x.a ? `${pt(x.a)} – ${pt(x.b)}` : x.transit ? `${pt(x.transit)} → ${pt(x.natal)}` : x.id ? pt(x.id) : x.name ? String(x.name) : "";
      const text = TEXT_KEYS.map((t) => x[t]).find((v) => typeof v === "string" && v.trim()) as string | undefined;
      return text ? `${head ? `${head}: ` : ""}${text}` : null;
    }).filter((s): s is string => !!s);
    if (items.length) out.push({ type: "list", title: `Yorum — ${LABEL[k] ?? k}`, items, kind: "yorum" });
  }
  return out;
}

const PERSON2: VisitorField[] = [
  { ...F.birthDate, k: "birthDate2", label: "2. kişi — doğum tarihi" },
  { ...F.birthTime, k: "birthTime2", label: "2. kişi — doğum saati" },
  { ...F.birthPlace, k: "birthPlace2", label: "2. kişi — doğum yeri" },
];
const PLANETS = [{ value: "saturn", label: "Satürn" }, { value: "jupiter", label: "Jüpiter" }, { value: "mars", label: "Mars" }, { value: "venus", label: "Venüs" }, { value: "mercury", label: "Merkür" }];
const VARGA = [9, 10, 2, 3, 4, 7, 12, 16, 20, 24, 27, 30, 40, 45, 60].map((n) => ({ value: String(n), label: `D${n}` }));
type Def = { title: string; partner?: boolean; extraFields: VisitorField[]; options: (extra: Record<string, unknown>, now: Date, me: Person) => Record<string, unknown> };
const nowOpt = (x: Record<string, unknown>) => (x.atDate ? { date: x.atDate, time: "12:00", timezone: "Europe/Istanbul" } : { now: true });
const AT_DATE: VisitorField = { k: "atDate", label: "Bakılacak tarih", type: "date", hint: "Boş bırakılırsa bugün." };
const TARGET: VisitorField = { k: "targetDate", label: "Hedef tarih", type: "date", hint: "Boş bırakılırsa bugün." };

const DEF: Record<string, Def> = {
  "western.natal": { title: "Doğum Haritası (Natal)", extraFields: [], options: () => ({}) },
  "western.transit": { title: "Transitler (tek an)", extraFields: [AT_DATE], options: (x) => nowOpt(x) },
  "western.forecast": {
    title: "Transit Takvimi (dönem)",
    extraFields: [{ k: "startDate", label: "Başlangıç", type: "date", hint: "Boş bırakılırsa bugün." }, { k: "days", label: "Gün sayısı", type: "select", options: [{ value: "30", label: "30 gün" }, { value: "60", label: "60 gün" }, { value: "90", label: "90 gün" }] }],
    options: (x, now) => ({ startDate: x.startDate ?? istanbulToday(now).iso, days: Math.min(90, Number(x.days ?? 30)) }),
  },
  "western.progression": { title: "İlerletilmiş Harita (Progresyon)", extraFields: [TARGET], options: (x, now) => ({ targetDate: x.targetDate ?? istanbulToday(now).iso }) },
  "western.solar_arc": { title: "Solar Ark", extraFields: [TARGET], options: (x, now) => ({ targetDate: x.targetDate ?? istanbulToday(now).iso }) },
  "western.solar_return": { title: "Solar Return (Güneş Dönüşü)", extraFields: [{ k: "returnYear", label: "Dönüş yılı", type: "number", min: 1900, max: 2100, hint: "Boş bırakılırsa bu yıl." }, { ...F.birthPlace, k: "returnPlace", label: "O yıl bulunacağınız yer", required: false, hint: "Boşsa doğum yeri." }], options: (x, now) => ({ returnYear: x.returnYear ?? istanbulToday(now).year, ...(x.returnPlace ? { returnLocationId: x.returnPlace } : {}) }) },
  "western.lunar_return": { title: "Lunar Return (Ay Dönüşü)", extraFields: [{ k: "month", label: "Ay", type: "month", hint: "Boş bırakılırsa bu ay." }], options: (x, now) => ({ month: x.month ?? istanbulToday(now).iso.slice(0, 7) }) },
  "western.planetary_return": { title: "Gezegen Dönüşü", extraFields: [{ k: "planet", label: "Gezegen", type: "select", required: true, options: PLANETS }, { k: "approxDate", label: "Yaklaşık tarih", type: "date", required: true }], options: (x) => ({ planet: x.planet, approxDate: x.approxDate }) },
  "western.profections": { title: "Yıllık Profeksiyon", extraFields: [{ k: "age", label: "Yaş", type: "number", min: 0, max: 120, hint: "Boş bırakılırsa şimdiki yaşınız." }], options: (x) => ({ age: x.age }) },
  "western.synastry": { title: "Sinastri (iki kişi)", partner: true, extraFields: PERSON2, options: () => ({ partnerProfileId: INLINE_PARTNER_ID }) },
  "western.composite": { title: "Composite (iki kişi)", partner: true, extraFields: PERSON2, options: () => ({ partnerProfileId: INLINE_PARTNER_ID }) },
  "western.astrocartography": { title: "Astrokartografi", extraFields: [], options: () => ({}) },
  "western.relocation": { title: "Taşınma Haritası (Relocation)", extraFields: [{ ...F.birthPlace, k: "targetPlace", label: "Yeni yer" }], options: (x) => ({ targetLocationId: x.targetPlace }) },
  "western.local_space": { title: "Local Space", extraFields: [{ ...F.birthPlace, k: "referencePlace", label: "Referans yer", required: false, hint: "Boşsa doğum yeri." }], options: (x) => ({ referenceLocationId: x.referencePlace ?? null }) },
  "western.fixed_stars": { title: "Sabit Yıldızlar", extraFields: [], options: () => ({}) },
  "western.extra_points": { title: "Ek Noktalar (asteroitler, Lilith, Arap noktaları)", extraFields: [], options: () => ({ sections: ["asteroids", "lots", "lilith"] }) },
  "vedic.d1": { title: "Vedik Doğum Haritası (D1)", extraFields: [], options: () => ({}) },
  "vedic.varga": { title: "Vedik Bölümsel Harita (Varga)", extraFields: [{ k: "division", label: "Bölüm", type: "select", options: VARGA }], options: (x) => ({ division: Number(x.division ?? 9) }) },
  "vedic.dasha": { title: "Vimshottari Dasha", extraFields: [], options: () => ({}) },
  "vedic.drishti": { title: "Vedik Bakışlar (Drishti)", extraFields: [], options: () => ({}) },
  "vedic.ashtakavarga": { title: "Ashtakavarga", extraFields: [], options: () => ({}) },
  "vedic.shadbala": { title: "Shadbala", extraFields: [], options: () => ({}) },
  "vedic.panchanga": { title: "Panchanga (doğum günü)", extraFields: [], options: () => ({}) },
  "vedic.transit": { title: "Vedik Transit (Gochara)", extraFields: [AT_DATE], options: (x) => nowOpt(x) },
  "vedic.bhav_chalit": { title: "Bhav Chalit", extraFields: [], options: () => ({}) },
  "vedic.chara_karaka": { title: "Chara Karakalar", extraFields: [], options: () => ({}) },
  "vedic.arudha": { title: "Arudha Padalar", extraFields: [], options: () => ({}) },
  "vedic.bhava_bala": { title: "Bhava Bala", extraFields: [], options: () => ({}) },
  "vedic.upagraha": { title: "Upagrahalar", extraFields: [], options: () => ({}) },
  "vedic.sade_sati": { title: "Sade Sati", extraFields: [], options: () => ({}) },
  "vedic.gun_milan": { title: "Guna Milan (iki kişi)", partner: true, extraFields: PERSON2, options: () => ({ partnerProfileId: INLINE_PARTNER_ID }) },
  "vedic.dashakoot": { title: "Dashakoot (iki kişi)", partner: true, extraFields: PERSON2, options: () => ({ partnerProfileId: INLINE_PARTNER_ID }) },
  "vedic.papasamyam": { title: "Papasamyam (iki kişi)", partner: true, extraFields: PERSON2, options: () => ({ partnerProfileId: INLINE_PARTNER_ID }) },
  "kp.chart": { title: "KP Haritası", extraFields: [], options: () => ({}) },
  "kp.dasha": { title: "KP Dasha", extraFields: [], options: () => ({}) },
  "kp.ruling": { title: "KP Ruling Gezegenler", extraFields: [AT_DATE], options: (x) => nowOpt(x) },
};
export const ATLAS_VISITOR_TECHNIQUES = Object.keys(DEF);

function ageAt(birth: { year: number; month: number; day: number }, now: Date): number {
  const t = istanbulToday(now);
  return t.year - birth.year - (t.month < birth.month || (t.month === birth.month && t.day < birth.day) ? 1 : 0);
}

function parsePerson(input: Record<string, unknown>, sfx: string, errors: FieldErrors, now: Date): Person | null {
  const birth = parseDate(input, `birthDate${sfx}`, errors, { min: 1800, max: 2100 });
  notFuture(birth, `birthDate${sfx}`, errors, istanbulToday(now).iso);
  const time = parseTime(input, `birthTime${sfx}`, errors);
  const place = parsePlace(input, `birthPlace${sfx}`, errors);
  return birth && time && place ? { birth, time, place } : null;
}

/** Bellek içi revizyon satırı (kayıt DEĞİL) — servis seçim çözücüsünün beklediği biçim. */
function inlineRevision(p: Person, utcIso: string, offsetSeconds: number): RevisionRow {
  return {
    id: "kampanya-satir-ici", profile_id: "kampanya-satir-ici", revision: 1, birth_date: p.birth.iso, birth_time: `${p.time}:00`, time_known: true,
    time_accuracy: "exact", location_id: p.place.id, location_label: p.place.label, latitude: p.place.latitude, longitude: p.place.longitude,
    timezone: p.place.timezone, dst_choice: "auto", utc_offset_seconds: offsetSeconds, birth_utc: utcIso, change_note: null, created_at: utcIso,
  };
}

/** DB'ye dokunmaya kalkarsa hata (tek kişilik tekniklerde çözücü DB kullanmaz; kullanırsa fail-closed). */
const NO_DB = new Proxy({}, { get: () => { throw new Error("kampanya: atlas çözücüsü DB'ye erişmeye çalıştı"); } });

function atlasRunner(id: string): VisitorRunner<AtlasIn> {
  const d = DEF[id];
  const extraKeys = d.extraFields.map((f) => f.k);
  return {
    key: `atlas:${id}`,
    kind: "provider",
    formLabel: d.partner ? "İki kişinin doğum tarihi, saati ve yeri" : d.extraFields.length ? "Doğum bilgileri ve seçenek" : "Doğum tarihi, saati ve yeri",
    fields: [F.birthDate, F.birthTime, F.birthPlace, ...d.extraFields],
    parse(input, now) {
      const bad = onlyKeys(input, ["birthDate", "birthTime", "birthPlace", ...extraKeys]);
      if (bad) return { ok: false, errors: bad };
      const errors: FieldErrors = {};
      const me = parsePerson(input, "", errors, now);
      const partner = d.partner ? parsePerson(input, "2", errors, now) : null;
      const extra: Record<string, unknown> = {};
      for (const f of d.extraFields) {
        if (f.k.endsWith("2")) continue;
        const raw = input[f.k];
        if (raw === undefined || raw === null || raw === "") {
          if (f.required) errors[f.k] = "Bu alan zorunlu.";
          continue;
        }
        if (f.type === "date") {
          const x = parseDate(input, f.k, errors, { min: 1600, max: 2600 }, false);
          if (x) extra[f.k] = x.iso;
        } else if (f.type === "month") {
          if (typeof raw !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) errors[f.k] = "Ayı seçin.";
          else extra[f.k] = raw;
        } else if (f.type === "location") {
          const pl = parsePlace(input, f.k, errors);
          if (pl) extra[f.k] = pl.id;
        } else if (f.type === "select") {
          if (!(f.options ?? []).some((o) => o.value === raw)) errors[f.k] = "Listeden seçin.";
          else extra[f.k] = raw;
        } else {
          const num = Number(raw);
          if (!Number.isInteger(num) || num < (f.min ?? 0) || num > (f.max ?? 9999)) errors[f.k] = `${f.min}–${f.max} arası bir sayı girin.`;
          else extra[f.k] = num;
        }
      }
      if (id === "western.profections" && extra.age === undefined && me) extra.age = ageAt(me.birth, now);
      return done(errors, { me: me!, partner, extra });
    },
    async run(ctx, v): Promise<RunOutcome> {
      const config = readAstroRoxyConfig(ctx.env as NodeJS.ProcessEnv);
      if (!config || !isAstrologyModuleEnabled(ctx.env as NodeJS.ProcessEnv)) return { ok: false, code: "saglayici", message: "Bu analiz şu anda kullanılamıyor." };
      const def = getTechnique(id);
      if (!def) return { ok: false, code: "hesap", message: "Bu analiz şu anda kullanılamıyor." };
      const t1 = resolveAstroBirthTime(v.me.birth.iso, v.me.time, v.me.place.timezone, "auto");
      const t2 = v.partner ? resolveAstroBirthTime(v.partner.birth.iso, v.partner.time, v.partner.place.timezone, "auto") : null;
      for (const [t, f] of [[t1, "birthTime"], [t2, "birthTime2"]] as const) {
        if (t && t.kind !== "ok") {
          const msg = t.kind === "gap" ? "Bu saat yaz saati geçişi nedeniyle o gün yaşanmadı." : t.kind === "ambiguous" ? "Bu saat yaz/kış saati geçişinde iki kez yaşandı; bu analizde kullanılamıyor." : "Doğum tarihi/saati geçersiz.";
          return { ok: false, code: "girdi", message: msg, errors: { [f]: msg } };
        }
      }
      if (t1.kind !== "ok") return { ok: false, code: "girdi", message: "Doğum tarihi/saati geçersiz." };
      const sel = parseSelections([{ technique: id, options: d.options(v.extra, ctx.now, v.me) }], ctx.now);
      if (!sel.ok) return { ok: false, code: "girdi", message: "Seçenekler geçersiz." };
      const s0 = sel.selections[0];
      let unitCtx: UnitContext;
      let options = s0.options;
      const rev1 = inlineRevision(v.me, t1.utcIso, t1.offsetSeconds);
      if (d.partner) {
        if (!v.partner || !t2 || t2.kind !== "ok") return { ok: false, code: "girdi", message: "İkinci kişinin bilgileri gerekli." };
        // Servisin iki kişilik dalıyla aynı kural (eş DB'den değil bellekten): her iki doğum yerinde kutup ev engeli.
        const hs = (options as { houseSystem?: unknown }).houseSystem;
        const polar = polarHouseBlock(hs, v.me.place.latitude, def.label, "1. kişinin doğum yerinde") ?? polarHouseBlock(hs, v.partner.place.latitude, def.label, "2. kişinin doğum yerinde");
        if (polar) return { ok: false, code: "girdi", message: polar.error };
        options = { ...options, partnerRevision: 1 };
        unitCtx = { birth: revisionToBirth(rev1), birthUtc: rev1.birth_utc, partner: revisionToBirth(inlineRevision(v.partner, t2.utcIso, t2.offsetSeconds)) };
      } else {
        let resolved: Awaited<ReturnType<typeof resolveSelectionContexts>>;
        try {
          resolved = await resolveSelectionContexts({ db: NO_DB, tenantId: "kampanya", userId: "kampanya", entitlements: {} } as unknown as EngineCtx, rev1, sel.selections);
        } catch {
          return { ok: false, code: "hesap", message: "Bu analiz şu anda kullanılamıyor." };
        }
        if (!resolved.ok) return { ok: false, code: "girdi", message: "Bu bilgilerle hesap yapılamadı." };
        const r0 = resolved.v[0];
        if (r0.blocked || !r0.ctx) return { ok: false, code: "girdi", message: r0.blocked?.error ?? "Bu bilgilerle hesap yapılamadı." };
        unitCtx = r0.ctx;
        options = r0.options;
      }
      let units: CalcUnit[];
      try {
        units = def.units(unitCtx, options);
      } catch {
        return { ok: false, code: "hesap", message: "Bu bilgilerle hesap yapılamadı." };
      }
      if (!units.length) return { ok: false, code: "hesap", message: def.noUnitsReason?.(unitCtx, options) ?? "Bu bilgilerle hesap yapılamadı." };
      const denials: GuardDenial[] = [];
      const fetchImpl = guardedFetch(ctx.guard, ctx.db, config.baseUrl, `astrology/${id}`.replace(/[^A-Za-z0-9_./-]/g, "_"), { fetchImpl: ctx.fetchImpl, denials });
      const parts: { technical: unknown; interpretation: unknown }[] = [];
      for (const unit of units) {
        const r = await callRoxy(config, unit.endpoint, unit.body, { lang: unit.lang, query: unit.query, fetchImpl, maxRetries: 0 });
        if (!r.ok) return { ok: false, code: denials.length ? "kota" : "saglayici", message: "Hesaplama şu anda yapılamadı. Lütfen daha sonra tekrar deneyin." };
        const p = def.project(unit, r.raw, options);
        if (!p.ok) return { ok: false, code: "saglayici", message: "Hesaplama sonucu doğrulanamadı; sonuç gösterilmedi." };
        parts.push({ technical: p.technical, interpretation: p.interpretation });
      }
      const primary = def.primaryPart ?? 0;
      const technical = parts.length > 1 && def.combineTechnical ? def.combineTechnical(parts.map((p) => p.technical), options) : parts[Math.min(primary, parts.length - 1)].technical;
      const blocks = atlasBlocks(technical);
      let commentsShown = false;
      if (ctx.commentsEnabled) {
        const interp = parts.length > 1 && def.combineInterpretation && parts.every((p) => isObj(p.interpretation)) ? def.combineInterpretation(parts.map((p) => p.interpretation as Record<string, unknown>)) : parts[Math.min(primary, parts.length - 1)].interpretation;
        const ib = atlasInterpretationBlocks(interp);
        if (ib.length) { blocks.push(...ib); commentsShown = true; }
      }
      const who = `${trDate(v.me.birth)} ${v.me.time} · ${v.me.place.label}`;
      return {
        ok: true,
        result: {
          title: d.title,
          subtitle: v.partner ? `${who} & ${trDate(v.partner.birth)} ${v.partner.time} · ${v.partner.place.label}` : who,
          blocks,
          notes: [
            ...(commentsShown ? ["Yorumlar hesaplama altyapısının genel metinleridir; kişiye özel uzman değerlendirmesi değildir."] : ctx.commentsEnabled ? [] : ["Yorumlar bu kampanyada kapalı. Yorumlu çalışma profesyonel üyelikte."]),
            ...(d.partner ? ["İkinci kişinin bilgileri yalnız bu hesap için kullanıldı; kaydedilmedi."] : []),
          ],
          commentsShown,
        },
      };
    },
  };
}

export const ATLAS_RUNNERS: VisitorRunner<never>[] = ATLAS_VISITOR_TECHNIQUES.map((id) => atlasRunner(id)) as unknown as VisitorRunner<never>[];
