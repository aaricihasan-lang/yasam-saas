"use client";

/**
 * Astroloji Çalışma Merkezi — AŞAMA 1 (OWNER-ONLY, satış sonrası pilot).
 *
 * Bu sayfa yalnız owner'a render edilir (layout.tsx: kill switch + katı owner → aksi notFound).
 * Veri yetkisi her API çağrısında sunucuda yeniden verilir (requireAstrologyOwner).
 *
 * Akış: Doğum profili seç/oluştur → yöntem (ev sistemi, düğüm) → önizleme (X/Y/Z) → Hesapla →
 *       "Hesaplama / Teknik Veriler" + AYRI "Roxy Otomatik Yorumu" paneli.
 * Owner önizlemesi: "Roxy Yorumu Kapalıymış Gibi Gör" → sunucu yorum içeriğini yanıta hiç koymaz.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import type { NatalView } from "@/lib/astrology/view/natalView";
import { HOUSE_SYSTEMS, NODE_TYPES, type HouseSystem, type NodeType } from "@/lib/astrology/model/western";
import { HOUSE_SYSTEM_LABELS, NODE_TYPE_LABELS } from "@/lib/astrology/labels/tr";
import { astroFetch, readPreviewFlag, subscribePreviewFlag, writePreviewFlag } from "./_lib/api";
import NatalWheel from "./_components/NatalWheel";
import NatalTechnicalPanel from "./_components/NatalTechnicalPanel";
import ProviderInterpretationPanel from "./_components/ProviderInterpretationPanel";
import ProfileForm, { type ProfileFormInitial } from "./_components/ProfileForm";
import AnalysisWorkspace from "./_components/AnalysisWorkspace";
import KnowledgeBankPanel from "./_components/KnowledgeBankPanel";
import UnmappedAuditPanel from "./_components/UnmappedAuditPanel";
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

type PlanSummary = {
  selectedCount: number;
  newRequestCount: number;
  cachedCount: number;
  coveredCount: number;
  dedupedCount: number;
  requiresConfirmation: boolean;
};

type RunResponse = {
  plan: PlanSummary;
  executed: { newResults: number; cachedResults: number; providerAttempts: number };
  revision: PublicRevision;
  results: ({ ok: true; reused: boolean; view: NatalView } | { ok: false; code: string; error: string })[];
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

  const [houseSystem, setHouseSystem] = useState<HouseSystem>("placidus");
  const [nodeType, setNodeType] = useState<NodeType>("true");
  const [planState, setPlanState] = useState<{ key: string; plan: PlanSummary | null; error: string | null } | null>(null);
  const [planNonce, setPlanNonce] = useState(0);
  const [running, setRunning] = useState(false);
  // Sonuç/hata/son işlem BAĞLAM ANAHTARIYLA (profil|revizyon) saklanır: bağlam değiştikten sonra
  // gelen geç yanıt başka profilin altında GÖSTERİLMEZ (yanlış danışana veri gösterimi engellenir).
  const [viewState, setViewState] = useState<{ key: string; view: NatalView } | null>(null);
  const [runInfoState, setRunInfoState] = useState<{ key: string; info: RunResponse["executed"] } | null>(null);
  const [runErrorState, setRunErrorState] = useState<{ key: string; message: string } | null>(null);
  const [profilesReload, setProfilesReload] = useState(0);
  const [detailReload, setDetailReload] = useState(0);
  // Owner önizleme bayrağı tarayıcı depolamasından (SSR: false) — useSyncExternalStore ile.
  const previewNoInterp = useSyncExternalStore(subscribePreviewFlag, readPreviewFlag, () => false);
  const [tab, setTab] = useState<"work" | "kb" | "audit">("work");
  // Açık kayıtlı analiz profil kimliğiyle saklanır (profil değişince başka profilin analizi görünmez).
  const [openAnalysis, setOpenAnalysis] = useState<{ profileId: string; id: string } | null>(null);
  const [analysesReload, setAnalysesReload] = useState(0);
  // Çalışma sekmesine her dönüşte canlı çalışma alanı (Bilgi Bankam eşleşmeleri/notlar) tazelenir.
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
  }

  const shownDetail = detail && detail.id === selectedId ? detail : null;
  const ctxKey = shownDetail && revision !== null ? `${shownDetail.id}|${revision}` : null;
  const view = viewState && viewState.key === ctxKey ? viewState.view : null;
  const runInfo = runInfoState && runInfoState.key === ctxKey ? runInfoState.info : null;
  const runError = runErrorState && runErrorState.key === ctxKey ? runErrorState.message : null;
  const selections = [{ technique: "western.natal", options: { houseSystem, nodeType } }];

  // Önizleme: X hesap seçildi → Y yeni Roxy isteği → Z kayıtlı sonuç (sağlayıcı ÇAĞRILMAZ).
  const planKey = shownDetail && revision !== null ? `${shownDetail.id}|${revision}|${houseSystem}|${nodeType}|${planNonce}` : null;
  useEffect(() => {
    if (!planKey) return;
    const [profileId, rev, hs, nt] = planKey.split("|");
    let alive = true;
    void astroFetch<{ plan: PlanSummary }>("/api/admin/astroloji/engine/plan", {
      method: "POST",
      body: { profileId, revision: Number(rev), selections: [{ technique: "western.natal", options: { houseSystem: hs, nodeType: nt } }] },
    }).then((r) => {
      if (!alive) return;
      setPlanState({ key: planKey, plan: r.ok ? r.data.plan : null, error: r.ok ? null : r.error });
    });
    return () => {
      alive = false;
    };
  }, [planKey]);
  const plan = planState && planState.key === planKey ? planState.plan : null;
  const planError = planState && planState.key === planKey ? planState.error : null;

  async function run() {
    if (!selectedId || revision === null || !ctxKey) return;
    const key = ctxKey;
    setRunning(true);
    setRunErrorState(null);
    const r = await astroFetch<RunResponse>(`/api/admin/astroloji/engine/run${previewNoInterp ? "?previewNoInterp=1" : ""}`, {
      method: "POST",
      body: { profileId: selectedId, revision, selections, confirmNewRequests: plan?.newRequestCount },
    });
    setRunning(false);
    setPlanNonce((n) => n + 1);
    if (!r.ok) {
      setRunErrorState({ key, message: r.error });
      return;
    }
    setRunInfoState({ key, info: r.data.executed });
    const first = r.data.results[0];
    if (first && first.ok) setViewState({ key, view: first.view });
    else if (first && !first.ok) setRunErrorState({ key, message: first.error });
  }

  async function togglePreview(next: boolean) {
    writePreviewFlag(next);
    if (!view || !selectedId || revision === null || !ctxKey) return;
    const key = ctxKey;
    // Kayıtlı sonucu yeniden oku (0 sağlayıcı isteği) — yorum katmanı sunucuda yeniden karar verilir.
    const qs = new URLSearchParams({ profileId: selectedId, revision: String(revision) });
    if (next) qs.set("previewNoInterp", "1");
    const r = await astroFetch<{ view: NatalView }>(`/api/admin/astroloji/results/${view.id}?${qs.toString()}`);
    if (r.ok) setViewState({ key, view: r.data.view });
  }

  const currentRev = shownDetail?.revisions.find((r) => r.revision === revision) ?? null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">Astroloji Çalışma Merkezi</h1>
          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white">Owner pilot · Aşama 2</span>
        </div>
        <p className="text-sm text-slate-600">
          Hesap Motoru: Batı · Natal (tropikal). Teknik sonuçlar ile sağlayıcının otomatik yorumu ayrı katmanlardadır.
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

      <div className={`grid gap-4 lg:grid-cols-[320px_1fr] ${tab === "work" ? "" : "hidden"}`}>
        {/* Sol: profiller */}
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
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                      selectedId === p.id ? "border-violet-400 bg-violet-50" : "border-slate-200 bg-white hover:border-violet-200"
                    }`}
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

        {/* Sağ: çalışma alanı */}
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
                  <select
                    value={revision ?? undefined}
                    onChange={(e) => {
                      setRevision(Number(e.target.value));
                    }}
                    className="rounded-lg border border-slate-300 px-2 py-1"
                  >
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

              <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-600">Ev sistemi</span>
                  <select value={houseSystem} onChange={(e) => setHouseSystem(e.target.value as HouseSystem)} className="rounded-lg border border-slate-300 px-2 py-1.5">
                    {HOUSE_SYSTEMS.map((h) => (
                      <option key={h} value={h}>
                        {HOUSE_SYSTEM_LABELS[h]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-600">Ay düğümü</span>
                  <select value={nodeType} onChange={(e) => setNodeType(e.target.value as NodeType)} className="rounded-lg border border-slate-300 px-2 py-1.5">
                    {NODE_TYPES.map((n) => (
                      <option key={n} value={n}>
                        {NODE_TYPE_LABELS[n]}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="text-sm text-slate-500">Zodyak: Tropikal</span>
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                {plan ? (
                  <span className="text-slate-700" data-testid="astro-plan">
                    {plan.selectedCount} hesap seçildi → <strong>{plan.newRequestCount}</strong> yeni Roxy isteği →{" "}
                    <strong>{plan.cachedCount}</strong> kayıtlı sonuç
                  </span>
                ) : planError ? (
                  <span className="text-rose-700">{planError}</span>
                ) : (
                  <span className="text-slate-400">Önizleme hazırlanıyor…</span>
                )}
                <button type="button" disabled={running || !plan} onClick={() => void run()} className="btn-primary ml-auto rounded-lg px-4 py-2 text-sm disabled:opacity-60">
                  {running
                    ? "Hesaplanıyor…"
                    : plan && plan.newRequestCount === 0
                      ? "Kayıtlı sonucu aç"
                      : plan?.requiresConfirmation
                        ? `${plan.newRequestCount} yeni isteği onayla ve hesapla`
                        : "Hesapla"}
                </button>
              </div>
              {runInfo && (
                <p className="text-xs text-slate-500">
                  Son işlem: {runInfo.newResults} yeni sonuç · {runInfo.cachedResults} kayıttan · {runInfo.providerAttempts} sağlayıcı isteği
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

          {view && (
            <div className="flex flex-col gap-4">
              <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4" aria-label="Hesaplama / Teknik Veriler">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-slate-900">Hesaplama / Teknik Veriler</h3>
                  <span className="text-xs text-slate-500">
                    {HOUSE_SYSTEM_LABELS[view.technical.houseSystem]} · {NODE_TYPE_LABELS[view.technical.nodeType]} · sağlayıcı: {view.provider} ({view.providerApiVersion})
                  </span>
                </div>
                <NatalWheel technical={view.technical} />
                <NatalTechnicalPanel technical={view.technical} timeUnknown={view.timeUnknownMasked} />
              </section>
              <ProviderInterpretationPanel interpretation={view.interpretation} />
              {shownDetail && revision !== null && (
                <AnalysisWorkspace
                  key={`${shownDetail.id}|${revision}|${view.id}`}
                  profileId={shownDetail.id}
                  revision={revision}
                  resultId={view.id}
                  interpVisible={view.interpretation.visible}
                  previewNoInterp={previewNoInterp}
                  refreshKey={workRefresh}
                  onSaved={(id) => {
                    setAnalysesReload((n) => n + 1);
                    setOpenAnalysis({ profileId: shownDetail.id, id });
                  }}
                />
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
