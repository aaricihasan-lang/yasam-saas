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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { HouseSystem, NodeType } from "@/lib/astrology/model/western";
import type { TechniqueView } from "@/lib/astrology/view/techniqueView";
import { HOUSE_SYSTEM_LABELS, NODE_TYPE_LABELS } from "@/lib/astrology/labels/tr";
import { astroFetch, isAdminSurface, readPreviewFlag, subscribePreviewFlag, writePreviewFlag } from "./_lib/api";
import type { DashaDrillResult, DashaPathSel } from "./_components/VedicPanels";
import type { VedicDashaTechnical } from "@/lib/astrology/model/vedic";
import { buildSelections, defaultParams, istanbulDateIso, profectionContextKey, profectionSelectionCurrent, runOptionsFor, describeOptions, houseSystemLabel, syncProfectionContext, techniqueLabel, zodiacLabel, TECHNIQUE_META, type LunarReturnInfo, type PlanetaryReturnInfo, type PlanetaryReturnNeighbors, type TechniqueParams, type UiTechniqueId } from "./_lib/techniques";
import ProviderInterpretationPanel, { interpretationTitle, type InterpretationLayer } from "./_components/ProviderInterpretationPanel";
import ProfileForm, { type ProfileFormInitial } from "./_components/ProfileForm";
import AnalysisWorkspace from "./_components/AnalysisWorkspace";
import KnowledgeBankPanel from "./_components/KnowledgeBankPanel";
import UnmappedAuditPanel from "./_components/UnmappedAuditPanel";
import PrepCenter from "./_components/atlas/PrepCenter";
import ClientPicker from "./_components/atlas/ClientPicker";
import OpenTabs from "./_components/atlas/OpenTabs";
import SavedAnalysisTabs from "./_components/atlas/SavedAnalysisTabs";
import { NO_PROVIDER_INTERPRETATION_NOTE, hasNoProviderInterpretation } from "@/lib/astrology/noProviderInterp";
import AddTechniqueDialog, { type AddRunResult } from "./_components/atlas/AddTechniqueDialog";
import SaveBatchDialog, { type SaveItemResult } from "./_components/atlas/SaveBatchDialog";
import { DirectedWheelCaption, directedWheelGap, TechniqueTechnical, wheelForTechnique, type CalendarTransitApi } from "./_components/TimingPanels";
import { SavedAnalysesList, SavedAnalysisView } from "./_components/SavedAnalyses";
import ArchiveList, { type ArchiveSummary } from "./_components/atlas/ArchiveList";
import ArchiveDeleteFlow from "./_components/atlas/ArchiveDeleteFlow";
import ClientLinkPanel from "./_components/ClientLinkPanel";
import ModuleAccessDenied from "@/components/auth/ModuleAccessDenied";
import AtlasHero from "./_components/atlas/AtlasHero";
import { AtlasMetric, AtlasMetrics, AtlasPremiumHero, AtlasWorkBar, ap, isPremiumView } from "./_components/atlas/premium/AtlasPremium";
import ComingSoonPanel from "./_components/atlas/ComingSoonPanel";
import { atlasDisplay, atlasText } from "./_components/atlas/fonts";
import ResultDesk, { AtlasHomeContext, DeskChip, deskGhostLight, deskPrimary, type DeskTab } from "./_components/atlas/ResultDesk";
import NatalWheel from "./_components/NatalWheel";
import { SynastryWheelCaption, TransitWheelCaption, roxyChartFor, transitWheelGap } from "./_components/RoxyWheels";
import type { TransitTechnical } from "@/lib/astrology/model/westernTiming";
import NatalTechnicalPanel from "./_components/NatalTechnicalPanel";
import type { NatalTechnical } from "@/lib/astrology/model/western";
import { localSpaceCenter } from "@/lib/astrology/localSpaceCenter";
import { AtlasHeader, atlasDangerBtn, atlasGhostBtn, atlasNightBg, atlasPanel, atlasSecondaryBtn, type AtlasView } from "./_components/AtlasShell";
import { ArrowLeft, CalendarDays, CheckCircle2, Loader2, Save, ScrollText, Settings2, Users, X } from "lucide-react";
import { formatUtcOffset } from "./_lib/utcOffset";

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
  staleTimezone?: { storedOffsetSeconds: number; currentOffsetSeconds: number; text: string };
  lmtNotice?: { storedOffsetSeconds: number; localMeanOffsetSeconds: number; text: string };
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
  info?: { lunarReturns?: LunarReturnInfo[]; planetaryReturns?: PlanetaryReturnInfo[]; planetaryReturnNeighbors?: PlanetaryReturnNeighbors } | null;
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
type ResultItem = { technique: string; ok: true; partial: boolean; reused: boolean; view: View } | { technique: string; ok: false; code: string; error: string; retryAfterSec?: number };
/** Çalışma masası sekmesi: başarılı sonuç + kararlı anahtar (teknik | normalize seçenekler). */
type BenchItem = Extract<ResultItem, { ok: true }> & { key: string };
/** Hata kaydı: aynı teknik+seçenek tekrar başarısız olursa deneme sayısı artar (geçmiş kaybolmaz). */
type BenchFail = { key: string; technique: string; code: string; error: string; options: Record<string, unknown> | null; attempts: number; lastAt: number; retryAfterSec?: number; note?: string };
type Bench = { key: string; seq: number; items: BenchItem[]; fails: BenchFail[]; open: string[]; active: string | null; executed: RunResponse["executed"] };

type RunResponse = {
  plan: PlanSummary;
  executed: { newResults: number; cachedResults: number; providerAttempts: number };
  revision: PublicRevision;
  results: ResultItem[];
};

const fmtOffset = formatUtcOffset;

function RevisionLine({ r }: { r: PublicRevision }) {
  return (
    <span>
      {r.birthDate} · {r.timeKnown ? r.birthTime?.slice(0, 5) : "saat bilinmiyor"} · {r.locationLabel} · {r.timezone} ({fmtOffset(r.utcOffsetSeconds)})
    </span>
  );
}

/** Olay işleyicilerinde zaman damgası (render dışı). */
const nowMs = () => Date.now();

/**
 * Modül içi geçmiş kaydı. Her kayıt Next.js'in kendi durumunu (__NA + ağaç) KORUR (yoksa Next geri dönüşte sayfayı tam
 * yeniler) ve bir derinlik taşır: modüle girilen kayıt 0, modülün eklediği her kayıt +1. Geri tuşu derinlik 0'a
 * düşerse kullanıcı modülden çıkmak üzeredir (kaydedilmemiş iş varsa uyarı).
 */
function atlasDepthOf(st: unknown): number {
  const d = (st as { atlasDepth?: unknown } | null)?.atlasDepth;
  return typeof d === "number" && Number.isFinite(d) ? d : 0;
}
function pushAtlasEntry(view: AtlasView, url: string) {
  const cur = (window.history.state ?? {}) as Record<string, unknown>;
  window.history.pushState({ ...cur, atlasView: view, atlasDepth: atlasDepthOf(cur) + 1 }, "", url);
}
function replaceAtlasEntry(view: AtlasView, url: string) {
  const cur = (window.history.state ?? {}) as Record<string, unknown>;
  window.history.replaceState({ ...cur, atlasView: view }, "", url);
}

const LEAVE_MESSAGE = "Kaydedilmemiş değişiklikleriniz var. Kaydetmeden çıkmak istiyor musunuz?";
const DRAFT_LOSS = "Kaydedilmemiş “Kendi Yorumum” / Bilgi Bankası taslağı";

const VIEW_HASH: Record<AtlasView, string> = { home: "", new: "yeni-analiz", archive: "analiz-arsivi", client: "danisan", result: "analiz-sonucu", kb: "bilgi-bankasi", audit: "alan-denetimi", soon: "yakinda" };
/** Danışan Dosyası adresi: #danisan/<profil-kimliği> (yenileme, geri/ileri ve doğrudan bağlantı için). */
const CLIENT_HASH_RE = /^#?danisan\/([0-9a-fA-F-]{36})$/;
function clientIdFromHash(hash: string): string | null {
  return CLIENT_HASH_RE.exec(hash)?.[1] ?? null;
}
function viewFromHash(hash: string): AtlasView {
  if (clientIdFromHash(hash)) return "client";
  const h = hash.replace(/^#/, "");
  const hit = (Object.keys(VIEW_HASH) as AtlasView[]).find((k) => VIEW_HASH[k] === h && h !== "");
  return hit ?? "home";
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
  // Analiz Arşivi silme akışı (tekli / seçilenler / tümü) + liste yenileme anahtarı.
  const [archiveDelete, setArchiveDelete] = useState<{ scope: "single" | "selected" | "all"; ids: string[]; deleted?: string[] } | null>(null);
  const [archiveReload, setArchiveReload] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProfileDetail | null>(null);
  const [detailError, setDetailError] = useState<{ id: string; error: string } | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [form, setForm] = useState<null | { mode: "create" } | { mode: "revise"; initial: ProfileFormInitial }>(null);

  const [method, setMethod] = useState<{ houseSystem: HouseSystem; nodeType: NodeType }>({ houseSystem: "placidus", nodeType: "true" });
  // D4: Natal zorunlu/sabit değil — başlangıçta hiçbir teknik seçili değildir.
  const [checked, setChecked] = useState<Partial<Record<UiTechniqueId, boolean>>>({});
  const [params, setParams] = useState<TechniqueParams>(() => defaultParams(new Date()));
  const [planState, setPlanState] = useState<{ key: string; plan: PlanSummary | null; error: string | null } | null>(null);
  const [planNonce, setPlanNonce] = useState(0);
  const [running, setRunning] = useState(false);
  // Sonuçlar BAĞLAM ANAHTARI + çalıştırma sırasıyla: geç yanıt başka profilin / yeni çalıştırmanın üstüne yazılmaz.
  const runSeq = useRef(0);
  // D4 çalışma masası: bu danışan+revizyon için oturumda hesaplanan/açılan sonuçlar BİRİKİR (yeni çalıştırma öncekileri
  // silmez). open = açık sekmeler (× yalnız sekmeyi kapatır; sonuç bellekte kalır, kayıt/sonuç silinmez); fails = hatalar.
  // 2026-10-12: masa DANIŞAN+REVİZYON başına ayrı tutulur (çalışma grubu). Başka danışana geçmek / yeni danışan için
  // hesaplamak önceki danışanın kaydedilmemiş sonuçlarını SİLMEZ (eskiden tek masa vardı → yeni bağlamda sıfırlanıyordu).
  const [benches, setBenches] = useState<Record<string, Bench>>({});
  const setBench = useCallback((key: string, fn: (prev: Bench | null) => Bench | null) => {
    setBenches((m) => {
      const next = fn(m[key] ?? null);
      if (next === (m[key] ?? null)) return m;
      const out = { ...m };
      if (next) out[key] = next;
      else delete out[key];
      return out;
    });
  }, []);
  const [runErrorState, setRunErrorState] = useState<{ key: string; message: string } | null>(null);
  const [profilesReload, setProfilesReload] = useState(0);
  const [detailReload, setDetailReload] = useState(0);
  const previewFlag = useSyncExternalStore(subscribePreviewFlag, readPreviewFlag, () => false);
  // Aşama 7C: erişim + yetkiler SUNUCUDAN (fail-closed). Owner-only öğeler (önizleme, alan denetimi,
  // pilot rozeti) yalnız isOwner'da; uzman yüzeyinde owner önizleme bayrağı yok sayılır.
  const [access, setAccess] = useState<{ isOwner: boolean; providerInterp: boolean } | "denied" | null>(null);
  useEffect(() => {
    let alive = true;
    void astroFetch<{ isOwner?: boolean; entitlements: { providerInterpretations: boolean } }>("/api/admin/astroloji/access").then((r) => {
      if (!alive) return;
      setAccess(r.ok ? { isOwner: r.data.isOwner === true, providerInterp: r.data.entitlements.providerInterpretations === true } : "denied");
    });
    return () => {
      alive = false;
    };
  }, []);
  const isOwnerView = access !== null && access !== "denied" && access.isOwner;
  const previewNoInterp = isOwnerView && previewFlag;
  const [view, setView] = useState<AtlasView>("home");
  // Ana sayfa "Son Çalışmalar" → Analiz Arşivi, mevcut "Son analiz: en yeni" sıralamasıyla.
  const [archiveSortReq, setArchiveSortReq] = useState<{ sort: string; n: number } | undefined>(undefined);
  const viewRef = useRef<AtlasView>("home");
  // FINAL: tüm görünümlerde ana alanın en küçük yüksekliği = görünür ekran − üst (Yaşam Sistemi) çubuğu → içerik kısaysa
  // gereksiz sayfa kaydırması olmaz; uzun içerik doğal olarak kayar.
  const mainRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const fit = () => {
      const top = el.getBoundingClientRect().top + (document.scrollingElement?.scrollTop ?? 0) + document.body.scrollTop;
      el.style.minHeight = `${Math.max(0, Math.floor(window.innerHeight - top))}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
      el.style.minHeight = "";
    };
    // access: ilk yüklemede ana alan "Yükleniyor" durumundan SONRA çizilir → görünüm değişmese de yeniden uygulanır.
  }, [view, access]);
  // FINAL: kaydedilmemiş not / Bilgi Bankası taslağı olan sekmeler (sessiz veri kaybı yok: kapatma/ayrılma uyarısı).
  const [dirtyTabs, setDirtyTabs] = useState<Record<string, boolean>>({});
  /**
   * 2026-10-12 (Android UAT madde 2): KAYDEDİLMEMİŞ ÇALIŞMA KORUMASI — tek kaynak. Uyarı yalnız gerçekten kaybolacak bir
   * şey varken çıkar; hangi işlemin neyi kaybettirdiği ayrı ayrı hesaplanır (sekme / görünüm değiştirmek masadaki
   * sonuçları KAYBETTİRMEZ; yalnız modülden ayrılmak, danışan / doğum bilgisi değiştirmek ve açık taslağı kapatmak).
   * Uyarı yeni Roxy hesabı BAŞLATMAZ; "Kaydet ve Çık" mevcut toplu kayıt yolunu (sağlayıcısız) kullanır.
   */
  const [pendingLeave, setPendingLeave] = useState<{ message: string; details: string[]; action: () => void; saveKeys?: string[]; onStay?: () => void } | null>(null);
  const [leaveSaving, setLeaveSaving] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const anyDirty = Object.values(dirtyTabs).some(Boolean);
  const [kbDirty, setKbDirty] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [addDirty, setAddDirty] = useState(false);
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = anyDirty;
  }, [anyDirty]);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const [resultMode, setResultMode] = useState<"run" | "saved">("run");
  // Kayıt durumu SONUÇ bazında (anahtar profil|revizyon|teknik|seçenekler → analiz kimliği). Revizyon anahtarda: aynı
  // tekniğin başka doğum revizyonundaki sonucu "kaydedildi" görünmez.
  const [savedIds, setSavedIds] = useState<Record<string, string>>({});
  // Toplu kayıt: her sonucun KARARLI kayıt isteği kimliği (yeniden deneme mükerrer kayıt üretmez — sunucu "reused").
  const saveReqIds = useRef<Record<string, string>>({});
  const [saveDialog, setSaveDialog] = useState(false);
  const [saveToast, setSaveToast] = useState<{ n: number; at: number } | null>(null);
  useEffect(() => {
    if (!saveToast) return;
    const t = window.setTimeout(() => setSaveToast(null), 8000);
    return () => window.clearTimeout(t);
  }, [saveToast]);
  const [addOpen, setAddOpen] = useState<{ initial: UiTechniqueId | null } | null>(null);
  // FINAL: tüm seçili teknikler başarısız olduğunda sonuç ekranı AÇILMAZ; özet Yeni Analiz'de gösterilir.
  const [lastFailures, setLastFailures] = useState<{ key: string; at: number; items: { technique: string; code: string; error: string; retryAfterSec?: number }[] } | null>(null);
  const [deskTab, setDeskTab] = useState("harita");
  const [workRefresh, setWorkRefresh] = useState(0);
  /**
   * Görünüm ↔ adres çubuğu (#yeni-analiz vb.): tarayıcı geri/ileri ve sayfa yenileme aynı ekrana döner.
   * Sonuç görünümü bellekteki hesaplamaya bağlıdır; yenilemede sonuç yoksa Yeni Analiz'e (seçimler korunur) döner.
   */
  function go(v: AtlasView, opts: { history?: "push" | "replace" | "none"; profileId?: string | null } = {}) {
    // Arşiv listesine dönüşte kaydırma konumu korunur (liste bağlı kalır; arama/filtre durumu kaybolmaz).
    if (typeof window !== "undefined" && viewRef.current === "archive" && v !== "archive") archiveScrollRef.current = window.scrollY;
    setView(v);
    if (v === "new" || v === "result") setWorkRefresh((n) => n + 1);
    if (typeof window !== "undefined") {
      const mode = opts.history ?? "push";
      const hash = v === "client" ? `danisan/${opts.profileId ?? selectedIdRef.current ?? ""}` : VIEW_HASH[v];
      const url = `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ""}`;
      if (mode === "push" && window.location.hash.replace(/^#/, "") !== hash) pushAtlasEntry(v, url);
      else if (mode === "replace") replaceAtlasEntry(v, url);
      const y = v === "archive" ? archiveScrollRef.current : 0;
      requestAnimationFrame(() => window.scrollTo({ top: y }));
    }
  }
  const archiveScrollRef = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
  // Sonuç görünümü yalnız bellekte bir sonuç/kayıt açıkken anlamlıdır (ref: popstate dinleyicisi güncel değeri okur).
  const hasResultRef = useRef(false);
  /**
   * Geri tuşu (Android / tarayıcı) + uygulama içi geri: her görünüm adres çubuğunda ayrı kayıttır (#yeni-analiz …).
   * Modüle girilen kaydın ÜSTÜNE bir taban kaydı (derinlik 1) eklenir: geri tuşu modülden çıkmak üzereyken önce giriş
   * kaydına (derinlik 0) düşer → kaydedilmemiş çalışma varsa uyarı gösterilir (yoksa kullanıcı fark etmeden bir adım daha
   * geri gidilir). Açık pencere
   * (form / Teknik Ekle / kayıt) varken geri tuşu önce pencereyi kapatır. Tarayıcı yenileme ve harici siteye çıkışta
   * yalnız tarayıcının izin verdiği standart uyarı (beforeunload) gösterilebilir.
   */
  const baseReadyRef = useRef(false);
  const pathRef = useRef<string | null>(null);
  const leavingRef = useRef(false);
  const guardRef = useRef<{ onPop: () => boolean; moduleLoss: () => string[]; ask: (p: NonNullable<typeof pendingLeave>) => void; leaveModule: (href?: string) => void }>({
    onPop: () => false,
    moduleLoss: () => [],
    ask: () => undefined,
    leaveModule: () => undefined,
  });
  const currentViewUrl = () => {
    const v = viewRef.current;
    const hash = v === "client" ? `danisan/${selectedIdRef.current ?? ""}` : VIEW_HASH[v];
    return `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ""}`;
  };
  useEffect(() => {
    pathRef.current = window.location.pathname;
    // Next.js kendi geçmiş durumunu (__NA) ilk işlemede sayfa efektlerinden SONRA yazar → taban kaydı o hazır olunca
    // eklenir (Next durumu kopyalanır). Yeniden yükleme / yeniden bağlanmada taban zaten varsa (derinlik ≥ 1) eklenmez.
    let cancelled = false;
    let tries = 0;
    const setup = () => {
      if (cancelled) return;
      const st = window.history.state as Record<string, unknown> | null;
      if (!st?.__NA) {
        if (tries++ < 300) window.setTimeout(setup, 20);
        return; // Next durumu yoksa taban eklenmez (tam yenileme riskine girilmez); diğer korumalar sürer
      }
      if (atlasDepthOf(st) === 0) pushAtlasEntry(viewFromHash(window.location.hash), window.location.href);
      baseReadyRef.current = true;
    };
    setup();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const restore = (fromPop: boolean) => {
      if (fromPop) {
        // Sayfadan çıkılıyor (başka rota) ya da onaylanmış çıkış sürüyor → müdahale yok.
        if (leavingRef.current || window.location.pathname !== pathRef.current) return;
        // Durumsuz kayıt (#… bağlantısı / adres çubuğuna yazılan hash) modül içi gezinmedir; Next bu kayıtlara dokunmaz.
        if (baseReadyRef.current && window.history.state && atlasDepthOf(window.history.state) === 0) {
          // Modüle girilen kayda dönüldü: bir adım daha geri = modülden çıkış.
          const loss = guardRef.current.moduleLoss();
          if (loss.length === 0) {
            leavingRef.current = true;
            window.history.back();
            return;
          }
          pushAtlasEntry(viewRef.current, currentViewUrl());
          guardRef.current.ask({ message: LEAVE_MESSAGE, details: loss, action: () => guardRef.current.leaveModule() });
          return;
        }
        // Açık pencere / form → geri tuşu önce onu kapatır (görünüm değişmez).
        if (guardRef.current.onPop()) {
          pushAtlasEntry(viewRef.current, currentViewUrl());
          return;
        }
      }
      let v = viewFromHash(window.location.hash);
      if (fromPop) {
        const loss = viewLossRef.current(viewRef.current, v);
        if (loss.length > 0) {
          const target = v;
          const cid = target === "client" ? clientIdFromHash(window.location.hash) : null;
          pushAtlasEntry(viewRef.current, currentViewUrl());
          guardRef.current.ask({
            message: LEAVE_MESSAGE,
            details: loss,
            action: () => {
              if (cid) selectProfileRef.current(cid);
              go(target, { profileId: cid });
            },
          });
          return;
        }
      }
      if (v === "result" && !hasResultRef.current) v = "new";
      if (v === "audit" && !(access !== null && access !== "denied" && access.isOwner)) v = "home";
      const cid = v === "client" ? clientIdFromHash(window.location.hash) : null;
      if (cid) selectProfileRef.current(cid);
      if (fromPop) closeFormsRef.current();
      go(v, { history: "none", profileId: cid });
    };
    // 2026-10-12 (UAT 2. tur, madde G): modüle DIŞARIDAN her yeni girişte (dashboard kartı, üst menü, bağlantı) Gökyüzü
    // Atlası'nın ana ekranı açılır; adres çubuğunda kalmış #analiz-arsivi / #analiz-sonucu vb. yeniden açılmaz. Görünüm
    // hash'i yalnız sayfa YENİLEME ve tarayıcı geri/ileri ile belge geri yüklenince korunur. Danışan Dosyası derin
    // bağlantısı (#danisan/<id>) açık hedef olduğu için korunur. Karar belge başına bir kez verilir.
    if (initialEntryRef.current === null) {
      const w = window as unknown as { __atlasDocMounted?: boolean };
      const firstInDoc = !w.__atlasDocMounted;
      w.__atlasDocMounted = true;
      const nav = (performance.getEntriesByType?.("navigation")?.[0] as PerformanceNavigationTiming | undefined)?.type;
      // 2026-10-19: #yakinda (statik bilgi görünümü) Danışan Dosyası gibi açık hedeftir → doğrudan bağlantıyla açılır.
      const restoreHash = clientIdFromHash(window.location.hash) !== null || window.location.hash === "#yakinda" || (firstInDoc && (nav === "reload" || nav === "back_forward"));
      initialEntryRef.current = restoreHash ? "hash" : "home";
      if (!restoreHash && window.location.hash) {
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
      }
    }
    restore(false);
    const onPop = () => restore(true);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // Yalnız ilk yüklemede + erişim bilgisi gelince (alan denetimi owner'a özel).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access === null]);
  // Görünüm değişince neyin kaybolacağı (ref: popstate dinleyicisi güncel durumu okur).
  const viewLossRef = useRef<(from: AtlasView, to: AtlasView) => string[]>(() => []);
  const initialEntryRef = useRef<"hash" | "home" | null>(null);
  const closeFormsRef = useRef<() => void>(() => undefined);
  const [openAnalysis, setOpenAnalysis] = useState<{ profileId: string; id: string } | null>(null);
  const [analysesReload, setAnalysesReload] = useState(0);
  // Aşama 5: etkin sonucun çalışma alanı KB eşleşmeleri (Vedik ayrıntı paneli için; ek istek yok).
  // FINAL: her açık sekmenin çalışma alanı bağlı kalır → KB eşleşmeleri sekme bağlamına göre haritada tutulur.
  const [kbMap, setKbMap] = useState<Record<string, { topicKey: string; topicLabel: string; title: string; body: string }[]>>({});


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
      if (!alive) return;
      if (!r.ok) {
        // Başka uzmanın / tenant'ın kimliği veya silinmiş profil → sunucu reddeder; dosya açılmaz (veri sızmaz).
        setDetailError({ id: selectedId, error: r.status === 404 ? "Danışan dosyası bulunamadı veya erişim yetkiniz yok." : r.error });
        return;
      }
      setDetailError(null);
      setDetail(r.data.profile);
      setRevision(r.data.profile.currentRevision);
      rememberLabels([r.data.profile]);
    });
    return () => {
      alive = false;
    };
  }, [selectedId, detailReload]);

  // Karşı taraf seçimi (sinastri / composite): yalnız ikili teknik seçiliyken, sunucu aramasıyla (≤100; etkin kayıtlar).
  const anyPartnerChecked = !!(checked["western.synastry"] || checked["western.composite"] || checked["vedic.gun_milan"] || checked["vedic.dashakoot"] || checked["vedic.papasamyam"]);
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

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  const selectProfileRef = useRef<(id: string) => void>(() => undefined);
  useEffect(() => {
    selectProfileRef.current = selectProfile;
  });

  /**
   * 2026-10-12 (UAT 2. tur, madde K): listede bir satıra ÇİFT tıklanınca ilk tıklama ekranı değiştiriyor, ikinci tıklama
   * yeni açılan içeriğe düşüp tarayıcıda ~1000 karakterlik blok SEÇİYORDU (mavi vurgu). Yalnız bu geçişte kısa süre
   * çoklu tıklamanın seçim başlatması engellenir; normal metin seçme / kopyalama ETKİLENMEZ (genel user-select yok).
   */
  function suppressMultiClickSelection() {
    const block = (e: MouseEvent) => {
      if (e.detail > 1) e.preventDefault();
    };
    document.addEventListener("mousedown", block, true);
    window.setTimeout(() => document.removeEventListener("mousedown", block, true), 700);
  }

  /** Danışan Dosyası'nı aç (ayrı adres). */
  function openClientFile(id: string) {
    suppressMultiClickSelection();
    selectProfile(id);
    go("client", { profileId: id });
  }

  /**
   * YENİ ANALİZ OLUŞTUR (temiz taslak) — yalnız danışan + GÜNCEL doğum profili taşınır. Önceki teknik seçimleri ve
   * tekniğe özgü geçici ayarlar (hedef tarihler, karşı taraf, relocation/konum seçimleri, KP an/yer, dasha düzeyi…)
   * SIFIRLANIR → istenmeyen ücretli istek planlanamaz. Kayıtlı analizler ve hesaplanmış sonuçlar etkilenmez.
   * (Üst menüdeki "Yeni Analiz" ise mevcut taslağa GERİ DÖNER — bu fonksiyon çağrılmaz.)
   */
  function startFreshAnalysis(id: string | null) {
    if (id) selectProfile(id);
    if (id && detail && detail.id === id) setRevision(detail.currentRevision);
    setChecked({});
    setParams(defaultParams(new Date()));
    setMethod({ houseSystem: "placidus", nodeType: "true" });
    setPartnerQuery("");
    setLastFailures(null);
    setRunErrorState(null);
    go("new");
  }

  function selectProfile(id: string) {
    // Aynı profil yeniden seçilirse ayrıntı temizlenmez (seçim değişmediği için yeniden yüklenmez; boş panelde kalırdı).
    if (id === selectedId) {
      setForm(null);
      return;
    }
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
  const birthplace = currentRev ? { lat: currentRev.latitude, lon: currentRev.longitude, label: currentRev.locationLabel } : null;
  // 24.10.2026: Shadbala / Bhava Bala kutup günü uyarısı (yalnız sunum) — profilin çözülmüş doğum ofseti (gövdeyle aynı).
  const balaBirth = currentRev
    ? { birthDate: currentRev.birthDate, birthTime: currentRev.timeKnown ? currentRev.birthTime : null, latitude: currentRev.latitude, longitude: currentRev.longitude, timezone: currentRev.timezone, utcOffsetSeconds: currentRev.utcOffsetSeconds }
    : null;
  // P2-01 (2026-10-20): profeksiyon yaşı danışan bağlamına bağlıdır (kimlik + revizyon + doğum tarihi). Saklanan yaş başka bir
  // bağlama aitse (danışan / revizyon / doğum tarihi değişti) render sırasında YENİ kişinin bu yılı kullanılır (effect + ek render yok;
  // eski yaş hiçbir an plana/çalıştırmaya giremez). Kullanıcı yıl seçince yaş bu bağlamla birlikte saklanır → aynı danışanda korunur.
  const profectionCtx = profectionContextKey(shownDetail?.id, revision, currentRev?.birthDate);
  const profectionBirthDate = currentRev?.birthDate ?? null;
  const paramsView = useMemo(() => syncProfectionContext(params, profectionCtx, profectionBirthDate, istanbulDateIso(new Date())), [params, profectionCtx, profectionBirthDate]);
  const selections = useMemo(() => {
    const all = buildSelections(checked, paramsView, method).filter((s) => s.technique !== "western.profections" || profectionSelectionCurrent(paramsView, profectionCtx));
    // Karşı taraf seçilmeden ikili teknikler plana girmez (uyarı ayrıca gösterilir).
    return paramsView.partnerProfileId ? all : all.filter((s) => !TECHNIQUE_META[s.technique].needsPartner);
  }, [checked, paramsView, method, profectionCtx]);

  const runs = ctxKey ? (benches[ctxKey] ?? null) : null;
  const runError = runErrorState && runErrorState.key === ctxKey ? runErrorState.message : null;
  const activeItem = runs && runs.active && runs.open.includes(runs.active) ? (runs.items.find((x) => x.key === runs.active) ?? null) : null;
  useEffect(() => {
    hasResultRef.current = !!(runs && (runs.items.length > 0 || runs.fails.length > 0)) || !!openAnalysis;
  }, [runs, openAnalysis]);

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
  const planetaryReturns = plan?.selections.find((s) => s.technique === "western.planetary_return")?.info?.planetaryReturns ?? null;
  const planetaryReturnNeighbors = plan?.selections.find((s) => s.technique === "western.planetary_return")?.info?.planetaryReturnNeighbors ?? null;

  async function run() {
    if (!shownDetail || revision === null || !ctxKey || !plan || !planKey) return;
    const key = ctxKey;
    const seq = ++runSeq.current;
    // Önizlemede gösterilen NORMALİZE seçenekler aynen çalıştırılır (ör. "şimdi" saat başı); KP horary + şimdi istisnası: runOptionsFor.
    const sels = plan.selections.map((s, i) => ({ technique: s.technique, options: runOptionsFor(s.technique, s.options, selections[i].options) }));
    setRunning(true);
    setRunErrorState(null);
    setLastFailures(null);
    setLastRunSig(JSON.stringify(selections));
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
      // Engellenen/başarısız seçimler hata geçmişine yazılır (Roxy isteği yapılmadan). Hiçbiri başarılı DEĞİLSE sonuç
      // ekranına geçilmez (boş ekran yerine Yeni Analiz'de neden + sonraki adım gösterilir).
      const items = (r.data?.results as ResultItem[] | undefined) ?? null;
      if (items) {
        mergeRun(key, items, sels, (r.data?.executed as RunResponse["executed"]) ?? { newResults: 0, cachedResults: 0, providerAttempts: 0 });
        const failed = items.filter((x): x is Extract<ResultItem, { ok: false }> => !x.ok);
        if (items.some((x) => x.ok)) {
          setResultMode("run");
          go("result");
        } else if (failed.length > 0) {
          setRunErrorState(null);
          setLastFailures({ key, at: nowMs(), items: failed.map((f) => ({ technique: f.technique, code: f.code, error: f.error, retryAfterSec: f.retryAfterSec })) });
        }
      }
      return;
    }
    mergeRun(key, r.data.results, sels, r.data.executed);
    setResultMode("run");
    go("result");
  }

  /**
   * D4: sonuçları çalışma masasına BİRLEŞTİRİR (aynı teknik+normalize seçenek → güncellenir, yeni → eklenir ve sekmesi
   * açılır). Başarısız seçimler sekme değil hata listesidir; aynı teknik sonradan başarılı olursa listeden düşer.
   */
  function mergeRun(key: string, results: ResultItem[], sels: { technique: string; options: Record<string, unknown> | null }[], executed: RunResponse["executed"]) {
    setBench(key, (prev) => {
      const base: Bench = prev ?? { key, seq: 0, items: [], fails: [], open: [], active: null, executed };
      const items = [...base.items];
      let fails = [...base.fails];
      const open = [...base.open];
      let first: string | null = null;
      results.forEach((res, i) => {
        if (res.ok) {
          const k = `${res.technique}|${JSON.stringify(res.view.options)}`;
          const at = items.findIndex((x) => x.key === k);
          if (at >= 0) items[at] = { ...res, key: k };
          else items.push({ ...res, key: k });
          if (!open.includes(k)) open.push(k);
          fails = fails.filter((f) => f.technique !== res.technique);
          first ??= k;
        } else {
          const fk = `${res.technique}|${JSON.stringify(sels[i]?.options ?? null)}`;
          const prevF = fails.find((f) => f.key === fk);
          fails = [
            ...fails.filter((f) => f.key !== fk),
            { key: fk, technique: res.technique, code: res.code, error: res.error, options: sels[i]?.options ?? null, attempts: (prevF?.attempts ?? 0) + 1, lastAt: Date.now(), retryAfterSec: res.retryAfterSec },
          ];
        }
      });
      return { ...base, seq: base.seq + 1, items, fails, open, active: first ?? (base.active && open.includes(base.active) ? base.active : (open[0] ?? null)), executed };
    });
  }

  /** Sekme kapatma sonucu SİLMEZ (bellekte kalır); yalnız o sekmenin kaydedilmemiş not taslağı kaybolacaksa uyarır. */
  function requestCloseTab(k: string) {
    if (dirtyTabs[k]) {
      setPendingLeave({
        message: LEAVE_MESSAGE,
        details: ["Bu sekmenin “Kendi Yorumum” / Bilgi Bankası taslağı (analiz sonucu silinmez, sekme yeniden açılabilir)"],
        action: () => closeTab(k),
      });
      return;
    }
    closeTab(k);
  }

  // ── Kaydedilmemiş çalışma envanteri ──
  const unsavedOf = (b: Bench) => b.items.filter((i) => !savedIds[`${b.key}|${i.key}`]);
  const unsavedTotal = Object.values(benches).reduce((n, b) => n + unsavedOf(b).length, 0);
  // Yeni Analiz: seçilmiş ama son hesaplamadan SONRA değişmiş teknik seçimi (hesaplanmış seçim tekrar uyarı üretmez).
  const [lastRunSig, setLastRunSig] = useState<string | null>(null);
  const selSig = selections.length > 0 ? JSON.stringify(selections) : null;
  const prepDirty = selSig !== null && selSig !== lastRunSig;
  const formLoss = form ? (form.mode === "create" ? "Doldurulmuş ama kaydedilmemiş Yeni Danışan formu" : "Kaydedilmemiş doğum bilgisi düzenlemesi") : "";
  function moduleLoss(): string[] {
    const out: string[] = [];
    if (unsavedTotal > 0) out.push(`${unsavedTotal} hesaplanmış ama Analiz Arşivi'ne kaydedilmemiş analiz`);
    if (anyDirty) out.push(DRAFT_LOSS);
    if (kbDirty && view === "kb") out.push("Bilgi Bankası'nda kaydedilmemiş kayıt");
    if (form && formDirty) out.push(formLoss);
    if (addOpen && addDirty) out.push("Teknik Ekle'de seçilmiş ama hesaplanmamış teknikler");
    if (prepDirty) out.push("Yeni Analiz'de seçilmiş ama henüz hesaplanmamış teknikler");
    return out;
  }
  /** Yalnız GÖRÜNÜM değişince kaybolanlar (masadaki sonuçlar görünüm değişince KAYBOLMAZ). */
  function viewLoss(from: AtlasView, to: AtlasView): string[] {
    if (from === to) return [];
    const out: string[] = [];
    if (from === "result" && anyDirty) out.push(DRAFT_LOSS);
    if (from === "kb" && kbDirty) out.push("Bilgi Bankası'nda kaydedilmemiş kayıt");
    if (form && formDirty) out.push(formLoss);
    return out;
  }
  const router = useRouter();
  const leaveTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    },
    [],
  );
  function leaveModule(href?: string) {
    leavingRef.current = true;
    if (href) {
      router.push(href);
      return;
    }
    // Kök kaydın altına (modüle girilen sayfaya) dön. Modül doğrudan açıldıysa geride sayfa yoktur → ana sayfaya.
    window.history.go(-2);
    leaveTimer.current = window.setTimeout(() => {
      if (window.location.pathname === pathRef.current) router.push(isAdminSurface() ? "/admin" : "/dashboard");
    }, 700);
  }
  function askLeave(p: NonNullable<typeof pendingLeave>) {
    setLeaveSaving({ busy: false, error: null });
    // "Kaydet ve Çık" yalnız kaybolacak tek şey kaydedilmemiş analiz sonuçlarıysa sunulur (taslak/form otomatik kaydedilmez).
    const onlyBench = p.details.length > 0 && p.details.every((d) => d.includes("Analiz Arşivi'ne kaydedilmemiş"));
    setPendingLeave(onlyBench && !p.saveKeys ? { ...p, saveKeys: Object.values(benches).flatMap((b) => unsavedOf(b).map((i) => `${b.key}|${i.key}`)) } : p);
  }
  useEffect(() => {
    guardRef.current = {
      moduleLoss,
      ask: askLeave,
      leaveModule,
      onPop: () => {
        if (pendingLeave) {
          setPendingLeave(null);
          return true;
        }
        if (saveDialog) {
          setSaveDialog(false);
          return true;
        }
        if (archiveDelete) {
          setArchiveDelete(null);
          return true;
        }
        if (addOpen) {
          if (addDirty) askLeave({ message: LEAVE_MESSAGE, details: ["Teknik Ekle'de seçilmiş ama hesaplanmamış teknikler"], action: () => setAddOpen(null) });
          else setAddOpen(null);
          return true;
        }
        if (form) {
          if (formDirty) askLeave({ message: LEAVE_MESSAGE, details: [formLoss], action: () => setForm(null) });
          else setForm(null);
          return true;
        }
        return false;
      },
    };
    viewLossRef.current = viewLoss;
    closeFormsRef.current = () => setForm(null);
  });
  // Tarayıcı yenileme / sekme kapatma / harici siteye çıkış: yalnız tarayıcının standart uyarısı gösterilebilir.
  const leaveRisk = unsavedTotal > 0 || anyDirty || (kbDirty && view === "kb") || (!!form && formDirty) || (!!addOpen && addDirty) || prepDirty;
  useEffect(() => {
    if (!leaveRisk) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (leavingRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    // Modül dışına giden uygulama bağlantıları (üst menü vb.): tıklama yakalanır, onaydan sonra gidilir.
    const onClick = (e: MouseEvent) => {
      if (leavingRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === pathRef.current) return;
      const loss = guardRef.current.moduleLoss();
      if (loss.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      guardRef.current.ask({ message: LEAVE_MESSAGE, details: loss, action: () => guardRef.current.leaveModule(`${url.pathname}${url.search}${url.hash}`) });
    };
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [leaveRisk]);
  /** Uygulama içi görünüm değişimi: yalnız gerçekten kaybolacak taslak varsa uyarır. */
  function guardGo(v: AtlasView, then?: () => void) {
    const run = () => {
      setForm(null);
      then?.();
      go(v);
    };
    const loss = viewLoss(view, v);
    if (loss.length > 0) askLeave({ message: LEAVE_MESSAGE, details: loss, action: run });
    else run();
  }
  /** Form kapatma (✕ / Vazgeç / geri): doldurulmuş form uyarısız kaybolmaz. */
  function closeForm() {
    if (form && formDirty) askLeave({ message: LEAVE_MESSAGE, details: [formLoss], action: () => setForm(null) });
    else setForm(null);
  }
  /**
   * Doğum bilgisi düzeltmesi YENİ revizyon açar; bu revizyonun masasındaki kaydedilmemiş sonuçlar ekrandan kalkar (bellekte
   * eski revizyona bağlı kalır). Önce açıkça uyarılır.
   */
  function guardRevision(action: () => void) {
    const pending = runs ? runs.items.filter((x) => !savedIds[`${runs.key}|${x.key}`]).length : 0;
    if (pending > 0) {
      askLeave({
        message: LEAVE_MESSAGE,
        details: [`${pending} hesaplanmış ama Analiz Arşivi'ne kaydedilmemiş analiz — doğum bilgisi değişince bu sonuçlar eski revizyonda kalır, ekrandan kalkar`],
        action,
      });
      return;
    }
    action();
  }
  function guardLeave(action: () => void) {
    const loss = viewLoss(view, "new");
    if (loss.length > 0) askLeave({ message: LEAVE_MESSAGE, details: loss, action });
    else action();
  }

  /**
   * TOPLU KAYIT — seçilen sonuçları SIRAYLA mevcut kayıt ucuna gönderir (her teknik ayrı değişmez analiz). Kararlı
   * saveRequestId → yeniden deneme mükerrer kayıt üretmez. Başarı yalnız sunucudan geri okunursa. Sağlayıcı çağrılmaz.
   * Anahtar: "profil|revizyon|teknik|seçenekler".
   */
  async function saveBenchKeys(fullKeys: string[], titles: Record<string, string>, onItem?: (r: SaveItemResult) => void): Promise<SaveItemResult[]> {
    const out: SaveItemResult[] = [];
    for (const fk of fullKeys) {
      const [pid, revRaw] = fk.split("|");
      const bench = benches[`${pid}|${revRaw}`];
      const itemKey = fk.slice(pid.length + revRaw.length + 2);
      const it = bench?.items.find((x) => x.key === itemKey);
      let res: SaveItemResult;
      if (!bench || !it) res = { key: itemKey, ok: false, error: "Sonuç çalışma masasında bulunamadı." };
      else {
        saveReqIds.current[fk] ??= crypto.randomUUID();
        const title = titles[itemKey]?.trim();
        const r = await astroFetch<{ analysisId: string; reused: boolean }>("/api/admin/astroloji/analyses", {
          method: "POST",
          body: { profileId: pid, revision: Number(revRaw), technique: it.technique, options: it.view.options, title: title || undefined, saveRequestId: saveReqIds.current[fk] },
        });
        if (!r.ok) res = { key: itemKey, ok: false, error: r.error };
        else {
          const check = await astroFetch<{ analysis: { id: string } }>(`/api/admin/astroloji/analyses/${encodeURIComponent(r.data.analysisId)}`);
          res = check.ok
            ? { key: itemKey, ok: true, analysisId: r.data.analysisId, reused: r.data.reused }
            : { key: itemKey, ok: false, error: `Kayıt doğrulanamadı (${check.error}). Yeniden denediğinizde aynı kayıt yinelenmez.` };
        }
        if (res.ok) {
          const id = res.analysisId;
          setSavedIds((m) => ({ ...m, [fk]: id }));
        }
      }
      onItem?.(res);
      out.push(res);
    }
    if (out.some((r) => r.ok)) {
      setAnalysesReload((n) => n + 1);
      setProfilesReload((n) => n + 1);
    }
    return out;
  }

  /**
   * FINAL: başarısız/kilitli seçim için ÜCRETSİZ durum kontrolü — YALNIZ-ÖNBELLEK uç (/engine/view; sağlayıcı bağımlılığı
   * yoktur). Sonuç kaydedilmişse masaya eklenir; yoksa hata kaydına not düşülür. Yeni ücretli istek GÖNDERİLMEZ.
   */
  async function checkFailStatus(fk: string) {
    if (!runs || !shownDetail || revision === null || !ctxKey) return;
    const f = runs.fails.find((x) => x.key === fk);
    if (!f || !f.options) return;
    const key = ctxKey;
    const r = await astroFetch<{ results: ResultItem[] }>(`/api/admin/astroloji/engine/view${previewNoInterp ? "?previewNoInterp=1" : ""}`, {
      method: "POST",
      body: { profileId: shownDetail.id, revision, selections: [{ technique: f.technique, options: f.options }] },
    });
    const it = r.ok ? r.data.results[0] : null;
    if (it && it.ok) {
      mergeRun(key, [it], [{ technique: f.technique, options: f.options }], runs.executed);
      return;
    }
    setBench(key, (prev) =>
      prev
        ? { ...prev, fails: prev.fails.map((x) => (x.key === fk ? { ...x, note: `Kontrol ${new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}: kayıtlı sonuç yok — hesaplama tamamlanmamış veya başarısız olmuş.` } : x)) }
        : prev,
    );
  }

  function closeTab(k: string) {
    if (!ctxKey) return;
    setBench(ctxKey, (prev) => {
      if (!prev) return prev;
      const idx = prev.open.indexOf(k);
      const open = prev.open.filter((x) => x !== k);
      const active = prev.active === k ? (open[Math.min(idx, open.length - 1)] ?? null) : prev.active;
      return { ...prev, open, active };
    });
  }

  /**
   * Aşama 5E: dasha alt düzeyini TEMBEL yükler — aynı çalıştırma ucu (planlayıcı + önbellek + yetki/yorum kapısı):
   * önbellekte varsa 0 sağlayıcı isteği. Tek seçim eşik altında → onay gerekmez. KB eşleşmeleri çalışma alanı
   * ucundan (sağlayıcı ÇAĞRILMAZ).
   */
  async function drillDasha(o: DashaPathSel, base: Record<string, unknown>, technique: string): Promise<DashaDrillResult> {
    if (!shownDetail || revision === null) return { ok: false, error: "Profil seçili değil." };
    // 6E: KP dasha aynı tembel mekanizmayı kullanır (KP ayanamsa + düğüm seçeneği korunur). 2026-10-21: teknik açıkça verilir
    // (Vedik ayanamsa listesinde KP çerçeveleri de var → ayanamsa adından KP çıkarımı Vedik ve KP alanlarını karıştırabilirdi).
    // Alt düzey isteğine zincir seçeneği EKLENMEZ (ek ücretli birim açılmaz); 4.–5. düzey yolu yalnız doluysa gönderilir.
    const path = { mahadasha: o.mahadasha, antardasha: o.antardasha, ...(o.pratyantardasha ? { pratyantardasha: o.pratyantardasha } : {}), ...(o.sookshma ? { sookshma: o.sookshma } : {}) };
    const sel =
      technique === "kp.dasha"
        ? { technique: "kp.dasha", options: { ayanamsa: base.ayanamsa, nodeType: base.nodeType, ...path } }
        : { technique: "vedic.dasha", options: { ayanamsa: base.ayanamsa ?? "lahiri", ...path } };
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

  /**
   * TRANSİT-01: Transit Takvimi gününden transit haritası. Önce ÜCRETSİZ plan (sağlayıcı çağrılmaz; kayıtlı sonuç varsa
   * 0 istek), uzman onayından sonra aynı çalıştırma ucu (planlayıcı + önbellek + kilit + saatlik sınır + yorum kapısı).
   * Seçenek takvim penceresini taşır → çalışma motoru takvimin ÖNBELLEKTEKİ olaylarından kesinleşme anlarını ekler
   * (yeni istek yok). Takvim analizi değişmez; transit yeni sekmede açılır ve ayrıca kaydedilir.
   */
  function calendarTransitFor(it: BenchItem): CalendarTransitApi | null {
    if (it.technique !== "western.forecast" || !shownDetail || revision === null || !ctxKey) return null;
    const o = it.view.options as { startDate?: unknown; days?: unknown; displayTz?: unknown };
    if (typeof o.startDate !== "string" || typeof o.days !== "number") return null;
    const profileId = shownDetail.id;
    const rev = revision;
    const key = ctxKey;
    const sel = (atUtc: string) => ({
      technique: "western.transit",
      options: { atUtc, nodeType: method.nodeType, calendar: { startDate: o.startDate, days: o.days }, ...(typeof o.displayTz === "string" ? { displayTz: o.displayTz } : {}) },
    });
    return {
      plan: async (atUtc) => {
        const r = await astroFetch<{ plan: PlanSummary }>("/api/admin/astroloji/engine/plan", { method: "POST", body: { profileId, revision: rev, selections: [sel(atUtc)] } });
        if (!r.ok) return { ok: false, error: r.error };
        const s0 = r.data.plan.selections[0];
        if (!s0) return { ok: false, error: "Plan alınamadı." };
        if (s0.blocked) return { ok: false, error: s0.blocked.error };
        return { ok: true, newRequests: r.data.plan.newRequestCount };
      },
      open: async (atUtc, confirmNewRequests) => {
        const sels = [sel(atUtc)];
        const r = await astroFetch<RunResponse>(`/api/admin/astroloji/engine/run${previewNoInterp ? "?previewNoInterp=1" : ""}`, {
          method: "POST",
          body: { profileId, revision: rev, selections: sels, confirmNewRequests },
        });
        setPlanNonce((n) => n + 1);
        const items = r.ok ? r.data.results : ((r.data?.results as ResultItem[] | undefined) ?? null);
        if (items) mergeRun(key, items, sels, r.ok ? r.data.executed : ((r.data?.executed as RunResponse["executed"]) ?? { newResults: 0, cachedResults: 0, providerAttempts: 0 }));
        if (!r.ok) return { ok: false, error: r.error };
        const it0 = r.data.results[0];
        return it0 && it0.ok ? { ok: true } : { ok: false, error: it0 && !it0.ok ? it0.error : "Transit hesaplanamadı." };
      },
    };
  }

  async function togglePreview(next: boolean) {
    writePreviewFlag(next);
    if (!runs || !shownDetail || revision === null || !ctxKey) return;
    const key = ctxKey;
    const seq = runs.seq;
    const okIdx = runs.items.map((_, i) => i);
    if (okIdx.length === 0) return;
    // YALNIZ-ÖNBELLEK görünüm ucu: hiçbir koşulda sağlayıcı çağrılmaz; yorum katmanına sunucu yeniden karar verir.
    const r = await astroFetch<{ results: ResultItem[] }>(`/api/admin/astroloji/engine/view${next ? "?previewNoInterp=1" : ""}`, {
      method: "POST",
      body: {
        profileId: shownDetail.id,
        revision,
        selections: okIdx.map((i) => {
          const it = runs.items[i];
          return { technique: it.technique, options: it.view.options };
        }),
      },
    });
    if (!r.ok) return;
    setBench(key, (prev) => {
      if (!prev || prev.seq !== seq) return prev;
      const items = [...prev.items];
      okIdx.forEach((i, j) => {
        const v = r.data.results[j];
        if (v && v.ok) items[i] = { ...v, key: items[i].key };
      });
      return { ...prev, items };
    });
  }

  // Analiz Arşivi başlık metrikleri (yalnız görüntü; ArchiveList yüklediği sayfadan bildirir).
  const [archiveSummary, setArchiveSummary] = useState<ArchiveSummary | null>(null);

  const partnerLabelOf = (v: View) => (typeof v.options.partnerProfileId === "string" ? (labelOf(v.options.partnerProfileId) ?? "Karşı taraf") : "2. kişi");

  if (access === "denied") return <ModuleAccessDenied reason="permission" />;
  if (access === null) {
    return (
      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <p className="text-sm text-slate-400">Yükleniyor…</p>
      </main>
    );
  }

  const ownerTools = isOwnerView ? (
      <details className="relative">
        <summary className={isPremiumView(view) ? `${ap.btnGhost} cursor-pointer list-none` : "flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-slate-300 hover:border-white/30 hover:text-white"}>
          <Settings2 className="h-3.5 w-3.5" /> Önizleme ve denetim
        </summary>
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 text-slate-800 shadow-xl">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={previewNoInterp} onChange={(e) => void togglePreview(e.target.checked)} />
            <span>
              Yorumu kapalı uzman görünümü
              <span className="block text-xs text-slate-500">Sistem yorumu yetkisi kapalı bir uzmanın göreceği ekranı önizler.</span>
            </span>
          </label>
          <button type="button" onClick={() => go("audit")} className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-left text-sm hover:border-slate-400">
            Alan denetimi
            <span className="block text-xs text-slate-500">Sağlayıcı yanıtında eşlenmemiş alanlar</span>
          </button>
        </div>
      </details>
  ) : undefined;

  return (
    <AtlasHomeContext.Provider value={() => guardGo("home")}>
    <main ref={mainRef} className={`${atlasDisplay.variable} ${atlasText.variable} min-h-screen w-full overflow-x-hidden data-[atlas-light=1]:bg-none data-[atlas-light=1]:bg-[#f2f1ed] ${view === "home" ? "bg-[#f7f4fb]" : isPremiumView(view) ? ap.page : atlasNightBg}`}>
      {view === "result" ? null : view === "home" ? (
        <AtlasHero
          onNavigate={(v) => guardGo(v)}
          onRecent={() => {
            setArchiveSortReq((r) => ({ sort: "last_desc", n: (r?.n ?? 0) + 1 }));
            go("archive");
          }}
          onNewProfile={() => {
            startFreshAnalysis(null);
            setForm({ mode: "create" });
          }}
          onSoon={() => guardGo("soon")}
        />
      ) : view === "new" ? (
        /* Yeni Analiz (owner 2026-10-23, Öneri 3): büyük başlık/sekme şeridi yerine ince çalışma çubuğu; gezinme aynı guardGo. */
        <AtlasWorkBar onNavigate={(v) => guardGo(v)} />
      ) : isPremiumView(view) ? (
        /* Açık premium başlık (Analiz Arşivi · Bilgi Bankası) — gezinme aynı guardGo ile. */
        <AtlasPremiumHero
          view={view}
          onNavigate={(v) => guardGo(v)}
          ownerTools={ownerTools}
          scene={view === "kb" ? "bilgi" : "genel"}
          eyebrow={view === "archive" ? "Kayıtlar" : "Çalışma alanı"}
          title={view === "archive" ? "Analiz Arşivi" : "Bilgi Bankası"}
          sub={
            view === "archive"
              ? "Kayıtlı analizi olan danışanlar; bir satıra basarak danışan dosyasını açın."
              : "Kendi yorumlarınız ve kaynak notlarınız; analizlerde ilgili konuyla otomatik eşleşir."
          }
          aside={
            view === "archive" && archiveSummary ? (
              <AtlasMetrics columns={archiveSummary.analyses !== null ? 3 : 1}>
                <AtlasMetric icon={<Users className="h-5 w-5" />} label={archiveSummary.filtered ? "Aramaya uyan danışan" : "Toplam danışan"} value={archiveSummary.total} />
                {archiveSummary.analyses !== null && <AtlasMetric icon={<ScrollText className="h-5 w-5" />} label="Toplam analiz" value={archiveSummary.analyses} />}
                {archiveSummary.analyses !== null && <AtlasMetric icon={<CalendarDays className="h-5 w-5" />} label="Son analiz" value={archiveSummary.lastAt ?? "—"} />}
              </AtlasMetrics>
            ) : undefined
          }
        />
      ) : (
      <AtlasHeader
        view={view}
        bare={view === "archive" || view === "client"}
        resultFrom={resultMode === "saved" ? "archive" : "new"}
        onNavigate={(v) => guardGo(v)}
        ownerTools={ownerTools}
      />
      )}

      <div className={`mx-auto w-full max-w-[1600px] flex-col gap-5 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] sm:px-6 lg:px-8 ${view === "result" || view === "new" ? "py-3" : "py-6"} ${view === "home" ? "hidden" : "flex"}`}>
        {view === "kb" && <KnowledgeBankPanel onDirtyChange={setKbDirty} />}
        {view === "audit" && isOwnerView && <UnmappedAuditPanel />}
        {view === "soon" && <ComingSoonPanel onHome={() => guardGo("home")} />}


        {/* Kalıcı silme akışı (Arşiv, Danışan Dosyası ve Yeni Analiz'deki "Profili Sil" ortak; görünümden bağımsız katman). */}
        {archiveDelete && (
          <ArchiveDeleteFlow
            key={`${archiveDelete.scope}|${archiveDelete.ids.join(",")}`}
            scope={archiveDelete.scope}
            ids={archiveDelete.ids}
            onDeleted={(_r, deletedIds) => {
              setArchiveDelete((d) => (d ? { ...d, deleted: deletedIds } : d));
              setProfilesReload((n) => n + 1);
              setArchiveReload((n) => n + 1);
              setAnalysesReload((n) => n + 1);
              setParams((p) => ({ ...p, partnerProfileId: deletedIds.includes(p.partnerProfileId) ? "" : p.partnerProfileId }));
              // Kalıcı silinen profilin bellekteki sonuçları artık kaydedilemez → masa ve etiket önbelleğinden düşer
              // (Danışan Seç / karşı taraf listesinde eski ad kalmaz).
              if (deletedIds.length > 0) {
                setBenches((m) => Object.fromEntries(Object.entries(m).filter(([k]) => !deletedIds.includes(k.split("|")[0]))));
                setKnownLabels((m) => Object.fromEntries(Object.entries(m).filter(([k]) => !deletedIds.includes(k))));
                setPartnerOptions((o) => o.filter((x) => !deletedIds.includes(x.id)));
              }
            }}
            onClose={() => {
              const deleted = archiveDelete.deleted ?? [];
              setArchiveDelete(null);
              // Açık danışan dosyası silindiyse listeye dön (silinmiş profil dosyası gösterilmez).
              if (selectedId && deleted.includes(selectedId)) {
                clearSelection();
                if (view === "client") go("archive");
              }
            }}
          />
        )}
        {/* Aşama D3: Yeni Analiz = Göksel Analiz Hazırlık Merkezi (yalnız yerleşim; plan/çalıştırma mantığı aşağıdaki run() ile aynı). */}
        {view === "new" && runs && runs.items.some((x) => !savedIds[`${runs.key}|${x.key}`]) && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-300/60 bg-amber-100/95 px-4 py-2.5 text-sm text-amber-950" role="status" data-testid="atlas-unsaved-banner">
            <span className="min-w-0 flex-1">
              Bu danışan için <strong>{runs.items.filter((x) => !savedIds[`${runs.key}|${x.key}`]).length} kaydedilmemiş analiz</strong> sonuç masasında bekliyor (kaybolmadı).
            </span>
            <span className="flex gap-2">
              <button type="button" className="rounded-lg border border-amber-500/60 bg-white px-3 py-1.5 font-medium" onClick={() => { setResultMode("run"); go("result"); }} data-testid="atlas-unsaved-banner-open">
                Sonuçlara dön
              </button>
              <button type="button" className="rounded-lg bg-[#0b1430] px-3 py-1.5 font-medium text-white" onClick={() => { setResultMode("run"); go("result"); setSaveDialog(true); }} data-testid="atlas-unsaved-banner-save">
                Tümünü Kaydet
              </button>
            </span>
          </div>
        )}
        {view === "new" && (
          <PrepCenter
            profile={shownDetail}
            rev={currentRev}
            picker={
              <ClientPicker
                compact
                selectedId={selectedId}
                selectedLabel={shownDetail?.label ?? (selectedId ? (knownLabels[selectedId] ?? null) : null)}
                reloadKey={profilesReload}
                onSelect={(p) => selectProfile(p.id)}
                onCreate={() => setForm({ mode: "create" })}
                onItems={rememberLabels}
              />
            }
            onCreateClient={() => setForm({ mode: "create" })}
            onEditBirth={
              shownDetail && currentRev
                ? () =>
                    guardRevision(() => setForm({
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
                    }))
                : null
            }
            onDeleteProfile={shownDetail ? () => setArchiveDelete({ scope: "single", ids: [shownDetail.id] }) : null}
            checked={checked}
            onChecked={setChecked}
            params={paramsView}
            onParams={setParams}
            method={method}
            onMethod={setMethod}
            partners={partners}
            partnerQuery={partnerQuery}
            onPartnerQuery={setPartnerQuery}
            lunarReturns={lunarReturns}
            planetaryReturns={planetaryReturns}
            planetaryReturnNeighbors={planetaryReturnNeighbors}
            selections={selections}
            plan={plan}
            planError={planError}
            running={running}
            runError={runError}
            runFailures={lastFailures && lastFailures.key === ctxKey ? lastFailures : null}
            onDismissFailures={() => setLastFailures(null)}
            onRun={() => void run()}
            labelOf={labelOf}
          />
        )}
        {view === "new" && form && (
          <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-[#050816]/80 p-3 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={form.mode === "create" ? "Yeni Danışan" : "Doğum Bilgilerini Düzenle"} data-testid="atlas-profile-dialog">
            <div className="w-full max-w-2xl rounded-[1.4rem] border border-[#D9B56F]/40 bg-[linear-gradient(180deg,#E6C887,#C9A158)] p-[3px] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95)]">
              <div className="relative max-h-[88svh] overflow-y-auto rounded-[1.25rem] bg-white">
                <button type="button" onClick={closeForm} aria-label="Kapat" className="absolute right-3 top-3 z-10 rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100">
                  ✕
                </button>
                {form.mode === "create" ? (
                  <ProfileForm
                    mode="create"
                    heading="Yeni Danışan"
                    onCancel={closeForm}
                    onDiscard={() => setForm(null)}
                    onOpenExisting={(id) => {
                      setFormDirty(false);
                      setForm(null);
                      openClientFile(id);
                    }}
                    onDirtyChange={setFormDirty}
                    onDone={(id) => {
                      setProfilesReload((n) => n + 1);
                      selectProfile(id);
                    }}
                  />
                ) : (
                  <ProfileForm
                    mode="revise"
                    heading="Doğum Bilgilerini Düzenle"
                    initial={form.initial}
                    onCancel={closeForm}
                    onDiscard={() => setForm(null)}
                    onOpenExisting={(id) => {
                      setFormDirty(false);
                      setForm(null);
                      openClientFile(id);
                    }}
                    onDirtyChange={setFormDirty}
                    onDone={(id) => {
                      setForm(null);
                      setProfilesReload((n) => n + 1);
                      if (id === selectedId) setDetailReload((n) => n + 1);
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Analiz Arşivi (liste) ve Danışan Dosyası (#danisan/<id>) aynı kapta: liste Danışan Dosyası açıkken GİZLENİR ama
            bağlı kalır → geri dönüşte arama, filtre, sayfa ve kaydırma konumu korunur. */}
        <div className={`grid items-start gap-5 ${view === "archive" || view === "client" ? "" : "hidden"}`}>
          <div className={view === "client" ? "hidden" : "min-w-0"}>
            <ArchiveList reloadKey={profilesReload + archiveReload} onOpen={(id) => openClientFile(id)} onDelete={(req) => setArchiveDelete(req)} onItems={rememberLabels} sortRequest={archiveSortReq} onSummary={setArchiveSummary} />
          </div>
          <section className={`min-w-0 flex-col gap-5 ${view === "client" ? "flex lg:grid lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)] lg:items-start" : "hidden"}`} data-testid={view === "client" ? "astro-client-file" : undefined}>
            {view === "client" && (
              <div className="flex flex-wrap items-center justify-between gap-2 max-sm:px-3 lg:col-span-2">
                <button type="button" onClick={() => go("archive")} className={atlasGhostBtn} data-testid="astro-client-file-back">
                  <ArrowLeft className="h-4 w-4" /> Analiz Arşivi&apos;ne Dön
                </button>
              </div>
            )}
            {view === "client" && detailError && detailError.id === selectedId && (
              <div className={`${atlasPanel} px-6 py-10 text-center text-sm text-rose-800 lg:col-span-2`} role="alert" data-testid="astro-client-file-error">
                {detailError.error}
              </div>
            )}
            {view === "client" && form?.mode === "create" && (
              <div className={`${atlasPanel} overflow-hidden lg:col-span-2`}>
                <ProfileForm
                  mode="create"
                  onCancel={closeForm}
                  onDiscard={() => setForm(null)}
                  onOpenExisting={(id) => {
                    setFormDirty(false);
                    setForm(null);
                    openClientFile(id);
                  }}
                    onDirtyChange={setFormDirty}
                  onDone={(id) => {
                    setProfilesReload((n) => n + 1);
                    openClientFile(id);
                  }}
                />
              </div>
            )}
            {view === "client" && form?.mode === "revise" && (
              <div className={`${atlasPanel} overflow-hidden lg:col-span-2`}>
                <ProfileForm
                  mode="revise"
                  initial={form.initial}
                  onCancel={closeForm}
                  onDiscard={() => setForm(null)}
                  onOpenExisting={(id) => {
                    setFormDirty(false);
                    setForm(null);
                    openClientFile(id);
                  }}
                    onDirtyChange={setFormDirty}
                  onDone={(id) => {
                    setForm(null);
                    setProfilesReload((n) => n + 1);
                    if (id === selectedId) setDetailReload((n) => n + 1);
                  }}
                />
              </div>
            )}

            {view === "client" && shownDetail && !form && (
              <div className={`${atlasPanel} flex flex-col gap-4 p-5 max-sm:px-3 sm:p-6 lg:sticky lg:top-4`} data-testid="astro-client-card">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  {/* Danışan kimliği: monogram + ad + durum rozetleri */}
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#0B1430] text-xl font-light text-[#F6E7C3] shadow-[0_10px_24px_-12px_rgba(11,20,48,0.9)] [font-family:var(--font-atlas-display)]" aria-hidden="true">
                      <span className="absolute inset-1 rounded-full border border-[#D9B56F]/50" />
                      {shownDetail.label.trim().charAt(0).toLocaleUpperCase("tr-TR") || "✦"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#a8843e]">Danışan dosyası</p>
                      <h3 className="mt-0.5 flex flex-wrap items-center gap-2 break-words text-2xl font-light tracking-[0.02em] text-[#0B1430] [font-family:var(--font-atlas-display)]">
                        {shownDetail.label}
                        {shownDetail.archivedAt && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 [font-family:var(--font-atlas-text)]">Arşivde</span>}
                      </h3>
                      {shownDetail.clientName && <p className="text-xs text-emerald-800">Danışan Yolculuğu: {shownDetail.clientName}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                  {currentRev && (
                    <button
                      type="button"
                      className={atlasSecondaryBtn}
                      onClick={() =>
                        guardRevision(() =>
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
                          }),
                        )
                      }
                    >
                      Doğum bilgisini düzelt
                    </button>
                  )}
                  {view === "client" && (
                    <>
                  <button
                    type="button"
                    className={atlasSecondaryBtn}
                    onClick={() => (shownDetail.archivedAt ? void setArchived(false) : setArchiveConfirm(true))}
                    disabled={archiveBusy}
                    data-testid="astro-archive-toggle"
                  >
                    {shownDetail.archivedAt ? "Arşivden çıkar" : "Arşivle"}
                  </button>
                  <button type="button" className={atlasDangerBtn} onClick={() => setArchiveDelete({ scope: "single", ids: [shownDetail.id] })} data-testid="astro-delete-single">
                    Sil
                  </button>
                    </>
                  )}
                  </div>
                </div>

                {/* Doğum kartı: harita künyesi gibi etiketli veri döşemeleri (yalnız mevcut alanlar). */}
                {currentRev && (
                  <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#e7dcc3] bg-[#e7dcc3] sm:grid-cols-3 lg:grid-cols-2 max-sm:-mx-3 max-sm:rounded-none max-sm:border-x-0" data-testid="astro-birth-card">
                    {(
                      [
                        ["Doğum tarihi", currentRev.birthDate.split("-").reverse().join(".")],
                        ["Saat", currentRev.timeKnown ? (currentRev.birthTime?.slice(0, 5) ?? "—") : "bilinmiyor"],
                        ["Doğum yeri", currentRev.locationLabel],
                        ["Saat dilimi", `${currentRev.timezone} (${fmtOffset(currentRev.utcOffsetSeconds)})`],
                        ["Saat doğruluğu", currentRev.timeAccuracyLabel],
                        ["Doğum bilgisi", `rev ${currentRev.revision}${currentRev.revision === shownDetail.currentRevision ? " · güncel" : ""}`],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k} className="min-w-0 bg-white/80 px-3.5 py-2.5">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a8843e]">{k}</dt>
                        <dd className="mt-0.5 truncate text-sm font-medium tabular-nums text-slate-800" title={v}>
                          {v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                {archiveConfirm && !shownDetail.archivedAt && (
                  <div className="flex flex-col gap-2 rounded-xl border border-amber-300/70 bg-amber-50/80 p-3 text-xs sm:flex-row sm:items-center sm:justify-between" role="alertdialog" aria-label="Arşivleme onayı">
                    <p className="text-slate-700">Profil arşivlensin mi? Etkin listeden kalkar; kayıtlı analizler, sonuçlar ve notlar silinmez. &quot;Arşiv&quot; filtresinden bulup geri alabilirsiniz.</p>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => setArchiveConfirm(false)} className={atlasSecondaryBtn}>
                        Vazgeç
                      </button>
                      <button type="button" disabled={archiveBusy} onClick={() => void setArchived(true)} className="rounded-lg bg-[#0B1430] px-3 py-1.5 text-sm font-medium text-[#F6E7C3] disabled:opacity-60">
                        Evet, arşivle
                      </button>
                    </div>
                  </div>
                )}
                {archiveError && <p className="text-sm text-rose-700">{archiveError}</p>}
                {view === "client" && (
                  <>
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
                  </>
                )}
              </div>
            )}

            {shownDetail && !form && view === "client" && (
              <div className={`${atlasPanel} flex flex-col gap-3 p-5 max-sm:px-3`} data-testid="astro-client-file-analyses">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#a8843e]">Çalışmalar</p>
                    <h3 className="text-xl font-light tracking-[0.02em] text-[#0B1430] [font-family:var(--font-atlas-display)]">Kayıtlı analizler</h3>
                  </div>
                  <p className="text-xs text-slate-500">Bir satıra basarak analizi açın; kayıtlar değişmez.</p>
                </div>
                <SavedAnalysesList
                  currentRevision={shownDetail.currentRevision}
                  profileLabel={shownDetail.label}
                  profileId={shownDetail.id}
                  reloadKey={analysesReload}
                  openId={openAnalysis && openAnalysis.profileId === shownDetail.id ? openAnalysis.id : null}
                  onOpen={(id) => {
                    suppressMultiClickSelection();
                    setOpenAnalysis({ profileId: shownDetail.id, id });
                    setResultMode("saved");
                    go("result");
                  }}
                  previewNoInterp={previewNoInterp}
                />
              </div>
            )}
          </section>
        </div>

        {view === "result" &&
          (resultMode === "saved" && openAnalysis && shownDetail && openAnalysis.profileId === shownDetail.id ? (
            <div className="flex min-w-0 flex-col gap-3">
              {/* 2026-10-15: aynı danışanın diğer kayıtlı analizleri — arşive dönmeden geçiş (yalnız snapshot okunur, Roxy YOK). */}
              <SavedAnalysisTabs
                profileId={shownDetail.id}
                activeId={openAnalysis.id}
                reloadKey={analysesReload}
                onSelect={(id) => setOpenAnalysis({ profileId: shownDetail.id, id })}
              />
              <SavedAnalysisView
                key={openAnalysis.id}
                id={openAnalysis.id}
                previewNoInterp={previewNoInterp}
                currentRevision={shownDetail.currentRevision}
                onClose={() => go("client", { profileId: shownDetail.id })}
                onAddTechnique={() => setAddOpen({ initial: null })}
                onComputeNatal={() => setAddOpen({ initial: "western.natal" })}
              />
            </div>
          ) : resultMode === "run" && runs && (runs.items.length > 0 || runs.fails.length > 0) && shownDetail && revision !== null ? (
            (() => {
              const item = activeItem;
              const savedId = item ? (savedIds[`${runs.key}|${item.key}`] ?? null) : null;
              const saved = !!savedId;
              const unsavedHere = runs.items.filter((x) => !savedIds[`${runs.key}|${x.key}`]);
              const saveAllBtn =
                unsavedHere.length > 0 ? (
                  <button type="button" className={deskPrimary} onClick={() => setSaveDialog(true)} data-testid="astro-desk-save" title="Bu danışan için hesaplanmış ve henüz kaydedilmemiş bütün analizleri kaydeder; isterseniz tek tek seçebilirsiniz.">
                    <Save className="h-4 w-4" />
                    {unsavedHere.length === 1 ? "Analizi Kaydet" : `Tümünü Kaydet (${unsavedHere.length})`}
                  </button>
                ) : null;
              const openTabs = runs.open
                .map((k) => runs.items.find((x) => x.key === k))
                .filter((x): x is BenchItem => !!x)
                .map((x) => {
                  const o = describeOptions(x.technique, x.view.options, labelOf);
                  const dup = runs.open.filter((k) => k.startsWith(`${x.technique}|`)).length > 1;
                  return { key: x.key, label: `${techniqueLabel(x.technique)}${dup && o ? ` · ${o}` : ""}`, title: `${techniqueLabel(x.technique)}${o ? ` · ${o}` : ""}`, partial: x.partial, dirty: !!dirtyTabs[x.key], saved: !!savedIds[`${runs.key}|${x.key}`] };
                });
              const switcher = (
                <OpenTabs
                  tone="light"
                  tabs={openTabs}
                  active={item?.key ?? null}
                  onSelect={(k) => setBench(runs.key, (prev) => (prev ? { ...prev, active: k } : prev))}
                  onClose={requestCloseTab}
                  onAdd={() => setAddOpen({ initial: null })}
                  fails={runs.fails.map((f) => ({ key: f.key, technique: f.technique, label: techniqueLabel(f.technique), error: f.error, code: f.code, attempts: f.attempts, lastAt: f.lastAt, note: f.note ?? null, options: f.options ? describeOptions(f.technique, f.options, labelOf) : "", retryAt: f.retryAfterSec ? f.lastAt + f.retryAfterSec * 1000 : null }))}
                  onRetry={(t) => setAddOpen({ initial: t as UiTechniqueId })}
                  onCheck={(k) => void checkFailStatus(k)}
                />
              );
              if (!item) {
                return (
                  <section className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.012))] p-4 text-[#F6F2EA]" data-testid="astro-result-view" aria-label="Analiz sonucu">
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => guardLeave(() => go("new"))} aria-label="Teknik seçimine dön" className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[#F6F2EA]/80 hover:border-[#D9B56F]/60">
                        ←
                      </button>
                      <div>
                        <p className="text-[10.5px] font-semibold tracking-[0.16em] text-[#E6CF9F]/90">ANALİZ SONUCU</p>
                        <h2 className="text-lg font-light [font-family:var(--font-atlas-display)]">{shownDetail.label}</h2>
                      </div>
                    </div>
                    {saveAllBtn && <div>{saveAllBtn}</div>}
                    {switcher}
                    {runError && runs.fails.length === 0 && <p className="rounded-xl border border-rose-300/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-100">{runError}</p>}
                    <p className="rounded-xl border border-white/[0.07] bg-black/20 px-4 py-6 text-center text-sm text-[#F6F2EA]/70" data-testid="atlas-no-open-tabs">
                      Açık analiz yok. Kapatılan sekmeler silinmedi; <strong>+ Teknik Ekle</strong> ile bu danışan için bir tekniği yeniden açabilir ya da yeni teknik ekleyebilirsiniz.
                    </p>
                  </section>
                );
              }
              const isNatal = !!item && item.ok && item.technique === "western.natal";
              const natalTech = isNatal && item.ok ? (item.view.technical as NatalTechnical | null) : null;
              const housesAvailable = !!natalTech && !!item && item.ok && !item.view.timeUnknownMasked && natalTech.houses.length > 0;
              // D3.1: çark üreten diğer teknikler (Solar/Lunar Return, Composite) → çark harita istasyonunda, ayrıntılar sağ panelde.
              const otherWheel = item && item.ok && !isNatal ? wheelForTechnique(item.technique, item.view.technical) : null;
              // Transit / Sinastri çift halkası: Roxy'nin bileşeni, KAYITLI teknik veriyle (yeni istek yok).
              const roxyChart = item && item.ok && !isNatal && !otherWheel ? roxyChartFor(item.technique, item.view.technical) : null;
              const wheelGap =
                item && item.ok && item.technique === "western.transit" && item.view.technical
                  ? transitWheelGap(item.view.technical as TransitTechnical, item.view.timeUnknownMasked)
                  : item && item.ok
                    ? directedWheelGap(item.technique, item.view.technical, item.view.timeUnknownMasked)
                    : null;
              const interpVisible = !!item && item.ok && item.view.interpretation.visible;
              const kbCount =
                item ? (kbMap[`${shownDetail.id}|${revision}|${item.technique}|${JSON.stringify(item.view.options)}`]?.length ?? null) : null;
              const tabs: DeskTab[] = !item
                ? []
                : [
                      ...(isNatal
                        ? ([
                            { id: "harita", label: "Harita", tone: "lavender", hint: "Açısal noktalar ve dağılım" },
                            { id: "gezegenler", label: "Gezegenler", tone: "blue" },
                            ...(housesAvailable ? [{ id: "evler", label: "Evler", tone: "sage" } as DeskTab] : []),
                            { id: "acilar", label: "Açılar", tone: "peach", badge: natalTech?.aspects.length ?? null },
                          ] as DeskTab[])
                        : []),
                      ...(otherWheel || roxyChart ? ([{ id: "teknik", label: "Teknik ayrıntı", tone: "blue", hint: "Konumlar, açılar ve tablolar" }] as DeskTab[]) : []),
                      ...(interpVisible ? ([{ id: "yorum", label: interpretationTitle(item.view.interpretation), tone: "gold", ownHeading: true }] as DeskTab[]) : []),
                      { id: "bilgi", label: "Bilgi Bankam", tone: "gold", badge: kbCount || null, ownHeading: true },
                      { id: "not", label: "Kendi Yorumum", tone: "turquoise", ownHeading: true },
                    ];
              const tab = tabs.some((t) => t.id === deskTab) ? deskTab : (tabs[0]?.id ?? "durum");
              const wsSection = tab === "bilgi" ? "kb" : tab === "not" ? "notes" : null;
              const opts = item && item.ok ? describeOptions(item.technique, item.view.options, labelOf) : "";
              return (
                <ResultDesk
                  variant="light"
                  backLabel="Teknik seçimine dön"
                  onBack={() => guardLeave(() => go("new"))}
                  eyebrow="ANALİZ SONUCU"
                  title={shownDetail.label}
                  subtitle={
                    item ? (
                      <>
                        <strong className="font-semibold text-[#F6F2EA]">{techniqueLabel(item.technique)}</strong>
                        {opts ? ` · ${opts}` : ""}
                        {item.ok && item.view.method.houseSystem ? ` · ${houseSystemLabel(item.view.method.houseSystem, HOUSE_SYSTEM_LABELS)}` : ""}
                      </>
                    ) : null
                  }
                  details={currentRev ? <RevisionLine r={currentRev} /> : null}
                  meta={
                    item && item.ok
                      ? [
                          zodiacLabel(item.technique),
                          item.view.method.nodeType ? (NODE_TYPE_LABELS[item.view.method.nodeType as keyof typeof NODE_TYPE_LABELS] ?? null) : null,
                          item.view.timeUnknownMasked ? "Saat bilinmiyor · evler gizli" : null,
                        ]
                      : undefined
                  }
                  chips={
                    <>
                      <DeskChip tone={saved ? "saved" : "muted"}>{saved ? "✓ Bu analiz kaydedildi" : "Bu analiz kaydedilmedi"}</DeskChip>
                      {item && hasNoProviderInterpretation(item.technique) && (
                        <span title={NO_PROVIDER_INTERPRETATION_NOTE} data-testid="astro-no-provider-interp">
                          <DeskChip tone="muted">Otomatik yorum yok · yalnız teknik hesaplama sonuçları</DeskChip>
                        </span>
                      )}
                    </>
                  }
                  actions={
                    <>
                      {saveAllBtn}
                      {saved && (
                        <button
                          type="button"
                          className={deskGhostLight}
                          onClick={() =>
                            guardLeave(() => {
                              setOpenAnalysis({ profileId: shownDetail.id, id: savedId! });
                              setResultMode("saved");
                            })
                          }
                          data-testid="astro-open-saved"
                          title="Kayıtlı (değişmez) analizi açar; Word/PDF kayıtlı analizden üretilir."
                        >
                          Kayıtlı analizi aç
                        </button>
                      )}
                    </>
                  }
                  notices={
                    <>
                      <p className="sr-only" role="status" data-testid="astro-run-info">
                        {runs.fails.length === 0 ? "Hesaplama tamamlandı" : "Bazı teknikler hesaplanamadı"} · {runs.executed.newResults} yeni sonuç · {runs.executed.cachedResults} önceden hesaplanmış ·{" "}
                        {runs.executed.providerAttempts} sağlayıcı isteği
                      </p>
                      {runError && runs.fails.length === 0 && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{runError}</p>}
                      {roxyChart && item.technique === "western.transit" && <TransitWheelCaption technical={item.view.technical as TransitTechnical} natalName={shownDetail.label} />}
                      {roxyChart && item.technique === "western.synastry" && <SynastryWheelCaption names={[shownDetail.label, partnerLabelOf(item.view)]} />}
                      {otherWheel && <DirectedWheelCaption technique={item.technique} technical={item.view.technical} natalName={shownDetail.label} />}
                      {wheelGap && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900" data-testid="astro-wheel-gap">
                          <span className="min-w-0 flex-1">{wheelGap}</span>
                          {!item.view.timeUnknownMasked && (
                            <button type="button" className={deskGhostLight} onClick={() => setAddOpen({ initial: "western.natal" })} data-testid="astro-wheel-gap-natal" title="Teknik Ekle açılır; hazır sonuç varsa 0 istek, yoksa yeni istek sayısı onaydan önce gösterilir.">
                              Natal&apos;ı hesapla (önce plan gösterilir)
                            </button>
                          )}
                        </div>
                      )}
                      {unsavedHere.length === 0 && runs.items.length > 0 && (
                        <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-2 text-sm text-emerald-900" data-testid="astro-all-saved">
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> Bu danışanın masadaki bütün analizleri kaydedildi.
                        </p>
                      )}
                    </>
                  }
                  switcher={switcher}
                  tabs={tabs}
                  active={tab}
                  onTab={setDeskTab}
                  chartKey={item.key}
                  chart={
                    natalTech
                      ? (cls: string) => <NatalWheel technical={natalTech} sizeClassName={cls} tinted />
                      : otherWheel
                        ? (cls: string) => <NatalWheel technical={otherWheel.wheel} label={otherWheel.label} sizeClassName={cls} tinted />
                        : roxyChart
                  }
                  stage={
                    item && item.ok && !natalTech ? (
                      <TechniqueTechnical
                        hideWheel={!!otherWheel || !!roxyChart}
                        interpretation={item.view.interpretation.visible ? item.view.interpretation.content : null}
                        technique={item.technique}
                        technical={item.view.technical}
                        timeUnknownMasked={item.view.timeUnknownMasked}
                        warnings={item.view.warnings}
                        names={[shownDetail.label, partnerLabelOf(item.view)]}
                        options={item.view.options}
                        birthplace={birthplace}
                        birthMoment={balaBirth}
                        kbLookup={
                          kbMap[`${shownDetail.id}|${revision}|${item.technique}|${JSON.stringify(item.view.options)}`]
                            ? (keys) => (kbMap[`${shownDetail.id}|${revision}|${item.technique}|${JSON.stringify(item.view.options)}`] ?? []).filter((e) => keys.includes(e.topicKey))
                            : null
                        }
                        dashaDrill={item.technique === "vedic.dasha" || item.technique === "kp.dasha" ? (o) => drillDasha(o, item.view.options, item.technique) : undefined}
                        calendarTransit={calendarTransitFor(item)}
                        onDashaLevel={
                          item.technique === "vedic.dasha"
                            ? (o) => {
                                setParams((p) => ({ ...p, dashaMd: o.mahadasha ?? "", dashaAd: o.antardasha ?? "", dashaPd: o.pratyantardasha ?? "", dashaSd: o.sookshma ?? "" }));
                                go("new");
                                setTimeout(() => document.querySelector('[aria-label="Dasha mahadasha"]')?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
                              }
                            : item.technique === "kp.dasha"
                              ? (o) => {
                                  setParams((p) => ({ ...p, kpDashaMd: o.mahadasha ?? "", kpDashaAd: o.antardasha ?? "", kpDashaPd: o.pratyantardasha ?? "", kpDashaSd: o.sookshma ?? "" }));
                                  go("new");
                                  setTimeout(() => document.querySelector('[aria-label="KP dasha mahadasha"]')?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
                                }
                              : undefined
                        }
                      />
                    ) : null
                  }
                >
                  {item && (
                    <div key={item.key}>
                      {tab === "harita" && natalTech && <NatalTechnicalPanel technical={natalTech} timeUnknown={item.view.timeUnknownMasked} part="overview" />}
                      {(tab === "gezegenler" || tab === "evler" || tab === "acilar") && natalTech && (
                        <NatalTechnicalPanel technical={natalTech} timeUnknown={item.view.timeUnknownMasked} part={tab === "gezegenler" ? "planets" : tab === "evler" ? "houses" : "aspects"} />
                      )}
                      {tab === "teknik" && (otherWheel || roxyChart) && (
                        <TechniqueTechnical
                          technique={item.technique}
                          technical={item.view.technical}
                          timeUnknownMasked={item.view.timeUnknownMasked}
                          warnings={item.view.warnings}
                          names={[shownDetail.label, partnerLabelOf(item.view)]}
                          options={item.view.options}
                          birthplace={birthplace}
                          birthMoment={balaBirth}
                          hideWheel
                        />
                      )}
                      {tab === "yorum" && interpVisible && (
                        <ProviderInterpretationPanel
                          interpretation={item.view.interpretation}
                          localSpace={item.technique === "western.local_space" ? localSpaceCenter(item.view.technical, item.view.options, birthplace) : null}
                          displayTz={typeof item.view.options.displayTz === "string" ? item.view.options.displayTz : null}
                        />
                      )}
                    </div>
                  )}
                      {/* FINAL: Bilgi Bankam / Kendi Yorumum / Kaydet — her AÇIK sekmenin çalışma alanı bağlı kalır (yalnız etkin olan
                      görünür) → sekme değiştirmek kaydedilmemiş notu silmez; kapatma/ayrılma kaydedilmemiş taslakta uyarır. */}
                  <div hidden={wsSection === null}>
                    {runs.open
                      .map((k) => runs.items.find((x) => x.key === k))
                      .filter((x): x is BenchItem => !!x)
                      .map((bi) => {
                        const bopts = describeOptions(bi.technique, bi.view.options, labelOf);
                        const kbKey = `${shownDetail.id}|${revision}|${bi.technique}|${JSON.stringify(bi.view.options)}`;
                        return (
                          <div key={bi.key} hidden={bi.key !== item.key}>
                            <AnalysisWorkspace
                              key={kbKey}
                              profileId={shownDetail.id}
                              revision={revision}
                              selection={{ technique: bi.technique, options: bi.view.options }}
                              refreshKey={workRefresh}
                              section={wsSection ?? "kb"}
                              profileLabel={shownDetail.label}
                              techniqueLabel={`${techniqueLabel(bi.technique)}${bopts ? ` · ${bopts}` : ""}`}
                              onDirtyChange={(d) => setDirtyTabs((m) => (!!m[bi.key] === d ? m : { ...m, [bi.key]: d }))}
                              onData={(d) => setKbMap((m) => ({ ...m, [kbKey]: d.kbMatches.map((e) => ({ topicKey: e.topicKey, topicLabel: e.topicLabel, title: e.title, body: e.body })) }))}
                            />
                          </div>
                        );
                      })}
                  </div>
                </ResultDesk>
              );
            })()
          ) : (
            <div className={`${atlasPanel} px-6 py-12 text-center text-sm text-slate-500`}>
              Gösterilecek sonuç yok.{" "}
              <button type="button" className="font-semibold text-[#0b1430] underline" onClick={() => go("new")}>
                Yeni analiz başlatın
              </button>
            </div>
          ))}
        {/* D4: "+ Teknik Ekle" — aynı danışan ve doğum profiliyle; plan + onay mevcut uçlarla. Kayıtlı analizler değişmez. */}
        {addOpen && shownDetail && revision !== null && ctxKey && (
          <AddTechniqueDialog<ResultItem>
            open
            initial={addOpen.initial}
            onClose={() => {
              if (addDirty) askLeave({ message: LEAVE_MESSAGE, details: ["Teknik Ekle'de seçilmiş ama hesaplanmamış teknikler"], action: () => setAddOpen(null) });
              else setAddOpen(null);
            }}
            onDirtyChange={setAddDirty}
            profileId={shownDetail.id}
            revision={revision}
            profileLabel={shownDetail.label}
            birthSummary={currentRev ? `${currentRev.birthDate.split("-").reverse().join(".")} · ${currentRev.timeKnown ? (currentRev.birthTime?.slice(0, 5) ?? "") : "saat bilinmiyor"} · ${currentRev.locationLabel}` : null}
            birthPlaceLabel={currentRev?.locationLabel ?? null}
            birthDate={currentRev?.birthDate ?? null}
            timeKnown={currentRev?.timeKnown ?? true}
            params={paramsView}
            onParams={setParams}
            method={method}
            onMethod={setMethod}
            partners={partners}
            partnerQuery={partnerQuery}
            onPartnerQuery={setPartnerQuery}
            openTechniques={runs ? runs.open.map((k) => k.split("|")[0]) : []}
            labelOf={labelOf}
            previewNoInterp={previewNoInterp}
            onDone={(r: AddRunResult<ResultItem>) => {
              const key = ctxKey;
              if (r.results) mergeRun(key, r.results, r.selections, r.ok ? r.executed : { newResults: 0, cachedResults: 0, providerAttempts: 0 });
              setPlanNonce((n) => n + 1);
              if (r.ok) {
                setAddOpen(null);
                setResultMode("run");
                if (view !== "result") go("result");
              }
            }}
          />
        )}
        {saveDialog && runs && shownDetail && (
          <SaveBatchDialog
            key={runs.key}
            items={runs.items
              .filter((x) => !savedIds[`${runs.key}|${x.key}`])
              .map((x) => {
                const o = describeOptions(x.technique, x.view.options, labelOf);
                // Yöntem satırı SUNUCUNUN normalize sonucundan (zodyak / ev sistemi / düğüm) — ham kimlik gösterilmez.
                const zod = x.view.method.zodiac === "sidereal" ? (x.technique.startsWith("kp.") ? "Sidereal (KP)" : "Sidereal (nirayana)") : "Tropikal";
                const hs = x.view.method.houseSystem ? houseSystemLabel(x.view.method.houseSystem, HOUSE_SYSTEM_LABELS) : null;
                const nt = x.view.method.nodeType === "true" || x.view.method.nodeType === "mean" ? NODE_TYPE_LABELS[x.view.method.nodeType] : null;
                return { key: x.key, label: techniqueLabel(x.technique), detail: [o, zod, hs, nt, `doğum rev ${revision}`, x.partial ? "kısmi sonuç" : ""].filter(Boolean).join(" · "), closed: !runs.open.includes(x.key), draft: !!dirtyTabs[x.key] };
              })}
            interpNote={access.providerInterp && !previewNoInterp ? "Bu analizlerin otomatik sistem yorumu, varsa, kayda ayrı katman olarak eklenir (sizin yorumunuzla karışmaz)." : null}
            onSave={(keys, titles, onItem) => saveBenchKeys(keys.map((k) => `${runs.key}|${k}`), titles, onItem)}
            onSucceeded={(n) => setSaveToast({ n, at: nowMs() })}
            onClose={() => setSaveDialog(false)}
          />
        )}
      </div>
      {/* UAT 2. tur: genel katmanlar (kayıt bildirimi + çıkış uyarısı) ana ekranda da görünür — ana ekranda gizlenen
          görünüm kabının DIŞINDA. Eskiden ana ekrandayken geri tuşu uyarıyı DOM'a koyuyor ama gizli kalıyordu. */}
      {saveToast && (
        <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--logo-h,44px)+8px)] z-[95] flex justify-center px-3" data-testid="astro-saved-toast-wrap">
          <div
            className="pointer-events-auto flex max-w-xl items-start gap-3 rounded-2xl border border-emerald-400 bg-emerald-600 px-4 py-3 text-white shadow-[0_18px_40px_-16px_rgba(5,150,105,0.75)]"
            role="status"
            aria-live="polite"
            data-testid="astro-saved-notice"
          >
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">{saveToast.n === 1 ? "Analiz başarıyla kaydedildi." : `${saveToast.n} analiz başarıyla kaydedildi.`}</p>
              <p className="text-[13px] text-emerald-50">Sunucuda doğrulandı · Danışan Dosyası&apos;nda ve Analiz Arşivi&apos;nde listelenir.</p>
            </div>
            <button type="button" onClick={() => setSaveToast(null)} aria-label="Bildirimi kapat" className="rounded-md p-1 text-emerald-50 hover:bg-white/15">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      {pendingLeave && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center bg-[#050816]/80 p-3 backdrop-blur-sm sm:items-center sm:p-4" role="alertdialog" aria-modal="true" aria-label="Kaydedilmemiş değişiklik" data-testid="atlas-unsaved-dialog">
          <div className="w-full max-w-md rounded-2xl border border-[#D9B56F]/40 bg-[linear-gradient(180deg,#151d4c,#0a1130)] p-5 text-[#F6F2EA] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95)]">
            <p className="text-[10.5px] font-semibold tracking-[0.18em] text-[#E6CF9F]/80">KAYDEDİLMEMİŞ DEĞİŞİKLİK</p>
            <p className="mt-2 text-[15px] leading-relaxed text-[#F6F2EA]" data-testid="atlas-unsaved-message">{pendingLeave.message}</p>
            {pendingLeave.details.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-[#F6F2EA]/75" data-testid="atlas-unsaved-details">
                {pendingLeave.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
            {leaveSaving.error && (
              <p className="mt-3 rounded-lg border border-rose-300/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-100" role="alert">
                {leaveSaving.error}
              </p>
            )}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                autoFocus
                disabled={leaveSaving.busy}
                onClick={() => {
                  pendingLeave.onStay?.();
                  setPendingLeave(null);
                }}
                className="rounded-lg border border-[#D9B56F]/60 bg-[#D9B56F]/15 px-3 py-2.5 text-sm font-medium text-[#F6E7C3] disabled:opacity-50"
                data-testid="atlas-unsaved-stay"
              >
                Çalışmaya Devam Et
              </button>
              {pendingLeave.saveKeys && pendingLeave.saveKeys.length > 0 && (
                <button
                  type="button"
                  disabled={leaveSaving.busy}
                  onClick={async () => {
                    const p = pendingLeave;
                    setLeaveSaving({ busy: true, error: null });
                    const res = await saveBenchKeys(p.saveKeys ?? [], {});
                    const failed = res.filter((r) => !r.ok).length;
                    if (failed > 0) {
                      setLeaveSaving({ busy: false, error: `${res.length - failed} analiz kaydedildi, ${failed} analiz kaydedilemedi. Çıkış yapılmadı; kaydedilenler tekrar oluşturulmaz.` });
                      return;
                    }
                    setLeaveSaving({ busy: false, error: null });
                    setSaveToast({ n: res.length, at: nowMs() });
                    setPendingLeave(null);
                    p.action();
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-300/60 bg-emerald-400/15 px-3 py-2.5 text-sm font-medium text-emerald-100 disabled:opacity-50"
                  data-testid="atlas-unsaved-save-leave"
                >
                  {leaveSaving.busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {leaveSaving.busy ? "Kaydediliyor…" : `Kaydet ve Çık (${pendingLeave.saveKeys.length})`}
                </button>
              )}
              <button
                type="button"
                disabled={leaveSaving.busy}
                onClick={() => {
                  const a = pendingLeave.action;
                  setPendingLeave(null);
                  a();
                }}
                className="rounded-lg border border-white/15 px-3 py-2.5 text-sm text-[#F6F2EA]/75 hover:border-rose-300/60 disabled:opacity-50"
                data-testid="atlas-unsaved-discard"
              >
                Kaydetmeden Çık
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
    </AtlasHomeContext.Provider>
  );
}
