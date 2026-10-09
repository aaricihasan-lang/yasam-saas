// RoxyAPI "SİSTEM YORUMU" — kayıtlı provider_raw'dan WHITELIST çıkarıcı (SAF, YALNIZ SUNUCU).
//
//   • Kaynak: ilk hesapta saklanan provider_raw (yeni Roxy çağrısı YOK; fallback çağrısı YOK).
//   • Yalnız aşağıda adı geçen yorum/etiket alanları kopyalanır; bilinmeyen/ek sağlayıcı alanları
//     DTO'ya GİRMEZ. Ham yanıt (provider_raw) hiçbir zaman istemciye dönmez.
//   • Metinler düz metindir: tip/uzunluk kontrollü, kontrol karakterleri temizlenir. HTML
//     YORUMLANMAZ (istemci yalnız metin düğümü olarak basar; dangerouslySetInnerHTML yok).
//   • Etiketlerde Türkçe *Localized değeri tercih edilir; yoksa sağlayıcının ham değeri.
//   • Sağlayıcının VERMEDİĞİ hiçbir açıklama üretilmez (ör. İmza/Benlik-dışı için uzun metin yok).
//   • Uzmanın Bilgi Bankası ile İLGİSİZDİR: hiçbir tabloya yazmaz, hiçbir içerikle birleşmez.

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
};

export type SystemReadingChannel = {
  id: string | null;
  name: string | null;
  circuit: string | null;
  description: string | null;
  circuitDescription: string | null;
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
};

export type SystemReadingDto = {
  general: SystemReadingGeneralItem[];
  centers: SystemReadingCenter[];
  channels: SystemReadingChannel[];
  activations: SystemReadingActivation[];
};

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
  const angle = localized(xc, "angle");
  const crossName = label(xc.name);
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
        ["Personality (bilinçli)", text(pk.personality)],
        ["Design (bilinçdışı)", text(pk.design)],
      ]),
    },
    { key: "definition", title: "Tanım", value: localized(r, "definition"), details: details([["Açıklama", text(r.definitionDescription)]]) },
    {
      key: "cross",
      title: "Enkarnasyon Haçı",
      value: crossName ?? angle,
      details: details([
        ["Açı", crossName ? angle : null],
        ["Açıklama", text(xc.description)],
      ]),
    },
    // İmza / Benlik-dışı: sağlayıcı uzun açıklama VERMİYOR → yalnız etiket (uydurma yok).
    { key: "signature", title: "İmza", value: localized(r, "signature"), details: [] },
    { key: "notSelf", title: "Benlik-Dışı Tema", value: localized(r, "notSelf"), details: [] },
  ];
  return items.filter((i) => i.value !== null || i.details.length > 0);
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
    });
  }
  return out;
}

/** provider_raw → güvenli DTO. Kullanılabilir içerik yoksa null (sistem yorumu "yok"). */
export function extractSystemReading(raw: unknown): SystemReadingDto | null {
  if (!isObj(raw)) return null;
  const dto: SystemReadingDto = {
    general: general(raw),
    centers: centers(raw),
    channels: channels(raw),
    activations: activations(raw),
  };
  const hasText =
    dto.general.some((g) => g.details.some((d) => d.label !== "Açı")) ||
    dto.centers.some((c) => c.theme || c.notSelfQuestion || c.biology) ||
    dto.channels.some((c) => c.description || c.circuitDescription) ||
    dto.activations.some((a) => a.gateDescription || a.lineMeaning || a.planetDescription);
  return hasText ? dto : null;
}
