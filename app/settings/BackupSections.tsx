"use client";

/**
 * Ayarlar — Dışa Aktarım (Premium Word Arşivi) / Sistem Yedeği / Geri Yükleme bölümleri (PAKET BACKUP, FA-01/FA-32).
 *
 * Dürüst metin kuralı: "eksiksiz" / "tüm kayıtlar" iddiası YALNIZ çalışma anı tamlık kontrolü
 * (her tablo boş sayfaya kadar okundu + okunan satır == sunucu sayımı) geçtiğinde gösterilir.
 *
 * I18N: ekran metinleri `settings.backup` (messages/<dil>/settings.backup.json). Yedek DOSYASI ekran dilinden
 * bağımsızdır (manifest, tablo kimlikleri, sürüm, şema, gerekçeler ve tablo hata metinleri dosyada aynen) —
 * bkz. ./backupI18n.ts ve scripts/settings-backup-i18n.
 */
import { useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Check, Download, FileJson, Loader2, RotateCcw, Upload } from "lucide-react";
import { readSessionToken, type YasamUser } from "@/lib/auth/yasamUser";
import { useToast } from "@/components/ui/ToastProvider";
import { triggerBlobDownload } from "@/lib/http/downloadResponse";
import { BACKUP_REGISTRY, EXPORT_MODULE_ORDER, isExportable, isRestorable, moduleKeyOf } from "@/lib/backup/registry";
import { runBackup, runRestore, serializeBackupParts, type JsonFetcher, type RestoreRunResult } from "@/lib/backup/client";
import { normalizeBackupFile, type NormalizedBackup } from "@/lib/backup/format";
import type { BackupFileV3, CodedMessage, RestoreTableReport } from "@/lib/backup/types";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { ArchiveExportTab } from "./ArchiveExportTab";
import {
  clientErrorText,
  codedText,
  localizedError,
  localizedLines,
  moduleLabel,
  tableLabel,
  tableTitle,
  type BackupTranslator,
} from "./backupI18n";

// ─── Ortak ────────────────────────────────────────────────────────────────────

function makeFetcher(user: YasamUser): JsonFetcher {
  return async (url, init) => {
    const token = readSessionToken();
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: {
        "x-user-id": user.id,
        ...(token ? { "x-session-token": token } : {}),
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json };
  };
}

type ModuleSummary = { key: string; label: string; tables: { table: string; label: string }[] };

/**
 * I18N: modül / tablo etiketleri `settings.backup.modules|tables` katalog eşlemesinden (TR değerleri registry
 * etiketleriyle birebir). Yedek dosyasına yazılan registry etiketleri ve tablo kimlikleri DEĞİŞMEZ.
 */
function useBackupText(): { t: BackupTranslator; isSource: boolean } {
  const t = useTranslations("settings.backup") as unknown as BackupTranslator;
  const locale = useLocale();
  return { t, isSource: locale === DEFAULT_LOCALE };
}

function useModuleSummaries(filter: "export" | "restore", t: BackupTranslator): ModuleSummary[] {
  return useMemo(() => {
    const pred = filter === "export" ? isExportable : isRestorable;
    return EXPORT_MODULE_ORDER.map((key) => ({
      key,
      label: moduleLabel(t, key),
      tables: BACKUP_REGISTRY.filter((e) => pred(e) && moduleKeyOf(e) === key).map((e) => ({ table: e.table, label: tableLabel(t, e.table) })),
    })).filter((m) => m.tables.length > 0);
  }, [filter, t]);
}

// ─── Dışa Aktarım (Premium Word Arşivi) ──────────────────────────────────────

/** Dışa Aktarım sekmesi: Premium Word Arşivi (ZIP) — ./ArchiveExportTab. */
export function ExportTab({ user }: { user: YasamUser }) {
  return <ArchiveExportTab user={user} />;
}

// ─── Sistem Yedeği (JSON) ────────────────────────────────────────────────────

type BackupOutcome = {
  fileName: string;
  complete: boolean;
  totalRows: number;
  tables: {
    table: string;
    label: string;
    rows: number;
    expected: number | null;
    complete: boolean;
    error: string | null;
    /** I18N: `error`'ın dil-bağımsız parçaları (kaynak dil dışında gösterilir). */
    errorCodes?: CodedMessage[];
  }[];
};

export function BackupTab({ user }: { user: YasamUser }) {
  const { showToast } = useToast();
  const { t, isSource } = useBackupText();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<BackupOutcome | null>(null);
  const modules = useModuleSummaries("export", t);
  // Android dahil tüm cihazlarda indirme açık (2026-10-14 owner kararı): uygulama WebView blob JSON/Word
  // indirmelerini kaydeder; yedek butonu her cihazda görünür.

  async function handleBackup() {
    if (loading) return;
    setLoading(true);
    setOutcome(null);
    setProgress(t("backup.planPreparing"));
    try {
      const result = await runBackup(makeFetcher(user), (p) =>
        setProgress(
          t("backup.progress", {
            index: String(p.index),
            total: String(p.total),
            // Sunucu planındaki registry etiketi (TR) yerine katalog etiketi; HD dosyaları ayrı anahtar.
            label: p.table === "hd_files" ? t("backup.hdFilesProgress") : tableLabel(t, p.table),
            rows: String(p.rows),
          }),
        ),
      );
      const file: BackupFileV3 = result.file;
      const blob = new Blob(serializeBackupParts(file), { type: "application/json" });
      triggerBlobDownload(blob, result.fileName);
      const tables: BackupOutcome["tables"] = Object.entries(file.tables).map(([table, d]) => ({
        table,
        label: tableTitle(t, table),
        rows: d.row_count,
        expected: d.expected_count,
        complete: d.complete,
        error: d.error,
        errorCodes: result.errorCodes?.[table],
      }));
      // P2-11: gömülü Human Design dosyaları da tamlık özetinde ayrı satır olarak gösterilir.
      const hd = result.hdFiles;
      if (hd && ((hd.expected ?? 0) > 0 || hd.included > 0 || hd.error)) {
        tables.push({
          table: "hd_files",
          label: t("backup.hdFilesRow"),
          rows: hd.included,
          expected: hd.expected,
          complete: !hd.error,
          error: hd.error,
          errorCodes: hd.error_codes,
        });
      }
      const totalRows = tables.reduce((s, x) => s + x.rows, 0);
      setOutcome({ fileName: result.fileName, complete: file.complete, totalRows, tables });
      if (file.complete) {
        showToast({ title: t("backup.toastOkTitle"), message: t("backup.toastOkBody", { rows: String(totalRows) }), type: "success" });
      } else {
        showToast({
          title: t("backup.toastIncompleteTitle"),
          message: t("backup.toastIncompleteBody", { count: result.incomplete.length, n: String(result.incomplete.length) }),
          type: "error",
          duration: 10000,
        });
      }
    } catch (err) {
      showToast({ message: clientErrorText(t, isSource, err, "backup.failed"), type: "error" });
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  const incompleteRows = outcome?.tables.filter((x) => !x.complete) ?? [];

  return (
    <div className="w-full space-y-5">
      <div className="rounded-2xl border border-slate-100 bg-white/80 p-5 shadow-sm">
        <FileJson className="mb-3 h-10 w-10 text-slate-400" />
        <h3 className="text-base font-bold text-slate-900">{t("backup.title")}</h3>
        <p className="mt-1.5 text-sm text-slate-600">{t.rich("backup.intro", { strong: (c) => <strong>{c}</strong> })}</p>
        <ul className="mt-3 space-y-1">
          {modules.map((m) => (
            <li key={m.key} className="flex items-center gap-2 text-xs text-slate-500">
              <Check className="h-3 w-3 shrink-0 text-emerald-500" />
              {t("backup.moduleItem", { label: m.label, count: m.tables.length, n: String(m.tables.length) })}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] italic text-slate-400">{t("backup.excludedNote")}</p>
        <button
          type="button"
          onClick={() => {
            void handleBackup();
          }}
          disabled={loading}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-slate-700 to-slate-900 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {loading ? t("backup.preparing") : t("backup.download")}
        </button>
        {progress && <p className="mt-2 text-center text-[11px] text-slate-500">{progress}</p>}
      </div>

      {outcome && (
        <div
          className={`rounded-xl border p-4 ${outcome.complete ? "border-emerald-200 bg-emerald-50/70" : "border-rose-300 bg-rose-50/80"}`}
        >
          <p className={`flex items-center gap-2 text-sm font-bold ${outcome.complete ? "text-emerald-800" : "text-rose-800"}`}>
            {outcome.complete ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {outcome.complete
              ? t("backup.outcomeComplete", { tables: String(outcome.tables.length), rows: String(outcome.totalRows) })
              : t("backup.outcomeIncomplete", { count: incompleteRows.length, n: String(incompleteRows.length) })}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">{t("backup.outcomeFile", { name: outcome.fileName })}</p>
          <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
            {[...incompleteRows, ...outcome.tables.filter((x) => x.complete && x.rows > 0)].map((x) => {
              const err = localizedError(t, isSource, x.error, x.errorCodes);
              return (
                <div key={x.table} className="flex items-center justify-between gap-3 text-xs">
                  <span className={`truncate ${x.complete ? "text-slate-600" : "font-bold text-rose-700"}`}>{x.label}</span>
                  <span className={`shrink-0 ${x.complete ? "text-slate-500" : "font-bold text-rose-700"}`}>
                    {x.expected !== null && x.expected !== x.rows
                      ? t("backup.rowsOfExpected", { rows: String(x.rows), expected: String(x.expected) })
                      : t("backup.rows", { rows: String(x.rows) })}
                    {err ? ` — ${err}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Geri Yükleme ────────────────────────────────────────────────────────────

/** Durum rozeti sınıfları; etiket `settings.backup.restore.status.<DURUM>` (durum kodu dil-bağımsız). */
const STATUS_CLS: Record<string, string> = {
  COMPLETE: "border-emerald-200 bg-emerald-50 text-emerald-800",
  PARTIAL: "border-amber-300 bg-amber-50 text-amber-800",
  FAILED: "border-rose-300 bg-rose-50 text-rose-800",
};

function skipReasonText(t: BackupTranslator, reason: string): string {
  return t.has(`restore.skipReasons.${reason}`) ? t(`restore.skipReasons.${reason}`) : reason;
}

function ReportRow({ r, t, isSource }: { r: RestoreTableReport; t: BackupTranslator; isSource: boolean }) {
  const failed = r.failed.reduce((s, f) => s + f.count, 0);
  const bad = r.status === "FAILED" || r.status === "PARTIAL";
  // Başarısızlık kodu → etiket; katalogda yoksa ham kod (bugünkü `FAILURE_LABELS[code] ?? code` kuralı).
  const failureLabel = (code: string) => (t.has(`failures.${code}`) ? t(`failures.${code}`) : code);
  return (
    <div className="rounded-lg border border-slate-100 bg-white/80 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`truncate text-xs ${bad ? "font-bold text-rose-700" : "text-slate-700"}`}>{tableTitle(t, r.table)}</span>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-700">
            {t("restore.badge.inserted", { n: String(r.inserted) })}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600">
            {t("restore.badge.present", { n: String(r.already_present) })}
          </span>
          {r.skipped_unlicensed > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">
              {t("restore.badge.unlicensed", { n: String(r.skipped_unlicensed) })}
            </span>
          )}
          {r.parent_missing > 0 && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 font-bold text-rose-700">
              {t("restore.badge.parentMissing", { n: String(r.parent_missing) })}
            </span>
          )}
          {failed > 0 && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 font-bold text-rose-700">{t("restore.badge.failed", { n: String(failed) })}</span>
          )}
        </div>
      </div>
      {r.failed.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {r.failed.map((f) => (
            <li key={f.code} className="text-[11px] text-rose-700">
              {failureLabel(f.code)}: {f.count}
            </li>
          ))}
        </ul>
      )}
      {r.dropped_columns.length > 0 && (
        <p className="mt-1 text-[11px] text-amber-700">{t("restore.droppedColumns", { columns: r.dropped_columns.join(", ") })}</p>
      )}
      {localizedLines(t, isSource, r.warnings, r.warning_codes).map((w) => (
        <p key={w} className="mt-1 text-[11px] text-amber-700">
          {w}
        </p>
      ))}
    </div>
  );
}

export function RestoreTab({ user }: { user: YasamUser }) {
  const { showToast } = useToast();
  const { t, isSource } = useBackupText();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: string } | null>(null);
  const [validated, setValidated] = useState<{ ok: boolean; message: string; warnings: string[] } | null>(null);
  const [parsedBackup, setParsedBackup] = useState<NormalizedBackup | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<RestoreRunResult | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileInfo({ name: file.name, size: (file.size / 1024).toFixed(1) + " KB" });
    setValidated(null);
    setParsedBackup(null);
    setConfirmed(false);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const norm = normalizeBackupFile(JSON.parse(ev.target?.result as string) as unknown);
        // Kaynak dilde normalize metni birebir; diğer dillerde dil-bağımsız koddan.
        if (!norm.ok) throw new Error(isSource ? norm.error : codedText(t, { code: norm.code, params: norm.params }));
        const b = norm.backup;
        const names = Object.keys(b.tables);
        const rows = names.reduce((s, x) => s + b.tables[x].length, 0);
        const warnings: string[] = [];
        if (b.incompleteTables.length > 0) {
          warnings.push(
            t("restore.incompleteInFile", {
              count: b.incompleteTables.length,
              n: String(b.incompleteTables.length),
              tables: b.incompleteTables.map((x) => tableLabel(t, x.table)).join(", "),
            }),
          );
        }
        if (b.sourceTenantId && user.tenant_id && b.sourceTenantId !== user.tenant_id) {
          warnings.push(t("restore.otherAccount"));
        }
        setParsedBackup(b);
        setValidated({
          ok: true,
          message: t("restore.valid", { version: b.version, tables: String(names.length), rows: String(rows) }),
          warnings,
        });
      } catch (err) {
        // JSON.parse hatası (bozuk / yarım / boş dosya) tarayıcının ham İngilizce metnini gösterir →
        // anlaşılır mesaj (settings.backup.restore.invalidJson). normalizeBackupFile'ın kendi (Türkçe) mesajları
        // kaynak dilde aynen kalır.
        const message = err instanceof SyntaxError ? t("restore.invalidJson") : (err as Error).message || t("restore.readFailed");
        setValidated({ ok: false, message, warnings: [] });
      }
    };
    reader.onerror = () => {
      setValidated({ ok: false, message: t("restore.readFailed"), warnings: [] });
    };
    reader.readAsText(file);
  }

  async function handleRestore() {
    if (!parsedBackup || !confirmed || loading) return;
    setLoading(true);
    setResult(null);
    setProgress(t("restore.planPreparing"));
    try {
      const res = await runRestore(parsedBackup, makeFetcher(user), (p) =>
        setProgress(
          t("restore.progress", {
            index: String(p.index),
            total: String(p.total),
            label: tableLabel(t, p.table),
            sent: String(p.sentRows),
            totalRows: String(p.totalRows),
          }),
        ),
      );
      setResult(res);
      showToast({
        title: t(`restore.status.${res.status}`),
        message: res.status === "COMPLETE" ? t("restore.toastComplete") : t("restore.toastPartial"),
        type: res.status === "COMPLETE" ? "success" : res.status === "PARTIAL" ? "warning" : "error",
        duration: 8000,
      });
    } catch (err) {
      showToast({ message: clientErrorText(t, isSource, err, "restore.failed"), type: "error" });
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  const totals = result
    ? result.tables.reduce(
        (s, r) => ({ inserted: s.inserted + r.inserted, present: s.present + r.already_present }),
        { inserted: 0, present: 0 },
      )
    : null;

  return (
    <div className="w-full space-y-5">
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
        <p className="text-xs font-bold text-amber-800">{t("restore.introTitle")}</p>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs font-semibold text-amber-700">
          <li>{t("restore.intro1")}</li>
          <li>{t("restore.intro2")}</li>
          <li>{t("restore.intro3")}</li>
          <li>{t("restore.intro4")}</li>
          <li>{t("restore.intro5")}</li>
        </ul>
      </div>

      <div>
        <label className="block text-sm font-bold text-slate-700">{t("restore.fileLabel")}</label>
        <div
          className="mt-1.5 flex min-h-[100px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-white/70 px-4 py-6 text-center transition hover:border-violet-300 hover:bg-violet-50/30"
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileRef.current?.click();
            }
          }}
          aria-label={t("restore.pickAria")}
        >
          <Upload className="mb-2 h-8 w-8 text-slate-300" />
          {fileInfo ? (
            <>
              <p className="text-sm font-bold text-slate-700">{fileInfo.name}</p>
              <p className="text-xs text-slate-400">{fileInfo.size}</p>
            </>
          ) : (
            <p className="text-sm text-slate-400">{t("restore.pickHint")}</p>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" onChange={handleFileChange} />
      </div>

      {validated && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-semibold ${validated.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}
        >
          {validated.message}
          {validated.warnings.map((w) => (
            <p key={w} className="mt-1 text-xs font-semibold text-amber-800">
              {w}
            </p>
          ))}
        </div>
      )}

      {validated?.ok && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500"
          />
          <span className="text-xs font-semibold text-amber-800">{t("restore.confirm")}</span>
        </label>
      )}

      {result && (
        <div className="space-y-3 rounded-xl border border-slate-100 bg-white/80 p-4">
          <div className={`rounded-lg border px-3 py-2 text-sm font-bold ${STATUS_CLS[result.status]}`}>
            {t("restore.result", { status: t(`restore.status.${result.status}`) })}
            {totals ? t("restore.resultTotals", { inserted: String(totals.inserted), present: String(totals.present) }) : ""}
          </div>
          {localizedLines(t, isSource, result.notes, result.noteCodes).map((n) => (
            <p key={n} className="text-xs text-amber-800">
              {n}
            </p>
          ))}
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {result.tables
              .filter((r) => r.expected > 0)
              .map((r) => (
                <ReportRow key={r.table} r={r} t={t} isSource={isSource} />
              ))}
          </div>
          {result.skipped.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-bold text-slate-600">{t("restore.skippedTitle")}</p>
              <ul className="space-y-0.5">
                {result.skipped.map((d) => (
                  <li key={d.table} className="text-[11px] text-slate-500">
                    {tableLabel(t, d.table)}: {d.action === "skip" ? skipReasonText(t, d.reason) : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {progress && <p className="text-center text-[11px] text-slate-500">{progress}</p>}

      <button
        type="button"
        onClick={() => {
          void handleRestore();
        }}
        disabled={!parsedBackup || !validated?.ok || !confirmed || loading}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
        {loading ? t("restore.restoring") : t("restore.submit")}
      </button>
    </div>
  );
}
