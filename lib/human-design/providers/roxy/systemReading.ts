// RoxyAPI "SİSTEM YORUMU" — kayıtlı provider_raw'dan WHITELIST çıkarıcı (SAF, YALNIZ SUNUCU).
//
//   • Kaynak: ilk hesapta saklanan provider_raw (yeni Roxy çağrısı YOK; fallback çağrısı YOK).
//   • Yalnız aşağıda adı geçen yorum/etiket alanları kopyalanır; bilinmeyen/ek sağlayıcı alanları
//     DTO'ya GİRMEZ. Ham yanıt (provider_raw) hiçbir zaman istemciye dönmez.
//   • Metinler düz metindir: tip/uzunluk kontrollü, kontrol karakterleri temizlenir. HTML
//     YORUMLANMAZ (istemci yalnız metin düğümü olarak basar; dangerouslySetInnerHTML yok).
//   • Etiketlerde Türkçe *Localized değeri tercih edilir; yoksa sağlayıcının ham değeri.
//   • Sağlayıcının VERMEDİĞİ hiçbir açıklama üretilmez (ör. İmza/Kendilik dışı tema için uzun metin yok).
//   • Uzmanın Bilgi Bankası ile İLGİSİZDİR: hiçbir tabloya yazmaz, hiçbir içerikle birleşmez.
//   • BodyGraph 1. API tamamlama (2026-10-17): şemadaki kullanıcıya anlamlı TÜM alanlar taşınır —
//     profil çizgi numaraları, haç kapıları/açı kodu, taraf (Personality/Design) açıklamaları, merkez
//     motor/farkındalık/aktif kapıları, kanal kapı/merkezleri, aktivasyon I Ching heksagramı. Yeni alanlar
//     OPSİYONELDİR: eski rapor snapshot'larında yoktur ve eski çıktı aynen kalır.
//   • lang=tr'de çevirisi olmayan metni sağlayıcı İngilizce döndürür → `languageNote` ile açıkça belirtilir
//     (otomatik çeviri / anlam uydurma YOK).

import { HUMAN_DESIGN_CHANNELS } from "@/lib/human-design/constants";
import {
  hdAuthorityDisplayLabel,
  hdCenterLabelFromCode,
  hdDefinitionLabelFromCode,
  hdTypeLabelFromCode,
} from "@/lib/human-design/codeHelpers";
import {
  toAppAuthorityCode,
  toAppCenterCode,
  toAppDefinitionCode,
  toAppTypeCode,
} from "@/lib/human-design/normalize/hdAppCodes";
import { HD_CROSS_SECTION_TITLE, HD_TERM, hdCrossAngleLabel, hdTypeKeynotes, normalizeProviderTrText } from "@/lib/human-design/normalize/hdDisplayLabels";

export const SYSTEM_READING_LIMITS = Object.freeze({
  label: 120,
  text: 4000,
  centers: 12,
  channels: 40,
  activations: 40,
});

export type SystemReadingDetail = { label: string; text: string };

export type SystemReadingGeneralKey =
  | "type"
  | "strategy"
  | "authority"
  | "profile"
  | "definition"
  | "cross"
  | "signature"
  | "notSelf";

export type SystemReadingGeneralItem = {
  key: SystemReadingGeneralKey;
  title: string;
  value: string | null;
  details: SystemReadingDetail[];
};

export type SystemReadingCenter = {
  id: string;
  name: string;
  defined: boolean | null;
  theme: string | null;
  notSelfQuestion: string | null;
  biology: string | null;
  /** Motor (enerji kaynağı) merkez mi — sağlayıcı alanı (eski snapshot'ta yok). */
  motor?: boolean | null;
  /** Farkındalık merkezi mi — sağlayıcı alanı (eski snapshot'ta yok). */
  awareness?: boolean | null;
  /** Bu merkezdeki aktif kapılar (sağlayıcı; eski snapshot'ta yok). */
  gates?: number[];
};

export type SystemReadingChannel = {
  id: string | null;
  name: string | null;
  circuit: string | null;
  description: string | null;
  circuitDescription: string | null;
  /** Kanalın bağladığı iki merkez (uygulama adları; eski snapshot'ta yok). */
  centers?: string[];
};

export type SystemReadingActivation = {
  side: "design" | "personality";
  planet: string | null;
  gate: number;
  line: number;
  gateName: string | null;
  gateDescription: string | null;
  lineMeaning: string | null;
  planetDescription: string | null;
  /** Aynı numaralı I Ching heksagramı (sağlayıcı; numara kapıyla eşleşmezse null; eski snapshot'ta yok). */
  iching?: { number: number; name: string } | null;
};

export type SystemReadingSides = {
  personality: string | null;
  design: string | null;
  /** Design anı (Güneş'in doğumdan 88° önceki konumu) — "21.04.2018 03:12 UTC" biçiminde; yoksa null. */
  designUtc?: string | null;
};

/** ISO UTC anı → "GG.AA.YYYY SS:DD UTC" (saat dilimi dönüşümü YOK; kayıtlı an aynen). */
function designUtcLabel(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  return m && Number.isFinite(Date.parse(v)) ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]} UTC` : null;
}

export type SystemReadingDto = {
  general: SystemReadingGeneralItem[];
  centers: SystemReadingCenter[];
  channels: SystemReadingChannel[];
  activations: SystemReadingActivation[];
  /** Personality (bilinçli) / Design (bilinçdışı) taraf açıklamaları (eski snapshot'ta yok). */
  sides?: SystemReadingSides | null;
  /** Sağlayıcı bazı metinleri Türkçe vermediyse açık not (eski snapshot'ta yok). */
  languageNote?: string | null;
};

/** I Ching heksagram adı yalnız sağlayıcının İngilizce adıdır (güvenilir Türkçe sözlük yok → çeviri uydurulmaz). */
export const SYSTEM_READING_ICHING_NOTE = "İngilizce kaynak adı";
export const SYSTEM_READING_LANGUAGE_NOTE =
  "Bazı açıklamalar hesaplama servisi tarafından Türkçe sağlanmadığı için kaynak dilinde (İngilizce) gösterilmektedir; otomatik çeviri yapılmamıştır.";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

// Kontrol karakterleri (\t \n hariç) temizlenir; satır sonları korunur.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\r\n?/g, "\n").replace(CONTROL_CHARS, "").replace(/[ \t]+\n/g, "\n").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

const label = (v: unknown) => cleanText(v, SYSTEM_READING_LIMITS.label);
const text = (v: unknown) => cleanText(v, SYSTEM_READING_LIMITS.text);

/** Türkçe *Localized tercih; yoksa ham sağlayıcı değeri. */
function localized(o: Obj, key: string): string | null {
  return label(o[`${key}Localized`]) ?? label(o[key]);
}

function int(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

function details(pairs: Array<[string, string | null]>): SystemReadingDetail[] {
  return pairs.filter((p): p is [string, string] => p[1] !== null).map(([l, t]) => ({ label: l, text: t }));
}

function general(r: Obj): SystemReadingGeneralItem[] {
  const pk = isObj(r.profileKeynotes) ? r.profileKeynotes : {};
  const xc = isObj(r.incarnationCross) ? r.incarnationCross : {};
  const profile = typeof r.profile === "string" && /^[1-6]\/[1-6]$/.test(r.profile.trim()) ? r.profile.trim() : null;
  const pLine = int(pk.personalityLine, 1, 6);
  const dLine = int(pk.designLine, 1, 6);
  // Açı: uygulamanın onaylı Türkçe etiketi (ör. "Sağ Açı (Right Angle)"); bilinmeyen → sağlayıcının yerel değeri.
  const angleApp = typeof xc.angle === "string" ? hdCrossAngleLabel(xc.angle.trim()) : null;
  const angle = angleApp && angleApp !== xc.angle ? angleApp : localized(xc, "angle");
  const angleCode = typeof xc.angleCode === "string" && /^[A-Z]{2,5}$/.test(xc.angleCode.trim()) ? xc.angleCode.trim() : null;
  const crossName = label(xc.name);
  const xg = Array.isArray(xc.gates) && xc.gates.length === 4 ? xc.gates.map((g) => int(g, 1, 64)) : null;
  const crossGates =
    xg && xg.every((g) => g !== null)
      ? `Personality Güneş ${xg[0]} · Personality Dünya ${xg[1]} · Design Güneş ${xg[2]} · Design Dünya ${xg[3]}`
      : null;
  const items: SystemReadingGeneralItem[] = [
    { key: "type", title: "Tip", value: localized(r, "type"), details: details([["Açıklama", text(r.typeDescription)], ["Aura", text(r.aura)]]) },
    { key: "strategy", title: "Strateji", value: localized(r, "strategy"), details: details([["Açıklama", text(r.strategyDescription)]]) },
    { key: "authority", title: "İç Otorite", value: localized(r, "authority"), details: details([["Açıklama", text(r.authorityDescription)]]) },
    {
      key: "profile",
      title: "Profil",
      value: profile,
      details: details([
        ["Açıklama", text(r.profileDescription)],
        [pLine ? `Personality (bilinçli) — ${pLine}. çizgi` : "Personality (bilinçli)", text(pk.personality)],
        [dLine ? `Design (bilinçdışı) — ${dLine}. çizgi` : "Design (bilinçdışı)", text(pk.design)],
      ]),
    },
    { key: "definition", title: "Tanım", value: localized(r, "definition"), details: details([["Açıklama", text(r.definitionDescription)]]) },
    {
      key: "cross",
      title: "Enkarnasyon Haçı",
      value: crossName ?? angle,
      details: details([
        ["Açı", crossName && angle ? `${angle}${angleCode ? ` (${angleCode})` : ""}` : null],
        ["Kapılar", crossGates],
        ["Açıklama", text(xc.description)],
      ]),
    },
    // İmza / Kendilik dışı tema: sağlayıcı uzun açıklama VERMİYOR → yalnız etiket (uydurma yok).
    { key: "signature", title: "İmza", value: localized(r, "signature"), details: [] },
    { key: "notSelf", title: HD_TERM.notSelf, value: localized(r, "notSelf"), details: [] },
  ];
  return items.filter((i) => i.value !== null || i.details.length > 0);
}

/** 1–64 aralığındaki benzersiz kapılar (artan); geçersiz değerler atlanır. */
function gateList(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<number>();
  for (const g of v.slice(0, 64)) {
    const n = int(g, 1, 64);
    if (n !== null) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

/** Sağlayıcı merkez kimliği → uygulama merkez adı (bilinmeyen → null). */
function centerName(v: unknown): string | null {
  if (typeof v !== "string" || !/^[a-z_-]{1,32}$/.test(v)) return null;
  const code = toAppCenterCode(v);
  return code ? hdCenterLabelFromCode(code) : null;
}

function centers(r: Obj): SystemReadingCenter[] {
  if (!Array.isArray(r.centers)) return [];
  const out: SystemReadingCenter[] = [];
  for (const c of r.centers.slice(0, SYSTEM_READING_LIMITS.centers)) {
    if (!isObj(c)) continue;
    const id = typeof c.id === "string" && /^[a-z_-]{1,32}$/.test(c.id) ? c.id : null;
    const name = localized(c, "name");
    if (!id || !name) continue;
    out.push({
      id,
      name,
      defined: typeof c.defined === "boolean" ? c.defined : null,
      theme: text(c.theme),
      notSelfQuestion: text(c.notSelfQuestion),
      biology: text(c.biology),
      motor: typeof c.motor === "boolean" ? c.motor : null,
      awareness: typeof c.awareness === "boolean" ? c.awareness : null,
      gates: gateList(c.gates),
    });
  }
  return out;
}

function channels(r: Obj): SystemReadingChannel[] {
  if (!Array.isArray(r.channels)) return [];
  const out: SystemReadingChannel[] = [];
  for (const c of r.channels.slice(0, SYSTEM_READING_LIMITS.channels)) {
    if (!isObj(c)) continue;
    const a = int(c.gateA, 1, 64);
    const b = int(c.gateB, 1, 64);
    const item: SystemReadingChannel = {
      id: a !== null && b !== null ? `${Math.min(a, b)}-${Math.max(a, b)}` : null,
      name: localized(c, "name"),
      circuit: localized(c, "circuit"),
      description: text(c.description),
      circuitDescription: text(c.circuitDescription),
      centers: Array.isArray(c.centers) ? c.centers.slice(0, 2).map(centerName).filter((x): x is string => x !== null) : [],
    };
    if (item.id || item.name || item.description) out.push(item);
  }
  return out;
}

function activations(r: Obj): SystemReadingActivation[] {
  if (!Array.isArray(r.gates)) return [];
  const out: SystemReadingActivation[] = [];
  for (const g of r.gates.slice(0, SYSTEM_READING_LIMITS.activations)) {
    if (!isObj(g)) continue;
    const side = g.side === "design" || g.side === "personality" ? g.side : null;
    const gate = int(g.gate, 1, 64);
    const line = int(g.line, 1, 6);
    if (!side || gate === null || line === null) continue;
    out.push({
      side,
      planet: localized(g, "planet"),
      gate,
      line,
      gateName: localized(g, "gateName"),
      gateDescription: text(g.gateDescription),
      lineMeaning: text(g.lineMeaning),
      planetDescription: text(g.planetDescription),
      iching: iching(g.ichingHexagram, gate),
    });
  }
  return out;
}

/** I Ching çapraz referansı: numara kapıyla BİREBİR eşleşmeli (şema sözleşmesi); değilse gösterilmez. */
function iching(v: unknown, gate: number): { number: number; name: string } | null {
  if (!isObj(v)) return null;
  const n = int(v.number, 1, 64);
  const name = label(v.english);
  return n !== null && n === gate && name ? { number: n, name } : null;
}

function sides(r: Obj): SystemReadingSides | null {
  const sd = isObj(r.sides) ? r.sides : {};
  const s = { personality: text(sd.personality), design: text(sd.design), designUtc: designUtcLabel(r.designInstantUtc) };
  return s.personality || s.design || s.designUtc ? s : null;
}

// ── Kaynak dili (lang=tr) ────────────────────────────────────────────────────────────────
// Şema: "a field with no translation in the requested language returns English". Türkçe harf içermeyen
// ve belirgin İngilizce işlev sözcükleri taşıyan uzun metin "İngilizce" sayılır. Metin DEĞİŞTİRİLMEZ.
const TR_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;
const EN_WORDS = /\b(the|and|of|is|to|with|that|this|for|are|it)\b/gi;
export function looksEnglishText(t: string | null | undefined): boolean {
  if (!t || t.length < 40 || TR_LETTERS.test(t)) return false;
  return (t.match(EN_WORDS) ?? []).length >= 3;
}

function languageNoteOf(dto: SystemReadingDto): string | null {
  const texts: Array<string | null | undefined> = [
    ...dto.general.flatMap((g) => g.details.map((d) => d.text)),
    ...dto.centers.flatMap((c) => [c.theme, c.notSelfQuestion, c.biology]),
    ...dto.channels.flatMap((c) => [c.description, c.circuitDescription]),
    ...dto.activations.flatMap((a) => [a.gateDescription, a.lineMeaning, a.planetDescription]),
    dto.sides?.personality,
    dto.sides?.design,
  ];
  return texts.some(looksEnglishText) ? SYSTEM_READING_LANGUAGE_NOTE : null;
}

// ── HD-05 / HD-06 / HD-23: görünen terim uyumu ──────────────────────────────────────────────
// Sağlayıcı (Roxy lang=tr) kendi çevirisini kullanır ("Jeneratör", "Tepe", "Şehit/Kâfir"…). Rapor ve
// ekranın geri kalanı uygulama sözlüğünü kullandığı için aynı kavram iki farklı adla görünüyordu.
// Uyum yalnız GÖRÜNEN DTO'da yapılır: provider_raw, hesap verisi ve teknik anahtarlar DEĞİŞMEZ.

/** Uygulama sözlüğünden gelen etiketler (bilinmeyen → sağlayıcı değeri kalır; uydurma yok). */
export type SystemReadingLabels = Partial<Record<"type" | "strategy" | "authority" | "definition" | "signature" | "notSelf", string | null>>;

const GENERAL_TITLE: Readonly<Partial<Record<SystemReadingGeneralKey, string>>> = {
  type: HD_TERM.type,
  strategy: HD_TERM.strategy,
  authority: HD_TERM.authority,
  profile: HD_TERM.profile,
  definition: HD_TERM.definition,
  cross: HD_CROSS_SECTION_TITLE,
  signature: HD_TERM.signature,
  notSelf: HD_TERM.notSelf,
};

const fixText = (t: string | null) => normalizeProviderTrText(t);

/**
 * SAF + idempotent. Hem yeni çıkarımda hem de DONMUŞ (eski) rapor snapshot'ı Word'e basılırken
 * uygulanır; snapshot kaydı değişmez.
 *   • Genel değerler: uygulama etiketi (verildiyse) — "Jeneratör" → "Generator".
 *   • Merkez adları: uygulama merkez adı — "Tepe" → "Head / Baş Merkezi".
 *   • "Kendilik dışı sorusu" sağlayıcıda HER merkez için açık-merkez diliyle gelir → YALNIZ açık
 *     (defined === false) merkezde tutulur; tanımlı ya da durumu bilinmeyen merkezde gösterilmez.
 *   • Tüm metinlerde "Şehit/Kâfir/Sapkın" → "Deneyimleyen/Çözüm Getiren".
 */
export function harmonizeSystemReading(dto: SystemReadingDto, labels: SystemReadingLabels = {}): SystemReadingDto {
  return {
    general: dto.general.map((g) => {
      const appValue = g.key in labels ? labels[g.key as keyof SystemReadingLabels] : null;
      return {
        ...g,
        title: GENERAL_TITLE[g.key] ?? g.title,
        value: appValue ?? fixText(g.value),
        details: g.details.map((d) => ({ label: d.label, text: fixText(d.text) ?? d.text })),
      };
    }),
    centers: dto.centers.map((c) => {
      const code = toAppCenterCode(c.id);
      return {
        ...c,
        name: code ? hdCenterLabelFromCode(code) : fixText(c.name) ?? c.name,
        theme: fixText(c.theme),
        notSelfQuestion: c.defined === false ? fixText(c.notSelfQuestion) : null,
        biology: fixText(c.biology),
      };
    }),
    channels: dto.channels.map((c) => {
      const appLabel = c.id ? HUMAN_DESIGN_CHANNELS.find((x) => x.code === c.id)?.label : undefined;
      const appName = appLabel ? appLabel.replace(/^\s*\d+-\d+\s*/, "").trim() : null;
      return {
        ...c,
        name: appName || fixText(c.name),
        circuit: fixText(c.circuit),
        description: fixText(c.description),
        circuitDescription: fixText(c.circuitDescription),
      };
    }),
    activations: dto.activations.map((a) => ({
      ...a,
      gateName: fixText(a.gateName),
      gateDescription: fixText(a.gateDescription),
      lineMeaning: fixText(a.lineMeaning),
      planetDescription: fixText(a.planetDescription),
    })),
    // Eski snapshot'ta alan yok → eklenmez (eski çıktı birebir).
    ...(dto.sides !== undefined
      ? { sides: dto.sides ? { ...dto.sides, personality: fixText(dto.sides.personality), design: fixText(dto.sides.design) } : null }
      : {}),
    ...(dto.languageNote !== undefined ? { languageNote: dto.languageNote } : {}),
  };
}

/** Ham sağlayıcı yanıtının İngilizce anahtar değerlerinden uygulama etiketleri (yalnız tanınanlar). */
export function systemReadingLabelsFromRaw(raw: unknown): SystemReadingLabels {
  if (!isObj(raw)) return {};
  const typeCode = toAppTypeCode(raw.type);
  const authorityCode = toAppAuthorityCode(raw.authority);
  const definitionCode = toAppDefinitionCode(raw.definition);
  const keynotes = hdTypeKeynotes(typeCode);
  return {
    type: typeCode ? hdTypeLabelFromCode(typeCode) : null,
    authority: authorityCode ? hdAuthorityDisplayLabel(authorityCode, typeCode) : null,
    definition: definitionCode ? hdDefinitionLabelFromCode(definitionCode) : null,
    strategy: keynotes?.strategy ?? null,
    signature: keynotes?.signature ?? null,
    notSelf: keynotes?.notSelf ?? null,
  };
}

/** provider_raw → güvenli DTO. Kullanılabilir içerik yoksa null (sistem yorumu "yok"). */
export function extractSystemReading(raw: unknown): SystemReadingDto | null {
  if (!isObj(raw)) return null;
  const base: SystemReadingDto = {
    general: general(raw),
    centers: centers(raw),
    channels: channels(raw),
    activations: activations(raw),
    sides: sides(raw),
  };
  const dto: SystemReadingDto = harmonizeSystemReading({ ...base, languageNote: languageNoteOf(base) }, systemReadingLabelsFromRaw(raw));
  const hasText =
    dto.general.some((g) => g.details.some((d) => d.label !== "Açı")) ||
    dto.centers.some((c) => c.theme || c.notSelfQuestion || c.biology) ||
    dto.channels.some((c) => c.description || c.circuitDescription) ||
    dto.activations.some((a) => a.gateDescription || a.lineMeaning || a.planetDescription) ||
    !!(dto.sides?.personality || dto.sides?.design);
  return hasText ? dto : null;
}
