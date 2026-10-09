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
import type { DashaDrillResult } from "./_components/VedicPanels";
import type { VedicDashaTechnical } from "@/lib/astrology/model/vedic";
import { buildSelections, defaultParams, describeOptions, houseSystemLabel, techniqueLabel, TECHNIQUE_META, type LunarReturnInfo, type TechniqueParams, type UiTechniqueId } from "./_lib/techniques";
import ProviderInterpretationPanel, { type InterpretationLayer } from "./_components/ProviderInterpretationPanel";
import ProfileForm, { type ProfileFormInitial } from "./_components/ProfileForm";
import AnalysisWorkspace from "./_components/AnalysisWorkspace";
import KnowledgeBankPanel from "./_components/KnowledgeBankPanel";
import UnmappedAuditPanel from "./_components/UnmappedAuditPanel";
import TechniqueSelector from "./_components/TechniqueSelector";
import { TechniqueTechnical } from "./_components/TimingPanels";
import { SavedAnalysesList, SavedAnalysisView } from "./_components/SavedAnalyses";
import ClientList from "./_components/ClientList";
import ClientLinkPanel from "./_components/ClientLinkPanel";
import ProfileDeleteFlow from "./_components/ProfileDeleteFlow";

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

type ProfileDetail = {
  id: string;
  label: string;
  clientId: string | null;
  clientName: string | null;
  /** Aşama 7B: bağ var ama danışan kaydı artık bulunamıyor. */
  clientMissing?: boolean;
  archivedAt?: string | null;
  currentRevision: number;
  revisions: PublicRevision[];
};

type PartnerOption = { id: string; label: string; clientName: string | null };

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
  // Aşama 7B: liste sunucuda sayfalı (ClientList); karşı taraf seçimi kendi aramasıyla gelir.
  // Bilinen profil adları (liste + karşı taraf + detay) → plan/sonuç satırlarındaki karşı taraf etiketi.
  const [knownLabels, setKnownLabels] = useState<Record<string, string>>({});
  const [partnerQuery, setPartnerQuery] = useState("");
  const [partnerOptions, setPartnerOptions] = useState<PartnerOption[]>([]);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  // Kalıcı silme (tekli; 2 onay). Dizi durumda tutulur → onay akışına kararlı referans.
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [deleteInfo, setDeleteInfo] = useState<string | null>(null);
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
  // Aşama 5: etkin sonucun çalışma alanı KB eşleşmeleri (Vedik ayrıntı paneli için; ek istek yok).
  const [kbState, setKbState] = useState<{ key: string; entries: { topicKey: string; topicLabel: string; title: string; body: string }[] } | null>(null);

  const rememberLabels = (rows: { id: string; label: string }[]) =>
    setKnownLabels((m) => {
      const next = { ...m };
      for (const r of rows) next[r.id] = r.label;
      return next;
    });

  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    void astroFetch<{ profile: ProfileDetail }>(`/api/admin/astroloji/profiles/${selectedId}`).then((r) => {
      if (!alive || !r.ok) return;
      setDetail(r.data.profile);
      setRevision(r.data.profile.currentRevision);
      rememberLabels([r.data.profile]);
    });
    return () => {
      alive = false;
    };
  }, [selectedId, detailReload]);

  // Karşı taraf seçimi (sinastri / composite): yalnız ikili teknik seçiliyken, sunucu aramasıyla (≤100; etkin kayıtlar).
  const anyPartnerChecked = !!(checked["western.synastry"] || checked["western.composite"]);
  useEffect(() => {
    if (!anyPartnerChecked) return;
    let alive = true;
    const t = setTimeout(() => {
      const sp = new URLSearchParams({ sort: "name", limit: "100" });
      if (partnerQuery.trim()) sp.set("q", partnerQuery.trim());
      void astroFetch<{ profiles: PartnerOption[] }>(`/api/admin/astroloji/profiles?${sp.toString()}`).then((r) => {
        if (!alive || !r.ok) return;
        setPartnerOptions(r.data.profiles);
        rememberLabels(r.data.profiles);
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [anyPartnerChecked, partnerQuery, profilesReload]);

  function selectProfile(id: string) {
    setSelectedId(id);
    setForm(null);
    setDetail(null);
    setRevision(null);
    setArchiveConfirm(false);
    setArchiveError(null);
    // Önceki profilin karşı taraf seçimi yeni profile taşınmaz.
    setParams((p) => ({ ...p, partnerProfileId: p.partnerProfileId === id ? "" : p.partnerProfileId }));
  }

  function clearSelection() {
    setSelectedId(null);
    setDetail(null);
    setRevision(null);
    setOpenAnalysis(null);
    setArchiveConfirm(false);
  }

  async function setArchived(archived: boolean) {
    if (!shownDetail) return;
    setArchiveBusy(true);
    setArchiveError(null);
    const r = await astroFetch(`/api/admin/astroloji/profiles/${shownDetail.id}`, { method: "PATCH", body: { archived } });
    setArchiveBusy(false);
    if (!r.ok) {
      setArchiveError(r.error);
      return;
    }
    setArchiveConfirm(false);
    setProfilesReload((n) => n + 1);
    setDetailReload((n) => n + 1);
  }

  const shownDetail = detail && detail.id === selectedId ? detail : null;
  const ctxKey = shownDetail && revision !== null ? `${shownDetail.id}|${revision}` : null;
  const currentRev = shownDetail?.revisions.find((r) => r.revision === revision) ?? null;
  const labelOf = useMemo(() => (id: string) => knownLabels[id] ?? null, [knownLabels]);
  const partners = partnerOptions.filter((p) => p.id !== selectedId).map((p) => ({ id: p.id, label: p.clientName ? `${p.label} (${p.clientName})` : p.label }));
  // Seçili karşı taraf arama sonucunda yoksa da seçimde görünür kalsın.
  if (params.partnerProfileId && !partners.some((p) => p.id === params.partnerProfileId)) {
    partners.unshift({ id: params.partnerProfileId, label: knownLabels[params.partnerProfileId] ?? "Seçili karşı taraf" });
  }
  const partnerMissing = !!(checked["western.synastry"] || checked["western.composite"]) && !params.partnerProfileId;
  const relocationTargetMissing = !!checked["western.relocation"] && !params.relocationTarget;
  const birthplace = currentRev ? { lat: currentRev.latitude, lon: currentRev.longitude, label: currentRev.locationLabel } : null;
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

  /**
   * Aşama 5E: dasha alt düzeyini TEMBEL yükler — aynı çalıştırma ucu (planlayıcı + önbellek + yetki/yorum kapısı):
   * önbellekte varsa 0 sağlayıcı isteği. Tek seçim eşik altında → onay gerekmez. KB eşleşmeleri çalışma alanı
   * ucundan (sağlayıcı ÇAĞRILMAZ).
   */
  async function drillDasha(o: { mahadasha: string; antardasha: string | null }, base: Record<string, unknown>): Promise<DashaDrillResult> {
    if (!shownDetail || revision === null) return { ok: false, error: "Profil seçili değil." };
    // 6E: KP dasha aynı tembel mekanizmayı kullanır (KP ayanamsa + düğüm seçeneği korunur).
    const kp = base.nodeType !== undefined && typeof base.ayanamsa === "string" && base.ayanamsa.startsWith("kp-");
    const sel = kp
      ? { technique: "kp.dasha", options: { ayanamsa: base.ayanamsa, nodeType: base.nodeType, mahadasha: o.mahadasha, antardasha: o.antardasha } }
      : { technique: "vedic.dasha", options: { ayanamsa: base.ayanamsa ?? "lahiri", mahadasha: o.mahadasha, antardasha: o.antardasha } };
    const r = await astroFetch<RunResponse>(`/api/admin/astroloji/engine/run${previewNoInterp ? "?previewNoInterp=1" : ""}`, {
      method: "POST",
      body: { profileId: shownDetail.id, revision, selections: [sel] },
    });
    if (!r.ok) return { ok: false, error: r.error };
    const it = r.data.results[0];
    if (!it || !it.ok || !it.view.technical) return { ok: false, error: it && !it.ok ? it.error : "Alt dönem yüklenemedi." };
    const ws = await astroFetch<{ kbMatches: { topicKey: string; topicLabel: string; title: string; body: string }[] }>("/api/admin/astroloji/workspace", {
      method: "POST",
      body: { profileId: shownDetail.id, revision, technique: sel.technique, options: it.view.options },
    });
    return { ok: true, technical: it.view.technical as VedicDashaTechnical, kb: ws.ok ? ws.data.kbMatches : [] };
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
          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white">Owner pilot · Aşama 6</span>
        </div>
        <p className="text-sm text-slate-600">
          Batı (tropikal): Natal · Transit · Transit takvimi · Progression · Solar arc · Solar/Lunar return · Sinastri · Composite · Astrocartography · Relocation · Local Space. Vedik / Jyotish (sidereal): D1 Rashi · Nakshatra/Pada · D9 + Varga · Vimshottari Dasha · Graha Drishti · Ashtakavarga · Shadbala · Janma Panchanga · Gochara. KP (Krishnamurti, Placidus): harita · cusp/sub lord · significator · KP dasha · ruling planets · transit (kısmi) · horary. Teknik sonuçlar ile sağlayıcının otomatik yorumu ayrı katmanlardadır.
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
        <ClientList
          selectedId={selectedId}
          reloadKey={profilesReload}
          onSelect={(p) => selectProfile(p.id)}
          onCreate={() => setForm({ mode: "create" })}
          onItems={rememberLabels}
          onProfilesDeleted={(ids) => {
            if (selectedId && ids.includes(selectedId)) clearSelection();
            setParams((p) => ({ ...p, partnerProfileId: ids.includes(p.partnerProfileId) ? "" : p.partnerProfileId }));
          }}
        />
        {deleteIds && (
          <ProfileDeleteFlow
            key={deleteIds.join(",")}
            mode="single"
            profileIds={deleteIds}
            onClose={() => setDeleteIds(null)}
            onDeleted={(r) => {
              const ids = deleteIds;
              setDeleteIds(null);
              clearSelection();
              setParams((p) => ({ ...p, partnerProfileId: ids.includes(p.partnerProfileId) ? "" : p.partnerProfileId }));
              setDeleteInfo(`Profil ve ${r.deletedAnalyses} kayıtlı analizi kalıcı olarak silindi; ${r.preservedSharedAnalyses} ortak analiz korundu.`);
              setProfilesReload((n) => n + 1);
            }}
          />
        )}

        <section className="flex min-w-0 flex-col gap-4">
          {deleteInfo && !shownDetail && (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900" data-testid="astro-delete-info">
              {deleteInfo}
            </p>
          )}
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
                <div className="min-w-0">
                  <h2 className="flex flex-wrap items-center gap-2 break-words text-lg font-semibold text-slate-900">
                    {shownDetail.label}
                    {shownDetail.archivedAt && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">Arşivde</span>}
                  </h2>
                  {currentRev && (
                    <p className="text-sm text-slate-600">
                      <RevisionLine r={currentRev} /> · saat doğruluğu: {currentRev.timeAccuracyLabel}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
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
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
                  onClick={() => (shownDetail.archivedAt ? void setArchived(false) : setArchiveConfirm(true))}
                  disabled={archiveBusy}
                  data-testid="astro-archive-toggle"
                >
                  {shownDetail.archivedAt ? "Arşivden çıkar" : "Arşivle"}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm text-rose-700"
                  onClick={() => setDeleteIds([shownDetail.id])}
                  data-testid="astro-delete-single"
                >
                  Kalıcı sil
                </button>
                </div>
              </div>

              {archiveConfirm && !shownDetail.archivedAt && (
                <div className="flex flex-col gap-2 rounded-lg border border-slate-300 bg-slate-50 p-2 text-xs sm:flex-row sm:items-center sm:justify-between" role="alertdialog" aria-label="Arşivleme onayı">
                  <p className="text-slate-700">Profil arşivlensin mi? Etkin listeden kalkar; kayıtlı analizler, sonuçlar ve notlar silinmez. &quot;Arşiv&quot; filtresinden bulup geri alabilirsiniz.</p>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setArchiveConfirm(false)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1">
                      Vazgeç
                    </button>
                    <button type="button" disabled={archiveBusy} onClick={() => void setArchived(true)} className="rounded-lg bg-slate-800 px-2.5 py-1 text-white disabled:opacity-60">
                      Evet, arşivle
                    </button>
                  </div>
                </div>
              )}
              {archiveError && <p className="text-sm text-rose-700">{archiveError}</p>}

              <ClientLinkPanel
                key={`${shownDetail.id}|${shownDetail.clientId ?? ""}`}
                profileId={shownDetail.id}
                profileLabel={shownDetail.label}
                birthDate={shownDetail.revisions.find((r) => r.revision === shownDetail.currentRevision)?.birthDate ?? null}
                clientId={shownDetail.clientId}
                clientName={shownDetail.clientName}
                clientMissing={!!shownDetail.clientMissing}
                onChanged={() => {
                  setDetailReload((n) => n + 1);
                  setProfilesReload((n) => n + 1);
                }}
              />

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
                  partnerQuery={partnerQuery}
                  onPartnerQuery={setPartnerQuery}
                  timeKnown={currentRev?.timeKnown ?? true}
                  lunarReturns={lunarReturns}
                />
              </div>

              <div className="flex flex-col gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm" data-testid="astro-plan-box">
                {partnerMissing && <p className="text-amber-800">Sinastri/Composite için karşı taraf profilini seçin (seçilene kadar plana alınmaz).</p>}
                {relocationTargetMissing && <p className="text-amber-800">Relocation için hedef konumu seçin (seçilene kadar plana alınmaz).</p>}
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
                        {activeItem.view.method.houseSystem
                          ? ` · ${houseSystemLabel(activeItem.view.method.houseSystem, HOUSE_SYSTEM_LABELS)}`
                          : ""}
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
                      options={activeItem.view.options}
                      birthplace={birthplace}
                      kbLookup={
                        kbState && kbState.key === `${shownDetail.id}|${revision}|${activeItem.technique}|${JSON.stringify(activeItem.view.options)}`
                          ? (keys) => kbState.entries.filter((e) => keys.includes(e.topicKey))
                          : null
                      }
                      dashaDrill={activeItem.technique === "vedic.dasha" || activeItem.technique === "kp.dasha" ? (o) => drillDasha(o, activeItem.view.options) : undefined}
                      onDashaLevel={
                        activeItem.technique === "vedic.dasha"
                          ? (o) => {
                              setParams((p) => ({ ...p, dashaMd: o.mahadasha ?? "", dashaAd: o.antardasha ?? "" }));
                              document.querySelector('[aria-label="Dasha mahadasha"]')?.scrollIntoView({ block: "center", behavior: "smooth" });
                            }
                          : activeItem.technique === "kp.dasha"
                            ? (o) => {
                                setParams((p) => ({ ...p, kpDashaMd: o.mahadasha ?? "", kpDashaAd: o.antardasha ?? "" }));
                                document.querySelector('[aria-label="KP dasha mahadasha"]')?.scrollIntoView({ block: "center", behavior: "smooth" });
                              }
                            : undefined
                      }
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
                    onData={(d) =>
                      setKbState({
                        key: `${shownDetail.id}|${revision}|${activeItem.technique}|${JSON.stringify(activeItem.view.options)}`,
                        entries: d.kbMatches.map((e) => ({ topicKey: e.topicKey, topicLabel: e.topicLabel, title: e.title, body: e.body })),
                      })
                    }
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
