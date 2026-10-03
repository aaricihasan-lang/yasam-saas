"use client";

/**
 * Ayarlar — Dışa Aktarım / Sistem Yedeği / Geri Yükleme bölümleri (PAKET BACKUP, FA-01/FA-32).
 *
 * Dürüst metin kuralı: "eksiksiz" / "tüm kayıtlar" iddiası YALNIZ çalışma anı tamlık kontrolü
 * (her tablo boş sayfaya kadar okundu + okunan satır == sunucu sayımı) geçtiğinde gösterilir.
 */
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Download, FileJson, Loader2, RotateCcw, Upload } from "lucide-react";
import { readSessionToken, type YasamUser } from "@/lib/auth/yasamUser";
import { useToast } from "@/components/ui/ToastProvider";
import { useIsAndroid } from "@/hooks/useIsAndroid";
import { useIsAndroidApp } from "@/hooks/useIsAndroidApp";
import { downloadFileResponse, triggerBlobDownload } from "@/lib/http/downloadResponse";
import {
  BACKUP_REGISTRY,
  EXPORT_MODULE_ORDER,
  MODULE_LABELS,
  isExportable,
  isRestorable,
  moduleKeyOf,
} from "@/lib/backup/registry";
import { runBackup, runRestore, serializeBackupParts, type JsonFetcher, type RestoreRunResult } from "@/lib/backup/client";
import { FAILURE_LABELS, normalizeBackupFile, type NormalizedBackup } from "@/lib/backup/format";
import type { BackupFileV3, RestoreTableReport } from "@/lib/backup/types";

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

function useModuleSummaries(filter: "export" | "restore"): ModuleSummary[] {
  return useMemo(() => {
    const pred = filter === "export" ? isExportable : isRestorable;
    return EXPORT_MODULE_ORDER.map((key) => ({
      key,
      label: MODULE_LABELS[key] ?? key,
      tables: BACKUP_REGISTRY.filter((e) => pred(e) && moduleKeyOf(e) === key).map((e) => ({ table: e.table, label: e.label })),
    })).filter((m) => m.tables.length > 0);
  }, [filter]);
}

const TABLE_LABEL: Record<string, string> = Object.fromEntries(BACKUP_REGISTRY.map((e) => [e.table, e.label]));

function tableTitle(table: string): string {
  const e = BACKUP_REGISTRY.find((x) => x.table === table);
  if (!e) return table;
  return `${MODULE_LABELS[moduleKeyOf(e)] ?? ""} › ${e.label}`;
}

// ─── Dışa Aktarım (Word) ─────────────────────────────────────────────────────

export function ExportTab({ user }: { user: YasamUser }) {
  const { showToast } = useToast();
  const [loadingModule, setLoadingModule] = useState<string | null>(null);
  // Sekmeler yalnız istemcide (SettingsPage kullanıcıyı effect'te okuduktan sonra) render edilir.
  const [mobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const isAndroid = useIsAndroid();
  const modules = useModuleSummaries("export");
  const tableCount = modules.reduce((s, m) => s + m.tables.length, 0);

  async function handleExport(moduleKey: string, label: string) {
    if (loadingModule) return;
    setLoadingModule(moduleKey);
    const sessionToken = readSessionToken();
    try {
      const res = await fetch("/api/settings/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
        },
        body: JSON.stringify({ module: moduleKey }),
      });
      if (!res.ok) {
        let msg = "Dışa aktarılamadı.";
        try {
          const json = (await res.json()) as { error?: string };
          if (json.error) msg = json.error;
        } catch {
          /* gövde yok */
        }
        showToast({ message: msg, type: res.status === 413 ? "warning" : "error", duration: 8000 });
        return;
      }
      const incomplete = res.headers.get("X-Export-Incomplete") === "1";
      await downloadFileResponse(res, `${moduleKey.replace(/_/g, "-")}-arsiv.docx`);
      if (incomplete) {
        showToast({
          title: "Eksik bölümler var",
          message: `${label} belgesi indirildi ancak bazı bölümler okunamadı; belgenin başındaki kırmızı listeye bakın.`,
          type: "warning",
          duration: 9000,
        });
      } else {
        showToast({ title: "İndirildi", message: `${label} arşivi hazır.`, type: "success" });
      }
    } catch {
      showToast({ message: "Bağlantı hatası.", type: "error" });
    } finally {
      setLoadingModule(null);
    }
  }

  const isLoading = loadingModule !== null;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
        <p className="text-xs font-semibold text-emerald-800">
          Word dışa aktarım, Yaşam Sistemi dışında da okunabilen bir <strong>arşiv</strong> belgesidir; geri yükleme için
          <strong> Sistem Yedeği (JSON)</strong> sekmesini kullanın. Fotoğraf ve dosyaların kendisi dahil değildir.
          Okunamayan bölüm olursa belgenin başında kırmızıyla listelenir. Çok büyük kapsamlar için modül bazlı indirmeniz istenebilir.
        </p>
      </div>

      {mobile && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold text-amber-700">Büyük raporları masaüstü tarayıcıdan indirmeniz önerilir.</p>
        </div>
      )}

      <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-black text-violet-900">Tüm Modülleri Word Olarak İndir</p>
            <p className="mt-0.5 text-xs text-violet-600">
              {modules.length} modül · {tableCount} tablo · tek belgede (büyük hesaplarda modül bazlı indirme gerekir)
            </p>
          </div>
          {!isAndroid && (
            <button
              type="button"
              onClick={() => {
                void handleExport("all", "Tüm modüller");
              }}
              disabled={isLoading}
              className="no-android flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60"
            >
              {loadingModule === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {loadingModule === "all" ? "Hazırlanıyor…" : "Tümünü İndir"}
            </button>
          )}
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">Modül Bazlı İndir</p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((mod) => (
            <div
              key={mod.key}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white/80 px-4 py-3 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800">{mod.label}</p>
                <p className="mt-0.5 truncate text-[11px] text-slate-400" title={mod.tables.map((t) => t.label).join(", ")}>
                  {mod.tables.length} tablo · {mod.tables.map((t) => t.label).join(", ")}
                </p>
              </div>
              {!isAndroid && (
                <button
                  type="button"
                  onClick={() => {
                    void handleExport(mod.key, mod.label);
                  }}
                  disabled={isLoading}
                  className="no-android flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700 transition hover:bg-violet-100 disabled:opacity-50"
                  title={`${mod.label} Word İndir`}
                  aria-label={`${mod.label} Word İndir`}
                >
                  {loadingModule === mod.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Sistem Yedeği (JSON) ────────────────────────────────────────────────────

type BackupOutcome = {
  fileName: string;
  complete: boolean;
  totalRows: number;
  tables: { table: string; label: string; rows: number; expected: number | null; complete: boolean; error: string | null }[];
};

export function BackupTab({ user }: { user: YasamUser }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<BackupOutcome | null>(null);
  const modules = useModuleSummaries("export");
  // Android uygulama WebView'inde blob: JSON indirme çalışmaz → yedek butonu yerine not (plan §4.6).
  const isAndroidApp = useIsAndroidApp();

  async function handleBackup() {
    if (loading) return;
    setLoading(true);
    setOutcome(null);
    setProgress("Plan hazırlanıyor…");
    try {
      const result = await runBackup(makeFetcher(user), (p) =>
        setProgress(`Tablo ${p.index}/${p.total}: ${p.label} — ${p.rows} kayıt`),
      );
      const file: BackupFileV3 = result.file;
      const blob = new Blob(serializeBackupParts(file), { type: "application/json" });
      triggerBlobDownload(blob, result.fileName);
      const tables = Object.entries(file.tables).map(([table, t]) => ({
        table,
        label: tableTitle(table),
        rows: t.row_count,
        expected: t.expected_count,
        complete: t.complete,
        error: t.error,
      }));
      const totalRows = tables.reduce((s, t) => s + t.rows, 0);
      setOutcome({ fileName: result.fileName, complete: file.complete, totalRows, tables });
      if (file.complete) {
        showToast({ title: "Yedek Alındı", message: `Tamlık kontrolü geçti (${totalRows} kayıt).`, type: "success" });
      } else {
        showToast({
          title: "Yedek EKSİK",
          message: `${result.incomplete.length} tablo tam okunamadı. Ayrıntılar aşağıda; lütfen tekrar deneyin.`,
          type: "error",
          duration: 10000,
        });
      }
    } catch (err) {
      showToast({ message: (err as Error).message || "Yedek alınamadı.", type: "error" });
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  const incompleteRows = outcome?.tables.filter((t) => !t.complete) ?? [];

  return (
    <div className="w-full space-y-5">
      <div className="rounded-2xl border border-slate-100 bg-white/80 p-5 shadow-sm">
        <FileJson className="mb-3 h-10 w-10 text-slate-400" />
        <h3 className="text-base font-bold text-slate-900">Sistem Yedeği — JSON</h3>
        <p className="mt-1.5 text-sm text-slate-600">
          Veritabanı kayıtlarınızın JSON yedeği; <strong>fotoğraf ve dosyalar dahil değildir</strong>. Bu dosya Geri Yükleme
          sekmesi ile yeniden içe aktarılabilir. İndirme sonunda her tablo sunucudaki kayıt sayısıyla karşılaştırılır ve
          sonuç aşağıda gösterilir.
        </p>
        <ul className="mt-3 space-y-1">
          {modules.map((m) => (
            <li key={m.key} className="flex items-center gap-2 text-xs text-slate-500">
              <Check className="h-3 w-3 shrink-0 text-emerald-500" />
              {m.label} ({m.tables.length} tablo)
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] italic text-slate-400">
          Hesap/oturum bilgileri, yönetici kayıtları, arama indeksleri ve paylaşımlı kataloglar yedeğe alınmaz (dosyadaki
          &quot;excluded&quot; listesinde gerekçeleriyle yazılıdır).
        </p>
        {isAndroidApp && (
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-xs font-semibold text-slate-600" role="note">
            Bu çıktı uygulamada desteklenmiyor; tarayıcıdan veya bilgisayardan açın.
          </p>
        )}
        {!isAndroidApp && (
        <button
          type="button"
          onClick={() => {
            void handleBackup();
          }}
          disabled={loading}
          className="no-android-app mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-slate-700 to-slate-900 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {loading ? "Hazırlanıyor…" : "Sistem Yedeği İndir"}
        </button>
        )}
        {progress && <p className="mt-2 text-center text-[11px] text-slate-500">{progress}</p>}
      </div>

      {outcome && (
        <div
          className={`rounded-xl border p-4 ${outcome.complete ? "border-emerald-200 bg-emerald-50/70" : "border-rose-300 bg-rose-50/80"}`}
        >
          <p className={`flex items-center gap-2 text-sm font-bold ${outcome.complete ? "text-emerald-800" : "text-rose-800"}`}>
            {outcome.complete ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {outcome.complete
              ? `Tamlık kontrolü geçti: ${outcome.tables.length} tablonun tamamı eksiksiz okundu (${outcome.totalRows} kayıt).`
              : `Yedek EKSİK: ${incompleteRows.length} tablo tam okunamadı. Dosya indirildi ama bu tablolar için güvenilir değildir.`}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Dosya: {outcome.fileName}</p>
          <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
            {[...incompleteRows, ...outcome.tables.filter((t) => t.complete && t.rows > 0)].map((t) => (
              <div key={t.table} className="flex items-center justify-between gap-3 text-xs">
                <span className={`truncate ${t.complete ? "text-slate-600" : "font-bold text-rose-700"}`}>{t.label}</span>
                <span className={`shrink-0 ${t.complete ? "text-slate-500" : "font-bold text-rose-700"}`}>
                  {t.rows}
                  {t.expected !== null && t.expected !== t.rows ? ` / ${t.expected}` : ""} kayıt
                  {t.error ? ` — ${t.error}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Geri Yükleme ────────────────────────────────────────────────────────────

const STATUS_TEXT: Record<string, { label: string; cls: string }> = {
  COMPLETE: { label: "TAMAMLANDI", cls: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  PARTIAL: { label: "KISMİ", cls: "border-amber-300 bg-amber-50 text-amber-800" },
  FAILED: { label: "BAŞARISIZ", cls: "border-rose-300 bg-rose-50 text-rose-800" },
};

const SKIP_REASON_TEXT: Record<string, string> = {
  unknown_table: "tanınmayan tablo",
  excluded: "yedek kapsamı dışında",
  export_only: "yalnız dışa aktarılır",
  unlicensed: "modül hesabınızda aktif değil",
  membership_inactive: "üyelik aktif değil",
  system_tenant: "sistem kataloğu",
};

function ReportRow({ r }: { r: RestoreTableReport }) {
  const failed = r.failed.reduce((s, f) => s + f.count, 0);
  const bad = r.status === "FAILED" || r.status === "PARTIAL";
  return (
    <div className="rounded-lg border border-slate-100 bg-white/80 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`truncate text-xs ${bad ? "font-bold text-rose-700" : "text-slate-700"}`}>{tableTitle(r.table)}</span>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-700">{r.inserted} eklendi</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600">{r.already_present} zaten vardı</span>
          {r.skipped_unlicensed > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">{r.skipped_unlicensed} lisans dışı</span>
          )}
          {r.parent_missing > 0 && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 font-bold text-rose-700">{r.parent_missing} bağlı kaydı yok</span>
          )}
          {failed > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 font-bold text-rose-700">{failed} başarısız</span>}
        </div>
      </div>
      {r.failed.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {r.failed.map((f) => (
            <li key={f.code} className="text-[11px] text-rose-700">
              {FAILURE_LABELS[f.code] ?? f.code}: {f.count}
            </li>
          ))}
        </ul>
      )}
      {r.dropped_columns.length > 0 && (
        <p className="mt-1 text-[11px] text-amber-700">Tanınmayan alanlar yok sayıldı: {r.dropped_columns.join(", ")}</p>
      )}
      {r.warnings.map((w) => (
        <p key={w} className="mt-1 text-[11px] text-amber-700">
          {w}
        </p>
      ))}
    </div>
  );
}

export function RestoreTab({ user }: { user: YasamUser }) {
  const { showToast } = useToast();
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
        if (!norm.ok) throw new Error(norm.error);
        const b = norm.backup;
        const names = Object.keys(b.tables);
        const rows = names.reduce((s, t) => s + b.tables[t].length, 0);
        const warnings: string[] = [];
        if (b.incompleteTables.length > 0) {
          warnings.push(
            `Bu yedek dosyasında ${b.incompleteTables.length} tablo alındığı sırada EKSİK işaretlenmiş: ` +
              b.incompleteTables.map((x) => TABLE_LABEL[x.table] ?? x.table).join(", "),
          );
        }
        if (b.sourceTenantId && user.tenant_id && b.sourceTenantId !== user.tenant_id) {
          warnings.push(
            "Bu yedek başka bir hesaptan alınmış. Kayıt kimlikleri korunur; kaynak hesapta hâlâ duran kayıtlar 'başka hesapta mevcut' olarak atlanır.",
          );
        }
        setParsedBackup(b);
        setValidated({ ok: true, message: `✓ v${b.version} — ${names.length} tablo, ${rows} kayıt; biçim geçerli.`, warnings });
      } catch (err) {
        // JSON.parse hatası (bozuk / yarım / boş dosya) tarayıcının ham İngilizce metnini gösterir →
        // anlaşılır Türkçe mesaj. normalizeBackupFile'ın kendi (Türkçe) mesajları aynen kalır.
        const message =
          err instanceof SyntaxError
            ? "Dosya geçerli bir JSON yedeği değil (bozuk, yarım kalmış veya boş dosya). Sistem Yedeği sekmesinden alınmış dosyayı seçin."
            : (err as Error).message || "Dosya okunamadı.";
        setValidated({ ok: false, message, warnings: [] });
      }
    };
    reader.onerror = () => {
      setValidated({ ok: false, message: "Dosya okunamadı.", warnings: [] });
    };
    reader.readAsText(file);
  }

  async function handleRestore() {
    if (!parsedBackup || !confirmed || loading) return;
    setLoading(true);
    setResult(null);
    setProgress("Plan hazırlanıyor…");
    try {
      const res = await runRestore(parsedBackup, makeFetcher(user), (p) =>
        setProgress(`Tablo ${p.index}/${p.total}: ${TABLE_LABEL[p.table] ?? p.table} — ${p.sentRows}/${p.totalRows} kayıt`),
      );
      setResult(res);
      showToast({
        title: STATUS_TEXT[res.status].label,
        message:
          res.status === "COMPLETE"
            ? "Eksik kayıtlar eklendi; mevcut kayıtlar değiştirilmedi."
            : "Geri yükleme kısmen tamamlandı; ayrıntılar aşağıda.",
        type: res.status === "COMPLETE" ? "success" : res.status === "PARTIAL" ? "warning" : "error",
        duration: 8000,
      });
    } catch (err) {
      showToast({ message: (err as Error).message || "Geri yükleme başarısız.", type: "error" });
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
        <p className="text-xs font-semibold text-amber-700">
          Yalnız eksik kayıtlar eklenir; mevcut kayıtlar değiştirilmez veya silinmez. İşlem tekrar çalıştırılabilir.
          Hesabınızda aktif olmayan modüllerin kayıtları atlanır. Fotoğraf/dosyalar geri yüklenmez.
          Desteklenen yedek sürümleri: 1.0, 2.0, 2.1, 3.0.
        </p>
      </div>

      <div>
        <label className="block text-sm font-bold text-slate-700">JSON Yedek Dosyası</label>
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
          aria-label="Yedek dosyası seç"
        >
          <Upload className="mb-2 h-8 w-8 text-slate-300" />
          {fileInfo ? (
            <>
              <p className="text-sm font-bold text-slate-700">{fileInfo.name}</p>
              <p className="text-xs text-slate-400">{fileInfo.size}</p>
            </>
          ) : (
            <p className="text-sm text-slate-400">Dosyayı seçmek için tıklayın</p>
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
          <span className="text-xs font-semibold text-amber-800">
            Onaylıyorum: yalnız eksik kayıtlar eklenecek; mevcut kayıtlarım değiştirilmeyecek veya silinmeyecek.
          </span>
        </label>
      )}

      {result && (
        <div className="space-y-3 rounded-xl border border-slate-100 bg-white/80 p-4">
          <div className={`rounded-lg border px-3 py-2 text-sm font-bold ${STATUS_TEXT[result.status].cls}`}>
            Sonuç: {STATUS_TEXT[result.status].label}
            {totals ? ` — ${totals.inserted} kayıt eklendi, ${totals.present} kayıt zaten vardı` : ""}
          </div>
          {result.notes.map((n) => (
            <p key={n} className="text-xs text-amber-800">
              {n}
            </p>
          ))}
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {result.tables
              .filter((r) => r.expected > 0)
              .map((r) => (
                <ReportRow key={r.table} r={r} />
              ))}
          </div>
          {result.skipped.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-bold text-slate-600">Atlanan tablolar</p>
              <ul className="space-y-0.5">
                {result.skipped.map((d) => (
                  <li key={d.table} className="text-[11px] text-slate-500">
                    {TABLE_LABEL[d.table] ?? d.table}: {d.action === "skip" ? SKIP_REASON_TEXT[d.reason] ?? d.reason : ""}
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
        {loading ? "Geri Yükleniyor…" : "Yedeği İçe Aktar"}
      </button>
    </div>
  );
}
