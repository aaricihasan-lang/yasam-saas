"use client";

/**
 * Astroloji Çalışma Merkezi — AŞAMA 3 (OWNER-ONLY, satış sonrası pilot).
 *
 * Bu sayfa yalnız owner'a render edilir (layout.tsx: kill switch + katı owner → aksi notFound).
 * Veri yetkisi her API çağrısında sunucuda yeniden verilir (requireAstrologyOwner).
 *
 * Akış: Doğum profili → teknik(ler) seç (yalnız seçilenlerin parametreleri) → SUNUCU planı
 *       (X hesap → Y yeni Roxy isteği → Z kayıtlı sonuç; engellenenler nedeniyle) → Hesapla →
 *       sonuç sekmeleri (her teknik kendi görünümüyle) → Bilgi Bankam → Uzman notlarım → Analizi Kaydet.
 * Owner önizlemesi: "Roxy Yorumu Kapalıymış Gibi Gör" → sunucu yorum içeriğini yanıta hiç koymaz;
 * önizleme değişince sonuçlar YALNIZ-ÖNBELLEK ucundan yeniden okunur (0 sağlayıcı isteği).
 *
 * Bayat veri koruması: plan / sonuç / etkin sekme BAĞLAM ANAHTARIYLA (profil|revizyon) ve çalıştırma
 * sırasıyla saklanır; geç gelen yanıt başka profilin / daha yeni bir çalıştırmanın üstüne YAZILMAZ.
 * Çalışma alanı seçimi formdan değil, GÖSTERİLEN sonucun kendi normalize seçeneklerinden kurulur.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { HouseSystem, NodeType } from "@/lib/astrology/model/western";
import type { TechniqueView } from "@/lib/astrology/view/techniqueView";
import { HOUSE_SYSTEM_LABELS, NODE_TYPE_LABELS } from "@/lib/astrology/labels/tr";
import { astroFetch, readPreviewFlag, subscribePreviewFlag, writePreviewFlag } from "./_lib/api";
import { buildSelections, defaultParams, describeOptions, techniqueLabel, TECHNIQUE_META, type LunarReturnInfo, type TechniqueParams, type UiTechniqueId } from "./_lib/techniques";
import ProviderInterpretationPanel, { type InterpretationLayer } from "./_components/ProviderInterpretationPanel";
import ProfileForm, { type ProfileFormInitial } from "./_components/ProfileForm";
import AnalysisWorkspace from "./_components/AnalysisWorkspace";
import KnowledgeBankPanel from "./_components/KnowledgeBankPanel";
import UnmappedAuditPanel from "./_components/UnmappedAuditPanel";
import TechniqueSelector from "./_components/TechniqueSelector";
import { TechniqueTechnical } from "./_components/TimingPanels";
import { SavedAnalysesList, SavedAnalysisView } from "./_components/SavedAnalyses";

type PublicRevision = {
  revision: number;
  birthDate: string;
  birthTime: string | null;
  timeKnown: boolean;
  timeAccuracy: string;
  timeAccuracyLabel: string;
  locationId: string | null;
  locationLabel: string;
  latitude: number;
  longitude: number;
  timezone: string;
  dstChoice: string;
  utcOffsetSeconds: number;
  birthUtc: string;
  changeNote: string | null;
  createdAt: string | null;
};

type ProfileListItem = {
  id: string;
  label: string;
  clientName: string | null;
  currentRevision: number;
  current: PublicRevision | null;
};

type ProfileDetail = {
  id: string;
  label: string;
  clientName: string | null;
  currentRevision: number;
  revisions: PublicRevision[];
};

type PlanSelection = {
  technique: string;
  options: Record<string, unknown> | null;
  unitCount: number;
  newRequests: number;
  blocked: { code: string; error: string } | null;
  info?: { lunarReturns?: LunarReturnInfo[] } | null;
};
type PlanSummary = {
  selectedCount: number;
  blockedCount: number;
  newRequestCount: number;
  cachedCount: number;
  coveredCount: number;
  dedupedCount: number;
  requiresConfirmation: boolean;
  selections: PlanSelection[];
};

type View = Omit<TechniqueView, "interpretation"> & { interpretation: InterpretationLayer };
type ResultItem = { technique: string; ok: true; partial: boolean; reused: boolean; view: View } | { technique: string; ok: false; code: string; error: string };

type RunResponse = {
  plan: PlanSummary;
  executed: { newResults: number; cachedResults: number; providerAttempts: number };
  revision: PublicRevision;
  results: ResultItem[];
};

function fmtOffset(sec: number): string {
  const sign = sec >= 0 ? "+" : "−";
  const a = Math.abs(sec);
  return `UTC${sign}${String(Math.floor(a / 3600)).padStart(2, "0")}:${String(Math.floor((a % 3600) / 60)).padStart(2, "0")}`;
}

function RevisionLine({ r }: { r: PublicRevision }) {
  return (
    <span>
      {r.birthDate} · {r.timeKnown ? r.birthTime?.slice(0, 5) : "saat bilinmiyor"} · {r.locationLabel} · {r.timezone} ({fmtOffset(r.utcOffsetSeconds)})
    </span>
  );
}

export default function AstrologyWorkspacePage() {
  const [profiles, setProfiles] = useState<ProfileListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProfileDetail | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [form, setForm] = useState<null | { mode: "create" } | { mode: "revise"; initial: ProfileFormInitial }>(null);

  const [method, setMethod] = useState<{ houseSystem: HouseSystem; nodeType: NodeType }>({ houseSystem: "placidus", nodeType: "true" });
  const [checked, setChecked] = useState<Partial<Record<UiTechniqueId, boolean>>>({ "western.natal": true });
  const [params, setParams] = useState<TechniqueParams>(() => defaultParams(new Date()));
  const [planState, setPlanState] = useState<{ key: string; plan: PlanSummary | null; error: string | null } | null>(null);
  const [planNonce, setPlanNonce] = useState(0);
  const [running, setRunning] = useState(false);
  // Sonuçlar BAĞLAM ANAHTARI + çalıştırma sırasıyla: geç yanıt başka profilin / yeni çalıştırmanın üstüne yazılmaz.
  const runSeq = useRef(0);
  const [runState, setRunState] = useState<{ key: string; seq: number; items: ResultItem[]; executed: RunResponse["executed"] } | null>(null);
  const [runErrorState, setRunErrorState] = useState<{ key: string; message: string } | null>(null);
  const [active, setActive] = useState<{ key: string; seq: number; idx: number } | null>(null);
  const [profilesReload, setProfilesReload] = useState(0);
  const [detailReload, setDetailReload] = useState(0);
  const previewNoInterp = useSyncExternalStore(subscribePreviewFlag, readPreviewFlag, () => false);
  const [tab, setTab] = useState<"work" | "kb" | "audit">("work");
  const [openAnalysis, setOpenAnalysis] = useState<{ profileId: string; id: string } | null>(null);
  const [analysesReload, setAnalysesReload] = useState(0);
  const [workRefresh, setWorkRefresh] = useState(0);

  useEffect(() => {
    let alive = true;
    void astroFetch<{ profiles: ProfileListItem[] }>("/api/admin/astroloji/profiles").then((r) => {
      if (!alive) return;
      setProfiles(r.ok ? r.data.profiles : []);
      setListError(r.ok ? null : r.error);
    });
    return () => {
      alive = false;
    };
  }, [profilesReload]);

  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    void astroFetch<{ profile: ProfileDetail }>(`/api/admin/astroloji/profiles/${selectedId}`).then((r) => {
      if (!alive || !r.ok) return;
      setDetail(r.data.profile);
      setRevision(r.data.profile.currentRevision);
    });
    return () => {
      alive = false;
    };
  }, [selectedId, detailReload]);

  function selectProfile(id: string) {
    setSelectedId(id);
    setForm(null);
    setDetail(null);
    setRevision(null);
    // Önceki profilin karşı taraf seçimi yeni profile taşınmaz.
    setParams((p) => ({ ...p, partnerProfileId: p.partnerProfileId === id ? "" : p.partnerProfileId }));
  }

  const shownDetail = detail && detail.id === selectedId ? detail : null;
  const ctxKey = shownDetail && revision !== null ? `${shownDetail.id}|${revision}` : null;
  const currentRev = shownDetail?.revisions.find((r) => r.revision === revision) ?? null;
  const labelOf = useMemo(() => {
    const m = new Map((profiles ?? []).map((p) => [p.id, p.label]));
    return (id: string) => m.get(id) ?? null;
  }, [profiles]);
  const partners = (profiles ?? []).filter((p) => p.id !== selectedId).map((p) => ({ id: p.id, label: p.clientName ? `${p.label} (${p.clientName})` : p.label }));
  const partnerMissing = !!(checked["western.synastry"] || checked["western.composite"]) && !params.partnerProfileId;
  const selections = useMemo(() => {
    const all = buildSelections(checked, params, method);
    // Karşı taraf seçilmeden ikili teknikler plana girmez (uyarı ayrıca gösterilir).
    return params.partnerProfileId ? all : all.filter((s) => !TECHNIQUE_META[s.technique].needsPartner);
  }, [checked, params, method]);

  const runs = runState && runState.key === ctxKey ? runState : null;
  const runError = runErrorState && runErrorState.key === ctxKey ? runErrorState.message : null;
  const activeIdx = runs && active && active.key === ctxKey && active.seq === runs.seq ? active.idx : 0;
  const activeItem = runs ? (runs.items[activeIdx] ?? null) : null;

  // SUNUCU planı (sağlayıcı ÇAĞRILMAZ): X hesap → Y yeni istek → Z kayıtlı; engellenenler nedeniyle.
  // Anahtar = isteğin kendisi (bağlam + seçimler + yenileme sayacı) → yanıt yalnız kendi anahtarında gösterilir.
  const planKey = ctxKey && shownDetail && revision !== null && selections.length > 0 ? JSON.stringify({ profileId: shownDetail.id, revision, selections, n: planNonce }) : null;
  useEffect(() => {
    if (!planKey) return;
    let alive = true;
    const { profileId, revision: rev, selections: sels } = JSON.parse(planKey) as { profileId: string; revision: number; selections: unknown[] };
    const body = { profileId, revision: rev, selections: sels };
    const t = setTimeout(() => {
      void astroFetch<{ plan: PlanSummary }>("/api/admin/astroloji/engine/plan", { method: "POST", body }).then((r) => {
        if (!alive) return;
        setPlanState({ key: planKey, plan: r.ok ? r.data.plan : null, error: r.ok ? null : r.error });
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [planKey]);
  const plan = planState && planState.key === planKey ? planState.plan : null;
  const planError = planState && planState.key === planKey ? planState.error : null;
  const lunarReturns = plan?.selections.find((s) => s.technique === "western.lunar_return")?.info?.lunarReturns ?? null;

  async function run() {
    if (!shownDetail || revision === null || !ctxKey || !plan || !planKey) return;
    const key = ctxKey;
    const seq = ++runSeq.current;
    // Önizlemede gösterilen NORMALİZE seçenekler aynen çalıştırılır (ör. "şimdi" saat başı).
    const sels = plan.selections.map((s, i) => ({ technique: s.technique, options: s.options ?? selections[i].options }));
    setRunning(true);
    setRunErrorState(null);
    const r = await astroFetch<RunResponse>(`/api/admin/astroloji/engine/run${previewNoInterp ? "?previewNoInterp=1" : ""}`, {
      method: "POST",
      body: { profileId: shownDetail.id, revision, selections: sels, confirmNewRequests: plan.newRequestCount },
    });
    if (seq !== runSeq.current) return; // daha yeni bir çalıştırma başladı
    setRunning(false);
    setPlanNonce((n) => n + 1);
    if (!r.ok) {
      if (r.code === "CONFIRMATION_REQUIRED" && r.data && typeof r.data.plan === "object") {
        setRunErrorState({ key, message: `${r.error} (plan güncellendi — yeniden kontrol edin)` });
      } else setRunErrorState({ key, message: r.error });
      // Engellenen/başarısız seçimler yine de listelenir (Roxy isteği yapılmadan).
      const items = (r.data?.results as ResultItem[] | undefined) ?? null;
      if (items) {
        setRunState({ key, seq, items, executed: (r.data?.executed as RunResponse["executed"]) ?? { newResults: 0, cachedResults: 0, providerAttempts: 0 } });
        setActive({ key, seq, idx: 0 });
      }
      return;
    }
    setRunState({ key, seq, items: r.data.results, executed: r.data.executed });
    const firstOk = r.data.results.findIndex((x) => x.ok);
    setActive({ key, seq, idx: firstOk >= 0 ? firstOk : 0 });
  }

  async function togglePreview(next: boolean) {
    writePreviewFlag(next);
    if (!runs || !shownDetail || revision === null || !ctxKey) return;
    const key = ctxKey;
    const seq = runs.seq;
    const okIdx = runs.items.map((x, i) => (x.ok ? i : -1)).filter((i) => i >= 0);
    if (okIdx.length === 0) return;
    // YALNIZ-ÖNBELLEK görünüm ucu: hiçbir koşulda sağlayıcı çağrılmaz; yorum katmanına sunucu yeniden karar verir.
    const r = await astroFetch<{ results: ResultItem[] }>(`/api/admin/astroloji/engine/view${next ? "?previewNoInterp=1" : ""}`, {
      method: "POST",
      body: {
        profileId: shownDetail.id,
        revision,
        selections: okIdx.map((i) => {
          const it = runs.items[i] as Extract<ResultItem, { ok: true }>;
          return { technique: it.technique, options: it.view.options };
        }),
      },
    });
    if (!r.ok || runSeq.current !== seq) return;
    setRunState((prev) => {
      if (!prev || prev.key !== key || prev.seq !== seq) return prev;
      const items = [...prev.items];
      okIdx.forEach((i, j) => {
        const v = r.data.results[j];
        if (v && v.ok) items[i] = v;
      });
      return { ...prev, items };
    });
  }

  const partnerLabelOf = (v: View) => (typeof v.options.partnerProfileId === "string" ? (labelOf(v.options.partnerProfileId) ?? "Karşı taraf") : "2. kişi");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">Astroloji Çalışma Merkezi</h1>
          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white">Owner pilot · Aşama 3</span>
        </div>
        <p className="text-sm text-slate-600">
          Batı (tropikal): Natal · Transit · Transit takvimi · Secondary progression · Solar arc · Solar/Lunar return · Sinastri · Composite. Teknik sonuçlar ile sağlayıcının otomatik yorumu ayrı katmanlardadır.
        </p>
      </header>

      <label className="flex items-center gap-2 self-start rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
        <input type="checkbox" checked={previewNoInterp} onChange={(e) => void togglePreview(e.target.checked)} />
        Roxy Yorumu Kapalıymış Gibi Gör <span className="text-xs text-violet-700">(owner önizlemesi — yorum yetkisi kapalı uzman görünümü)</span>
      </label>

      <nav className="flex gap-1 border-b border-slate-200" aria-label="Astroloji bölümleri">
        {([
          ["work", "Çalışma"],
          ["kb", "Bilgi Bankası"],
          ["audit", "Alan denetimi"],
        ] as const).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setTab(k);
              if (k === "work") setWorkRefresh((n) => n + 1);
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? "border-violet-600 font-semibold text-violet-800" : "border-transparent text-slate-600 hover:text-slate-900"}`}
          >
            {l}
          </button>
        ))}
      </nav>

      {tab === "kb" && <KnowledgeBankPanel />}
      {tab === "audit" && <UnmappedAuditPanel />}

      <div className={`grid gap-4 lg:grid-cols-[300px_1fr] ${tab === "work" ? "" : "hidden"}`}>
        <aside className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Doğum profilleri</h2>
            <button type="button" className="text-sm text-violet-700 underline" onClick={() => setForm({ mode: "create" })}>
              + Yeni
            </button>
          </div>
          {listError && <p className="text-sm text-rose-700">{listError}</p>}
          {profiles === null ? (
            <p className="text-sm text-slate-400">Yükleniyor…</p>
          ) : profiles.length === 0 ? (
            <p className="text-sm text-slate-500">Henüz profil yok.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {profiles.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => selectProfile(p.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedId === p.id ? "border-violet-400 bg-violet-50" : "border-slate-200 bg-white hover:border-violet-200"}`}
                  >
                    <div className="font-medium text-slate-800">{p.label}</div>
                    {p.clientName && <div className="text-xs text-emerald-700">Danışan: {p.clientName}</div>}
                    {p.current && (
                      <div className="text-xs text-slate-500">
                        <RevisionLine r={p.current} /> · rev {p.currentRevision}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="flex min-w-0 flex-col gap-4">
          {form?.mode === "create" && (
            <ProfileForm
              mode="create"
              onCancel={() => setForm(null)}
              onDone={(id) => {
                setProfilesReload((n) => n + 1);
                selectProfile(id);
              }}
            />
          )}
          {form?.mode === "revise" && (
            <ProfileForm
              mode="revise"
              initial={form.initial}
              onCancel={() => setForm(null)}
              onDone={(id) => {
                setForm(null);
                setProfilesReload((n) => n + 1);
                if (id === selectedId) setDetailReload((n) => n + 1);
              }}
            />
          )}

          {shownDetail && !form && (
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{shownDetail.label}</h2>
                  {shownDetail.clientName && <p className="text-sm text-emerald-700">Danışan: {shownDetail.clientName}</p>}
                  {currentRev && (
                    <p className="text-sm text-slate-600">
                      <RevisionLine r={currentRev} /> · saat doğruluğu: {currentRev.timeAccuracyLabel}
                    </p>
                  )}
                </div>
                {currentRev && (
                  <button
                    type="button"
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
                    onClick={() =>
                      setForm({
                        mode: "revise",
                        initial: {
                          profileId: shownDetail.id,
                          expectedRevision: shownDetail.currentRevision,
                          birthDate: currentRev.birthDate,
                          birthTime: currentRev.birthTime,
                          timeKnown: currentRev.timeKnown,
                          timeAccuracy: currentRev.timeAccuracy,
                          location: currentRev.locationId ? { id: currentRev.locationId, label: currentRev.locationLabel } : null,
                        },
                      })
                    }
                  >
                    Doğum bilgisini düzelt
                  </button>
                )}
              </div>

              {shownDetail.revisions.length > 1 && (
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-slate-600">Revizyon:</span>
                  <select value={revision ?? undefined} onChange={(e) => setRevision(Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-1">
                    {shownDetail.revisions.map((r) => (
                      <option key={r.revision} value={r.revision}>
                        rev {r.revision}
                        {r.revision === shownDetail.currentRevision ? " (güncel)" : ""}
                        {r.changeNote ? ` — ${r.changeNote}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="border-t border-slate-100 pt-3">
                <TechniqueSelector
                  checked={checked}
                  onChecked={setChecked}
                  params={params}
                  onParams={setParams}
                  method={method}
                  onMethod={setMethod}
                  partners={partners}
                  timeKnown={currentRev?.timeKnown ?? true}
                  lunarReturns={lunarReturns}
                />
              </div>

              <div className="flex flex-col gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm" data-testid="astro-plan-box">
                {partnerMissing && <p className="text-amber-800">Sinastri/Composite için karşı taraf profilini seçin (seçilene kadar plana alınmaz).</p>}
                {selections.length === 0 ? (
                  <span className="text-slate-500">Hesaplamak için en az bir teknik seçin.</span>
                ) : plan ? (
                  <>
                    <span className="text-slate-700" data-testid="astro-plan">
                      {plan.selectedCount} hesap seçildi → <strong>{plan.newRequestCount}</strong> yeni Roxy isteği → <strong>{plan.cachedCount}</strong> kayıtlı sonuç
                      {plan.blockedCount > 0 && <> · <strong className="text-rose-700">{plan.blockedCount}</strong> hesaplanamaz</>}
                      {plan.dedupedCount > 0 && <span className="text-xs text-slate-500"> · {plan.dedupedCount} yinelenen birim tekilleştirildi</span>}
                    </span>
                    <ul className="flex flex-col gap-0.5 text-xs" data-testid="astro-plan-lines">
                      {plan.selections.map((s, i) => (
                        <li key={`${s.technique}-${i}`} className={s.blocked ? "text-rose-700" : "text-slate-600"}>
                          {techniqueLabel(s.technique)}
                          {s.options && describeOptions(s.technique, s.options, labelOf) ? ` — ${describeOptions(s.technique, s.options, labelOf)}` : ""}:{" "}
                          {s.blocked ? s.blocked.error : `${s.unitCount} birim · ${s.newRequests} yeni istek`}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : planError ? (
                  <span className="text-rose-700">{planError}</span>
                ) : (
                  <span className="text-slate-400">Plan hazırlanıyor…</span>
                )}
                <button
                  type="button"
                  disabled={running || !plan || plan.selectedCount === plan.blockedCount}
                  onClick={() => void run()}
                  className="btn-primary self-end rounded-lg px-4 py-2 text-sm disabled:opacity-60"
                  data-testid="astro-run"
                >
                  {running
                    ? "Hesaplanıyor…"
                    : plan && plan.newRequestCount === 0
                      ? "Kayıtlı sonuçları aç"
                      : plan?.requiresConfirmation
                        ? `${plan.newRequestCount} yeni isteği onayla ve hesapla`
                        : "Hesapla"}
                </button>
              </div>
              {runs && (
                <p className="text-xs text-slate-500" data-testid="astro-run-info">
                  Son işlem: {runs.executed.newResults} yeni sonuç · {runs.executed.cachedResults} kayıttan · {runs.executed.providerAttempts} sağlayıcı isteği
                </p>
              )}
              {runError && <p className="text-sm text-rose-700">{runError}</p>}
              <div className="border-t border-slate-100 pt-3">
                <h3 className="mb-1 text-sm font-semibold text-slate-700">Kayıtlı analizler</h3>
                <SavedAnalysesList
                  profileId={shownDetail.id}
                  reloadKey={analysesReload}
                  openId={openAnalysis && openAnalysis.profileId === shownDetail.id ? openAnalysis.id : null}
                  onOpen={(id) => setOpenAnalysis({ profileId: shownDetail.id, id })}
                />
              </div>
            </div>
          )}

          {openAnalysis && shownDetail && openAnalysis.profileId === shownDetail.id && (
            <SavedAnalysisView key={openAnalysis.id} id={openAnalysis.id} previewNoInterp={previewNoInterp} onClose={() => setOpenAnalysis(null)} />
          )}

          {runs && runs.items.length > 0 && shownDetail && revision !== null && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Hesap sonuçları" data-testid="astro-result-tabs">
                {runs.items.map((it, i) => (
                  <button
                    key={`${runs.seq}-${i}`}
                    type="button"
                    role="tab"
                    aria-selected={i === activeIdx}
                    onClick={() => setActive({ key: ctxKey!, seq: runs.seq, idx: i })}
                    className={`rounded-lg border px-3 py-1.5 text-left text-xs ${
                      i === activeIdx ? "border-violet-500 bg-violet-50 text-violet-900" : it.ok ? "border-slate-200 bg-white text-slate-700" : "border-rose-200 bg-rose-50 text-rose-800"
                    }`}
                  >
                    <span className="font-semibold">{techniqueLabel(it.technique)}</span>
                    {it.ok ? (
                      <span className="block text-[11px] text-slate-500">
                        {describeOptions(it.technique, it.view.options, labelOf) || "—"}
                        {it.partial ? " · KISMİ" : ""}
                      </span>
                    ) : (
                      <span className="block text-[11px]">hesaplanamadı</span>
                    )}
                  </button>
                ))}
              </div>

              {activeItem && !activeItem.ok && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" data-testid="astro-result-error">
                  {techniqueLabel(activeItem.technique)}: {activeItem.error}
                </p>
              )}

              {activeItem && activeItem.ok && (
                <div className="flex flex-col gap-4" key={`${ctxKey}|${runs.seq}|${activeIdx}`}>
                  <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4" aria-label="Hesaplama / Teknik Veriler">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-base font-semibold text-slate-900" data-testid="astro-active-technique">
                        Hesaplama / Teknik Veriler — {techniqueLabel(activeItem.technique)}
                      </h3>
                      <span className="text-xs text-slate-500">
                        {describeOptions(activeItem.technique, activeItem.view.options, labelOf)}
                        {activeItem.view.method.houseSystem ? ` · ${HOUSE_SYSTEM_LABELS[activeItem.view.method.houseSystem as HouseSystem]}` : ""}
                        {activeItem.view.method.nodeType ? ` · ${NODE_TYPE_LABELS[activeItem.view.method.nodeType as NodeType]}` : ""} · sağlayıcı: {activeItem.view.provider} (
                        {activeItem.view.providerApiVersion})
                      </span>
                    </div>
                    <TechniqueTechnical
                      technique={activeItem.technique}
                      technical={activeItem.view.technical}
                      timeUnknownMasked={activeItem.view.timeUnknownMasked}
                      warnings={activeItem.view.warnings}
                      names={[shownDetail.label, partnerLabelOf(activeItem.view)]}
                    />
                  </section>
                  <ProviderInterpretationPanel interpretation={activeItem.view.interpretation} />
                  <AnalysisWorkspace
                    key={`${shownDetail.id}|${revision}|${activeItem.technique}|${JSON.stringify(activeItem.view.options)}`}
                    profileId={shownDetail.id}
                    revision={revision}
                    selection={{ technique: activeItem.technique, options: activeItem.view.options }}
                    interpVisible={activeItem.view.interpretation.visible}
                    previewNoInterp={previewNoInterp}
                    refreshKey={workRefresh}
                    onSaved={(id) => {
                      setAnalysesReload((n) => n + 1);
                      setOpenAnalysis({ profileId: shownDetail.id, id });
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
