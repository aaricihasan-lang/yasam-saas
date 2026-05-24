"use client";

import { useCallback, useMemo, useState, type ChangeEvent } from "react";
import { HeartPulse, Loader2, Upload } from "lucide-react";
import { useAdminSourceTenant } from "@/components/admin/AdminSourceTenantContext";
import { useToast } from "@/components/ui/ToastProvider";
import { ADMIN_SOURCE_TENANT_MISSING_MESSAGE } from "@/lib/admin/adminSourceTenant";
import {
  buildHealingGuideImportPlan,
  fetchExistingHealingGuideNameKeys,
  HEALING_GUIDE_FAILED_PREVIEW_LIMIT,
  HEALING_GUIDE_PREVIEW_LIMIT,
  HEALING_GUIDE_SECTION_TYPES,
  importHealingGuideDrafts,
  type HealingGuideImportPlan,
  type HealingGuideImportReport,
} from "@/lib/admin/healingGuideJsonImport";

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-violet-200/80 bg-white/95 px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-700/90">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

const SECTION_TYPE_LABELS: Record<string, string> = {
  reasons: "Nedenler",
  applications: "Uygulamalar",
  herbal: "Bitkisel (eski)",
  stones_details: "Taş Detayları",
  islamic_suggestions: "İslami Öneriler",
  supportive: "Destekleyici",
};

export function HealingGuideJsonTab() {
  const { tenantId, error: tenantError } = useAdminSourceTenant();
  const { showToast } = useToast();

  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [plan, setPlan] = useState<HealingGuideImportPlan | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importPhase, setImportPhase] = useState("");
  const [importReport, setImportReport] = useState<HealingGuideImportReport | null>(null);

  const infoTypeCount = useMemo(() => {
    if (!plan) return 0;
    return HEALING_GUIDE_SECTION_TYPES.filter(
      (type) => plan.stats.sectionTypeCounts[type] > 0,
    ).length;
  }, [plan]);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setParseError(null);
    setPlan(null);
    setFileName(null);
    setImportReport(null);
    setImportProgress(0);
    setImportTotal(0);
    setImportPhase("");

    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        const text = typeof reader.result === "string" ? reader.result : "";
        setParsing(true);
        const { plan: nextPlan, error } = await buildHealingGuideImportPlan(text);
        setParsing(false);
        setFileName(file.name);
        if (error || !nextPlan) {
          setParseError(error ?? "JSON işlenemedi.");
          setPlan(null);
          return;
        }
        setPlan(nextPlan);
      })();
    };
    reader.onerror = () => {
      setParseError("Dosya okunamadı.");
      setFileName(file.name);
    };
    reader.readAsText(file, "utf-8");
    event.target.value = "";
  }, []);

  const handleFullImport = useCallback(async () => {
    if (!tenantId) {
      setParseError(tenantError ?? ADMIN_SOURCE_TENANT_MISSING_MESSAGE);
      return;
    }
    if (!plan || plan.drafts.length === 0) {
      setParseError("Aktarılacak kayıt bulunamadı.");
      return;
    }

    setImporting(true);
    setImportReport(null);
    setParseError(null);
    setImportProgress(0);
    setImportTotal(plan.drafts.length);
    setImportPhase("Mevcut kayıtlar kontrol ediliyor…");

    const existingKeys = await fetchExistingHealingGuideNameKeys(tenantId);

    const report = await importHealingGuideDrafts(
      plan.drafts,
      tenantId,
      existingKeys,
      (progress) => {
        setImportProgress(progress.processed);
        setImportTotal(progress.total);
        setImportPhase(progress.phase);
      },
    );

    setImporting(false);
    setImportReport(report);

    if (report.failedCount === 0 && report.successCount > 0) {
      showToast({
        type: "success",
        message: `${report.successCount} hastalık kaydı ve alt içerikleri yüklendi.${
          report.duplicateSkipped > 0
            ? ` ${report.duplicateSkipped} kayıt zaten vardı (atlandı).`
            : ""
        }`,
      });
    } else if (report.successCount > 0) {
      showToast({
        type: "warning",
        message: `${report.successCount} başarılı, ${report.failedCount} başarısız.${
          report.duplicateSkipped > 0 ? ` ${report.duplicateSkipped} mükerrer atlandı.` : ""
        }`,
      });
    } else if (report.duplicateSkipped > 0 && report.failedCount === 0) {
      showToast({
        type: "warning",
        message: `Tüm kayıtlar zaten mevcut (${report.duplicateSkipped} mükerrer).`,
      });
    } else {
      const detail = report.failures[0]?.message;
      showToast({
        type: "error",
        message: detail
          ? `Hiçbir kayıt yüklenemedi: ${detail}`
          : "Hiçbir kayıt healing_guides tablosuna yazılamadı.",
      });
    }
  }, [plan, showToast, tenantError, tenantId]);

  return (
    <section
      className="rounded-3xl border-2 border-violet-200/80 bg-gradient-to-br from-violet-50/50 via-white to-cyan-50/45 p-6 shadow-xl sm:p-8"
      aria-label="Şifa Rehberi JSON sekmesi"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-slate-900 sm:text-2xl">
            <HeartPulse className="h-6 w-6 text-violet-700" aria-hidden />
            Şifa Rehberi JSON
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-medium text-slate-600 sm:text-base">
            Hastalık / şikayet bazlı JSON dosyasını seçin; kayıtlar{" "}
            <span className="font-mono text-violet-800">healing_guides</span> ve alt içerikler{" "}
            <span className="font-mono text-violet-800">healing_guide_sections</span> tablolarına
            aktarılır.
          </p>
          <p className="mt-3 max-w-2xl rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs font-semibold text-amber-950">
            Mükerrer kontrol: aynı tenant içinde aynı hastalık adı varsa atlanır. Destekleyici alt
            alanlar ayrı section olarak normalize edilir.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-violet-300 bg-white px-5 py-3 text-sm font-bold text-violet-950 shadow-md transition hover:scale-[1.02] hover:border-violet-400">
            <Upload className="h-5 w-5" aria-hidden />
            JSON dosyası seç
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={handleFileChange}
              disabled={importing || parsing}
            />
          </label>
          {plan && plan.drafts.length > 0 ? (
            <button
              type="button"
              disabled={importing || parsing}
              onClick={() => void handleFullImport()}
              className="inline-flex items-center gap-2 rounded-2xl border-2 border-cyan-400 bg-gradient-to-r from-violet-600 to-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Yükleniyor...
                </>
              ) : (
                "Tamamını Yükle"
              )}
            </button>
          ) : null}
        </div>
      </div>

      {fileName ? (
        <p className="mt-4 text-sm font-semibold text-slate-700">
          Dosya: <span className="font-mono text-violet-900">{fileName}</span>
          {plan ? (
            <span className="ml-2 text-violet-700">
              · {plan.stats.totalDiseases} hastalık · {plan.stats.totalSections} alt içerik
            </span>
          ) : null}
        </p>
      ) : null}

      {parsing ? (
        <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-violet-800">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          JSON ayrıştırılıyor (büyük dosyalarda kısa süre bekleyin)…
        </p>
      ) : null}

      {parseError ? (
        <p
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900"
          role="alert"
        >
          {parseError}
        </p>
      ) : null}

      {importing ? (
        <div className="mt-6 rounded-2xl border border-violet-200 bg-violet-50/80 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-violet-950">
            <span>{importPhase || "Aktarılıyor…"}</span>
            <span>
              {importProgress}/{importTotal}
            </span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-violet-200/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-600 to-cyan-500 transition-all duration-300"
              style={{
                width: importTotal > 0 ? `${(importProgress / importTotal) * 100}%` : "0%",
              }}
            />
          </div>
        </div>
      ) : null}

      {plan ? (
        <div className="mt-8 space-y-8">
          <div>
            <h3 className="text-lg font-black text-slate-900">Özet</h3>
            <p className="mt-1 text-sm text-slate-600">JSON dosyasından okunan istatistikler.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatBox label="Toplam Hastalık" value={plan.stats.totalDiseases} />
              <StatBox label="Toplam Alt İçerik" value={plan.stats.totalSections} />
              <StatBox label="Bilgi Tipleri" value={infoTypeCount} />
              <StatBox label="Dosya içi mükerrer" value={plan.stats.duplicateInFile} />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-black text-slate-900">Bilgi tipi dağılımı</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {HEALING_GUIDE_SECTION_TYPES.map((type) => (
                <span
                  key={type}
                  className="inline-flex rounded-full border border-cyan-200/90 bg-cyan-50/90 px-3 py-1.5 text-xs font-bold text-cyan-950"
                >
                  {SECTION_TYPE_LABELS[type] ?? type}: {plan.stats.sectionTypeCounts[type]}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-black text-slate-900">Önizleme</h3>
            <p className="mt-1 text-sm text-slate-600">
              İlk {HEALING_GUIDE_PREVIEW_LIMIT} hastalık kaydı.
            </p>
            <div className="mt-4 space-y-3">
              {plan.preview.map((row, index) => (
                <div
                  key={`${row.name}-${index}`}
                  className="rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 shadow-sm"
                >
                  <p className="text-sm font-black text-slate-900">{row.name}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    {row.category ?? "Kategori yok"} · {row.sectionCount} alt içerik
                  </p>
                  <p className="mt-2 text-xs font-semibold text-violet-800">
                    {row.sectionTypes.join(", ") || "—"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {importReport ? (
        <div className="mt-8 rounded-2xl border border-violet-200 bg-violet-50/90 p-5">
          <h3 className="text-lg font-black text-violet-950">Yükleme raporu</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatBox label="Başarılı" value={importReport.successCount} />
            <StatBox label="Başarısız" value={importReport.failedCount} />
            <StatBox label="Mükerrer (atlandı)" value={importReport.duplicateSkipped} />
            <StatBox label="Toplam işlenen" value={importReport.totalProcessed} />
          </div>
          {importReport.failures.length > 0 ? (
            <div className="mt-5">
              <p className="text-sm font-black text-rose-950">
                Başarısız kayıtlar (en fazla {HEALING_GUIDE_FAILED_PREVIEW_LIMIT})
              </p>
              <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
                {importReport.failures.map((row, index) => (
                  <li
                    key={`${row.name}-${index}`}
                    className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs"
                  >
                    <span className="font-bold text-rose-950">{row.name}</span>
                    <span className="mt-1 block font-medium text-rose-800">{row.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
