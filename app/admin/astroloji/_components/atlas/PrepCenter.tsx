"use client";

/**
 * Gökyüzü Atlası — GÖKSEL ANALİZ HAZIRLIK MERKEZİ (Aşama D3; yalnız Yeni Analiz ekranı, sunum katmanı).
 *
 * Yerleşim
 *   • Üst: kimlik plakası — kompakt danışan seçici + doğum verisi göstergeleri (tarih, saat, yer, saat doğruluğu, tz).
 *   • ≥1280 px: üç sütun — sol: sistem kadranları (Batı / Vedik / KP) + teknik dizini · orta: göksel ön izleme odası ·
 *     sağ: odaktaki tekniğin ayarları. 768–1279 px: iki sütun (ön izleme sağ üstte, ayarlar altında). <768 px: tek
 *     sütun, ayarlar odaktaki tekniğin satırında açılır.
 *   • Alt: Analiz Hazırlık Konsolu — ekranın altına YAPIŞIK (sticky); seçilen teknikler, plan göstergeleri ve Hesapla.
 *
 * Veri kuralları (değişmedi): seçim → buildSelections (sayfa) → SUNUCU planı → çalıştırma. Bu bileşen istek sayısı
 * tahmin etmez; plan sayfadan gelir. FINAL: Yeni Analiz'deki harita ön izlemesi owner kararıyla KALDIRILDI (aşağıdaki
 * ön izleme notu tarihçedir; gerçek haritalar yalnız Analiz Sonucu ekranında). Eski ön izleme ÜÇ durumu ayırıyordu:
 *   1) Temsili şema (TechniqueSchematic) — hesaplama sonucu DEĞİL; açıkça etiketli.
 *   2) Önceden hesaplanmış — /engine/view (YALNIZ-ÖNBELLEK uç; sağlayıcı bağımlılığı verilmez → Roxy isteği yapılamaz).
 *   3) Bu oturumda yeni hesaplanmış — aynı önbellek görünümü, son çalıştırmada reused=false olan sonuçla eşleşirse.
 * 3D: WebGL KULLANILMAZ; derinlik CSS perspektifli kaide/halka katmanları, iç gölge, cam ve metal degradelerle verilir.
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronDown, Loader2, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { HOUSE_SYSTEM_LABELS, NODE_TYPE_LABELS } from "@/lib/astrology/labels/tr";
import type { HouseSystem, NodeType } from "@/lib/astrology/model/western";
import { dateInputReason, describeOptions, missingReason, TECHNIQUE_META, UI_TECHNIQUES, techniqueLabel, type LunarReturnInfo, type PlanetaryReturnInfo, type PlanetaryReturnNeighbors, type TechniqueParams, type UiTechniqueId } from "../../_lib/techniques";
import { MethodFields, PartnerField, TechniqueParamFields, USES_HOUSE_SYSTEM, USES_NODE_TYPE, type PartnerOption } from "../TechniqueSelector";
import { deskPrimary } from "./ResultDesk";
import { ap } from "./premium/AtlasPremium";
import { atlasDisplay, atlasText } from "./fonts";
import { formatUtcOffset } from "../../_lib/utcOffset";

/* ── Tipler (sayfadakiyle yapısal olarak aynı) ─────────────────────────────────────────────────── */
export type PrepRevision = {
  birthDate: string;
  birthTime: string | null;
  timeKnown: boolean;
  timeAccuracy?: string;
  timeAccuracyLabel: string;
  locationLabel: string;
  latitude: number;
  longitude: number;
  timezone: string;
  utcOffsetSeconds: number;
  /** YENİ-P2-03: saklı ofset güncel tarihsel saat dilimi tablosundan farklı (sunucu okuma anında işaretler). */
  staleTimezone?: { storedOffsetSeconds: number; currentOffsetSeconds: number; text: string };
  /** ATL-P2-07: saklı ofset temsilci şehrin yerel ortalama saati; doğum yeri boylamından farklı (yalnız uyarı). */
  lmtNotice?: { storedOffsetSeconds: number; localMeanOffsetSeconds: number; text: string };
};
type PlanSelection = { technique: string; options: Record<string, unknown> | null; unitCount: number; newRequests: number; blocked: { code: string; error: string } | null };
export type PrepPlan = { selectedCount: number; blockedCount: number; newRequestCount: number; cachedCount: number; coveredCount: number; dedupedCount: number; requiresConfirmation: boolean; selections: PlanSelection[] };
type ViewLike = { technique?: string; options: Record<string, unknown>; technical: unknown; timeUnknownMasked: boolean; warnings: string[] };
export type PrepRunItem = { technique: string; ok: true; partial: boolean; reused: boolean; view: ViewLike } | { technique: string; ok: false; code: string; error: string };

export type SystemId = "western" | "vedic" | "kp";
const SYSTEMS: { id: SystemId; label: string; short: string; sub: string }[] = [
  { id: "western", label: "Batı Astrolojisi", short: "Batı", sub: "Tropikal zodyak" },
  { id: "vedic", label: "Vedik Astroloji", short: "Vedik", sub: "Sidereal · Jyotish" },
  { id: "kp", label: "KP Astrolojisi", short: "KP", sub: "Krishnamurti · Placidus" },
];
const systemOf = (id: UiTechniqueId): SystemId => id.split(".")[0] as SystemId;
const TECH_BY_SYSTEM: Record<SystemId, UiTechniqueId[]> = {
  western: UI_TECHNIQUES.filter((t) => systemOf(t) === "western"),
  vedic: UI_TECHNIQUES.filter((t) => systemOf(t) === "vedic"),
  kp: UI_TECHNIQUES.filter((t) => systemOf(t) === "kp"),
};

/** Tekniğin ne gösterdiği (genel tanım; kişiye özgü içerik yok). */
const ABOUT: Record<UiTechniqueId, string> = {
  "western.natal": "Doğum anındaki gökyüzü: gezegenlerin burç ve ev konumları, açısal noktalar ve gezegenler arası açılar.",
  "western.transit": "Seçilen andaki gezegenlerin natal haritayla yaptığı açılar: güç, orb, yaklaşan/ayrılan, transit gezegenin geçtiği natal ev ve çift halka harita. Tek bir anın görüntüsüdür; kesinleşme anları Transit Takvimi gününden açıldığında takvimden gösterilir.",
  "western.forecast": "Bir dönem boyunca natal haritaya transit açılarının kesinleşme anları ile burç girişleri, istasyonlar, tutulmalar ve Ay evreleri; sağlayıcı önem puanı. Gün seçilince o günün ayrıntısı açılır, günün transit haritası istenirse ayrıca hesaplanır. Sağlayıcı isteği en çok 90 günlük parçalara bölünür.",
  "western.progression": "İkincil ilerletme: doğumdan sonraki her gün yaşamın bir yılına karşılık gelir; hedef tarih için ilerletilmiş harita.",
  "western.solar_arc": "Tüm natal noktalar, ilerletilmiş Güneş'in kat ettiği yay kadar ileri taşınır.",
  "western.solar_return": "Güneş'in natal boylamına döndüğü anın haritası; seçilen yılın teması için kullanılır.",
  "western.lunar_return": "Ay'ın natal boylamına döndüğü anın haritası. Bir takvim ayında iki dönüş olabilir; her dönüş ayrı istektir.",
  "western.synastry": "İki kişinin haritaları arasındaki açılar ve bir kişinin gezegenlerinin diğerinin evlerine düşüşü.",
  "western.composite": "İki haritanın orta noktalarından kurulan tek ilişki haritası.",
  "western.astrocartography": "Gezegenlerin doğum anında MC, IC, yükselen ve alçalan olduğu yerler dünya haritası üzerinde hat olarak çizilir.",
  "western.relocation": "Aynı doğum anı başka bir konum için hesaplanır: gezegen konumları değişmez; yükselen, MC ve evler değişir.",
  "western.local_space": "Seçilen merkezden bakıldığında gezegenlerin ufuk yönleri (azimut); pusula ve harita üzerinde.",
  "western.fixed_stars": "43 sabit yıldızın doğum anındaki tropikal konumu ve natal gezegen, Yükselen ve MC ile ekliptik boylam kavuşumları. Paran yöntemi değildir. Orb ayarı yalnız filtredir; değiştirmek yeni hesaplama gerektirmez.",
  "western.profections": "Yükselen burçtan her tamamlanmış yaş için bir burç ilerlenir (bütün-burç evleri): seçilen profeksiyon yılının etkin evi, burcu, klasik yönetici gezegeni ve yöneticinin doğum haritasındaki burcu ile evi.",
  "western.planetary_return": "Seçilen gezegenin (Satürn, Jüpiter, Mars, Venüs, Merkür) natal boylamına döndüğü anın haritası. Retro döngüsünde gezegen natal derecesinden 2–3 kez geçebilir; hedef tarihe en yakın kümedeki kavuşumlar listelenir ve seçilen kavuşum hesaplanır.",
  "vedic.d1": "Sidereal Rashi kundli: Lagna, grahaların burç ve bhava yerleşimi, nakshatra / pada ve yogalar.",
  "vedic.varga": "Bölümsel haritalar: her burç n parçaya bölünür (D9 Navamsa varsayılan); vargottama işaretlenir.",
  "vedic.dasha": "Vimshottari: doğumdaki Ay nakshatrasına göre 120 yıllık gezegen dönemleri; alt dönemler (Prana düzeyine kadar) sonuç ekranında tıklayınca yüklenir; isteğe bağlı güncel dönem zinciri.",
  "vedic.drishti": "Parashari bütün-burç graha drishti: hangi grahanın hangi burç ve bhavaya baktığı. Yalnız Lahiri ile hesaplanır.",
  "vedic.ashtakavarga": "Her grahanın ve Lagna'nın 12 burca verdiği bindu puanları, Sarva toplamı ve Shodhana.",
  "vedic.shadbala": "Grahaların altı bileşenli güç hesabı (BPHS); gerekli güce oran ve sıralama.",
  "vedic.panchanga": "Doğum anının tithi, nakshatra, nitya yoga ve karana öğeleri; isteğe bağlı ayrıntılı gün (vara, gün doğumu/batımı, Rahu Kaal, Abhijit…). Yalnız Lahiri ile hesaplanır.",
  "vedic.transit": "Gochara: seçilen andaki sidereal grahaların Janma Rashi'den ve Lagna'dan evleri, drishti ve kaksha. Yalnız Lahiri.",
  "kp.chart": "Placidus cusp'larıyla KP haritası: her nokta için burç, yıldız, alt ve alt-alt lordu; dört düzey significator.",
  "kp.dasha": "KP ayanamsa ile Vimshottari dönemleri ve dönem lordlarının KP significator'ları.",
  "kp.ruling": "Seçilen an ve yerdeki ruling planet'ler ile natal significator'lar.",
  "kp.transit": "İki kip: Tek an — seçilen anın KP gökyüzü (yıldız ve alt lordlar); Zaman aralığı — seçilen gezegenlerin Sub-Lord (KP numarası) değişim anları, Rasi geçişleri ve isteğe bağlı KP konum tablosu. Natal cusp'lara göre transit analizi sağlayıcıda yoktur.",
  "kp.horary": "1–249 arası sayı ile soru haritası; doğum verisi kullanılmaz. Soru anı ve değerlendirme yeri seçilir.",
};

/** Gerekli / ayarlanabilir parametrelerin kısa özeti (dizinde görünür). */
const PARAMS_NOTE: Record<UiTechniqueId, string> = {
  "western.natal": "ev sistemi · ay düğümü",
  "western.transit": "an (şimdi / gün / gün + saat) · saat dilimi · ay düğümü",
  "western.forecast": "başlangıç · bitiş (en çok 366 gün) · saat dilimi",
  "western.progression": "hedef tarih · ay düğümü",
  "western.solar_arc": "hedef tarih · ay düğümü",
  "western.solar_return": "yıl · konum · ev sistemi",
  "western.lunar_return": "ay · dönüş sırası · konum",
  "western.synastry": "karşı taraf · ev sistemi",
  "western.composite": "karşı taraf · ev sistemi",
  "western.astrocartography": "ek ayar yok",
  "western.relocation": "hedef konum · ev sistemi",
  "western.local_space": "merkez konum",
  "western.fixed_stars": "orb · ay düğümü · rapor kataloğu",
  "western.profections": "profeksiyon yılı (yaş) · ev sistemi sabit: Tam Burç",
  "western.planetary_return": "gezegen · hedef tarih · kavuşum · konum · ev sistemi",
  "vedic.d1": "ayanamsa",
  "vedic.varga": "bölüm · ayanamsa",
  "vedic.dasha": "düzey · ayanamsa",
  "vedic.drishti": "Lahiri sabit",
  "vedic.ashtakavarga": "ayanamsa",
  "vedic.shadbala": "ayanamsa",
  "vedic.panchanga": "Lahiri sabit",
  "vedic.transit": "an · Lahiri sabit",
  "kp.chart": "KP ayanamsa · düğüm",
  "kp.dasha": "düzey · KP ayanamsa",
  "kp.ruling": "an · yer · düğüm",
  "kp.transit": "tek an veya aralık (başlangıç · süre ≤ 92 gün · gezegen · tür) · KP ayanamsa · düğüm",
  "kp.horary": "sayı · an · yer",
};
/** Kendi parametresi olmayan teknikler (yalnız ortak Batı yöntemi veya hiç ayar). */
const NO_PRIMARY_PARAMS: UiTechniqueId[] = ["western.natal", "western.astrocartography", "western.synastry", "western.composite"];

/* ── Düzen modu ────────────────────────────────────────────────────────────────────────────────── */
type Mode = "wide" | "mid" | "narrow";
const MQ_WIDE = "(min-width: 1280px)";
const MQ_MID = "(min-width: 768px)";
function subscribeMode(cb: () => void) {
  const a = window.matchMedia(MQ_WIDE);
  const b = window.matchMedia(MQ_MID);
  a.addEventListener("change", cb);
  b.addEventListener("change", cb);
  return () => {
    a.removeEventListener("change", cb);
    b.removeEventListener("change", cb);
  };
}
function useMode(): Mode {
  return useSyncExternalStore(subscribeMode, () => (window.matchMedia(MQ_WIDE).matches ? "wide" : window.matchMedia(MQ_MID).matches ? "mid" : "narrow"), () => "wide");
}

/* ── Görsel yardımcılar ────────────────────────────────────────────────────────────────────────── */
/* Açık premium görünüm (2026-10-21): yüzey / yazı / çip / düğme değerleri tek kaynaktan (premium/atlasPremium.module.css). */
const SURFACE = ap.surface;
const EYEBROW = ap.eyebrowSm;

const CSS = `
@keyframes atlasPrepIn { from { opacity: 0; transform: translateY(6px) scale(.985); } to { opacity: 1; transform: none; } }
.atlas-prep-in { animation: atlasPrepIn .32s cubic-bezier(.2,.7,.2,1) both; }
@media (prefers-reduced-motion: reduce) { .atlas-prep-in { animation: none; } .atlas-prep-dial { transition: none !important; } }
`;

/** HUD köşe braketleri (dekoratif). */
function Brackets({ className = "border-[#D9B56F]/55" }: { className?: string }) {
  const b = `pointer-events-none absolute h-4 w-4 ${className}`;
  return (
    <>
      <span className={`${b} left-2 top-2 border-l border-t`} aria-hidden="true" />
      <span className={`${b} right-2 top-2 border-r border-t`} aria-hidden="true" />
      <span className={`${b} bottom-2 left-2 border-b border-l`} aria-hidden="true" />
      <span className={`${b} bottom-2 right-2 border-b border-r`} aria-hidden="true" />
    </>
  );
}

/** Sistem kadranı amblemi (yapı; veri yok). */
export function DialEmblem({ id }: { id: SystemId }) {
  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden="true">
      <circle cx="32" cy="32" r="27" fill="none" stroke="#D9B56F" strokeOpacity="0.55" strokeWidth="1" />
      {id === "western" && (
        <g>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6;
            return <line key={i} x1={32 + 27 * Math.cos(a)} y1={32 + 27 * Math.sin(a)} x2={32 + 21 * Math.cos(a)} y2={32 + 21 * Math.sin(a)} stroke="#D9B56F" strokeOpacity="0.6" strokeWidth="0.8" />;
          })}
          <circle cx="32" cy="32" r="13" fill="none" stroke="#9CC0F2" strokeOpacity="0.5" strokeDasharray="1.5 2.5" />
          <circle cx="32" cy="32" r="5" fill="#D9B56F" fillOpacity="0.9" />
        </g>
      )}
      {id === "vedic" && (
        <g fill="none" stroke="#D9B56F" strokeWidth="0.9">
          <rect x="16" y="16" width="32" height="32" strokeOpacity="0.7" />
          <path d="M16,16L48,48M48,16L16,48" strokeOpacity="0.45" />
          <path d="M32,16L48,32L32,48L16,32Z" strokeOpacity="0.6" />
        </g>
      )}
      {id === "kp" && (
        <g>
          {Array.from({ length: 54 }, (_, i) => {
            const a = (i * Math.PI * 2) / 54;
            const long = i % 2 === 0;
            return <line key={i} x1={32 + 27 * Math.cos(a)} y1={32 + 27 * Math.sin(a)} x2={32 + (long ? 21 : 24) * Math.cos(a)} y2={32 + (long ? 21 : 24) * Math.sin(a)} stroke={long ? "#D9B56F" : "#9CC0F2"} strokeOpacity="0.55" strokeWidth="0.6" />;
          })}
          <circle cx="32" cy="32" r="9" fill="none" stroke="#D9B56F" strokeOpacity="0.7" />
          <path d="M32,23v18M23,32h18" stroke="#9CC0F2" strokeOpacity="0.55" strokeWidth="0.8" />
        </g>
      )}
    </svg>
  );
}

/* ── Sistem kadranları (HUD uydu diskleri) ─────────────────────────────────────────────────────── */
function SystemDials({ active, onChange, counts }: { active: SystemId; onChange: (s: SystemId) => void; counts: Record<SystemId, number> }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: React.KeyboardEvent, i: number) => {
    let n = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % 3;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i + 2) % 3;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = 2;
    if (n < 0) return;
    e.preventDefault();
    onChange(SYSTEMS[n].id);
    refs.current[SYSTEMS[n].id]?.focus();
  };
  return (
    <div className="relative" data-testid="atlas-system-dials">
      {/* perspektifli yörünge rayı (dekoratif) */}
      <div className="pointer-events-none absolute inset-x-0 top-[30px] h-16 [perspective:600px]" aria-hidden="true">
        <div className={ap.dialTrack} />
      </div>
      <div role="tablist" aria-label="Astroloji sistemi" className="relative grid grid-cols-3 gap-1">
        {SYSTEMS.map((s, i) => {
          const on = s.id === active;
          return (
            <button
              key={s.id}
              ref={(el) => {
                refs.current[s.id] = el;
              }}
              type="button"
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(s.id)}
              onKeyDown={(e) => onKey(e, i)}
              className="group flex min-w-0 flex-col items-center gap-1.5 rounded-xl px-1 py-1 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9B56F]"
              data-system={s.id}
            >
              <span
                className={`atlas-prep-dial relative flex items-center justify-center rounded-full p-2 transition-all duration-300 ${
                  on
                    ? `h-[76px] w-[76px] [@media(max-height:780px)]:h-14 [@media(max-height:780px)]:w-14 ${ap.dialOn}`
                    : `mt-2 h-[60px] w-[60px] [@media(max-height:780px)]:mt-1 [@media(max-height:780px)]:h-11 [@media(max-height:780px)]:w-11 ${ap.dialOff} group-hover:opacity-100`
                }`}
              >
                <DialEmblem id={s.id} />
                {counts[s.id] > 0 && (
                  <span className={`${ap.dialBadge} absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10.5px] font-semibold tabular-nums shadow`}>{counts[s.id]}</span>
                )}
              </span>
              <span className={`text-[12.5px] font-semibold leading-tight ${on ? ap.ink : ap.muted}`}>{s.short}</span>
              <span className={`hidden text-[10px] leading-tight sm:block [@media(max-height:780px)]:sm:hidden ${on ? ap.goldInk : ap.faint}`}>{s.sub}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Durum (plan) ──────────────────────────────────────────────────────────────────────────────── */
type Status = { kind: "none" | "pending" | "ready" | "new" | "blocked" | "missing" | "error"; text: string };
const STATUS_DOT: Record<Status["kind"], string> = {
  none: "bg-transparent",
  pending: ap.dotPending,
  ready: ap.dotReady,
  new: ap.dotNew,
  blocked: ap.dotBlocked,
  missing: ap.dotMissing,
  error: ap.dotError,
};

/* ── Bileşen ───────────────────────────────────────────────────────────────────────────────────── */
export default function PrepCenter({
  profile,
  rev,
  picker,
  onCreateClient,
  onEditBirth,
  onDeleteProfile,
  checked,
  onChecked,
  params,
  onParams,
  method,
  onMethod,
  partners,
  partnerQuery,
  onPartnerQuery,
  lunarReturns,
  planetaryReturns = null,
  planetaryReturnNeighbors = null,
  selections,
  plan,
  planError,
  running,
  runError,
  runFailures,
  onDismissFailures,
  onRun,
  labelOf,
}: {
  profile: { id: string; label: string; archivedAt?: string | null; clientName: string | null } | null;
  rev: PrepRevision | null;
  picker: ReactNode;
  /** D3.1: her zaman görünür "+ Yeni Danışan" (mevcut doğum profili formunu açar). */
  onCreateClient: () => void;
  onEditBirth: (() => void) | null;
  /** Seçili doğum profilini silme akışı (analizi olmayan profil dahil; A/B seçimi + sunucu onayı ArchiveDeleteFlow'da). */
  onDeleteProfile?: (() => void) | null;
  checked: Partial<Record<UiTechniqueId, boolean>>;
  /** Durum ayarlayıcı (işlevsel güncelleme desteklenir → hızlı ardışık tıklamalarda seçim kaybolmaz). */
  onChecked: (next: Partial<Record<UiTechniqueId, boolean>> | ((prev: Partial<Record<UiTechniqueId, boolean>>) => Partial<Record<UiTechniqueId, boolean>>)) => void;
  params: TechniqueParams;
  onParams: (next: TechniqueParams) => void;
  method: { houseSystem: HouseSystem; nodeType: NodeType };
  onMethod: (next: { houseSystem: HouseSystem; nodeType: NodeType }) => void;
  partners: PartnerOption[];
  partnerQuery: string;
  onPartnerQuery: (q: string) => void;
  lunarReturns: LunarReturnInfo[] | null;
  /** 2026-10-22: gezegen dönüşü kümesinin kavuşumları (sunucu planından; yoksa null). */
  planetaryReturns?: PlanetaryReturnInfo[] | null;
  planetaryReturnNeighbors?: PlanetaryReturnNeighbors | null;
  selections: { technique: UiTechniqueId; options: Record<string, unknown> }[];
  plan: PrepPlan | null;
  planError: string | null;
  running: boolean;
  runError: string | null;
  /** FINAL: tüm seçili teknikler başarısız olduğunda (sonuç ekranı açılmaz) teknik bazında neden + sonraki adım. */
  runFailures: { at: number; items: { technique: string; code: string; error: string; retryAfterSec?: number }[] } | null;
  onDismissFailures: () => void;
  onRun: () => void;
  labelOf: (id: string) => string | null;
}) {
  const mode = useMode();
  const [system, setSystem] = useState<SystemId>("western");
  const [focus, setFocus] = useState<UiTechniqueId>("western.natal");
  const [birthDetailsOpen, setBirthDetailsOpen] = useState(false);

  const focusOn = (id: UiTechniqueId) => {
    setFocus(id);
    setSystem(systemOf(id));
  };
  const toggle = (id: UiTechniqueId, next?: boolean) => onChecked((prev) => ({ ...prev, [id]: next ?? !prev[id] }));

  const counts = useMemo(() => {
    const c: Record<SystemId, number> = { western: 0, vedic: 0, kp: 0 };
    for (const id of UI_TECHNIQUES) if (checked[id]) c[systemOf(id)]++;
    return c;
  }, [checked]);
  const chosen = UI_TECHNIQUES.filter((id) => checked[id]);

  // Plan satırı ↔ teknik: plan.selections, selections ile AYNI sırada (çalıştırma da bu eşlemeyi kullanır).
  const statusOf = useCallback(
    (id: UiTechniqueId): Status => {
      if (!checked[id]) return { kind: "none", text: "" };
      const idx = selections.findIndex((s) => s.technique === id);
      if (idx < 0) return { kind: "missing", text: missingReason(id, params) ?? "eksik ayar" };
      if (!profile) return { kind: "pending", text: "danışan seçin" };
      if (!plan) return planError ? { kind: "error", text: "plan alınamadı" } : { kind: "pending", text: "plan hazırlanıyor" };
      const ps = plan.selections[idx];
      if (!ps) return { kind: "pending", text: "plan hazırlanıyor" };
      if (ps.blocked) return { kind: "blocked", text: ps.blocked.error };
      if (ps.newRequests === 0) return { kind: "ready", text: "hazır" };
      return { kind: "new", text: ps.newRequests === 1 ? "yeni hesaplama" : `yeni hesaplama · ${ps.newRequests} istek` };
    },
    [checked, selections, plan, planError, profile, params],
  );

  /* ── Masaüstü yüksekliği ── */
  const deskRef = useRef<HTMLDivElement | null>(null);
  const consoleRef = useRef<HTMLDivElement | null>(null);
  const [deskH, setDeskH] = useState<number | null>(null);
  const [consoleH, setConsoleH] = useState(80);
  const measure = useCallback(() => {
    const ch = consoleRef.current?.offsetHeight ?? 80;
    setConsoleH(ch);
    const el = deskRef.current;
    if (!el || window.innerWidth < 768) {
      setDeskH(null);
      return;
    }
    // FINAL: masanın altındaki GERÇEK pay (konsol boşluğu + aralık + kapsayıcı alt dolgusu) canlı ölçülür → masaüstünde
    // gereksiz sayfa kaydırması olmaz. Kısa ekranda alt sınır korunur (doğal kaydırma).
    const scrollTop = (document.scrollingElement?.scrollTop ?? 0) + document.body.scrollTop;
    const rect = el.getBoundingClientRect();
    const top = rect.top + scrollTop;
    const sec = el.closest("section");
    const wrap = sec?.parentElement ?? null;
    const spacer = Math.max(ch, consoleRef.current?.offsetHeight ?? ch);
    const gap = sec ? parseFloat(getComputedStyle(sec).rowGap) || 12 : 12;
    const below = gap + spacer + (wrap ? parseFloat(getComputedStyle(wrap).paddingBottom) || 0 : 0);
    setDeskH(Math.max(window.innerWidth >= 1280 ? 340 : 520, Math.floor(window.innerHeight - top - below - 1)));
  }, []);
  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver !== "undefined" && consoleRef.current ? new ResizeObserver(() => measure()) : null;
    if (ro && consoleRef.current) ro.observe(consoleRef.current);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [measure, mode, profile?.id, birthDetailsOpen]);

  const sysDef = SYSTEMS.find((s) => s.id === system)!;
  const meta = TECHNIQUE_META[focus];
  const focusOnChecked = !!checked[focus];
  const timeUnknown = !!rev && !rev.timeKnown;

  /* ── Parçalar ── */
  const dials = <SystemDials active={system} onChange={setSystem} counts={counts} />;

  const usesMethod = USES_HOUSE_SYSTEM.includes(focus) || USES_NODE_TYPE.includes(focus);
  const methodSummary = [
    USES_HOUSE_SYSTEM.includes(focus) ? `Ev sistemi: ${HOUSE_SYSTEM_LABELS[method.houseSystem]}${method.houseSystem === "placidus" ? " (varsayılan)" : ""}` : null,
    USES_NODE_TYPE.includes(focus) ? `Ay düğümü: ${NODE_TYPE_LABELS[method.nodeType]}${method.nodeType === "true" ? " (varsayılan)" : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const settingsBody = (inline: boolean) => {
    const st = statusOf(focus);
    const primary = (
      <>
        {meta.needsPartner && <PartnerField params={params} onParams={onParams} partners={partners} partnerQuery={partnerQuery} onPartnerQuery={onPartnerQuery} />}
        <TechniqueParamFields id={focus} params={params} onParams={onParams} lunarReturns={lunarReturns} birthPlaceLabel={rev?.locationLabel ?? null} birthDate={rev?.birthDate ?? null} planetaryReturns={planetaryReturns} planetaryReturnNeighbors={planetaryReturnNeighbors} />
      </>
    );
    const hasPrimary = meta.needsPartner || !NO_PRIMARY_PARAMS.includes(focus);
    return (
      <div className="flex min-w-0 flex-col gap-3" data-testid="atlas-technique-settings" data-focus={focus}>
        {!inline && (
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={EYEBROW}>{sysDef.label.toLocaleUpperCase("tr-TR")}</p>
              <h3 className={`${ap.ink} ${ap.display} mt-1 break-words text-xl leading-snug`}>{meta.label}</h3>
              <p className={`${ap.muted} mt-0.5 text-[13px] leading-snug`}>{meta.hint}</p>
              <p className={`mt-1.5 inline-flex items-center gap-1.5 text-[11.5px] ${focusOnChecked ? ap.lavInk : ap.muted}`} data-testid="atlas-focus-selected">
                {focusOnChecked ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {focusOnChecked ? "Analize eklendi" : "Analize eklemek için soldaki + düğmesini kullanın"}
              </p>
            </div>
          </div>
        )}
        {(meta.needsTime && timeUnknown) || st.kind !== "none" || focus === "kp.transit" ? (
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {meta.needsTime && timeUnknown && <span className={ap.chipWarn}>Doğum saati bilinmiyor — hesaplanmaz</span>}
            {focus === "kp.transit" && <span className={ap.chipWarn}>Natal ev analizi yok</span>}
            {st.kind !== "none" && (
              <span className={ap.chip} data-testid="atlas-focus-status">
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[st.kind]}`} /> {st.text}
              </span>
            )}
          </div>
        ) : null}
        <div className={`${ap.paramsCard} text-sm`} data-testid="atlas-params-card">
          <p className="mb-2 text-[10.5px] font-semibold tracking-[0.16em] text-[#8a6d2c]">AYARLAR</p>
          {hasPrimary ? <div className="flex min-w-0 flex-col gap-2.5">{primary}</div> : <p className="text-xs text-slate-600">Bu teknik için ek ayar gerekmez; doğum bilgisiyle hesaplanır.</p>}
          {usesMethod && (
            <details className="mt-3 rounded-lg border border-[#d9c9a3] bg-white/60 px-2.5 py-2" data-testid="atlas-advanced">
              <summary className="cursor-pointer select-none text-xs text-slate-700">
                <span className="font-semibold">Gelişmiş Ayarlar</span>
                <span className="block text-[11px] text-slate-500">{methodSummary}</span>
              </summary>
              <div className="mt-2">
                <MethodFields id={focus} method={method} onMethod={onMethod} />
                <p className="mt-1.5 text-[11px] text-slate-500">Bu iki ayar tüm Batı tekniklerinde ortaktır ve sonucu değiştirir.</p>
              </div>
            </details>
          )}

        </div>
        <details className={`${ap.inset} group px-3 py-2.5`} data-testid="atlas-about">
          <summary className={`${ap.ink} cursor-pointer select-none text-[13px] font-semibold`}>Teknik hakkında</summary>
          <p className={`${ap.text} mt-1.5 text-[13px] leading-relaxed`}>{ABOUT[focus]}</p>
          <p className={`${ap.muted} mt-1 text-[11.5px]`}>Parametreler: {PARAMS_NOTE[focus]}</p>
        </details>
      </div>
    );
  };

  const techniqueIndex = (inlineSettings: boolean) => (
    <ul className="flex flex-col gap-1.5" aria-label={`${sysDef.label} teknikleri`} data-testid="atlas-technique-index">
      {TECH_BY_SYSTEM[system].map((id) => {
        const m = TECHNIQUE_META[id];
        const on = !!checked[id];
        const f = id === focus;
        const st = statusOf(id);
        return (
          <li key={id}>
            <div
              className={`${ap.tech} ${f ? ap.techFocus : on ? ap.techOn : ""}`}
            >
              {on && <span className={ap.techBar} aria-hidden="true" />}
              <button type="button" onClick={() => focusOn(id)} aria-current={f ? "true" : undefined} className="min-w-0 flex-1 px-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#D9B56F]" data-technique-focus={id}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`min-w-0 break-words text-[13.5px] leading-snug ${on || f ? `${ap.ink} font-semibold` : ap.text}`}>{m.label}</span>
                  {st.kind !== "none" && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[st.kind]}`} title={st.text} aria-label={st.text} />}
                </span>
                {m.needsTime && timeUnknown && <span className={`${ap.warnInk} mt-0.5 block text-[11px] leading-snug`}>doğum saati gerekir</span>}
              </button>
              <button
                type="button"
                onClick={() => toggle(id)}
                aria-pressed={on}
                aria-label={on ? `${m.label}: analizden çıkar` : `${m.label}: analize ekle`}
                className={`${ap.techToggleCol} focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#6f55c9]`}
                data-technique={id}
              >
                <span className={`${ap.techToggle} ${on ? ap.techToggleOn : ""}`}>
                  {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Plus className="h-3.5 w-3.5" />}
                </span>
              </button>
            </div>
            {inlineSettings && f && <div className={`atlas-prep-in ${ap.inset} mt-1.5 p-3 max-sm:-mx-2 max-sm:rounded-none max-sm:border-x-0 max-sm:px-2`}>{settingsBody(true)}</div>}
          </li>
        );
      })}
    </ul>
  );

  /* ── Konsol (D4: kısa özet + Plan Ayrıntıları) ── */
  const statuses = chosen.map((id) => statusOf(id));
  const readyN = statuses.filter((s) => s.kind === "ready").length;
  const newN = statuses.filter((s) => s.kind === "new").length;
  const blockedN = statuses.filter((s) => s.kind === "blocked").length;
  const missingN = statuses.filter((s) => s.kind === "missing").length;
  // Tarih/saat alanı tamamlanmamış teknik varken başlatma kapalı (yarım tarihle diğerleri sessizce çalışmasın).
  const dateIncomplete = chosen.some((id) => !!dateInputReason(id, params));
  const runDisabled = !profile || running || !plan || plan.selectedCount === plan.blockedCount || dateIncomplete;
  const runLabel = running ? "Hesaplanıyor…" : plan?.requiresConfirmation ? `${plan.newRequestCount} yeni isteği onayla ve başlat` : "Analizi Başlat";

  const missingList = chosen.map((id) => ({ id, why: missingReason(id, params) })).filter((x): x is { id: UiTechniqueId; why: string } => !!x.why);
  const [planOpen, setPlanOpen] = useState(false);
  const consoleBar = (
    // SABİT (fixed): kök düzende body kendi kaydırma kabı olduğundan sticky çalışmaz; yerine akışta ölçülü boşluk bırakılır.
    // FINAL: tek satır, kompakt; Plan Ayrıntıları yukarı açılan panelde (konsol yüksekliği büyümez).
    <div ref={consoleRef} className="pointer-events-none fixed inset-x-0 bottom-0 z-40 pb-[max(0.4rem,env(safe-area-inset-bottom))]" data-testid="atlas-console">
      <div className="mx-auto w-full max-w-[1600px] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] sm:px-6 lg:px-8">
        <div
          className={`${ap.console} pointer-events-auto`}
          data-testid="astro-plan-box"
        >
          <span className={ap.consoleGlow} aria-hidden="true" />
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="min-w-0 flex-1">
              <p className={`${ap.ink} text-[13px] leading-snug`} data-testid="atlas-console-summary">
                {!profile ? (
                  "Önce danışan seçin."
                ) : chosen.length === 0 ? (
                  "Hesaplamak için en az bir teknik seçin."
                ) : (
                  <>
                    <strong>{chosen.length}</strong> teknik seçildi
                    {plan ? (
                      <>
                        {" "}
                        · <strong className={ap.okInk}>{readyN}</strong> hazır · <strong className={ap.goldInk}>{newN}</strong> yeni hesaplama gerekiyor
                        {blockedN > 0 && (
                          <>
                            {" "}
                            · <strong className={ap.dangerInk}>{blockedN}</strong> hesaplanamaz
                          </>
                        )}
                      </>
                    ) : planError ? (
                      <span className={ap.dangerInk}> · {planError}</span>
                    ) : (
                      <span className={ap.muted}> · plan hazırlanıyor…</span>
                    )}
                    {missingN > 0 && <span className={ap.warnInk}> · {missingN} eksik ayar</span>}
                  </>
                )}
              </p>
              {plan && plan.newRequestCount > 0 && (
                <p className={`${ap.goldInk} truncate text-[11px]`} data-testid="atlas-console-requests">
                  Başlatınca {plan.newRequestCount} yeni sağlayıcı isteği yapılır; hazır sonuçlar yeniden istenmez.
                </p>
              )}
              {missingList.length > 0 && (
                <p className={`${ap.warnInk} truncate text-[11px]`} data-testid="atlas-console-missing" title={missingList.map((m) => `${TECHNIQUE_META[m.id].label}: ${m.why}`).join(" · ")}>
                  {missingList.map((m) => `${TECHNIQUE_META[m.id].label}: ${m.why}`).join(" · ")} (seçilene kadar plana alınmaz)
                </p>
              )}
            </div>
            {chosen.length > 0 && (
              <button
                type="button"
                aria-expanded={planOpen}
                aria-controls="atlas-plan-details"
                onClick={() => setPlanOpen((v) => !v)}
                className={`${ap.btnGhost} shrink-0 !min-h-[36px] !px-2.5 !text-[12px]`}
                data-testid="atlas-plan-toggle"
              >
                <span className="hidden sm:inline">Plan Ayrıntıları</span>
                <span className="sm:hidden">Plan</span>
              </button>
            )}
            <button type="button" disabled={runDisabled} onClick={onRun} className={`${deskPrimary} max-w-[48%] shrink-0 rounded-xl px-3 py-2 text-left leading-tight md:max-w-none md:px-4`} data-testid="astro-run">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {runLabel}
            </button>
          </div>
          {planOpen && chosen.length > 0 && (
            <div
              id="atlas-plan-details"
              className={ap.planPanel}
              data-testid="atlas-plan-details"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className={EYEBROW}>PLAN AYRINTILARI</p>
                <button type="button" onClick={() => setPlanOpen(false)} aria-label="Plan ayrıntılarını kapat" className={`${ap.muted} rounded p-1 hover:bg-black/5`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                {plan && (
                  <span className={ap.text} data-testid="astro-plan">
                    {plan.selectedCount} hesap · {plan.newRequestCount} yeni sağlayıcı isteği · {plan.cachedCount} önceden hesaplanmış
                    {plan.blockedCount > 0 && <> · {plan.blockedCount} hesaplanamaz</>}
                    {plan.dedupedCount > 0 && <> · {plan.dedupedCount} yinelenen birim tekilleştirildi</>}
                    {plan.requiresConfirmation && <> · onay gerekir</>}
                  </span>
                )}
                <div className="flex min-w-0 flex-wrap gap-1.5" role="list" aria-label="Seçilen teknikler" data-testid="atlas-chosen">
                  {chosen.map((id) => {
                    const st = statusOf(id);
                    const f = id === focus;
                    return (
                      <span key={id} role="listitem" className={`${f ? ap.chipGold : ap.chip} !gap-0 !p-0 text-xs`}>
                        <button type="button" onClick={() => focusOn(id)} className="inline-flex items-center gap-1.5 py-1 pl-2.5 pr-1.5" title={`${techniqueLabel(id)} — ${st.text}`} data-chip={id}>
                          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[st.kind]}`} />
                          <span className="max-w-[180px] truncate">{TECHNIQUE_META[id].label}</span>
                          <span className={`${ap.muted} text-[10.5px]`}>· {st.text}</span>
                        </button>
                        <button type="button" onClick={() => toggle(id, false)} aria-label={`${TECHNIQUE_META[id].label} tekniğini kaldır`} className={`${ap.muted} mr-1 rounded-full p-1 hover:bg-black/5`}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
                {plan && plan.selections.length > 0 && (
                  <ul className="flex flex-col gap-0.5" data-testid="astro-plan-lines">
                    {plan.selections.map((s, i) => (
                      <li key={`${s.technique}-${i}`} className={s.blocked ? ap.dangerInk : ap.text}>
                        {techniqueLabel(s.technique)}
                        {s.options && describeOptions(s.technique, s.options, labelOf) ? ` — ${describeOptions(s.technique, s.options, labelOf)}` : ""}:{" "}
                        {s.blocked ? s.blocked.error : `${s.unitCount} birim · ${s.newRequests} yeni istek`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  /* ── Kimlik satırı (D4: ad + tek satır özet; ayrıntılar açılır) ── */
  const fmtDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
  const off = rev ? rev.utcOffsetSeconds : 0;
  const offTxt = formatUtcOffset(off);
  const accuracyWarn = rev && rev.timeKnown && rev.timeAccuracy && rev.timeAccuracy !== "exact_record" && rev.timeAccuracy !== "rectified" ? `Saat doğruluğu: ${rev.timeAccuracyLabel}` : null;
  const detail = (label: string, value: ReactNode) => (
    <div className="min-w-0">
      <dt className={`${ap.goldInk} text-[9.5px] font-semibold tracking-[0.16em]`}>{label}</dt>
      <dd className={`${ap.ink} truncate text-[13px] tabular-nums`}>{value}</dd>
    </div>
  );
  const ghostBtn = `${ap.btnGhost} shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6f55c9]`;

  // z-20: Danışan Seç açılır paneli alttaki cam yüzeylerin (ayrı katman bağlamı) üstünde kalır.
  const plate = (
    <header className={`${SURFACE} z-20 flex flex-col gap-2.5 px-3 py-3 sm:px-4`} data-testid="atlas-prep-plate">
      <Brackets className="border-[#b68a3c]/35" />
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0" data-testid="atlas-client-identity">
          <p className={EYEBROW}>GÖKSEL ANALİZ · DANIŞAN</p>
          <h2 className={`${ap.ink} ${ap.display} break-words text-lg leading-tight [overflow-wrap:anywhere] sm:truncate sm:text-xl`} data-testid="atlas-client-name">
            {profile ? profile.label : "Danışan seçilmedi"}
          </h2>
          {profile && rev ? (
            <p className={`${ap.text} mt-0.5 break-words text-[13px] tabular-nums sm:truncate`} data-testid="atlas-birth-summary">
              {fmtDate(rev.birthDate)} · {rev.timeKnown ? rev.birthTime?.slice(0, 5) : "saat bilinmiyor"} · {rev.locationLabel}
            </p>
          ) : (
            <p className={`${ap.muted} mt-0.5 text-[13px]`}>{profile ? "Doğum bilgisi yükleniyor…" : "Danışan seçin ya da Yeni Danışan oluşturun. Teknikleri şimdiden inceleyebilirsiniz."}</p>
          )}
          {(timeUnknown || accuracyWarn) && (
            <p className={`${ap.chipWarn} mt-1`} data-testid="atlas-birth-warning">
              <AlertTriangle className="h-3 w-3" />
              {timeUnknown ? "Doğum saati bilinmiyor: saat gerektiren teknikler hesaplanmaz, evler gösterilmez." : accuracyWarn}
            </p>
          )}
          {rev?.staleTimezone && (
            <p className={`${ap.chipWarn} mt-1`} data-testid="atlas-stale-timezone">
              <AlertTriangle className="h-3 w-3" />
              {rev.staleTimezone.text}
            </p>
          )}
          {rev?.lmtNotice && (
            <p className={`${ap.chipWarn} mt-1`} data-testid="atlas-representative-lmt">
              <AlertTriangle className="h-3 w-3" />
              {rev.lmtNotice.text}
            </p>
          )}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="min-w-0">{picker}</div>
          <button
            type="button"
            onClick={onCreateClient}
            className={`${ap.btnGold} shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6f55c9]`}
            data-testid="atlas-new-client"
          >
            <Plus className="h-4 w-4" /> <span className="whitespace-nowrap">Yeni Danışan</span>
          </button>
          {profile && rev && onEditBirth && (
            <button type="button" onClick={onEditBirth} className={ghostBtn} data-testid="atlas-edit-birth">
              <Pencil className="h-3.5 w-3.5" /> Doğum Bilgilerini Düzenle
            </button>
          )}
          {profile && rev && (
            <button type="button" onClick={() => setBirthDetailsOpen((v) => !v)} aria-expanded={birthDetailsOpen} aria-controls="atlas-birth-details" className={ghostBtn} data-testid="atlas-birth-details-toggle">
              Doğum Ayrıntıları <ChevronDown className={`h-3.5 w-3.5 transition ${birthDetailsOpen ? "rotate-180" : ""}`} />
            </button>
          )}
          {profile && onDeleteProfile && (
            <button type="button" onClick={onDeleteProfile} className={`${ghostBtn} hover:!border-rose-300 hover:!text-rose-700`} data-testid="atlas-delete-profile" title="Doğum profilini veya yalnız kayıtlı analizlerini kalıcı sil (onaylı)">
              <Trash2 className="h-3.5 w-3.5" /> Profili Sil
            </button>
          )}
        </div>
      </div>
      {/* Adım şeridi: kullanıcı akışta nerede olduğunu görür (yalnız mevcut durumdan türetilir; yeni mantık yok). */}
      <ol className={ap.steps} aria-label="Analiz adımları" data-testid="atlas-steps">
        {(
          [
            ["Danışan", profile && rev ? "done" : "now", profile && rev ? profile.label : "seçilmedi"],
            ["Teknik", chosen.length > 0 ? "done" : profile ? "now" : "todo", chosen.length > 0 ? `${chosen.length} seçili` : "seçilmedi"],
            ["Ayarlar", chosen.length === 0 ? "todo" : missingN > 0 ? "warn" : "done", chosen.length === 0 ? "—" : missingN > 0 ? `${missingN} eksik` : "hazır"],
            ["Başlat", running ? "done" : !runDisabled ? "now" : "todo", running ? "hesaplanıyor" : !runDisabled ? "hazır" : "bekliyor"],
          ] as const
        ).map(([label, st, sub], i) => (
          <li
            key={label}
            aria-current={st === "now" ? "step" : undefined}
            className={`${ap.step} ${st === "now" ? ap.stepNow : st === "warn" ? ap.stepWarn : ""}`}
          >
            <span
              className={`${ap.stepNum} ${st === "done" ? ap.stepNumDone : st === "now" ? ap.stepNumNow : st === "warn" ? ap.stepNumWarn : ""}`}
              aria-hidden="true"
            >
              {st === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className="min-w-0 leading-tight">
              <span className={`block text-[13px] font-semibold ${st === "todo" ? ap.muted : ap.ink}`}>{label}</span>
              <span className={`${ap.muted} block truncate text-[11px]`}>{sub}</span>
            </span>
          </li>
        ))}
      </ol>
      {profile && rev && birthDetailsOpen && (
        <dl id="atlas-birth-details" className={`atlas-prep-in ${ap.inset} grid grid-cols-2 gap-x-4 gap-y-2 px-3 py-2.5 sm:grid-cols-3 lg:grid-cols-6`} data-testid="atlas-birth-details">
          {detail("DOĞUM TARİHİ", fmtDate(rev.birthDate))}
          {detail("SAAT", rev.timeKnown ? rev.birthTime?.slice(0, 5) : "bilinmiyor")}
          {detail("SAAT DİLİMİ", <span title={rev.timezone}>{`${rev.timezone} · ${offTxt}`}</span>)}
          {detail("KOORDİNAT", `${Math.abs(rev.latitude).toFixed(4)}° ${rev.latitude >= 0 ? "K" : "G"} · ${Math.abs(rev.longitude).toFixed(4)}° ${rev.longitude >= 0 ? "D" : "B"}`)}
          {detail("SAAT DOĞRULUĞU", rev.timeAccuracyLabel)}
          {detail("DANIŞAN KAYDI", profile.clientName ?? "eşleştirilmemiş")}
        </dl>
      )}
      {profile?.archivedAt && <p className={`${ap.warnInk} text-xs`}>Bu danışan arşivde. Analiz yapılabilir; arşivden çıkarmak için Analiz Arşivi&apos;ni kullanın.</p>}
    </header>
  );

  const hhmmss = (ms: number) => new Date(ms).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const failPanel = runFailures && runFailures.items.length > 0 && (
    <div className={`${ap.noteDanger} px-4 py-3`} role="alert" data-testid="atlas-run-failures">
      <div className="flex items-start justify-between gap-3">
        <p className={`${ap.dangerInk} flex items-start gap-2 font-semibold`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Analiz açılmadı: seçilen tekniklerin hiçbiri hesaplanamadı. Sonuç kaydedilmedi.
        </p>
        <button type="button" onClick={onDismissFailures} aria-label="Hata özetini kapat" className={`${ap.muted} rounded p-1 hover:bg-black/5`}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {runFailures.items.map((f, i) => (
          <li key={`${f.technique}-${i}`} className="rounded-lg bg-white/80 px-3 py-1.5" data-fail-technique={f.technique} data-fail-code={f.code}>
            <span className="font-semibold">{techniqueLabel(f.technique)}:</span> <span className={ap.text}>{f.error}</span>
          </li>
        ))}
      </ul>
      <p className={`${ap.text} mt-2 text-[12px] leading-snug`} data-testid="atlas-run-failures-next">
        {runFailures.items.some((f) => f.code === "LOCAL_FIXTURE_MISSING")
          ? "Yerel önizlemede yalnız test verisi bulunan girdiler hesaplanır (ör. “Ali Örnek — natal”). Bu danışan için gerçek hesaplama, gerçek hesaplama hizmetine bağlı ortamda yapılır. "
          : ""}
        {runFailures.items.some((f) => f.code === "IN_PROGRESS")
          ? `Çift ücretli istek önleme kilidi nedeniyle yeni istek gönderilmedi; en erken ${hhmmss(runFailures.at + Math.max(...runFailures.items.map((f) => f.retryAfterSec ?? 0)) * 1000)} itibarıyla yeniden deneyebilirsiniz. `
          : ""}
        Yeniden denemek için “Analizi Başlat”a basın; yeni ücretli istek gerekiyorsa sayısı ve onayı önceden gösterilir.
      </p>
    </div>
  );

  const notices = (
    <>
      {failPanel}
      {runError && (
        <p className={`${ap.noteDanger} flex items-start gap-2`} role="alert" data-testid="astro-run-error">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Hesaplama tamamlanamadı: {runError}
        </p>
      )}
      {running && (
        <p className={`${ap.noteInfo} flex items-center gap-2`} role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> Hesaplama sürüyor… Tamamlandığında sonuç ekranı açılacak.
        </p>
      )}
    </>
  );

  const leftCol = (
    <div className={`${SURFACE} flex min-h-0 flex-col gap-3 p-3`}>
      {dials}
      <div className="flex items-center justify-between gap-2 px-1">
        <p className={EYEBROW}>{sysDef.short.toLocaleUpperCase("tr-TR")} TEKNİKLERİ</p>
        <span className={`${ap.muted} text-[11.5px] tabular-nums`}>
          {counts[system]} / {TECH_BY_SYSTEM[system].length} seçili
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]">{techniqueIndex(false)}</div>
    </div>
  );
  const settingsCol = <div className={`${SURFACE} min-h-0 overflow-y-auto p-4 [scrollbar-width:thin]`}>{settingsBody(false)}</div>;

  return (
    <section className={`${atlasDisplay.variable} ${atlasText.variable} relative flex min-w-0 flex-col gap-3 [font-family:var(--font-atlas-text)]`} aria-label="Göksel Analiz Hazırlık Merkezi" data-testid="atlas-prep-center">
      <style>{CSS}</style>
      {plate}
      {notices}
      {mode === "wide" ? (
        <div
          ref={deskRef}
          style={deskH ? { height: deskH } : undefined}
          className="grid min-h-0 grid-cols-[minmax(320px,400px)_minmax(0,1fr)] gap-3"
          data-testid="atlas-prep-grid"
        >
          {leftCol}
          {settingsCol}
        </div>
      ) : mode === "mid" ? (
        <div ref={deskRef} style={deskH ? { height: deskH } : undefined} className="grid min-h-0 grid-cols-[minmax(260px,300px)_minmax(0,1fr)] gap-3" data-testid="atlas-prep-grid">
          {leftCol}
          {settingsCol}
        </div>
      ) : (
        <div className="flex flex-col gap-3" data-testid="atlas-prep-stack">
          <div className={`${SURFACE} p-3`}>{dials}</div>
          <div className={`${SURFACE} p-2`}>
            <div className="flex items-center justify-between gap-2 px-1 pb-2">
              <p className={EYEBROW}>
                {sysDef.short.toLocaleUpperCase("tr-TR")} TEKNİKLERİ · {counts[system]} / {TECH_BY_SYSTEM[system].length}
              </p>
            </div>
            {techniqueIndex(true)}
          </div>
        </div>
      )}
      {/* sabit konsolun kapladığı yer kadar boşluk (içerik konsolun altında kalmaz) */}
      <div aria-hidden="true" style={{ height: consoleH }} />
      {consoleBar}
    </section>
  );
}
