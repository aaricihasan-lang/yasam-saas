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

/** Bir cevabı okunur metne çevirir (fark ekranı / salt-okunur görünüm). */
export function displayAnswer(
  value: AnswerValue | undefined,
  field: TemplateField,
  version: string,
  locale: AnamnezLocale,
  yesNo: { yes: string; no: string },
): string {
  if (value === null || value === undefined) return "";
  const template = getTemplate(version);
  const catalog = getCatalog(version, locale);
  const ef: EffectiveField = { kind: "template", key: field.key, field, labelOverride: null, hidden: false };
  const opts = fieldOptions(ef, template, catalog);
  const optLabel = (k: string) => opts.find((o) => o.key === k)?.label ?? k;
  switch (field.type) {
    case "yn":
      return value === true ? yesNo.yes : value === false ? yesNo.no : "";
    case "ynd": {
      const v = value as YndValue;
      const head = v.v === true ? yesNo.yes : v.v === false ? yesNo.no : "";
      return [head, v.d].filter(Boolean).join(" — ");
    }
    case "single":
      return optLabel(String(value));
    case "multi":
      return (value as string[]).map(optLabel).join(", ");
    case "number":
      return `${value}${field.unit ? ` ${catalog.units[field.unit] ?? ""}` : ""}`;
    case "rows":
      return (value as RowValue[])
        .map((r) =>
          (field.columns ?? [])
            .map((c) => {
              const cell = r[c.key];
              if (cell === null || cell === undefined || cell === "") return null;
              return c.type === "single" ? catalog.options[c.options ?? ""]?.[String(cell)] ?? String(cell) : String(cell);
            })
            .filter(Boolean)
            .join(" · "),
        )
        .filter(Boolean)
        .join("; ");
    case "date":
      return formatIsoDate(String(value), locale);
    default:
      return String(value);
  }
}
