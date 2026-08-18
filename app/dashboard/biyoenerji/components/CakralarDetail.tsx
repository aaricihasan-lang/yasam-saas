"use client";

import Link from "next/link";
import { ArrowUpRight, FileText, Flower2, Gem, Link2, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DogaltasFontSizeControl } from "@/app/dogaltas/components/DogaltasFontSizeControl";
import { formatStoneContent } from "@/lib/dogaltas/formatStoneContent";
import { getSessionTenantId, getSyncedTenantId, MISSING_SESSION_TENANT_MESSAGE } from "@/lib/auth/sessionTenant";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { chakraColorDot } from "@/lib/bioenergy/chakraColorUtils";
import {
  CHAKRAS_FONT_DEFAULT,
  CHAKRAS_FONT_MOBILE_MIN,
  chakrasTypography,
  type ChakrasTypography,
} from "@/lib/bioenergy/chakrasFontSize";
import {
  chakraDisplayName,
  chakraCardBadge,
  fetchChakraRecordById,
  mapChakraDetailRow,
  CHAKRAS_LIST_PATH,
  type ChakraDetailItem,
} from "@/lib/bioenergy/chakrasListFetch";
import { useChakrasFontSize } from "@/lib/bioenergy/useChakrasFontSize";
import {
  partitionBedenSistemBlocks,
  type ChakraSection,
  type ChakraSectionBlock,
} from "@/lib/bioenergy/chakraSections";
import {
  buildChakraWorkspace,
  deriveChakraBibliography,
  type ChakraContentBlock,
  type ChakraWorkspaceSection,
} from "@/lib/bioenergy/chakraWorkspace";
import { fetchChakraBlocks } from "@/lib/bioenergy/chakraBlocksFetch";
import ChakraV4Content from "./ChakraV4Content";
import ChakraBibliography from "./ChakraBibliography";
import { BIOENERJI_FOLDER_BASE, findBiyoenerjiSection } from "../biyoenerjiFolderConfig";
import BiyoenerjiBreadcrumb, { type BiyoenerjiCrumb } from "./BiyoenerjiBreadcrumb";
import ChakraSectionNav from "./ChakraSectionNav";
import { authHeaders, bioApiDelete, bioApiUpdate } from "@/lib/biyoenerji/secureApi";
import { BiyoenerjiCrudFormModal } from "./BiyoenerjiCrudFormModal";
import { BiyoenerjiConfirmModal } from "./BiyoenerjiConfirmModal";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { DemoGate } from "@/components/demo/DemoGate";
import { LongTextareaField } from "./LargeTextModal";
import { fetchAllStonesExtended } from "@/lib/dogaltas/stonesListFetch";
import {
  buildChakraStoneView,
  type ChakraMatchStone,
  type ManualStoneItem,
} from "@/lib/bioenergy/chakraStoneMatch";
import {
  getCachedDogaltasStones,
  setCachedDogaltasStones,
} from "@/lib/biyoenerji/dogaltasStoneCache";
import { bioListFindRow } from "@/lib/biyoenerji/listCache";

type ChakraForm = {
  name: string;
  organs: string;
  glands: string;
  color: string;
  stones: string;
  causes: string;
  physical: string;
  mental: string;
  notes: string;
};

// Aksiyon rayı — kompakt, header'la yarışmayan. Düzenle hafif violet ile öne
// çıkar (bağırmadan); Sil destructive kimliğini korur ama baskın değildir; Word
// sade. Mobilde 44px dokunma hedefi, masaüstünde kompakt.
const tbBtn =
  "inline-flex min-h-[44px] sm:min-h-[38px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-[13px] font-semibold text-slate-600 shadow-sm transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-40";
const tbBtnPrimary =
  "inline-flex min-h-[44px] sm:min-h-[38px] items-center justify-center gap-1.5 rounded-lg border border-violet-200/80 bg-violet-50 px-3 py-2 text-[13px] font-bold text-violet-800 shadow-sm transition hover:border-violet-300 hover:bg-violet-100 disabled:opacity-40";
const tbBtnDanger =
  "inline-flex min-h-[44px] sm:min-h-[38px] items-center justify-center gap-1.5 rounded-lg border border-rose-200/70 bg-white/90 px-3 py-2 text-[13px] font-semibold text-rose-600 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 disabled:opacity-40";

function trimOrEmpty(v: string) {
  return v.trim();
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function useMobileViewport() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

/**
 * Manuel "Taşlar" gövdesi — her satır kullanıcının yazdığı metni gösterir;
 * Doğaltaş'ta aynı isimde kayıt varsa satıra tıklanabilir küçük bir badge eklenir.
 * Manuel metin korunur (yalnızca sunum). Liste ayrıştırılamazsa ham metne döner.
 * (Dış <section>/başlık artık üst section kartı tarafından sağlanır.)
 */
function ManualStonesBody({
  text,
  items,
  typography,
}: {
  text: string;
  items: ManualStoneItem[];
  typography: ChakrasTypography;
}) {
  return (
    <>
      {items.length === 0 ? (
        <div className="min-w-0" style={typography.bodyStyle}>
          {formatStoneContent(text, { fontSizePx: typography.fontSizePx })}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((it, i) =>
            it.match ? (
              <Link
                key={`${it.key}-${i}`}
                href={`/dogaltas/dogaltas-listesi/${it.match.id}`}
                title="Doğaltaş kaydını aç"
                className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1 text-[13px] font-semibold text-emerald-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-100"
              >
                <span className="min-w-0 break-words">{it.display}</span>
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200/70">
                  <Link2 className="h-3 w-3" aria-hidden />
                  Doğaltaş
                </span>
              </Link>
            ) : (
              <span
                key={`${it.key}-${i}`}
                className="inline-flex max-w-full items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[13px] font-medium text-slate-700 shadow-sm"
              >
                <span className="min-w-0 break-words">{it.display}</span>
              </span>
            ),
          )}
        </div>
      )}
    </>
  );
}

/**
 * İçerik blokları — editorial: alt başlık (h3) + gövde; bloklar arası ince
 * separator (nested kart YOK). Hem ana içerikte hem context panelinde kullanılır.
 */
function ContentBlocks({
  blocks,
  typography,
}: {
  blocks: ChakraSectionBlock[];
  typography: ChakrasTypography;
}) {
  return (
    <div className="flex flex-col gap-5">
      {blocks.map((b, i) => (
        <div
          key={`${b.title ?? "blok"}-${i}`}
          className={i > 0 ? "border-t border-slate-200/60 pt-5" : ""}
        >
          {b.title ? (
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {b.title}
            </h3>
          ) : null}
          <div className="min-w-0 max-w-3xl" style={typography.bodyStyle}>
            {formatStoneContent(b.text, { fontSizePx: typography.fontSizePx })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Bağlamsal bilgi paneli — çok hafif premium yüzey (sakin border/tint, ağır
 * shadow/gradient YOK). Yalnız GERÇEK veri geldiğinde render edilir; boş/sahte
 * panel gösterilmez. Gelecekte yeni gerçek alanlar geldiğinde aynı slot
 * zenginleşir (empty-state reklamı YOK).
 */
function ContextPanel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <aside className="rounded-xl border border-slate-200/70 bg-white/55 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:p-5">
      {title ? (
        <h3 className="mb-3 text-[11px] font-black uppercase tracking-[0.16em] text-violet-700/80">
          {title}
        </h3>
      ) : null}
      {children}
    </aside>
  );
}

function recordToForm(record: ChakraDetailItem): ChakraForm {
  return {
    name: record.name ?? "",
    organs: record.organs ?? "",
    glands: record.glands ?? "",
    color: record.color ?? "",
    stones: record.stones ?? "",
    causes: record.causes ?? "",
    physical: record.physical ?? "",
    mental: record.mental ?? "",
    notes: record.notes ?? "",
  };
}

export default function CakralarDetail({ id }: { id: string }) {
  const router = useRouter();
  const { isDemo } = useDemoGuard();
  const lastGoodRecordRef = useRef<ChakraDetailItem | null>(null);
  const isMobile = useMobileViewport();
  const {
    fontSizePx,
    decrease: decreaseFontSize,
    reset: resetFontSize,
    increase: increaseFontSize,
    canDecrease: canDecreaseFontSize,
    canIncrease: canIncreaseFontSize,
    isDefault: isDefaultFontSize,
  } = useChakrasFontSize();

  const contentFontSizePx = isMobile
    ? Math.max(CHAKRAS_FONT_MOBILE_MIN, fontSizePx)
    : fontSizePx;

  const contentTypography = useMemo(
    () => chakrasTypography(contentFontSizePx),
    [contentFontSizePx],
  );

  const [record, setRecord] = useState<ChakraDetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [wordBusy, setWordBusy] = useState(false);

  // Doğaltaş eşleşmeleri (salt-okuma) — mevcut güvenli API, veri yazma yok
  const [dogaltasStones, setDogaltasStones] = useState<ChakraMatchStone[]>([]);
  const [stonesLoading, setStonesLoading] = useState(true);
  const [stonesError, setStonesError] = useState(false);

  // FAZ 3.3E — rich içerik blokları (salt-okuma, tenant/IDOR-safe server route).
  // Kayıtta blok yoksa boş → tüm mevcut kayıtlarda FAZ 3.1 davranışı DEĞİŞMEZ.
  const [blocks, setBlocks] = useState<ChakraContentBlock[]>([]);

  const downloadWord = useCallback(async () => {
    if (!record) return;
    const tenantId = await getSyncedTenantId();
    if (!tenantId) return;
    setWordBusy(true);
    try {
      const res = await fetch("/api/biyoenerji/chakra-report", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ tenantId, userId: readYasamUser()?.id ?? "", exportMode: "single", chakraId: record.id }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safe = (record.name || "cakra").toLowerCase()
        .replace(/ı/g,"i").replace(/ğ/g,"g").replace(/ü/g,"u")
        .replace(/ş/g,"s").replace(/ö/g,"o").replace(/ç/g,"c")
        .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
      a.download = `biyoenerji-cakra-${safe}-${new Date().toISOString().slice(0,10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* sessiz */ } finally {
      setWordBusy(false);
    }
  }, [record]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ChakraForm>({
    name: "",
    organs: "",
    glands: "",
    color: "",
    stones: "",
    causes: "",
    physical: "",
    mental: "",
    notes: "",
  });
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [infoSuccess, setInfoSuccess] = useState("");
  const [infoError, setInfoError] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const showSoft = useCallback((kind: "ok" | "err", text: string) => {
    if (kind === "ok") {
      setInfoError("");
      setInfoSuccess(text);
    } else {
      setInfoSuccess("");
      setInfoError(text);
    }
  }, []);

  useEffect(() => {
    if (!infoSuccess && !infoError) return;
    const t = window.setTimeout(() => {
      setInfoSuccess("");
      setInfoError("");
    }, 5200);
    return () => window.clearTimeout(t);
  }, [infoSuccess, infoError]);

  const loadRecord = useCallback(async () => {
    const recordId = id.trim();
    if (!recordId) {
      setLoading(false);
      setErrorMessage("Geçersiz kayıt bağlantısı.");
      setRecord(null);
      return;
    }

    // Listeden gelen taze veriyle ANINDA içerik göster; tam kaydı arka planda çek
    // (stale-while-revalidate). Cache'te yoksa normal spinner gösterilir.
    let seeded = false;
    const seed = bioListFindRow("chakras", recordId);
    if (seed) {
      const mapped = mapChakraDetailRow(seed);
      lastGoodRecordRef.current = mapped;
      setRecord(mapped);
      setForm(recordToForm(mapped));
      seeded = true;
    }

    setLoading(!seeded);
    setErrorMessage("");

    const tenantId = await getSyncedTenantId();
    if (!tenantId) {
      setLoading(false);
      setErrorMessage(MISSING_SESSION_TENANT_MESSAGE);
      return;
    }

    try {
      const result = await fetchChakraRecordById(tenantId, recordId);
      setLoading(false);

      if (result.error) {
        setErrorMessage(`Kayıt okunamadı: ${result.error}`);
        if (lastGoodRecordRef.current) setRecord(lastGoodRecordRef.current);
        else setRecord(null);
        return;
      }

      if (!result.data) {
        setErrorMessage("Kayıt bulunamadı.");
        if (lastGoodRecordRef.current) setRecord(lastGoodRecordRef.current);
        else setRecord(null);
        return;
      }

      lastGoodRecordRef.current = result.data;
      setRecord(result.data);
      setErrorMessage("");
      setForm(recordToForm(result.data));
    } catch (err) {
      setLoading(false);
      const message = err instanceof Error ? err.message : String(err);
      console.error("[CakralarDetail] loadRecord exception:", message);
      setErrorMessage(`Beklenmeyen hata: ${message}`);
      if (lastGoodRecordRef.current) setRecord(lastGoodRecordRef.current);
    }
  }, [id]);

  useEffect(() => {
    if (!id.trim()) {
      setLoading(false);
      setErrorMessage("Geçersiz kayıt bağlantısı.");
      setRecord(null);
      return;
    }
    void loadRecord();
  }, [loadRecord, id]);

  // FAZ 3.3E — rich blokları çek (salt-okuma). Hata/boş → graceful boş liste;
  // mevcut kayıtlarda (blok yok) hiçbir görsel değişiklik olmaz.
  useEffect(() => {
    const recordId = id.trim();
    if (!recordId) return;
    let cancelled = false;
    void fetchChakraBlocks(recordId).then(({ blocks: rows }) => {
      if (!cancelled) setBlocks(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Doğaltaş taşları — oturum-içi tenant cache (her detayda yeniden çekme)
  useEffect(() => {
    let cancelled = false;
    const tenantId = getSessionTenantId();

    // Cache hit → anında kullan; mode=extended çağrısı yapma
    const cached = getCachedDogaltasStones(tenantId);
    if (cached) {
      setDogaltasStones(cached);
      setStonesError(false);
      setStonesLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setStonesLoading(true);
    setStonesError(false);
    void fetchAllStonesExtended("").then(({ rows, error }) => {
      if (cancelled) return;
      if (error) {
        setStonesError(true);
        setDogaltasStones([]);
      } else {
        const mapped = rows.map((r) => ({
          id: r.id,
          stone_name: r.stone_name,
          chakras: r.chakras,
          assignments: r.assignments,
        }));
        setDogaltasStones(mapped);
        setCachedDogaltasStones(tenantId, mapped);
      }
      setStonesLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const stoneView = useMemo(
    () => buildChakraStoneView(record?.name ?? null, dogaltasStones, record?.stones ?? null),
    [record?.name, record?.stones, dogaltasStones],
  );

  // Tek-section workspace state — URL `?section=<hash>` ile kalıcı (refresh +
  // paylaşım + back/forward). Geçersiz/boş/future → ilk görünür section
  // (render'da resolveActiveChakraSection ile). Lazy init: hydration-güvenli
  // (section içeriği zaten kayıt yüklendikten sonra render edilir).
  const [sectionParam, setSectionParam] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("section")
      : null,
  );

  // Back/forward: URL değişince section state'i güncelle (event handler).
  useEffect(() => {
    const onPop = () =>
      setSectionParam(new URLSearchParams(window.location.search).get("section"));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const selectSection = useCallback((hash: string) => {
    setSectionParam(hash);
    if (typeof window !== "undefined") {
      window.history.pushState(
        null,
        "",
        `${window.location.pathname}?section=${encodeURIComponent(hash)}`,
      );
    }
  }, []);

  async function handleGuncelle() {
    const tenantId = await getSyncedTenantId();
    if (!tenantId || !record) return;

    const nameTrim = form.name.trim();
    if (!nameTrim) {
      showSoft("err", "Çakra adı zorunludur.");
      return;
    }

    setSaving(true);
    const { error } = await bioApiUpdate("chakras", record.id, {
      name: nameTrim,
      organs: trimOrEmpty(form.organs),
      glands: trimOrEmpty(form.glands),
      color: trimOrEmpty(form.color),
      stones: trimOrEmpty(form.stones),
      causes: trimOrEmpty(form.causes),
      physical: trimOrEmpty(form.physical),
      mental: trimOrEmpty(form.mental),
      notes: trimOrEmpty(form.notes),
    });

    setSaving(false);

    if (error) {
      showSoft("err", `Güncellenemedi: ${error}`);
      return;
    }

    setFormModalOpen(false);
    await loadRecord();
    showSoft("ok", "Kayıt güncellendi.");
  }

  async function executeDelete() {
    const tenantId = await getSyncedTenantId();
    if (!tenantId || !record) return;

    setSaving(true);
    const { error } = await bioApiDelete("chakras", record.id);

    setSaving(false);
    setDeleteConfirmOpen(false);

    if (error) {
      showSoft("err", `Silinemedi: ${error}`);
      return;
    }

    router.push(CHAKRAS_LIST_PATH);
  }

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-3xl border-2 border-fuchsia-200/60 bg-fuchsia-50/80">
        <p className="text-lg font-semibold text-slate-600">Kayıt yükleniyor…</p>
      </div>
    );
  }

  const showRecordWithWarning = Boolean(record && errorMessage);

  if (errorMessage && !record) {
    return (
      <div className="rounded-3xl border-2 border-rose-200 bg-rose-50 p-6 text-center sm:p-8">
        <p className="text-lg font-bold text-rose-800">{errorMessage}</p>
      </div>
    );
  }

  if (!record) return null;

  const displayTitle = chakraDisplayName(record);
  const badge = chakraCardBadge(record);
  const dotColor = chakraColorDot(record.color);

  // FAZ 3.1 — legacy kolonlar profesyonel section modeline map edilir (veri
  // dönüşümü YOK; boş alan → section gizli). Taşlar & Destekleyiciler manuel
  // stones metni varsa görünür; Doğaltaş ek-taş bloğu ayrıca (aşağıda) render
  // edilir (mevcut davranış korunur).
  const stonesVisible = Boolean(record.stones?.trim());
  // FAZ 3.3E — legacy + rich (V4) birleşik workspace. blocks=[] iken çıktı FAZ 3.1
  // legacy davranışıyla birebir aynıdır (regresyon yok). source-evidence gizli.
  const workspace = buildChakraWorkspace(record, blocks, {
    stonesVisible,
    quickFacts: {
      sanskritName: record.sanskrit_name,
      element: record.element,
      location: record.location,
      bijaMantra: record.bija_mantra,
    },
  });
  const activeWs: ChakraWorkspaceSection | null =
    (sectionParam ? workspace.find((s) => s.hash === sectionParam) : undefined) ??
    workspace[0] ??
    null;
  const bibliography = deriveChakraBibliography(blocks);

  // Breadcrumb — son segment gerçek kayıt adı (generic "Kayıt detayı" değil).
  // Zincir IA sözlüğünden kurulur; link davranışı korunur (Çakralar → liste).
  const chakraNav = findBiyoenerjiSection("cakralar");
  const crumbs: BiyoenerjiCrumb[] = chakraNav
    ? [
        { label: "Biyoenerji", href: BIOENERJI_FOLDER_BASE },
        { label: chakraNav.group.title },
        { label: chakraNav.card.title, href: chakraNav.card.href },
        { label: displayTitle },
      ]
    : [{ label: "Biyoenerji", href: BIOENERJI_FOLDER_BASE }];

  const stoneMatchVisible =
    !stonesLoading && !stonesError && stoneView.matchedCount > 0;

  // ── Adaptif workspace kompozisyonu ─────────────────────────────────────────
  // Selected section → ana içerik + (yalnız GERÇEK veri varsa) bağlam paneli.
  // Bağlam yoksa panel render EDİLMEZ; ana içerik doğal tek kolona genişler
  // (boş/sahte sağ kolon YOK). Yeni network/DB/field YOK — tümü mevcut veriden.
  const stonesReady = !stonesLoading && !stonesError;

  const renderStonesMain = (): ReactNode => (
    <div className="flex flex-col gap-6">
      <ManualStonesBody
        text={record.stones?.trim() ?? ""}
        items={stoneView.manualItems}
        typography={contentTypography}
      />
      {/* Doğaltaşta bulunan ek taşlar — yalnız bu section aktifken (geniş grid) */}
      {stonesReady && stoneView.extraStones.length > 0 && (
        <div className="border-t border-slate-200/60 pt-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 text-white shadow-sm">
              <Gem className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-black tracking-tight text-slate-900">Doğaltaşta bulunan ek taşlar</h3>
              <p className="text-[12px] font-medium leading-snug text-slate-500">
                Bu çakraya Doğaltaş&rsquo;ta atanmış olup manuel listede olmayan taşlar.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {stoneView.extraStones.map((s) => (
              <Link
                key={s.id}
                href={`/dogaltas/dogaltas-listesi/${s.id}`}
                title="Doğaltaş kaydını aç"
                className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-violet-200/70 bg-violet-50/80 px-3 py-1.5 text-[12px] font-bold text-violet-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-violet-100/80 hover:shadow"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-violet-500" aria-hidden />
                <span className="truncate">{s.name}</span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-60 transition group-hover:opacity-100" aria-hidden />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderGenelMain = (
    blocksArg: ChakraSectionBlock[],
    quickRows: { key: string; label: string; value: string }[],
  ): ReactNode => (
    <div className="flex flex-col gap-3">
      {quickRows.map((r) => (
        <div key={`qf-${r.key}`} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{r.label}</span>
          <span className="text-[15px] font-semibold text-slate-800">{r.value}</span>
        </div>
      ))}
      {blocksArg.map((b, i) => (
        <div key={`gb-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {b.title ? (
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {b.title}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-2 text-[15px] font-semibold text-slate-800">
            {b.title === "Renk" ? (
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-slate-200"
                style={{ backgroundColor: dotColor }}
                aria-hidden
              />
            ) : null}
            {b.text}
          </span>
        </div>
      ))}
    </div>
  );

  // Aktif section içeriği: legacy (mevcut davranış) + rich V4 görünür bloklar.
  // legacy renderer'lar activeWs.legacyBlocks ile beslenir (blocks=[] iken FAZ 3.1
  // ile birebir). Rich bloklar ChakraV4Content ile; source-evidence zaten workspace'te
  // elenmiştir (ana içerikte kaynak adı YOK).
  let sectionMain: ReactNode = null;
  let sectionContext: ReactNode = null;

  if (activeWs) {
    const legacyBlocks = activeWs.legacyBlocks;
    let legacyNode: ReactNode = null;
    if (activeWs.kind === "stones") {
      legacyNode = renderStonesMain();
    } else if (activeWs.id === "genel-bakis") {
      legacyNode =
        legacyBlocks.length > 0 || activeWs.quickFacts.length > 0
          ? renderGenelMain(legacyBlocks, activeWs.quickFacts)
          : null;
    } else if (activeWs.id === "beden-sistem") {
      const { primary, context } = partitionBedenSistemBlocks({
        blocks: legacyBlocks,
      } as ChakraSection);
      if (primary.length > 0 && context.length > 0) {
        legacyNode = <ContentBlocks blocks={primary} typography={contentTypography} />;
        sectionContext = (
          <ContextPanel>
            <ContentBlocks blocks={context} typography={contentTypography} />
          </ContextPanel>
        );
      } else if (legacyBlocks.length > 0) {
        legacyNode = <ContentBlocks blocks={legacyBlocks} typography={contentTypography} />;
      }
    } else if (legacyBlocks.length > 0) {
      legacyNode = <ContentBlocks blocks={legacyBlocks} typography={contentTypography} />;
    }

    const richNode =
      activeWs.richBlocks.length > 0 ? (
        <div className="flex flex-col gap-6">
          {activeWs.richBlocks.map((b) => (
            <ChakraV4Content key={b.id} block={b} />
          ))}
        </div>
      ) : null;

    sectionMain =
      legacyNode && richNode ? (
        <div className="flex flex-col gap-6">
          {legacyNode}
          {richNode}
        </div>
      ) : (
        legacyNode ?? richNode
      );
  }

  return (
    <div className="w-full min-w-0 max-w-none">

      {/* Feedback */}
      {(infoSuccess || infoError || showRecordWithWarning) && (
        <div className="mb-4 flex flex-col gap-1.5 sm:flex-row">
          {infoSuccess ? (
            <div className="flex-1 rounded-md border border-emerald-200 bg-emerald-50/80 px-3 py-1.5 text-[12px] font-medium text-emerald-700">{infoSuccess}</div>
          ) : null}
          {infoError ? (
            <div className="flex-1 rounded-md border border-rose-200 bg-rose-50/80 px-3 py-1.5 text-[12px] font-medium text-rose-700">{infoError}</div>
          ) : null}
          {showRecordWithWarning ? (
            <div className="flex-1 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-1.5 text-[12px] font-medium text-amber-700">{errorMessage}</div>
          ) : null}
        </div>
      )}

      {/* Breadcrumb — kompakt, geri planda; son segment gerçek kayıt adı */}
      <div className="mb-3">
        <BiyoenerjiBreadcrumb items={crumbs} />
      </div>

      {/* Record header — tek bütün: sol kimlik + meta, sağ aksiyon rayı */}
      <header className="flex flex-col gap-3.5 border-b border-slate-200/70 pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2.5 text-[1.7rem] font-black leading-tight tracking-tight text-slate-900 sm:text-[2rem]">
            <Flower2 className="h-7 w-7 shrink-0 text-emerald-500" strokeWidth={2} aria-hidden />
            <span className="min-w-0 break-words">{displayTitle}</span>
          </h1>
          {/* Meta — renk noktası + renk metni · tarih · taş eşleşme (record metadata) */}
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] font-medium text-slate-500">
            {badge ? (
              <span className="inline-flex items-center gap-1.5 text-slate-600">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-slate-200"
                  style={{ backgroundColor: dotColor }}
                  aria-hidden
                />
                <span className="min-w-0 break-words">{badge}</span>
              </span>
            ) : null}
            {badge ? <span className="h-1 w-1 shrink-0 rounded-full bg-slate-300" aria-hidden /> : null}
            <span>{formatDate(record.created_at)}</span>
            {stoneMatchVisible ? (
              <>
                <span className="h-1 w-1 shrink-0 rounded-full bg-slate-300" aria-hidden />
                <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                  <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {stoneView.matchedCount} taş Doğaltaş ile eşleşiyor
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:shrink-0 sm:justify-end">
          <DogaltasFontSizeControl
            fontSizePx={fontSizePx}
            onDecrease={decreaseFontSize}
            onReset={resetFontSize}
            onIncrease={increaseFontSize}
            canDecrease={canDecreaseFontSize}
            canIncrease={canIncreaseFontSize}
            isDefault={isDefaultFontSize}
            defaultFontSizePx={CHAKRAS_FONT_DEFAULT}
            compact
          />
          {!isDemo && (
            <>
              <div className="hidden h-6 w-px bg-slate-200 sm:block" aria-hidden />
              <button type="button" onClick={() => setFormModalOpen(true)} className={tbBtnPrimary}>
                <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
                Düzenle
              </button>
              <button type="button" disabled={saving} onClick={() => setDeleteConfirmOpen(true)} className={tbBtnDanger}>
                <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                Sil
              </button>
              {record && (
                <button type="button" onClick={() => void downloadWord()} disabled={wordBusy} className={tbBtn}>
                  <FileText className="h-4 w-4" strokeWidth={2} aria-hidden />
                  {wordBusy ? "Hazırlanıyor…" : "Word"}
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {/* FAZ 3.1 — ikinci-seviye editorial section nav (tek-section workspace) */}
      <div className="mt-4">
        <ChakraSectionNav
          sections={workspace.map((s) => ({ hash: s.hash, title: s.title }))}
          activeHash={activeWs?.hash ?? ""}
          onSelect={selectSection}
        />
      </div>

      <DemoGate
        isProtected={isDemo}
        message="Bu kayıt içeriği demo hesabında sınırlı gösterilir. Tam sürümde tüm bilgilere erişilebilir."
      >
        {activeWs ? (
          // Editorial içerik yüzeyi — koca beyaz kart YOK; metin ana odak.
          // Sol accent + güçlü başlık. Bağlam paneli varsa masaüstünde adaptif
          // 8/4 iki kolon; yoksa doğal tek kolon (boş sağ rezerve YOK).
          <section className="pt-5 sm:pt-6">
            <h2 className="mb-4 flex items-center gap-2.5 text-xl font-black tracking-tight text-slate-900">
              <span className="h-5 w-1 shrink-0 rounded-full bg-gradient-to-b from-violet-400 to-cyan-400" aria-hidden />
              <span className="min-w-0 break-words">{activeWs.title}</span>
            </h2>

            {sectionContext ? (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
                <div className="min-w-0 lg:col-span-8">{sectionMain}</div>
                {/* Mobilde context ana içeriğin ALTINA stack olur (iki kolon yok) */}
                <div className="min-w-0 lg:col-span-4">{sectionContext}</div>
              </div>
            ) : (
              sectionMain
            )}
          </section>
        ) : (
          <div className="pt-6 text-sm font-medium text-slate-500">
            Bu kayıt için henüz içerik girilmemiş.
          </div>
        )}

        {/* FAZ 3.3E — sayfa sonunda TEK Kaynakça (gizli source-evidence'tan distinct eser) */}
        <ChakraBibliography entries={bibliography} />
      </DemoGate>

      <BiyoenerjiCrudFormModal
        open={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        title="Çakra kaydını düzenle"
        subtitle="Kaydettikten sonra detay yenilenir."
        titleId="chakra-edit-modal-title"
        accentRingClass="ring-fuchsia-100/50"
        footer={
          <>
            <button
              type="button"
              disabled={saving}
              onClick={() => setFormModalOpen(false)}
              className="rounded-xl border border-slate-200/85 bg-white/90 px-4 py-2.5 text-[12px] font-black text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              Vazgeç
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => record && setForm(recordToForm(record))}
              className="rounded-xl border border-slate-200/80 bg-white/90 px-4 py-2.5 text-[12px] font-black text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              Sıfırla
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleGuncelle()}
              className="rounded-xl border border-fuchsia-200/70 bg-fuchsia-50/90 px-4 py-2.5 text-[12px] font-black text-fuchsia-950 shadow-sm transition hover:bg-fuchsia-100/90 disabled:opacity-55"
            >
              {saving ? "Güncelleniyor…" : "Güncelle"}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Çakra Adı *</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="h-12 w-full rounded-xl border border-fuchsia-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 outline-none transition focus:border-fuchsia-200/90 focus:ring-2 focus:ring-fuchsia-100/55"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-800">Renk</span>
            <input
              value={form.color}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              className="h-12 w-full rounded-xl border border-rose-100/80 bg-white/90 px-3.5 text-[13px] font-semibold text-slate-900 outline-none transition focus:border-rose-200/90 focus:ring-2 focus:ring-rose-100/55"
            />
          </label>
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Organlar</span>}
            modalTitle="Organlar"
            value={form.organs}
            onChange={(v) => setForm((f) => ({ ...f, organs: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-cyan-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-cyan-100/50"
            disabled={saving}
          />
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Bezler</span>}
            modalTitle="Bezler"
            value={form.glands}
            onChange={(v) => setForm((f) => ({ ...f, glands: v }))}
            minRows={2}
            className="w-full resize-none rounded-xl border border-violet-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-violet-100/50"
            disabled={saving}
          />
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Taşlar</span>}
            modalTitle="Taşlar"
            value={form.stones}
            onChange={(v) => setForm((f) => ({ ...f, stones: v }))}
            minRows={2}
            className="w-full resize-none rounded-xl border border-indigo-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-indigo-100/50"
            disabled={saving}
          />
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Nedenler</span>}
            modalTitle="Nedenler"
            value={form.causes}
            onChange={(v) => setForm((f) => ({ ...f, causes: v }))}
            minRows={4}
            className="w-full resize-none rounded-xl border border-amber-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-amber-100/50"
            disabled={saving}
          />
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Fiziksel</span>}
            modalTitle="Fiziksel"
            value={form.physical}
            onChange={(v) => setForm((f) => ({ ...f, physical: v }))}
            minRows={4}
            className="w-full resize-none rounded-xl border border-emerald-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-emerald-100/50"
            disabled={saving}
          />
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Zihinsel</span>}
            modalTitle="Zihinsel"
            value={form.mental}
            onChange={(v) => setForm((f) => ({ ...f, mental: v }))}
            minRows={4}
            className="w-full resize-none rounded-xl border border-fuchsia-100/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-fuchsia-100/50"
            disabled={saving}
          />
          <LongTextareaField
            label={<span className="mb-2 block text-[12px] font-black text-slate-800">Notlar</span>}
            modalTitle="Notlar"
            value={form.notes}
            onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
            minRows={3}
            className="w-full resize-none rounded-xl border border-slate-200/80 bg-white/90 p-3.5 text-[13px] leading-relaxed ring-1 ring-slate-100/60"
            disabled={saving}
          />
        </div>
      </BiyoenerjiCrudFormModal>

      <BiyoenerjiConfirmModal
        open={deleteConfirmOpen}
        title="Bu çakra kaydını silmek istediğinizden emin misiniz?"
        message="Bu işlem geri alınamaz."
        busy={saving}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void executeDelete()}
      />
    </div>
  );
}
