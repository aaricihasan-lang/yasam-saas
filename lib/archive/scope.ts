/**
 * lib/archive/scope.ts — Premium Word Arşivi kapsam kuralları (SAF; istemci + sunucu).
 *
 * - Danışan süzgeci yalnız danışana DOĞRUDAN bağlı tablolarda uygulanır (clients.id veya clients'a FK). Bağsız
 *   tablolar (katalog, bilgi bankası …) danışan seçiliyken arşive girmez ve "kapsam dışı" olarak yazılır.
 * - Tarih aralığı kayıt oluşturma anına (created_at) uygulanır; Europe/Istanbul takvim günü, iki uç dahil.
 * - Klasör / dosya adları Türkçe korunarak güvenli hâle getirilir (lib/archive/zip.ts safeFileName).
 */
import { EXPORT_MODULE_ORDER, MODULE_LABELS, tablesForModule } from "@/lib/backup/registry";
import type { RegistryEntry } from "@/lib/backup/types";
import { safeFileName } from "./zip";
import type { ArchiveOptions } from "./types";
import { ARCHIVE_CLIENT_FILTER_MAX } from "./types";

export const ARCHIVE_TIMEZONE = "Europe/Istanbul";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Danışan süzgecinin uygulanacağı kolon (yoksa tablo danışana bağlı değildir). */
export function clientLinkColumn(e: RegistryEntry): string | null {
  if (e.table === "clients") return "id";
  const p = e.fkParents.find((f) => f.table === "clients");
  return p ? p.column : null;
}

/** Modül klasörü: "03 Human Design" (EXPORT_MODULE_ORDER sırası; arşivde düzenli sıralanır). */
export function moduleFolder(moduleKey: string): string {
  const i = EXPORT_MODULE_ORDER.indexOf(moduleKey);
  const n = String((i < 0 ? EXPORT_MODULE_ORDER.length : i) + 1).padStart(2, "0");
  return safeFileName(`${n} ${MODULE_LABELS[moduleKey] ?? moduleKey}`);
}

export const REPORTS_FOLDER = "Hazır Analiz Raporları";
export const DOSSIER_FOLDER = "Danışan Dosyaları";
export const FILES_FOLDER = "Fotoğraf ve Ekler";
export const DATA_FOLDER = "Kayıt Dökümü (Word)";

/** Europe/Istanbul takvim gününün başlangıç anı (UTC ISO). Ofset tarihsel kurallarla (Intl) hesaplanır. */
export function istanbulDayStartIso(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offsetAt = (ms: number): number => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: ARCHIVE_TIMEZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(ms));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return asUtc - ms;
  };
  let ms = guess - offsetAt(guess);
  ms = guess - offsetAt(ms);
  return new Date(ms).toISOString();
}

export function nextDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export type NormalizedOptions = { ok: true; options: ArchiveOptions } | { ok: false; error: string };

/** İstemciden gelen seçenekleri doğrular ve normalleştirir (bilinmeyen modül / bozuk tarih / fazla danışan → hata). */
export function normalizeArchiveOptions(raw: unknown): NormalizedOptions {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const modulesRaw = Array.isArray(o.modules) ? o.modules : [];
  const modules = [...new Set(modulesRaw.map(String))];
  if (modules.length === 0) return { ok: false, error: "En az bir modül seçin." };
  for (const m of modules) if (!EXPORT_MODULE_ORDER.includes(m)) return { ok: false, error: "Geçersiz modül." };
  modules.sort((a, b) => EXPORT_MODULE_ORDER.indexOf(a) - EXPORT_MODULE_ORDER.indexOf(b));

  let clientIds: string[] | null = null;
  if (Array.isArray(o.clientIds)) {
    const ids = [...new Set(o.clientIds.map(String))];
    if (ids.length === 0) return { ok: false, error: "Danışan seçimi boş." };
    if (ids.length > ARCHIVE_CLIENT_FILTER_MAX) return { ok: false, error: `En fazla ${ARCHIVE_CLIENT_FILTER_MAX} danışan seçilebilir.` };
    if (!ids.every((x) => UUID_RE.test(x))) return { ok: false, error: "Geçersiz danışan seçimi." };
    clientIds = ids.sort();
  } else if (o.clientIds !== null && o.clientIds !== undefined) {
    return { ok: false, error: "Geçersiz danışan seçimi." };
  }

  const day = (v: unknown): string | null | "bad" => {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v !== "string" || !DAY_RE.test(v)) return "bad";
    const [y, m, d] = v.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? v : "bad";
  };
  const dateFrom = day(o.dateFrom);
  const dateTo = day(o.dateTo);
  if (dateFrom === "bad" || dateTo === "bad") return { ok: false, error: "Geçersiz tarih." };
  if (dateFrom && dateTo && dateFrom > dateTo) return { ok: false, error: "Başlangıç tarihi bitiş tarihinden sonra olamaz." };

  const inc = (o.include && typeof o.include === "object" ? o.include : {}) as Record<string, unknown>;
  const include = {
    data: inc.data !== false,
    dossiers: inc.dossiers !== false,
    reports: inc.reports !== false,
    files: inc.files === true,
    sensitive: inc.sensitive === true,
  };
  if (!include.data && !include.dossiers && !include.reports && !include.files) {
    return { ok: false, error: "Arşive girecek en az bir içerik türü seçin." };
  }
  return { ok: true, options: { modules, clientIds, dateFrom, dateTo, include } };
}

/** Modülün dışa aktarılabilir tabloları (topolojik sıra). */
export function moduleTables(moduleKey: string): RegistryEntry[] {
  return tablesForModule(moduleKey);
}
