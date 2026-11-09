"use client";

/**
 * Ayarlar › Dışa Aktarım — Premium Word Arşivi (ZIP).
 *
 * Akış: seçim (modüller, danışanlar, tarih aralığı, içerik türleri) → "Arşivi Planla" (sunucu kapsamı ve kapsam
 * dışı kalanları gösterir) → "Arşivi Oluştur" (parça parça indirilir, tarayıcıda ZIP'lenir) → sonuç (başarılı /
 * başarısız / atlanan; eksik arşiv asla "tamamlandı" gösterilmez) → gerekirse "Başarısızları yeniden dene".
 * Word arşivi ≠ JSON Sistem Yedeği: arşiv okunabilir kopyadır, geri yüklenemez (metinde açıkça yazılır).
 */
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Download, FileArchive, Loader2, RotateCcw, Search, X } from "lucide-react";
import { readSessionToken, type YasamUser } from "@/lib/auth/yasamUser";
import { useToast } from "@/components/ui/ToastProvider";
import { triggerBlobDownload } from "@/lib/http/downloadResponse";
import { BACKUP_REGISTRY, EXPORT_MODULE_ORDER, MODULE_LABELS, isExportable, moduleKeyOf } from "@/lib/backup/registry";
import { runArchive, type ArchiveProgress, type ArchiveRunResult, type PartResponse } from "@/lib/archive/client";
import { ARCHIVE_CLIENT_FILTER_MAX, type ArchiveInclude, type ArchiveJob, type ArchiveOptions, type ArchivePlanResponse } from "@/lib/archive/types";

type ClientHit = { id: string; name: string };

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

const STATUS_VIEW: Record<ArchiveRunResult["status"], { title: string; cls: string }> = {
  complete: { title: "Arşiv tamamlandı", cls: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  partial: { title: "Arşiv EKSİK oluşturuldu", cls: "border-amber-300 bg-amber-50 text-amber-900" },
  failed: { title: "Arşiv oluşturulamadı", cls: "border-rose-300 bg-rose-50 text-rose-800" },
  cancelled: { title: "Arşiv iptal edildi", cls: "border-slate-300 bg-slate-50 text-slate-700" },
};

const MB = (n: number) => `${(n / 1_048_576).toFixed(1)} MB`;

export function ArchiveExportTab({ user }: { user: YasamUser }) {
  const { showToast } = useToast();
  const modules = useMemo(
    () =>
      EXPORT_MODULE_ORDER.map((key) => ({
        key,
        label: MODULE_LABELS[key] ?? key,
        tables: BACKUP_REGISTRY.filter((e) => isExportable(e) && moduleKeyOf(e) === key).length,
      })).filter((m) => m.tables > 0),
    [],
  );
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
        showToast({ message: String(r.json.error ?? "Danışanlar okunamadı."), type: "error" });
        return;
      }
      setHits((r.json.clients as ClientHit[]) ?? []);
    } catch {
      showToast({ message: "Bağlantı hatası.", type: "error" });
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
      showToast({ message: "En az bir modül seçin.", type: "warning" });
      return;
    }
    if (clientMode === "some" && picked.length === 0) {
      showToast({ message: "Danışan seçin veya 'Tüm danışanlar'ı işaretleyin.", type: "warning" });
      return;
    }
    setPlanning(true);
    setResult(null);
    try {
      const r = await postJson(user, "/api/settings/archive/plan", { options: options() });
      if (!r.ok) {
        showToast({ message: String(r.json.error ?? "Arşiv planlanamadı."), type: r.status === 413 ? "warning" : "error", duration: 8000 });
        setPlan(null);
        return;
      }
      setPlan(r.json as unknown as ArchivePlanResponse);
    } catch {
      showToast({ message: "Bağlantı hatası.", type: "error" });
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
    setProgress({ done: 0, total: jobs.length, current: "", ok: 0, failed: 0, skipped: 0, records: 0, bytes: 0 });
    const runPlan: ArchivePlanResponse = { ...source, jobs, file_name: suffix ? source.file_name.replace(/\.zip$/, `${suffix}.zip`) : source.file_name };
    try {
      const res = await runArchive(runPlan, {
        signal: ctrl.signal,
        onProgress: setProgress,
        postPart: async (body, signal): Promise<PartResponse> => {
          const r = await fetch("/api/settings/archive/part", { method: "POST", headers: authHeaders(user), body: JSON.stringify(body), signal });
          const isFile = (r.headers.get("Content-Type") ?? "").includes("officedocument");
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
          records: res.counts.records,
          bytes: res.counts.bytes,
          duration_ms: res.durationMs,
        },
      }).catch(() => undefined);
      showToast({
        title: STATUS_VIEW[res.status].title,
        message:
          res.status === "complete"
            ? `${res.counts.files} dosya · ${MB(res.counts.bytes)} indirildi.`
            : `${res.counts.failed} parça alınamadı. Arşiv indirildi; eksikler ARŞİV-RAPORU.txt dosyasında.`,
        type: res.status === "complete" ? "success" : res.status === "partial" ? "warning" : "error",
        duration: 10000,
      });
    } catch (e) {
      showToast({ message: (e as Error)?.message || "Arşiv oluşturulamadı.", type: "error" });
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  const failedJobs = result?.outcomes.filter((o) => o.status === "failed").map((o) => o.job) ?? [];
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
        <p>
          <strong>Premium Word Arşivi</strong> (ZIP): kayıtlarınızın okunabilir Word dökümü, danışan dosyaları ve kayıtlı hazır analiz
          raporlarınız düzenli klasörlerde. Raporlar yeniden hesaplanmaz; kayıtlı hâlleriyle üretilir.
        </p>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 font-medium">
          <li>
            Word arşivi <strong>geri yüklenemez</strong>. Hesaba geri yükleme için <strong>Sistem Yedeği (JSON)</strong> sekmesini kullanın.
          </li>
          <li>Fotoğraf ve ekler isteğe bağlıdır; Word&apos;e gömülmez, ayrı dosya olarak eklenir.</li>
          <li>Eksik kalan parça olursa arşiv &quot;EKSİK&quot; olarak işaretlenir ve ARŞİV-RAPORU.txt dosyasında listelenir.</li>
        </ul>
      </div>

      <section aria-labelledby="arc-modules">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p id="arc-modules" className="text-xs font-bold uppercase tracking-widest text-slate-500">
            1 · Modüller ({selected.size}/{modules.length})
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => { invalidate(); setSelected(new Set(modules.map((m) => m.key))); }} className="min-h-11 rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-bold text-violet-700 disabled:opacity-50">
              Tümünü seç
            </button>
            <button type="button" disabled={busy} onClick={() => { invalidate(); setSelected(new Set()); }} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 disabled:opacity-50">
              Temizle
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <label key={m.key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-slate-100 bg-white/80 px-3 py-2 shadow-sm">
              <input type="checkbox" className="h-5 w-5 shrink-0 accent-violet-600" checked={selected.has(m.key)} disabled={busy} onChange={() => toggleModule(m.key)} aria-label={`${m.label} arşive dahil`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-800">{m.label}</span>
                <span className="block text-[11px] text-slate-400">{m.tables} tablo</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section aria-labelledby="arc-scope" className="space-y-3">
        <p id="arc-scope" className="text-xs font-bold uppercase tracking-widest text-slate-500">2 · Kapsam</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Danışan kapsamı">
          {(["all", "some"] as const).map((mode) => (
            <label key={mode} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-bold ${clientMode === mode ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-600"}`}>
              <input type="radio" name="arc-client-mode" className="h-4 w-4 accent-violet-600" checked={clientMode === mode} disabled={busy} onChange={() => { invalidate(); setClientMode(mode); }} />
              {mode === "all" ? "Tüm danışanlar" : `Seçili danışanlar (en fazla ${ARCHIVE_CLIENT_FILTER_MAX})`}
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
                placeholder="Ad veya soyad ile ara"
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm"
                aria-label="Danışan ara"
                disabled={busy}
              />
              <button type="button" onClick={() => void searchClients()} disabled={busy || searching} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-violet-600 px-3 text-white disabled:opacity-50" aria-label="Ara">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </button>
            </div>
            {hits.length > 0 && (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto" aria-label="Arama sonuçları">
                {hits.map((c) => (
                  <li key={c.id}>
                    <button type="button" disabled={busy || picked.some((p) => p.id === c.id)} onClick={() => pickClient(c)} className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-sm hover:bg-violet-50 disabled:opacity-50">
                      <span className="truncate">{c.name}</span>
                      {picked.some((p) => p.id === c.id) ? <Check className="h-4 w-4 text-emerald-600" /> : <span className="text-xs font-bold text-violet-700">Ekle</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {picked.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Seçili danışanlar">
                {picked.map((c) => (
                  <span key={c.id} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-violet-100 pl-3 text-xs font-bold text-violet-800">
                    {c.name}
                    <button type="button" disabled={busy} onClick={() => { invalidate(); setPicked((p) => p.filter((x) => x.id !== c.id)); }} className="flex h-11 w-11 items-center justify-center rounded-full" aria-label={`${c.name} seçimini kaldır`}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] text-slate-500">Danışan seçildiğinde yalnız danışana bağlı kayıtlar arşive girer; bağsız kayıtlar (katalog, bilgi bankası) kapsam dışı yazılır.</p>
          </div>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-xs font-bold text-slate-600">
            Kayıt tarihi — başlangıç
            <input type="date" value={dateFrom} max={dateTo || undefined} disabled={busy} onChange={(e) => { invalidate(); setDateFrom(e.target.value); }} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Kayıt tarihi — bitiş
            <input type="date" value={dateTo} min={dateFrom || undefined} disabled={busy} onChange={(e) => { invalidate(); setDateTo(e.target.value); }} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
          </label>
          <button type="button" disabled={busy || (!dateFrom && !dateTo)} onClick={() => { invalidate(); setDateFrom(""); setDateTo(""); }} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 disabled:opacity-40">
            Tarihi temizle
          </button>
        </div>
      </section>

      <section aria-labelledby="arc-include" className="space-y-2">
        <p id="arc-include" className="text-xs font-bold uppercase tracking-widest text-slate-500">3 · İçerik</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {inc("data", "Kayıt dökümü (Word)", "Seçili modüllerin tüm kayıtları; büyük modüller bölümlere ayrılır.")}
          {inc("dossiers", "Danışan dosyaları", "Her danışan için Danışan Yolculuğu tam raporu.")}
          {inc("reports", "Hazır analiz raporları", "Kayıtlı HD, HD İlişki, Gökyüzü Atlası ve Numeroloji raporları.")}
          {inc("files", "Fotoğraf ve ekler", "Analiz görselleri, taş fotoğrafları, anamnez PDF'leri, Kişisel Arşiv dosyaları (ayrı dosya).")}
          {inc("sensitive", "Hassas bölümler", "Danışan dosyasına anamnez, beslenme özeti, iç notlar ve ücretlendirme eklenir.")}
        </div>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={() => void makePlan()} disabled={busy} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-violet-300 bg-white text-sm font-black text-violet-800 shadow-sm disabled:opacity-50" data-testid="archive-plan">
          {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}
          {planning ? "Planlanıyor…" : "Arşivi Planla"}
        </button>
        <button type="button" onClick={() => plan && void execute(plan, plan.jobs)} disabled={busy || !plan || plan.jobs.length === 0} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-sm font-black text-white shadow-md disabled:opacity-50" data-testid="archive-run">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {running ? "Arşiv oluşturuluyor…" : "Arşivi Oluştur ve İndir"}
        </button>
      </div>

      {plan && !running && !result && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 text-sm" data-testid="archive-plan-summary">
          <p className="font-black text-violet-900">
            {plan.jobs.length} parça · {totalRecords} kayıt
            {plan.jobs.length === 0 ? " — arşive girecek içerik yok" : ""}
          </p>
          <ul className="mt-2 space-y-0.5 text-xs text-slate-700">
            {plan.summary.filter((s) => s.records > 0).map((s) => (
              <li key={s.module}>{s.label}: {s.records} kayıt</li>
            ))}
            {(["client_dossier", "hd_report", "hd_relation_report", "astro_report", "numerology_record", "file"] as const).map((k) => {
              const n = plan.jobs.filter((j) => j.kind === k).length;
              const label = { client_dossier: "Danışan dosyası", hd_report: "HD raporu", hd_relation_report: "HD İlişki raporu", astro_report: "Gökyüzü Atlası raporu", numerology_record: "Numeroloji raporu", file: "Fotoğraf / ek" }[k];
              return n > 0 ? <li key={k}>{label}: {n}</li> : null;
            })}
          </ul>
          {plan.excluded.length > 0 && (
            <details className="mt-2 text-xs text-slate-600">
              <summary className="min-h-11 cursor-pointer py-2 font-bold">Kapsam dışı kalanlar ({plan.excluded.length})</summary>
              <ul className="space-y-0.5">{plan.excluded.map((e) => <li key={`${e.scope}-${e.reason}`}>• {e.scope}: {e.reason}</li>)}</ul>
            </details>
          )}
          {plan.warnings.map((w) => (
            <p key={w} className="mt-1 text-xs font-semibold text-amber-800">{w}</p>
          ))}
        </div>
      )}

      {running && progress && (
        <div className="rounded-xl border border-slate-200 bg-white p-4" role="status" aria-live="polite" data-testid="archive-progress">
          <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-700">
            <span>{progress.done} / {progress.total} parça · %{pct}</span>
            <span>{MB(progress.bytes)}</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 truncate text-[11px] text-slate-500">{progress.current}</p>
          <p className="mt-1 text-[11px] text-slate-600">Başarılı {progress.ok} · Başarısız {progress.failed} · Atlanan {progress.skipped} · {progress.records} kayıt</p>
          <button type="button" onClick={() => abortRef.current?.abort()} className="mt-3 min-h-11 w-full rounded-lg border border-rose-200 bg-rose-50 text-sm font-bold text-rose-700">
            İptal et
          </button>
        </div>
      )}

      {result && (
        <div className={`rounded-xl border p-4 ${STATUS_VIEW[result.status].cls}`} data-testid="archive-result">
          <p className="flex items-center gap-2 text-sm font-black">
            {result.status === "complete" ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {STATUS_VIEW[result.status].title}
          </p>
          <p className="mt-1 text-xs">
            Başarılı {result.counts.ok} · Başarısız {result.counts.failed} · Atlanan {result.counts.skipped} · {result.counts.records} kayıt · {result.counts.files} dosya · {MB(result.counts.bytes)}
          </p>
          {result.outcomes.filter((o) => o.status !== "ok").length > 0 && (
            <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto text-[11px]">
              {result.outcomes.filter((o) => o.status !== "ok").map((o, i) => (
                <li key={`${o.job.kind}-${i}`}>
                  <strong>{o.status === "failed" ? "Başarısız" : "Atlandı"}:</strong> {o.job.label} — {o.message}
                </li>
              ))}
            </ul>
          )}
          {failedJobs.length > 0 && plan && (
            <button type="button" onClick={() => void execute(plan, failedJobs, "-ek")} disabled={busy} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-white/80 text-sm font-bold text-slate-800 shadow-sm disabled:opacity-50">
              <RotateCcw className="h-4 w-4" /> Başarısız {failedJobs.length} parçayı yeniden dene (ek arşiv)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
