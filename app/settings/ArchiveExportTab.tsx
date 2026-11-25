"use client";

/**
 * Ayarlar › Dışa Aktarım — Premium Word Arşivi (ZIP).
 *
 * Akış: seçim (modüller, danışanlar, tarih aralığı, içerik türleri) → "Arşivi Planla" (sunucu kapsamı ve kapsam
 * dışı kalanları gösterir) → "Arşivi Oluştur" (parça parça indirilir, tarayıcıda ZIP'lenir) → sonuç (başarılı /
 * başarısız / atlanan; eksik arşiv asla "tamamlandı" gösterilmez) → gerekirse "Başarısızları yeniden dene".
 * Word arşivi ≠ JSON Sistem Yedeği: arşiv okunabilir kopyadır, geri yüklenemez (metinde açıkça yazılır).
 *
 * I18N: ekran metinleri `settings.backup.archive.*`. Arşivin İÇERİĞİ (Word, klasör adları, BENİOKU.txt, ARŞİV-RAPORU.txt)
 * Türkçe kalır; plan / iş metinleri kaynak dilde birebir, diğer dillerde dil-bağımsız kodlardan (./backupI18n).
 */
import { useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Check, Download, FileArchive, Loader2, RotateCcw, Search, X } from "lucide-react";
import { readSessionToken, type YasamUser } from "@/lib/auth/yasamUser";
import { useToast } from "@/components/ui/ToastProvider";
import { triggerBlobDownload } from "@/lib/http/downloadResponse";
import { BACKUP_REGISTRY, EXPORT_MODULE_ORDER, isExportable, moduleKeyOf } from "@/lib/backup/registry";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import {
  archiveApiError,
  archiveJobLabel,
  archiveJobMessage,
  archiveNote,
  archiveWarnings,
  moduleLabel,
  type BackupTranslator,
} from "./backupI18n";
import { runArchive, type ArchiveProgress, type ArchiveRunResult, type PartResponse } from "@/lib/archive/client";
import { ARCHIVE_CLIENT_FILTER_MAX, type ArchiveInclude, type ArchiveJob, type ArchiveOptions, type ArchivePlanResponse } from "@/lib/archive/types";

type ClientHit = { id: string; name: string; unnamed?: boolean };

function authHeaders(user: YasamUser): Record<string, string> {
  const token = readSessionToken();
  return { "x-user-id": user.id, ...(token ? { "x-session-token": token } : {}), "Content-Type": "application/json" };
}

async function postJson(user: YasamUser, url: string, body: unknown): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const res = await fetch(url, { method: "POST", headers: authHeaders(user), body: JSON.stringify(body) });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* gövde yok */
  }
  return { ok: res.ok, status: res.status, json };
}

/** Durum sınıfları; başlık `settings.backup.archive.status.<durum>` (durum kodu dil-bağımsız). */
const STATUS_CLS: Record<ArchiveRunResult["status"], string> = {
  complete: "border-emerald-200 bg-emerald-50 text-emerald-800",
  partial: "border-amber-300 bg-amber-50 text-amber-900",
  failed: "border-rose-300 bg-rose-50 text-rose-800",
  cancelled: "border-slate-300 bg-slate-50 text-slate-700",
};

const MB = (n: number) => `${(n / 1_048_576).toFixed(1)} MB`;

export function ArchiveExportTab({ user }: { user: YasamUser }) {
  const { showToast } = useToast();
  const t = useTranslations("settings.backup") as unknown as BackupTranslator;
  const isSource = useLocale() === DEFAULT_LOCALE;
  const modules = useMemo(
    () =>
      EXPORT_MODULE_ORDER.map((key) => ({
        key,
        label: moduleLabel(t, key),
        tables: BACKUP_REGISTRY.filter((e) => isExportable(e) && moduleKeyOf(e) === key).length,
      })).filter((m) => m.tables > 0),
    [t],
  );
  const hitName = (c: ClientHit) => (c.unnamed && !isSource ? t("archive.unnamedClient") : c.name);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(modules.map((m) => m.key)));
  const [clientMode, setClientMode] = useState<"all" | "some">("all");
  const [picked, setPicked] = useState<ClientHit[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ClientHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [include, setInclude] = useState<ArchiveInclude>({ data: true, dossiers: true, reports: true, files: false, sensitive: false });
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<ArchivePlanResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ArchiveProgress | null>(null);
  const [result, setResult] = useState<ArchiveRunResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const busy = planning || running;
  const options = (): ArchiveOptions => ({
    modules: [...selected],
    clientIds: clientMode === "some" ? picked.map((c) => c.id) : null,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    include,
  });
  const invalidate = () => {
    setPlan(null);
    setResult(null);
  };

  function toggleModule(key: string) {
    invalidate();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function searchClients() {
    if (searching) return;
    setSearching(true);
    try {
      const r = await postJson(user, "/api/settings/archive/clients", { q: query });
      if (!r.ok) {
        showToast({ message: archiveApiError(t, isSource, r, "archive.toast.clientsFailed"), type: "error" });
        return;
      }
      setHits((r.json.clients as ClientHit[]) ?? []);
    } catch {
      showToast({ message: t("archive.toast.connection"), type: "error" });
    } finally {
      setSearching(false);
    }
  }

  function pickClient(c: ClientHit) {
    invalidate();
    setPicked((prev) => (prev.some((x) => x.id === c.id) || prev.length >= ARCHIVE_CLIENT_FILTER_MAX ? prev : [...prev, c]));
  }

  async function makePlan() {
    if (busy) return;
    if (selected.size === 0) {
      showToast({ message: t("archive.toast.pickModule"), type: "warning" });
      return;
    }
    if (clientMode === "some" && picked.length === 0) {
      showToast({ message: t("archive.toast.pickClient"), type: "warning" });
      return;
    }
    setPlanning(true);
    setResult(null);
    try {
      const r = await postJson(user, "/api/settings/archive/plan", { options: options() });
      if (!r.ok) {
        showToast({ message: archiveApiError(t, isSource, r, "archive.toast.planFailed"), type: r.status === 413 ? "warning" : "error", duration: 8000 });
        setPlan(null);
        return;
      }
      setPlan(r.json as unknown as ArchivePlanResponse);
    } catch {
      showToast({ message: t("archive.toast.connection"), type: "error" });
    } finally {
      setPlanning(false);
    }
  }

  async function execute(source: ArchivePlanResponse, jobs: ArchiveJob[], suffix = "") {
    if (running) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    setResult(null);
    setProgress({ done: 0, total: jobs.length, current: "", ok: 0, failed: 0, skipped: 0, empty: 0, records: 0, bytes: 0 });
    const runPlan: ArchivePlanResponse = { ...source, jobs, file_name: suffix ? source.file_name.replace(/\.zip$/, `${suffix}.zip`) : source.file_name };
    try {
      const res = await runArchive(runPlan, {
        signal: ctrl.signal,
        onProgress: setProgress,
        // Büyük arşiv: her cilt (≈1,5 GB) dolunca hemen indirilir → tarayıcı belleği ve 4 GB ZIP sınırı aşılmaz.
        onVolume: (v) => triggerBlobDownload(new Blob(v.parts as BlobPart[], { type: "application/zip" }), v.fileName),
        postPart: async (body, signal): Promise<PartResponse> => {
          const r = await fetch("/api/settings/archive/part", { method: "POST", headers: authHeaders(user), body: JSON.stringify(body), signal });
          const isFile = r.ok && r.headers.has("X-Archive-File-Name");
          return {
            status: r.status,
            isFile,
            header: (n) => r.headers.get(n),
            json: async () => (await r.json()) as unknown,
            bytes: async () => new Uint8Array(await r.arrayBuffer()),
          };
        },
        getFile: async (url, signal) => {
          const r = await fetch(url, { signal, credentials: "omit", cache: "no-store" });
          // i18n-ignore: Türkçe mesaj ARŞİV-RAPORU.txt'ye yazılır (dosya içeriği Türkçe kalır); ekran message_code'u kullanır.
          if (!r.ok) throw new Error(`Dosya indirilemedi (${r.status}).`);
          return new Uint8Array(await r.arrayBuffer());
        },
      });
      triggerBlobDownload(new Blob(res.parts as BlobPart[], { type: "application/zip" }), res.fileName);
      setResult(res);
      void postJson(user, "/api/settings/archive/audit", {
        archive_id: source.archive_id,
        result: {
          status: res.status,
          ok: res.counts.ok,
          failed: res.counts.failed,
          skipped: res.counts.skipped,
          empty: res.counts.empty,
          records: res.counts.records,
          bytes: res.counts.bytes,
          duration_ms: res.durationMs,
        },
      }).catch(() => undefined);
      showToast({
        title: t(`archive.status.${res.status}`),
        message:
          res.status === "complete"
            ? t("archive.toast.complete", {
                files: String(res.counts.files),
                size: MB(res.counts.bytes),
                volumes: res.volumes > 1 ? t("archive.toast.volumes", { n: String(res.volumes) }) : "",
              })
            : t("archive.toast.partial", { count: res.counts.failed, n: String(res.counts.failed) }),
        type: res.status === "complete" ? "success" : res.status === "partial" ? "warning" : "error",
        duration: 10000,
      });
    } catch (e) {
      showToast({ message: (isSource ? (e as Error)?.message : "") || t("archive.toast.failed"), type: "error" });
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  const failedJobs = result?.outcomes.filter((o) => o.status === "failed").map((o) => o.job) ?? [];
  // İlerleme satırı: lib/archive/client `current` = iş etiketi (Türkçe; ARŞİV-RAPORU ile aynı). Kaynak dil dışında
  // plandaki aynı etiketli işin dil-bağımsız `display` kodundan gösterilir.
  const currentLabel = (label: string): string => {
    if (isSource || !label) return label;
    const job = plan?.jobs.find((j) => j.label === label);
    return job ? archiveJobLabel(t, isSource, job) : t("archive.jobs.generic");
  };
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const totalRecords = plan?.summary.reduce((s, m) => s + m.records, 0) ?? 0;

  const inc = (key: keyof ArchiveInclude, label: string, hint: string) => (
    <label key={key} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-slate-100 bg-white/80 px-3 py-2.5">
      <input
        type="checkbox"
        className="mt-0.5 h-5 w-5 shrink-0 accent-violet-600"
        checked={include[key]}
        disabled={busy || (key === "sensitive" && !include.dossiers)}
        onChange={(e) => {
          invalidate();
          setInclude((p) => ({ ...p, [key]: e.target.checked }));
        }}
      />
      <span className="min-w-0">
        <span className="block text-sm font-bold text-slate-800">{label}</span>
        <span className="block text-[11px] text-slate-500">{hint}</span>
      </span>
    </label>
  );

  return (
    <div className="space-y-5" data-testid="archive-export">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-xs font-semibold text-emerald-900">
        <p>{t.rich("archive.intro", { strong: (c) => <strong>{c}</strong> })}</p>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 font-medium">
          <li>{t.rich("archive.intro1", { strong: (c) => <strong>{c}</strong> })}</li>
          <li>{t("archive.intro2")}</li>
          <li>{t("archive.intro3")}</li>
          {/* Kaynak dil dışında: arşiv dosyalarının dili dürüstçe belirtilir (Kayıt Dökümü Word içeriği ekran dilinde; yol adları / BENİOKU / ARŞİV-RAPORU bu fazda Türkçe). */}
          {!isSource && <li>{t("archive.contentLanguage")}</li>}
        </ul>
      </div>

      <section aria-labelledby="arc-modules">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p id="arc-modules" className="text-xs font-bold uppercase tracking-widest text-slate-500">
            {t("archive.modulesHeading", { selected: String(selected.size), total: String(modules.length) })}
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => { invalidate(); setSelected(new Set(modules.map((m) => m.key))); }} className="min-h-11 rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-bold text-violet-700 disabled:opacity-50">
              {t("archive.selectAll")}
            </button>
            <button type="button" disabled={busy} onClick={() => { invalidate(); setSelected(new Set()); }} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 disabled:opacity-50">
              {t("archive.clear")}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <label key={m.key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-slate-100 bg-white/80 px-3 py-2 shadow-sm">
              <input type="checkbox" className="h-5 w-5 shrink-0 accent-violet-600" checked={selected.has(m.key)} disabled={busy} onChange={() => toggleModule(m.key)} aria-label={t("archive.moduleAria", { label: m.label })} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-800">{m.label}</span>
                <span className="block text-[11px] text-slate-400">{t("archive.moduleTables", { count: m.tables, n: String(m.tables) })}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section aria-labelledby="arc-scope" className="space-y-3">
        <p id="arc-scope" className="text-xs font-bold uppercase tracking-widest text-slate-500">{t("archive.scopeHeading")}</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("archive.clientScopeAria")}>
          {(["all", "some"] as const).map((mode) => (
            <label key={mode} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-bold ${clientMode === mode ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600"}`}>
              <input type="radio" name="arc-client-mode" className="h-4 w-4 accent-violet-600" checked={clientMode === mode} disabled={busy} onChange={() => { invalidate(); setClientMode(mode); }} />
              {mode === "all" ? t("archive.allClients") : t("archive.someClients", { max: String(ARCHIVE_CLIENT_FILTER_MAX) })}
            </label>
          ))}
        </div>
        {clientMode === "some" && (
          <div className="rounded-xl border border-slate-100 bg-white/80 p-3">
            <div className="flex gap-2">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void searchClients();
                  }
                }}
                placeholder={t("archive.searchPlaceholder")}
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm"
                aria-label={t("archive.searchAria")}
                disabled={busy}
              />
              <button type="button" onClick={() => void searchClients()} disabled={busy || searching} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-violet-600 px-3 text-white disabled:opacity-50" aria-label={t("archive.searchButton")}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </button>
            </div>
            {hits.length > 0 && (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto" aria-label={t("archive.resultsAria")}>
                {hits.map((c) => (
                  <li key={c.id}>
                    <button type="button" disabled={busy || picked.some((p) => p.id === c.id)} onClick={() => pickClient(c)} className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-sm hover:bg-violet-50 disabled:opacity-50">
                      <span className="truncate">{hitName(c)}</span>
                      {picked.some((p) => p.id === c.id) ? <Check className="h-4 w-4 text-emerald-600" /> : <span className="text-xs font-bold text-violet-700">{t("archive.add")}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {picked.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5" aria-label={t("archive.pickedAria")}>
                {picked.map((c) => (
                  <span key={c.id} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-violet-100 pl-3 text-xs font-bold text-violet-800">
                    {hitName(c)}
                    <button type="button" disabled={busy} onClick={() => { invalidate(); setPicked((p) => p.filter((x) => x.id !== c.id)); }} className="flex h-11 w-11 items-center justify-center rounded-full" aria-label={t("archive.removeAria", { name: hitName(c) })}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] text-slate-500">{t("archive.clientHint")}</p>
          </div>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-xs font-bold text-slate-600">
            {t("archive.dateFrom")}
            <input type="date" value={dateFrom} max={dateTo || undefined} disabled={busy} onChange={(e) => { invalidate(); setDateFrom(e.target.value); }} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="text-xs font-bold text-slate-600">
            {t("archive.dateTo")}
            <input type="date" value={dateTo} min={dateFrom || undefined} disabled={busy} onChange={(e) => { invalidate(); setDateTo(e.target.value); }} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <button type="button" disabled={busy || (!dateFrom && !dateTo)} onClick={() => { invalidate(); setDateFrom(""); setDateTo(""); }} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 disabled:opacity-40">
            {t("archive.clearDate")}
          </button>
        </div>
      </section>

      <section aria-labelledby="arc-include" className="space-y-2">
        <p id="arc-include" className="text-xs font-bold uppercase tracking-widest text-slate-500">{t("archive.contentHeading")}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(["data", "dossiers", "reports", "files", "sensitive"] as const).map((k) => inc(k, t(`archive.include.${k}`), t(`archive.include.${k}Hint`)))}
        </div>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={() => void makePlan()} disabled={busy} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-violet-300 bg-white text-sm font-black text-violet-800 shadow-sm disabled:opacity-50" data-testid="archive-plan">
          {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}
          {planning ? t("archive.planning") : t("archive.plan")}
        </button>
        <button type="button" onClick={() => plan && void execute(plan, plan.jobs)} disabled={busy || !plan || plan.jobs.length === 0} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-sm font-black text-white shadow-md disabled:opacity-50" data-testid="archive-run">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {running ? t("archive.running") : t("archive.run")}
        </button>
      </div>

      {plan && !running && !result && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 text-sm" data-testid="archive-plan-summary">
          <p className="font-black text-violet-900">
            {t("archive.planSummary", { jobs: String(plan.jobs.length), records: String(totalRecords) })}
            {plan.jobs.length === 0 ? t("archive.planEmpty") : ""}
          </p>
          <ul className="mt-2 space-y-0.5 text-xs text-slate-700">
            {plan.summary.filter((s) => s.records > 0).map((s) => (
              <li key={s.module}>{t("archive.summaryLine", { label: isSource ? s.label : moduleLabel(t, s.module), records: String(s.records) })}</li>
            ))}
            {(["client_dossier", "hd_report", "hd_relation_report", "astro_report", "numerology_record", "file", "media"] as const).map((k) => {
              const n = plan.jobs.filter((j) => j.kind === k).length;
              return n > 0 ? <li key={k}>{t(`archive.kind.${k}`)}: {n}</li> : null;
            })}
          </ul>
          {plan.excluded.length > 0 && (
            <details className="mt-2 text-xs text-slate-600">
              <summary className="min-h-11 cursor-pointer py-2 font-bold">{t("archive.excludedTitle", { n: String(plan.excluded.length) })}</summary>
              <ul className="space-y-0.5">
                {plan.excluded.map((e) => (
                  <li key={`${e.scope}-${e.reason}`}>{t("archive.noteLine", archiveNote(t, isSource, e))}</li>
                ))}
              </ul>
            </details>
          )}
          {(plan.preferences ?? []).length > 0 && (
            <details className="mt-2 text-xs text-slate-600" data-testid="archive-preferences">
              <summary className="min-h-11 cursor-pointer py-2 font-bold">{t("archive.preferencesTitle", { n: String((plan.preferences ?? []).length) })}</summary>
              <ul className="space-y-0.5">
                {(plan.preferences ?? []).map((e) => (
                  <li key={e.scope}>{t("archive.noteLine", archiveNote(t, isSource, e))}</li>
                ))}
              </ul>
            </details>
          )}
          {(plan.restricted ?? []).length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900" data-testid="archive-restricted">
              <p className="font-bold">{t("archive.restrictedTitle")}</p>
              <ul className="mt-1 space-y-0.5">
                {(plan.restricted ?? []).map((e) => (
                  <li key={e.scope}>{t("archive.noteLine", archiveNote(t, isSource, e))}</li>
                ))}
              </ul>
            </div>
          )}
          {archiveWarnings(t, isSource, plan.warnings, plan.warning_codes).map((w) => (
            <p key={w} className="mt-1 text-xs font-semibold text-amber-800">{w}</p>
          ))}
        </div>
      )}

      {running && progress && (
        <div className="rounded-xl border border-slate-200 bg-white p-4" role="status" aria-live="polite" data-testid="archive-progress">
          <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-700">
            <span>{t("archive.progressLine", { done: String(progress.done), total: String(progress.total), pct: String(pct) })}</span>
            <span>{MB(progress.bytes)}</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 truncate text-[11px] text-slate-500">{currentLabel(progress.current)}</p>
          <p className="mt-1 text-[11px] text-slate-600">
            {t("archive.progressCounts", {
              ok: String(progress.ok),
              failed: String(progress.failed),
              skipped: String(progress.skipped),
              empty: String(progress.empty),
              records: String(progress.records),
            })}
          </p>
          <button type="button" onClick={() => abortRef.current?.abort()} className="mt-3 min-h-11 w-full rounded-lg border border-rose-200 bg-rose-50 text-sm font-bold text-rose-700">
            {t("archive.cancel")}
          </button>
        </div>
      )}

      {result && (
        <div className={`rounded-xl border p-4 ${STATUS_CLS[result.status]}`} data-testid="archive-result">
          <p className="flex items-center gap-2 text-sm font-black">
            {result.status === "complete" ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {t(`archive.status.${result.status}`)}
          </p>
          <p className="mt-1 text-xs">
            {t("archive.resultCounts", {
              ok: String(result.counts.ok),
              failed: String(result.counts.failed),
              skipped: String(result.counts.skipped),
              empty: String(result.counts.empty),
              records: String(result.counts.records),
              files: String(result.counts.files),
              size: MB(result.counts.bytes),
            })}
          </p>
          {result.outcomes.filter((o) => o.status === "failed" || o.status === "skipped").length > 0 && (
            <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto text-[11px]">
              {result.outcomes.filter((o) => o.status === "failed" || o.status === "skipped").map((o, i) => (
                <li key={`${o.job.kind}-${i}`}>
                  <strong>{o.status === "failed" ? t("archive.outcomeFailed") : t("archive.outcomeSkipped")}:</strong>{" "}
                  {archiveJobLabel(t, isSource, o.job)} — {archiveJobMessage(t, isSource, o.message, o.message_code)}
                </li>
              ))}
            </ul>
          )}
          {result.counts.empty > 0 && (
            <p className="mt-2 text-[11px] text-slate-600" data-testid="archive-empty-note">
              {t("archive.emptyNote", { count: result.counts.empty, n: String(result.counts.empty) })}
            </p>
          )}
          {failedJobs.length > 0 && plan && (
            <button type="button" onClick={() => void execute(plan, failedJobs, "-ek")} disabled={busy} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-white/80 text-sm font-bold text-slate-800 shadow-sm disabled:opacity-50">
              <RotateCcw className="h-4 w-4" /> {t("archive.retry", { count: failedJobs.length, n: String(failedJobs.length) })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
