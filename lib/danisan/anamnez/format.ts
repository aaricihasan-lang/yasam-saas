/**
 * Anamnez görüntüleme yardımcıları — SAF (saat dilimi bağımsız).
 */
import { fieldOptions, getCatalog, getTemplate, type AnamnezLocale, type EffectiveField } from "./schema";
import type { AnswerValue, RowValue, TemplateField, YndValue } from "./types";

/** "YYYY-MM-DD" → TR "DD.MM.YYYY" / EN "DD/MM/YYYY" (Date nesnesi YOK → TZ kayması yok). */
export function formatIsoDate(value: string | null | undefined, locale: AnamnezLocale): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  return locale === "en" ? `${m[3]}/${m[2]}/${m[1]}` : `${m[3]}.${m[2]}.${m[1]}`;
}

/** Europe/Istanbul takvimindeki bugün (YYYY-MM-DD). */
export function todayIsoIstanbul(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Anlık zaman damgası → Europe/Istanbul takviminde "DD.MM.YYYY HH:MM" (EN: "DD/MM/YYYY HH:MM"). */
export function formatInstantIstanbul(value: string | Date | null | undefined, locale: AnamnezLocale, withTime = true): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const date = formatIsoDate(`${get("year")}-${get("month")}-${get("day")}`, locale);
  return withTime ? `${date} ${get("hour")}:${get("minute")}` : date;
}

/** Anlık zaman damgasını kullanıcının yerel tarih biçiminde (liste/meta için). */
export function formatInstantDate(iso: string | null | undefined, locale: AnamnezLocale): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale === "en" ? "en-GB" : "tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function clientDisplayFromSnapshot(s: { ad?: string | null; soyad?: string | null } | null | undefined): string {
  return `${s?.ad ?? ""} ${s?.soyad ?? ""}`.trim();
}

/** Dosya adı için ASCII slug (Türkçe harfler sadeleştirilir; ≤ 60 karakter). */
export function asciiSlug(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Bir cevabı okunur metne çevirir (fark ekranı / salt-okunur görünüm / dolu form PDF).
 * Kanonik alan (TemplateField) veya efektif alan (kanonik + danışana özel soru) kabul eder.
 * Beklenmeyen biçimdeki değer "undefined"/"NaN" üretmez (boş metin döner).
 */
export function displayAnswer(
  value: AnswerValue | undefined,
  field: TemplateField | EffectiveField,
  version: string,
  locale: AnamnezLocale,
  yesNo: { yes: string; no: string },
): string {
  if (value === null || value === undefined) return "";
  const template = getTemplate(version);
  const catalog = getCatalog(version, locale);
  const ef: EffectiveField = "kind" in field ? field : { kind: "template", key: field.key, field, labelOverride: null, hidden: false };
  const type = ef.kind === "template" ? ef.field.type : ef.custom.type;
  const unit = ef.kind === "template" ? ef.field.unit : undefined;
  const columns = ef.kind === "template" ? ef.field.columns : undefined;
  const opts = fieldOptions(ef, template, catalog);
  const optLabel = (k: string) => opts.find((o) => o.key === k)?.label ?? k;
  switch (type) {
    case "yn":
      return value === true ? yesNo.yes : value === false ? yesNo.no : "";
    case "ynd": {
      if (typeof value !== "object" || Array.isArray(value)) return "";
      const v = value as YndValue;
      const head = v.v === true ? yesNo.yes : v.v === false ? yesNo.no : "";
      return [head, typeof v.d === "string" ? v.d : ""].filter(Boolean).join(" — ");
    }
    case "single":
      return typeof value === "object" ? "" : optLabel(String(value));
    case "multi":
      return Array.isArray(value)
        ? (value as unknown[]).filter((x): x is string => typeof x === "string").map(optLabel).join(", ")
        : "";
    case "number":
    case "scale10":
      if (typeof value !== "number" || !Number.isFinite(value)) return "";
      return `${value}${unit ? ` ${catalog.units[unit] ?? ""}` : ""}`.trim();
    case "rows":
      if (!Array.isArray(value)) return "";
      return (value as RowValue[])
        .map((r) =>
          (columns ?? [])
            .map((c) => {
              const cell = r?.[c.key];
              if (cell === null || cell === undefined || cell === "") return null;
              return c.type === "single" ? catalog.options[c.options ?? ""]?.[String(cell)] ?? String(cell) : String(cell);
            })
            .filter(Boolean)
            .join(" · "),
        )
        .filter(Boolean)
        .join("; ");
    case "date":
      return typeof value === "string" ? formatIsoDate(value, locale) : "";
    default:
      return typeof value === "string" || typeof value === "number" ? String(value) : "";
  }
}
