/**
 * KAMPANYA MERKEZİ KM-3 — ziyaretçi çalıştırıcıları için ortak doğrulama ve sözlükler (YALNIZ SUNUCU).
 * Ziyaretçi girdisi ASLA güvenilir sayılmaz: bilinmeyen alan → red, uzunluk / aralık / takvim denetimi, konum yalnız
 * yerel veri setinden (dış API yok). Kişisel veri kalıcı yazılmaz; çalıştırıcılar girdiyi yalnız bellekte işler.
 */
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { canonicalName } from "@/lib/numeroloji-klasik/input";
import { resolveAstroLocation } from "@/lib/astrology/birth/location";
import type { ReservationCallGuard } from "../../quotaService";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VisitorField, VisitorResult } from "../types";

assertServerOnly("lib/campaign/visitor/runners/shared");

export type FieldErrors = Record<string, string>;
export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

export type RunContext = {
  db: Pick<SupabaseClient, "rpc" | "from">;
  guard: ReservationCallGuard;
  commentsEnabled: boolean;
  hdOptions: { word: boolean; kb: boolean };
  env: Record<string, string | undefined>;
  now: Date;
  /** Test / yerel: sağlayıcı fetch'i (verilmezse global fetch; HER zaman guardedFetch ile sarılır). */
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  /** YALNIZ testler: Klasik Numeroloji normalize/verify yerine sentetik katman (hat bunu hiç doldurmaz). Sağlayıcı çağrısı
   *  ve kota koruması bu alanla DEĞİŞTİRİLEMEZ (runClassic korumalı callProvider'ı her zaman sonra yazar). */
  classicTestOverrides?: { normalize?: unknown; verify?: unknown };
};
export type RunOutcome =
  | { ok: true; result: VisitorResult }
  | { ok: false; code: "girdi" | "saglayici" | "kota" | "hesap"; message: string; errors?: FieldErrors };

export type VisitorRunner<T = unknown> = {
  key: string;
  kind: "local" | "provider" | "client";
  formLabel: string;
  fields: VisitorField[];
  hasReport?: boolean;
  parse(input: Record<string, unknown>, now: Date): Parsed<T>;
  run(ctx: RunContext, value: T): Promise<RunOutcome>;
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function daysIn(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Yalnız izinli anahtarlar; değerler metin. */
export function onlyKeys(input: Record<string, unknown>, allowed: readonly string[]): FieldErrors | null {
  for (const k of Object.keys(input)) if (!allowed.includes(k)) return { _: "Beklenmeyen alan gönderildi." };
  return null;
}

export function reqText(input: Record<string, unknown>, k: string, errors: FieldErrors, max = 120): string {
  const v = input[k];
  if (typeof v !== "string" || !v.trim()) {
    errors[k] = "Bu alan zorunlu.";
    return "";
  }
  const s = v.normalize("NFC").replace(/\s+/g, " ").trim();
  if ([...s].length > max) errors[k] = `En çok ${max} karakter.`;
  return s;
}

export function parseName(input: Record<string, unknown>, k: string, errors: FieldErrors): string {
  const r = canonicalName(input[k], k);
  if (!r.ok) {
    errors[k] = typeof input[k] === "string" && (input[k] as string).trim() ? "Geçerli bir ad soyad girin (harf içermeli, en çok 120 karakter)." : "Bu alan zorunlu.";
    return "";
  }
  return r.value;
}

export type YMD = { year: number; month: number; day: number; iso: string };

export function parseDate(input: Record<string, unknown>, k: string, errors: FieldErrors, range: { min: number; max: number }, required = true): YMD | null {
  const v = input[k];
  if (v === undefined || v === null || v === "") {
    if (required) errors[k] = "Bu alan zorunlu.";
    return null;
  }
  const m = typeof v === "string" ? DATE_RE.exec(v.trim()) : null;
  if (!m) {
    errors[k] = "Tarihi GG.AA.YYYY biçiminde seçin.";
    return null;
  }
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysIn(year, month)) {
    errors[k] = "Takvimde olmayan bir tarih.";
    return null;
  }
  if (year < range.min || year > range.max) {
    errors[k] = `Desteklenen yıl aralığı ${range.min}–${range.max}.`;
    return null;
  }
  return { year, month, day, iso: `${m[1]}-${m[2]}-${m[3]}` };
}

export function notFuture(d: YMD | null, k: string, errors: FieldErrors, todayIso: string): void {
  if (d && d.iso > todayIso) errors[k] = "Doğum tarihi gelecekte olamaz.";
}

export function parseTime(input: Record<string, unknown>, k: string, errors: FieldErrors): string | null {
  const v = input[k];
  if (typeof v !== "string" || !TIME_RE.test(v.trim())) {
    errors[k] = typeof v === "string" && v.trim() ? "Saati SS:DD biçiminde girin." : "Bu alan zorunlu.";
    return null;
  }
  return v.trim();
}

export type Place = { id: string; label: string; timezone: string; latitude: number; longitude: number };
export function parsePlace(input: Record<string, unknown>, k: string, errors: FieldErrors): Place | null {
  const loc = resolveAstroLocation(input[k]);
  if (!loc) {
    errors[k] = typeof input[k] === "string" && (input[k] as string).trim() ? "Listeden bir yer seçin." : "Bu alan zorunlu.";
    return null;
  }
  return { id: String(input[k]), label: loc.label, timezone: loc.timezone, latitude: loc.latitude, longitude: loc.longitude };
}

export function istanbulToday(now: Date): YMD {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y, month: m, day: d, iso };
}

export const done = <T>(errors: FieldErrors, value: T): Parsed<T> => (Object.keys(errors).length ? { ok: false, errors } : { ok: true, value });

export function trDate(d: { year: number; month: number; day: number }): string {
  return `${String(d.day).padStart(2, "0")}.${String(d.month).padStart(2, "0")}.${d.year}`;
}

export const SIGN_TR: Record<string, string> = {
  aries: "Koç", taurus: "Boğa", gemini: "İkizler", cancer: "Yengeç", leo: "Aslan", virgo: "Başak",
  libra: "Terazi", scorpio: "Akrep", sagittarius: "Yay", capricorn: "Oğlak", aquarius: "Kova", pisces: "Balık",
};
export const PLANET_TR: Record<string, string> = {
  sun: "Güneş", moon: "Ay", mercury: "Merkür", venus: "Venüs", mars: "Mars", jupiter: "Jüpiter", saturn: "Satürn",
  uranus: "Uranüs", neptune: "Neptün", pluto: "Plüton",
};
export const trSign = (s: unknown) => SIGN_TR[String(s ?? "").toLowerCase()] ?? String(s ?? "—");
export const trPlanet = (s: unknown) => PLANET_TR[String(s ?? "").toLowerCase()] ?? String(s ?? "—");
export const deg = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? `${Math.floor(x % 30)}°${String(Math.floor(((x % 30) % 1) * 60)).padStart(2, "0")}′` : "—");

/** Ortak form alanları. */
export const F = {
  name: { k: "name", label: "Ad soyad", type: "text", required: true, placeholder: "Doğumdaki tam adınız", maxLength: 120 } as VisitorField,
  firstName: { k: "firstName", label: "Ad", type: "text", required: true, maxLength: 60 } as VisitorField,
  lastName: { k: "lastName", label: "Soyad", type: "text", required: true, maxLength: 60 } as VisitorField,
  birthDate: { k: "birthDate", label: "Doğum tarihi", type: "date", required: true } as VisitorField,
  birthTime: { k: "birthTime", label: "Doğum saati", type: "time", required: true, hint: "Saat bilinmiyorsa bu analiz doğru sonuç vermez." } as VisitorField,
  birthPlace: { k: "birthPlace", label: "Doğum yeri", type: "location", required: true, placeholder: "İl, ilçe ya da şehir" } as VisitorField,
};
