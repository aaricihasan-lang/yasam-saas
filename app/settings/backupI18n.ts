/**
 * Ayarlar › Sistem Yedeği / Geri Yükleme — GÖSTERİM eşlemesi (I18N; SAF — harness doğrudan test eder).
 *
 * Mimari (Owner talimatı §9):
 *  - Yedek DOSYASININ içeriği (manifest, tablo kimlikleri, sürüm, şema, `excluded` gerekçeleri, tablo `error` metinleri)
 *    ekran dilinden ETKİLENMEZ: lib/backup hiçbir dil girdisi okumaz (scripts/settings-backup-i18n harness'ları kanıtlar).
 *  - Modül / tablo etiketleri ekranda `settings.backup.modules.*` / `settings.backup.tables.*` katalog eşlemesinden gelir;
 *    TR katalog değerleri lib/backup/registry etiketleriyle BİREBİR aynıdır (harness denetler) → TR ekran değişmez.
 *  - Sunucu / istemci kütüphanesinin Türkçe metinleri (error, warnings, notes) kaynak dilde (tr) BİREBİR gösterilir;
 *    diğer dillerde yalnız dil-bağımsız `code` + `params` EK alanlarından üretilir (karışık dil yok).
 */
import type { ReactNode } from "react";
import { BACKUP_REGISTRY, moduleKeyOf } from "@/lib/backup/registry";
import type { CodedMessage } from "@/lib/backup/types";

/** next-intl çeviri fonksiyonunun burada kullanılan alt kümesi (useTranslations("settings.backup")). */
export type BackupTranslator = {
  (key: string, values?: Record<string, string | number>): string;
  has(key: string): boolean;
  /** Zengin metin (ör. <strong>); yalnız arayüzde kullanılır. */
  rich(key: string, values: Record<string, (chunks: ReactNode) => ReactNode>): ReactNode;
};

const ENTRY_BY_TABLE = new Map(BACKUP_REGISTRY.map((e) => [e.table, e]));

/** Modül etiketi (registry modül anahtarı → katalog). Bilinmeyen anahtar ham kimlikle (dil-bağımsız) gösterilir. */
export function moduleLabel(t: BackupTranslator, key: string): string {
  return t.has(`modules.${key}`) ? t(`modules.${key}`) : key;
}

/** Tablo etiketi (yalnız tablo). Registry'de olmayan tablo ham kimlikle gösterilir (bugünkü davranış). */
export function tableLabel(t: BackupTranslator, table: string): string {
  return ENTRY_BY_TABLE.has(table) && t.has(`tables.${table}`) ? t(`tables.${table}`) : table;
}

/** "Modül › Tablo" başlığı; registry dışı tablo ham kimlik (bugünkü `tableTitle` ile aynı kural). */
export function tableTitle(t: BackupTranslator, table: string): string {
  const e = ENTRY_BY_TABLE.get(table);
  if (!e) return table;
  return `${moduleLabel(t, moduleKeyOf(e))} › ${tableLabel(t, table)}`;
}

/** HTTP durumunun ekran metni (sunucunun Türkçe metni kaynak dil dışında gösterilmez). */
export function httpStatusText(t: BackupTranslator, status: number): string {
  if (status === 401 || status === 403 || status === 413 || status === 429) return t(`codes.http.${status}`);
  if (status >= 500) return t("codes.http.5xx");
  return t("codes.http.other", { status: String(status) });
}

function values(params: CodedMessage["params"]): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params ?? {})) out[k] = String(v ?? "");
  // Çoğul seçici sayısal kalır; görüntülenen sayı her zaman metin ({n}) — binlik ayraç / yerel sayı biçimi yok.
  if (params && "count" in params) {
    out.count = Number(params.count) || 0;
    out.n = String(params.count ?? "");
  }
  return out;
}

/** Dil-bağımsız kodun ekran metni. Bilinmeyen kod → genel sunucu metni (Türkçe ham metin ASLA yapıştırılmaz). */
export function codedText(t: BackupTranslator, c: CodedMessage): string {
  const p = c.params ?? {};
  switch (c.code) {
    case "HTTP_STATUS":
    case "SERVER_CODE":
      return httpStatusText(t, Number(p.status) || 0);
    case "HD_FILES_LIST_FAILED":
    case "HD_FILES_PLAN_FAILED":
      return t(`codes.${c.code}`);
    case "SKIPPED": {
      const reason = String(p.reason ?? "");
      const label = t.has(`restore.skipReasons.${reason}`) ? t(`restore.skipReasons.${reason}`) : reason;
      return t("codes.SKIPPED", { reason: label });
    }
    case "FILE_UNSUPPORTED_VERSION":
      return t("codes.FILE_UNSUPPORTED_VERSION", { version: String(p.version ?? "") || t("codes.versionNone") });
    default:
      return t.has(`codes.${c.code}`) ? t(`codes.${c.code}`, values(c.params)) : t("codes.SERVER_TEXT");
  }
}

/**
 * Türkçe metin listesi + paralel kod listesi → ekran satırları.
 * Kaynak dilde (tr) metinler BİREBİR; diğer dillerde kodlardan üretilir, kodu olmayan fazla metin için tek genel satır.
 */
export function localizedLines(
  t: BackupTranslator,
  isSource: boolean,
  texts: readonly string[],
  codes: readonly CodedMessage[] | undefined,
): string[] {
  if (isSource) return [...texts];
  const list = codes ?? [];
  const out = [...new Set(list.map((c) => codedText(t, c)))];
  if (texts.length > list.length) out.push(t("codes.UNCODED_WARNING"));
  return out;
}

/** Hata metni (yedek tablosu / dosya): tr → Türkçe metin birebir; diğer → kod parçaları " · " ile. */
export function localizedError(t: BackupTranslator, isSource: boolean, text: string | null, codes: readonly CodedMessage[] | undefined): string | null {
  if (text === null) return null;
  if (isSource) return text;
  const parts = (codes ?? []).map((c) => codedText(t, c));
  return parts.length ? [...new Set(parts)].join(" · ") : t("codes.SERVER_TEXT");
}

/** İstemci orkestrasyonundan fırlatılan hata (BackupClientError veya ağ hatası) → ekran metni. */
export function clientErrorText(t: BackupTranslator, isSource: boolean, err: unknown, fallbackKey: string): string {
  const e = err as { message?: unknown; code?: unknown; status?: unknown } | null;
  const message = e && typeof e.message === "string" ? e.message : "";
  if (isSource) return message || t(fallbackKey);
  if (e && typeof e.status === "number" && e.status > 0) return httpStatusText(t, e.status);
  if (e && typeof e.code === "string" && t.has(`codes.${e.code}`)) return t(`codes.${e.code}`);
  if (err instanceof TypeError) return t("codes.NETWORK");
  return t(fallbackKey);
}
