/**
 * Klasik Numeroloji — girdi doğrulama + kanonikleştirme (SAF; istemci ve sunucu güvenli).
 *
 * Kurallar (bilinçli olarak KATI):
 *   • Her düzeyde bilinmeyen alan → RED (sessizce atılmaz).
 *   • Ad: 1–120 karakter; yalnız Unicode harf (Türkçe dahil) + boşluk + ' - . ; en az bir harf.
 *     NFC'ye çevrilir, baş/son boşluk kırpılır, ardışık boşluk teke iner, ’ → ' olur.
 *   • Doğum: yıl 1900–2100, ay 1–12, gün takvimde gerçekten var (artık yıl dahil).
 *   • Hedef tarih (isteğe bağlı): YYYY-MM-DD, gerçek takvim günü, 1900–2100.
 *   • Sağlayıcı kuralı (400 yanıtı da kota düşürür → sağlayıcıya GİTMEDEN yerelde red): ad, Türkçe katlama
 *     sonrası (ı/İ→I, ö→O, ü→U, ş→S, ğ→G, ç→C; oracle/text.foldName) en az bir sesli (A E I O U) ve bir sessiz
 *     A–Z harf içermeli. Hedef tarih doğum tarihinden önce olamaz.
 *   • Gövde ≤ 16 KB (UTF-8 bayt).
 *   • Kanonik JSON: anahtarlar sıralı → önbellek anahtarı deterministik.
 */

import { foldName, isVowel } from "./oracle/text";

export const CLASSIC_MAX_BODY_BYTES = 16 * 1024;
export const CLASSIC_NAME_MAX = 120;
export const CLASSIC_TITLE_MAX = 160;
export const CLASSIC_MAX_CANDIDATES = 6;
export const CLASSIC_YEAR_MIN = 1900;
export const CLASSIC_YEAR_MAX = 2100;

export type ClassicKind = "person" | "relationship" | "business" | "names";
export const CLASSIC_KINDS: readonly ClassicKind[] = ["person", "relationship", "business", "names"];

/** Teknik grupları (MİMARİ §4). Sıra = kanonik sıra. */
export const CLASSIC_TECHNIQUES: Readonly<Record<ClassicKind, readonly string[]>> = Object.freeze({
  person: ["core", "bridge", "personal_day", "chaldean", "dual"],
  relationship: ["compatibility"],
  business: ["business_name"],
  names: ["dual"],
});
const DEFAULT_TECHNIQUES: Readonly<Record<ClassicKind, readonly string[]>> = Object.freeze({
  person: ["core"],
  relationship: ["compatibility"],
  business: ["business_name"],
  names: ["dual"],
});

export type BirthDate = { year: number; month: number; day: number };
export type PersonInput = { fullName: string; birth: BirthDate; targetDate?: string };
export type RelationshipInput = { person1: { fullName: string; birth: BirthDate }; person2: { fullName: string; birth: BirthDate } };
export type BusinessInput = { name: string };
export type NamesInput = { candidates: string[] };

export type ClassicAnalysisRequest =
  | { kind: "person"; title: string; clientId: string | null; techniques: string[]; input: PersonInput }
  | { kind: "relationship"; title: string; clientId: string | null; techniques: string[]; input: RelationshipInput }
  | { kind: "business"; title: string; clientId: string | null; techniques: string[]; input: BusinessInput }
  | { kind: "names"; title: string; clientId: string | null; techniques: string[]; input: NamesInput };

export type ClassicPatchRequest = { title?: string; clientId?: string | null; rowVersion: number };

export type Validation<T> = { ok: true; value: T } | { ok: false; code: string; error: string; field?: string };

const bad = <T>(code: string, error: string, field?: string): Validation<T> => ({ ok: false, code, error, ...(field ? { field } : {}) });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

function onlyKeys(o: Record<string, unknown>, allowed: readonly string[], where: string): Validation<true> {
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) return bad("UNKNOWN_FIELD", `Beklenmeyen alan: ${where ? `${where}.` : ""}${k.slice(0, 40)}`, where ? `${where}.${k}` : k);
  }
  return { ok: true, value: true };
}

/** UTF-8 bayt uzunluğu (TextEncoder; Node ve tarayıcıda aynı). */
export function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Ham gövde metni → JSON (boyut + biçim). */
export function parseClassicJsonBody(text: string): Validation<unknown> {
  if (utf8Bytes(text) > CLASSIC_MAX_BODY_BYTES) return bad("PAYLOAD_TOO_LARGE", "İstek çok büyük.");
  if (!text.trim()) return bad("MALFORMED_JSON", "Geçerli JSON gövdesi gerekli.");
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return bad("MALFORMED_JSON", "Geçerli JSON gövdesi gerekli.");
  }
}

const NAME_CHARS_RE = /^[\p{L}\p{M}' .\-]+$/u;
const HAS_LETTER_RE = /\p{L}/u;

/** Sağlayıcının ad kuralı: katlanmış A–Z harflerde en az bir sesli ve bir sessiz. */
export function hasVowelAndConsonant(name: string): boolean {
  const letters = foldName(name).letters;
  return letters.some(isVowel) && letters.some((L) => !isVowel(L));
}

/** Ad kanonikleştirme + doğrulama. */
export function canonicalName(v: unknown, field: string): Validation<string> {
  if (typeof v !== "string") return bad("INVALID_NAME", "Ad metin olmalı.", field);
  const s = v.normalize("NFC").replace(/[’ʼ]/g, "'").replace(/\s+/g, " ").trim();
  if (s.length < 1) return bad("INVALID_NAME", "Ad boş olamaz.", field);
  if ([...s].length > CLASSIC_NAME_MAX) return bad("INVALID_NAME", `Ad en fazla ${CLASSIC_NAME_MAX} karakter olabilir.`, field);
  if (!NAME_CHARS_RE.test(s) || !HAS_LETTER_RE.test(s)) {
    return bad("INVALID_NAME", "Ad yalnız harf, boşluk, kesme işareti, tire ve nokta içerebilir.", field);
  }
  if (!hasVowelAndConsonant(s)) return bad("INVALID_NAME", "Ad en az bir sesli ve bir sessiz harf içermeli (Latin/Türkçe harflerle).", field);
  return { ok: true, value: s };
}

const BUSINESS_CHARS_RE = /^[\p{L}\p{M}\p{N}' .,&\-]+$/u;
/** İşletme adı: harf + rakam + boşluk + ' . , & - ; en az bir harf veya rakam. */
export function canonicalBusinessName(v: unknown, field: string): Validation<string> {
  if (typeof v !== "string") return bad("INVALID_NAME", "İşletme adı metin olmalı.", field);
  const s = v.normalize("NFC").replace(/[’ʼ]/g, "'").replace(/\s+/g, " ").trim();
  if (s.length < 1) return bad("INVALID_NAME", "İşletme adı boş olamaz.", field);
  if ([...s].length > CLASSIC_NAME_MAX) return bad("INVALID_NAME", `İşletme adı en fazla ${CLASSIC_NAME_MAX} karakter olabilir.`, field);
  if (!BUSINESS_CHARS_RE.test(s) || !/[\p{L}\p{N}]/u.test(s)) {
    return bad("INVALID_NAME", "İşletme adı yalnız harf, rakam, boşluk ve ' . , & - içerebilir.", field);
  }
  if (!hasVowelAndConsonant(s)) return bad("INVALID_NAME", "İşletme adı en az bir sesli ve bir sessiz harf içermeli (Latin/Türkçe harflerle).", field);
  return { ok: true, value: s };
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}
export function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 0;
}
function isIntIn(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

export function validateBirth(v: unknown, field: string): Validation<BirthDate> {
  if (!isPlainObject(v)) return bad("INVALID_DATE", "Doğum tarihi gerekli.", field);
  const k = onlyKeys(v, ["year", "month", "day"], field);
  if (!k.ok) return k;
  const { year, month, day } = v;
  if (!isIntIn(year, CLASSIC_YEAR_MIN, CLASSIC_YEAR_MAX)) return bad("INVALID_DATE", `Doğum yılı ${CLASSIC_YEAR_MIN}–${CLASSIC_YEAR_MAX} arasında olmalı.`, `${field}.year`);
  if (!isIntIn(month, 1, 12)) return bad("INVALID_DATE", "Doğum ayı 1–12 arasında olmalı.", `${field}.month`);
  if (!isIntIn(day, 1, daysInMonth(year, month))) return bad("INVALID_DATE", "Bu ayda böyle bir gün yok.", `${field}.day`);
  return { ok: true, value: { year, month, day } };
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function validateIsoDate(v: unknown, field: string): Validation<string> {
  if (typeof v !== "string") return bad("INVALID_DATE", "Tarih YYYY-AA-GG biçiminde olmalı.", field);
  const m = ISO_DATE_RE.exec(v);
  if (!m) return bad("INVALID_DATE", "Tarih YYYY-AA-GG biçiminde olmalı.", field);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < CLASSIC_YEAR_MIN || y > CLASSIC_YEAR_MAX || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) {
    return bad("INVALID_DATE", "Geçersiz tarih.", field);
  }
  return { ok: true, value: v };
}

/** YYYY-MM-DD < doğum günü mü? (sözlük sırası = takvim sırası) */
export function isoBeforeBirth(iso: string, birth: BirthDate): boolean {
  const b = `${String(birth.year).padStart(4, "0")}-${String(birth.month).padStart(2, "0")}-${String(birth.day).padStart(2, "0")}`;
  return iso < b;
}

function validatePersonCore(v: unknown, field: string, allowTarget: boolean): Validation<PersonInput> {
  if (!isPlainObject(v)) return bad("INVALID_INPUT", "Kişi bilgisi gerekli.", field);
  const k = onlyKeys(v, allowTarget ? ["fullName", "birth", "targetDate"] : ["fullName", "birth"], field);
  if (!k.ok) return k;
  const n = canonicalName(v.fullName, `${field}.fullName`);
  if (!n.ok) return n;
  const b = validateBirth(v.birth, `${field}.birth`);
  if (!b.ok) return b;
  const out: PersonInput = { fullName: n.value, birth: b.value };
  if (allowTarget && v.targetDate !== undefined && v.targetDate !== null) {
    const t = validateIsoDate(v.targetDate, `${field}.targetDate`);
    if (!t.ok) return t;
    if (isoBeforeBirth(t.value, b.value)) return bad("TARGET_BEFORE_BIRTH", "Hedef tarih doğum tarihinden önce olamaz.", `${field}.targetDate`);
    out.targetDate = t.value;
  }
  return { ok: true, value: out };
}

export function validateTitle(v: unknown): Validation<string> {
  if (v === undefined || v === null) return { ok: true, value: "" };
  if (typeof v !== "string") return bad("INVALID_TITLE", "Başlık metin olmalı.", "title");
  const s = v.normalize("NFC").replace(/\s+/g, " ").trim();
  if ([...s].length > CLASSIC_TITLE_MAX) return bad("INVALID_TITLE", `Başlık en fazla ${CLASSIC_TITLE_MAX} karakter olabilir.`, "title");
  if (/[<>\u0000-\u001f\u007f]/.test(s)) return bad("INVALID_TITLE", "Başlık izin verilmeyen karakter içeriyor.", "title");
  return { ok: true, value: s };
}

function validateClientId(v: unknown): Validation<string | null> {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (!isUuid(v)) return bad("INVALID_CLIENT_ID", "Geçersiz danışan kimliği.", "clientId");
  return { ok: true, value: v.toLowerCase() };
}

function validateTechniques(kind: ClassicKind, v: unknown): Validation<string[]> {
  const allowed = CLASSIC_TECHNIQUES[kind];
  if (v === undefined || v === null) return { ok: true, value: [...DEFAULT_TECHNIQUES[kind]] };
  if (!Array.isArray(v) || v.length < 1 || v.length > allowed.length * 2) return bad("INVALID_TECHNIQUES", "Teknik seçimi geçersiz.", "techniques");
  const set = new Set<string>();
  for (const t of v) {
    if (typeof t !== "string" || !allowed.includes(t)) return bad("INVALID_TECHNIQUES", "Bilinmeyen teknik seçildi.", "techniques");
    set.add(t);
  }
  return { ok: true, value: allowed.filter((t) => set.has(t)) };
}

/** POST /analyses gövdesi. */
export function validateAnalysisRequest(body: unknown): Validation<ClassicAnalysisRequest> {
  if (!isPlainObject(body)) return bad("INVALID_INPUT", "Geçersiz istek.");
  const k = onlyKeys(body, ["kind", "title", "clientId", "techniques", "input"], "");
  if (!k.ok) return k;
  const kind = body.kind;
  if (typeof kind !== "string" || !(CLASSIC_KINDS as readonly string[]).includes(kind)) return bad("INVALID_KIND", "Analiz türü geçersiz.", "kind");
  const title = validateTitle(body.title);
  if (!title.ok) return title;
  const clientId = validateClientId(body.clientId);
  if (!clientId.ok) return clientId;
  const techniques = validateTechniques(kind as ClassicKind, body.techniques);
  if (!techniques.ok) return techniques;
  const base = { title: title.value, clientId: clientId.value, techniques: techniques.value };
  const input = body.input;

  if (kind === "person") {
    const p = validatePersonCore(input, "input", true);
    if (!p.ok) return p;
    return { ok: true, value: { kind, ...base, input: p.value } };
  }
  if (kind === "relationship") {
    if (!isPlainObject(input)) return bad("INVALID_INPUT", "İki kişinin bilgisi gerekli.", "input");
    const kk = onlyKeys(input, ["person1", "person2"], "input");
    if (!kk.ok) return kk;
    const p1 = validatePersonCore(input.person1, "input.person1", false);
    if (!p1.ok) return p1;
    const p2 = validatePersonCore(input.person2, "input.person2", false);
    if (!p2.ok) return p2;
    return { ok: true, value: { kind, ...base, input: { person1: { fullName: p1.value.fullName, birth: p1.value.birth }, person2: { fullName: p2.value.fullName, birth: p2.value.birth } } } };
  }
  if (kind === "business") {
    if (!isPlainObject(input)) return bad("INVALID_INPUT", "İşletme adı gerekli.", "input");
    const kk = onlyKeys(input, ["name"], "input");
    if (!kk.ok) return kk;
    const n = canonicalBusinessName(input.name, "input.name");
    if (!n.ok) return n;
    return { ok: true, value: { kind, ...base, input: { name: n.value } } };
  }
  // names
  if (!isPlainObject(input)) return bad("INVALID_INPUT", "Aday ad listesi gerekli.", "input");
  const kk = onlyKeys(input, ["candidates"], "input");
  if (!kk.ok) return kk;
  const c = input.candidates;
  if (!Array.isArray(c) || c.length < 1 || c.length > CLASSIC_MAX_CANDIDATES) {
    return bad("INVALID_INPUT", `1–${CLASSIC_MAX_CANDIDATES} aday ad girilmeli.`, "input.candidates");
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < c.length; i++) {
    const n = canonicalName(c[i], `input.candidates.${i}`);
    if (!n.ok) return n;
    const fold = n.value.toLocaleLowerCase("tr-TR");
    if (seen.has(fold)) return bad("DUPLICATE_CANDIDATE", "Aynı aday ad iki kez girilmiş.", `input.candidates.${i}`);
    seen.add(fold);
    out.push(n.value);
  }
  return { ok: true, value: { kind: "names", ...base, input: { candidates: out } } };
}

/** PATCH /analyses/[id] gövdesi. */
export function validatePatchRequest(body: unknown): Validation<ClassicPatchRequest> {
  if (!isPlainObject(body)) return bad("INVALID_INPUT", "Geçersiz istek.");
  const k = onlyKeys(body, ["title", "clientId", "rowVersion"], "");
  if (!k.ok) return k;
  if (!isIntIn(body.rowVersion, 1, 2_147_483_647)) return bad("INVALID_ROW_VERSION", "Sürüm bilgisi gerekli.", "rowVersion");
  const out: ClassicPatchRequest = { rowVersion: body.rowVersion };
  if ("title" in body) {
    const t = validateTitle(body.title);
    if (!t.ok) return t;
    out.title = t.value;
  }
  if ("clientId" in body) {
    const c = validateClientId(body.clientId);
    if (!c.ok) return c;
    out.clientId = c.value;
  }
  if (out.title === undefined && !("clientId" in out)) return bad("NOTHING_TO_UPDATE", "Değiştirilecek alan yok.");
  return { ok: true, value: out };
}

/** Anahtarları sıralı, boşluksuz JSON (önbellek anahtarı için deterministik). */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") {
    if (typeof v === "number" && !Number.isFinite(v)) throw new Error("kanonik JSON: sonlu olmayan sayı");
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(",")}}`;
}
