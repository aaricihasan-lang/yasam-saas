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

// ─── Dışa Aktarım (Premium Word Arşivi) ──────────────────────────────────────
// Arşiv DOSYALARI (Word, klasör adları, BENİOKU.txt, ARŞİV-RAPORU.txt) Türkçe kalır (lib/archive değişmez). Ekranda
// kaynak dilde plan / iş metinleri BİREBİR; diğer dillerde yalnız `scope_code` / `reason_code` / `display` /
// `message_code` / `warning_codes` EK alanlarından üretilir.

type ScopeNote = { scope: string; reason: string; scope_code?: CodedMessage; reason_code?: CodedMessage };
type JobLike = { kind: string; label: string; display?: CodedMessage };

function archiveScopeText(t: BackupTranslator, c: CodedMessage): string {
  const p = c.params ?? {};
  switch (c.code) {
    case "TABLE":
      return tableTitle(t, String(p.table ?? ""));
    case "FILE_SOURCE":
      return t.has(`archive.fileSources.${p.source}`) ? t(`archive.fileSources.${p.source}`) : String(p.source ?? "");
    case "MEDIA_SOURCE":
      return t.has(`archive.mediaSources.${p.table}`) ? t(`archive.mediaSources.${p.table}`) : String(p.table ?? "");
    default:
      return t.has(`archive.scopes.${c.code}`) ? t(`archive.scopes.${c.code}`, values(c.params)) : t("archive.reasons.UNKNOWN");
  }
}

function archiveReasonText(t: BackupTranslator, c: CodedMessage): string {
  const p = c.params ?? {};
  switch (c.code) {
    case "MODULE_LIST":
      return String(p.modules ?? "")
        .split(",")
        .filter(Boolean)
        .map((m) => moduleLabel(t, m))
        .join(", ");
    case "DATE_RANGE_OUTSIDE":
      return t("archive.reasons.DATE_RANGE_OUTSIDE", {
        from: String(p.from ?? "") || t("archive.reasons.rangeStart"),
        to: String(p.to ?? "") || t("archive.reasons.rangeToday"),
      });
    case "PERMISSION_OFF":
      return t("archive.reasons.PERMISSION_OFF", { module: moduleLabel(t, String(p.module ?? "")) });
    default:
      return t.has(`archive.reasons.${c.code}`) ? t(`archive.reasons.${c.code}`, values(c.params)) : t("archive.reasons.UNKNOWN");
  }
}

/** Kapsam notu → { scope, reason } ekran metni. Kodsuz not (eski sunucu) diğer dillerde genel metinle gösterilir. */
export function archiveNote(t: BackupTranslator, isSource: boolean, n: ScopeNote): { scope: string; reason: string } {
  if (isSource) return { scope: n.scope, reason: n.reason };
  return {
    scope: n.scope_code ? archiveScopeText(t, n.scope_code) : t("archive.reasons.UNKNOWN"),
    reason: n.reason_code ? archiveReasonText(t, n.reason_code) : t("archive.uncodedNote"),
  };
}

/** Plan uyarıları: kaynak dilde birebir; diğer dillerde koddan (kodsuz fazlalık için tek genel satır). */
export function archiveWarnings(t: BackupTranslator, isSource: boolean, texts: readonly string[], codes: readonly CodedMessage[] | undefined): string[] {
  if (isSource) return [...texts];
  const list = codes ?? [];
  const out = list.map((c) => {
    if (c.code === "TABLE_COUNT_FAILED") {
      return t("archive.warnings.TABLE_COUNT_FAILED", { scope: tableTitle(t, String(c.params?.table ?? "")), detail: String(c.params?.detail ?? "") });
    }
    return t.has(`archive.warnings.${c.code}`) ? t(`archive.warnings.${c.code}`, values(c.params)) : t("archive.warnings.uncoded");
  });
  if (texts.length > list.length) out.push(t("archive.warnings.uncoded"));
  return [...new Set(out)];
}

/** İş (parça) ekran adı: kaynak dilde `label` birebir (ARŞİV-RAPORU.txt ile aynı); diğer dillerde `display` kodundan. */
export function archiveJobLabel(t: BackupTranslator, isSource: boolean, job: JobLike): string {
  if (isSource || !job.display) return isSource ? job.label : t("archive.jobs.generic");
  const p = job.display.params ?? {};
  const name = String(p.name ?? "");
  switch (job.display.code) {
    case "DATA_JOB":
      return t("archive.jobs.DATA_JOB", { module: moduleLabel(t, String(p.module ?? "")) });
    case "DOSSIER_JOB":
      return t("archive.jobs.DOSSIER_JOB", { name });
    case "NUMEROLOGY_JOB":
      return t("archive.jobs.NUMEROLOGY_JOB", { name: name || t("archive.jobs.unnamedRecord") });
    case "HD_REPORT_JOB":
      return t("archive.jobs.HD_REPORT_JOB", { name: name || t("archive.jobs.unlinked") });
    case "HD_RELATION_JOB":
      return t("archive.jobs.HD_RELATION_JOB");
    case "ASTRO_JOB":
      return t("archive.jobs.ASTRO_JOB", { name: name || t("archive.jobs.unnamedAnalysis") });
    case "FILE_JOB": {
      const source = t.has(`archive.fileSources.${p.source}`) ? t(`archive.fileSources.${p.source}`) : String(p.source ?? "");
      return t("archive.jobs.FILE_JOB", { source, name: name || String(p.id ?? "") });
    }
    case "MEDIA_JOB": {
      const source = t.has(`archive.mediaSources.${p.table}`) ? t(`archive.mediaSources.${p.table}`) : String(p.table ?? "");
      return t("archive.jobs.MEDIA_JOB", { source, id: String(p.id ?? "") });
    }
    default:
      return t("archive.jobs.generic");
  }
}

/** İş sonucu mesajı: kaynak dilde Türkçe mesaj birebir; diğer dillerde `message_code`'dan. */
export function archiveJobMessage(t: BackupTranslator, isSource: boolean, message: string | null, coded: CodedMessage | undefined): string {
  if (isSource) return message ?? "";
  if (!message && !coded) return "";
  if (!coded) return t("codes.SERVER_TEXT");
  const p = coded.params ?? {};
  switch (coded.code) {
    case "HTTP_STATUS":
      return httpStatusText(t, Number(p.status) || 0);
    case "SERVER_CODE":
      return t.has(`archive.serverCodes.${p.code}`) ? t(`archive.serverCodes.${p.code}`) : httpStatusText(t, Number(p.status) || 0);
    case "DATA_PARTIAL":
      return Number(p.errors) > 0
        ? t("archive.messages.DATA_PARTIAL_ERRORS", { rows: String(p.rows ?? ""), expected: String(p.expected ?? ""), errors: String(p.errors ?? "") })
        : t("archive.messages.DATA_PARTIAL", { rows: String(p.rows ?? ""), expected: String(p.expected ?? "") });
    default:
      return t.has(`archive.messages.${coded.code}`) ? t(`archive.messages.${coded.code}`, values(coded.params)) : t("codes.SERVER_TEXT");
  }
}

/** Arşiv API hata yanıtı (plan / danışan arama): kaynak dilde sunucu metni birebir; diğer dillerde kod / HTTP durumu. */
export function archiveApiError(
  t: BackupTranslator,
  isSource: boolean,
  res: { status: number; json: Record<string, unknown> },
  fallbackKey: string,
): string {
  if (isSource) return String(res.json.error ?? t(fallbackKey));
  const code = typeof res.json.code === "string" ? res.json.code : "";
  if (code && t.has(`archive.serverCodes.${code}`)) return t(`archive.serverCodes.${code}`);
  return res.status ? httpStatusText(t, res.status) : t(fallbackKey);
}
