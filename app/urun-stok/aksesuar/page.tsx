"use client";

import { useTranslations } from "next-intl";
import { useStockServerText } from "../useStockServerText";
import { useStockFormat } from "../useStockFormat";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import { composeOtherValue, splitOtherValue } from "@/lib/urun-stok/selectOther";
import { CameraCaptureButton } from "@/components/media/CameraCaptureButton";
import { dataUrlsByteSize } from "@/lib/urun-stok/photoValidation";
import { SelectWithOther } from "../SelectWithOther";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MATERIALS,
  PRODUCT_GROUPS,
  SIZE_KINDS,
  type AccessoryItem,
  type AccessorySaleLine,
  type AccessorySaleRecord,
  addOrUpdateAccessoryItem,
  appendAccessorySales,
  calcLineAmounts,
  costPerUnitFromTotal,
  countSoldUnits,
  deductAccessoryInventory,
  filesToDataUrls,
  filterAccessoryItems,
  fmtMoney as libFmtMoney,
  fmtQty as libFmtQty,
  fmtUnitCost,
  formatLineCostBreakdown,
  formatSizeLabel,
  formatStockDisplay,
  formatVariantLabel,
  inventoryStockValue,
  loadAccessoryInventory,
  loadAccessorySales,
  salePerUnitFromTotal,
  salePerUnitWithProfit,
  saveAccessoryInventory,
  saveAccessorySales,
  sortAccessoryItems,
  toFloat,
  turkishUpper,
} from "@/lib/urun-stok/accessoryStockLogic";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import { pruneSelection } from "@/lib/ui/selection";
import {
  findSaveTarget,
  newPhotosOnly,
  planStockSave,
  stockFormSignature,
  type StockRetryState,
} from "../stockSaveAttempt";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import {
  deleteAccessoryInventoryItems,
  loadAccessoryInventoryForTenant,
  markAccessoryPendingSync,
  takeAccessoryQuarantineNotice,
  upsertAccessoryInventoryItem,
} from "@/lib/urun-stok/accessoryInventoryDb";
import { quarantineNoticeText } from "@/lib/urun-stok/inventorySyncState";
import { saleLinePrice } from "@/lib/urun-stok/salePricing";
import {
  cancelSale,
  submitCategorySale,
  DUPLICATE_SALE_MESSAGE,
  setSalesVisibility,
  type CancelOutcome,
  type SaleAttempt,
} from "@/lib/urun-stok/salesApi";
import SalesHistorySection from "../SalesHistorySection";
import { loadDbCategorySales, salesLoadIssue, type DbCategorySale } from "@/lib/urun-stok/salesHistoryDb";
import { seedDemoUrunStok } from "@/lib/demo/demoUrunStok";
import { DemoUrunStokBanner } from "@/components/demo/DemoUrunStokBanner";

type TabId = "stock" | "pricing" | "history";

const dbNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Canonical DB kategori satışları → AccessorySaleRecord (snapshot; iptal için saleId). */
function dbToAccessoryRecords(dbSales: DbCategorySale[]): AccessorySaleRecord[] {
  return dbSales.map((s) => {
    const lines: AccessorySaleLine[] = s.items.map((it) => ({
      productId: it.inventory_id,
      productName: it.product_name_snapshot,
      productGroup: it.product_subtitle_snapshot,
      saleQty: dbNum(it.quantity),
      lineCost: dbNum(it.line_cost_total),
      lineSale: dbNum(it.line_sale_total),
    }));
    const total_cost = lines.reduce((a, l) => a + l.lineCost, 0);
    const sale_price = lines.reduce((a, l) => a + l.lineSale, 0);
    const cancelled = s.status === "cancelled";
    return {
      name: (cancelled ? "(İptal edildi) " : "") + (s.note || lines[0]?.productName || "Satış"),
      lines,
      total_cost,
      sale_price,
      profit_pct: dbNum(s.items[0]?.markup_pct),
      photos: [],
      timestamp: s.soldAtDisplay,
      saleId: s.saleId,
      status: s.status,
      hiddenAt: s.hiddenAt,
      otherCategoryItems: Math.max(0, s.itemCount - s.items.length),
    };
  });
}

const pageBg =
  "relative w-full min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_10%_8%,rgba(253,230,138,0.28),transparent_32%),radial-gradient(circle_at_90%_10%,rgba(251,191,36,0.14),transparent_30%),linear-gradient(160deg,#fffbeb_0%,#fff7ed_40%,#f5f3ff_100%)] text-slate-950";

const pageShell = "relative z-10 w-full px-4 py-4 lg:px-8 xl:px-12";

const panelClass =
  "w-full rounded-2xl border-2 border-amber-200/80 bg-white/85 p-4 shadow-[0_8px_30px_rgba(15,23,42,0.07)] backdrop-blur-xl sm:p-5";

const inputClass =
  "h-9 w-full rounded-xl border-2 border-amber-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200/50";

const btnPrimary =
  "inline-flex h-9 items-center justify-center rounded-xl border-2 border-amber-400 bg-gradient-to-r from-amber-100 to-orange-100 px-5 text-sm font-black text-amber-950 shadow-md transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100";

const btnSecondary =
  "inline-flex h-8 items-center justify-center rounded-xl border-2 border-amber-200 bg-amber-50 px-4 text-xs font-black text-slate-800 transition hover:bg-amber-100";

const tabBtn = (active: boolean) =>
  `rounded-xl px-4 py-2 text-sm font-black transition ${
    active
      ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md"
      : "border-2 border-amber-200 bg-white/90 text-slate-700 hover:border-amber-400"
  }`;

function PhotoGalleryModal({ photos, onClose }: { photos: string[]; onClose: () => void }) {
  const tS = useTranslations("stock.common");
  const [idx, setIdx] = useState(0);
  const safe = photos.length ? photos : [];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-md">
      <div className="relative max-h-[90vh] w-full max-w-3xl rounded-[28px] border-2 border-white/90 bg-white p-6 shadow-2xl">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-xl border px-4 py-2 text-sm font-black">
          {tS("close")}
        </button>
        <h3 className="mb-4 text-xl font-black">{tS("photo")}</h3>
        {safe.length ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={safe[idx]} alt="" className="mx-auto max-h-[60vh] rounded-2xl object-contain" />
            <div className="mt-4 flex justify-center gap-3">
              <button type="button" className={btnSecondary} onClick={() => setIdx((i) => (i - 1 + safe.length) % safe.length)}>
                &#9664;
              </button>
              <button type="button" className={btnSecondary} onClick={() => setIdx((i) => (i + 1) % safe.length)}>
                &#9654;
              </button>
            </div>
          </>
        ) : (
          <p className="py-12 text-center text-slate-500">{tS("noPhoto")}</p>
        )}
      </div>
    </div>
  );
}

function SalesDetailModal({ record, onClose }: { record: AccessorySaleRecord; onClose: () => void }) {
  const { fmtMoney, fmtQty } = useStockFormat({ fmtMoney: libFmtMoney, fmtQty: libFmtQty });
  const tS = useTranslations("stock.common");
  const tP = useTranslations("stock.pages.accessory");
  const [gallery, setGallery] = useState<string[] | null>(null);
  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-md">
        <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border-2 bg-white shadow-2xl">
          <div className="border-b p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-black">{record.name}</h3>
              <button type="button" className={btnSecondary} onClick={() => setGallery(record.photos || [])}>
                {tS("photoCount", { count: String(record.photos?.length || 0) })}
              </button>
            </div>
          </div>
          <div className="overflow-auto p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-black text-amber-800">
                  <th className="py-1.5">{tS("colProduct")}</th>
                  <th>{tP("colCount")}</th>
                  <th>{tS("colCost")}</th>
                  <th>{tS("colSale")}</th>
                </tr>
              </thead>
              <tbody>
                {record.lines.map((ln, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-2 font-semibold">{ln.productName}</td>
                    <td>{tP("unitQty", { qty: fmtQty(ln.saleQty, 0) })}</td>
                    <td>{fmtMoney(ln.lineCost)}</td>
                    <td>{fmtMoney(ln.lineSale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-right text-sm font-black">
              {tS("total", { cost: fmtMoney(record.total_cost), sale: fmtMoney(record.sale_price) })}
            </p>
          </div>
          <div className="border-t p-3 text-right">
            <button type="button" className={btnSecondary} onClick={onClose}>
              {tS("close")}
            </button>
          </div>
        </div>
      </div>
      {gallery?.length ? <PhotoGalleryModal photos={gallery} onClose={() => setGallery(null)} /> : null}
    </>
  );
}

export default function AksesuarUrunStokPage() {
  const ss = useStockServerText();
  const { fmtMoney, fmtQty } = useStockFormat({ fmtMoney: libFmtMoney, fmtQty: libFmtQty });
  const tS = useTranslations("stock.common");
  const tP = useTranslations("stock.pages.accessory");
  const deleteConfirm = useDeleteConfirm();
  const committingRef = useRef(false);
  const saveLock = useSubmitLock();
  const retryRef = useRef<StockRetryState | null>(null);
  // STK-03: aynı sepetin tekrar denemesi aynı idempotency anahtarını kullanır.
  const saleAttemptRef = useRef<SaleAttempt | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [tab, setTab] = useState<TabId>("stock");
  const [inventory, setInventory] = useState<AccessoryItem[]>([]);
  const [sales, setSales] = useState<AccessorySaleRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [isDemo, setIsDemo] = useState(false);
  // K-2: Supabase sync için tenantId state'de tutulur
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);

  const [msg, setMsg] = useState<string | null>(null);
  const reloadInv = useCallback(async () => {
    const demo = readYasamUser()?.is_demo_account === true;
    if (demo) {
      // Demo modda: yalnızca localStorage; Supabase'e dokunma
      setInventory(loadAccessoryInventory());
      return;
    }
    const tenantId = await getSyncedTenantId();
    setActiveTenantId(tenantId);
    const { items } = await loadAccessoryInventoryForTenant(tenantId);
    setInventory(items);
    // BUG-021: eski önbellekten otomatik geri oluşturulmayan kalemler kullanıcıya bildirilir.
    const quarantined = takeAccessoryQuarantineNotice(tenantId);
    if (quarantined.length) setMsg(quarantineNoticeText(quarantined));
  }, []);
  // Satış Öncesi Hata #3: geçmiş eksik yüklendiyse SalesHistorySection toplamları göstermez.
  const [historyLoadIssue, setHistoryLoadIssue] = useState<string | null>(null);
  // USM: kategori "Satış Geçmişi" canonical DB'den (merkezî ile aynı veri). Demo localStorage.
  const reloadSales = useCallback(async () => {
    const demo = readYasamUser()?.is_demo_account === true;
    if (demo) { setSales(loadAccessorySales()); setHistoryLoadIssue(null); return; }
    const res = await loadDbCategorySales("accessory");
    setSales(dbToAccessoryRecords(res.sales));
    {
      // QA K3D-01: TR'de lib metni birebir; diğer dillerde katalog karşılığı.
      const issue = salesLoadIssue(res);
      setHistoryLoadIssue(issue && !ss.isSourceLocale ? tS("msg.loadIssue") : issue);
    }
  }, [ss, tS]);

  useEffect(() => {
    const demo = readYasamUser()?.is_demo_account === true;
    if (demo) seedDemoUrunStok();
    setIsDemo(demo);
    void reloadInv();
    void reloadSales();
    setHydrated(true);
  }, [reloadInv, reloadSales]);

  const [deleteBusy, setDeleteBusy] = useState(false);
  const [photoModal, setPhotoModal] = useState<string[] | null>(null);
  const [saleDetail, setSaleDetail] = useState<AccessorySaleRecord | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [productGroup, setProductGroup] = useState<string>(PRODUCT_GROUPS[0]);
  const [productGroupCustom, setProductGroupCustom] = useState("");
  const [productModel, setProductModel] = useState("");
  const [material, setMaterial] = useState<string>(MATERIALS[0]);
  const [materialCustom, setMaterialCustom] = useState("");
  const [color, setColor] = useState("");
  const [sizeKind, setSizeKind] = useState<string>(SIZE_KINDS[1]);
  const [sizeDetail, setSizeDetail] = useState("");
  const [stockQty, setStockQty] = useState("");
  const [costTotal, setCostTotal] = useState("");
  const [salePriceTotal, setSalePriceTotal] = useState("");
  const [profitPct, setProfitPct] = useState("100");
  const [barcode, setBarcode] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [addDelta, setAddDelta] = useState(true);

  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState("Urun (A->Z)");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const displayed = useMemo(
    () => sortAccessoryItems(filterAccessoryItems(inventory, search), sortMode),
    [inventory, search, sortMode],
  );

  // Arama/sıralama değişince seçim görünür kayıtlarla kesişime budanır
  // (değişiklik yoksa aynı Set döner → render döngüsü yok).
  useEffect(() => {
    const visibleIds = displayed.map((i) => i.id);
    runInEffect(() => setSelectedIds((prev) => pruneSelection(prev, visibleIds)));
  }, [displayed]);

  const stockValue = useMemo(() => inventoryStockValue(inventory), [inventory]);

  const stockUnitPreview = useMemo(() => {
    const qty = toFloat(stockQty, 0);
    if (qty <= 0) return null;
    const costPer = costPerUnitFromTotal(toFloat(costTotal, 0), qty);
    const salePer = salePerUnitFromTotal(toFloat(salePriceTotal, 0), qty);
    const pct = toFloat(profitPct, 0);
    const suggestedSalePer =
      costPer && pct > 0 ? salePerUnitWithProfit(costPer, pct) : salePer ?? null;
    return { costPer, salePer, suggestedSalePer };
  }, [stockQty, costTotal, salePriceTotal, profitPct]);

  function resetForm() {
    retryRef.current = null;
    setEditId(null);
    setName("");
    setProductModel("");
    setColor("");
    setSizeDetail("");
    setStockQty("");
    setCostTotal("");
    setSalePriceTotal("");
    setProfitPct("100");
    setBarcode("");
    setNote("");
    setProductGroupCustom("");
    setMaterialCustom("");
    setPhotos([]);
    setAddDelta(true);
  }

  function loadToForm(it: AccessoryItem) {
    retryRef.current = null;
    setEditId(it.id);
    setName(it.name);
    // Liste dışı (serbest metin) değer → "Diğer" + metin (düzenlemede kaybolmaz).
    const pg = splitOtherValue(it.productGroup, PRODUCT_GROUPS);
    setProductGroup(pg.select);
    setProductGroupCustom(pg.custom);
    setProductModel(it.productModel);
    const mt = splitOtherValue(it.material, MATERIALS);
    setMaterial(mt.select);
    setMaterialCustom(mt.custom);
    setColor(it.color);
    setSizeKind(it.sizeKind || SIZE_KINDS[4]);
    setSizeDetail(it.sizeDetail);
    setStockQty(String(it.stockQty));
    setCostTotal(String(it.costPerUnit * it.stockQty));
    setSalePriceTotal(String(it.salePerUnit * it.stockQty));
    setProfitPct(String(it.profitPct));
    setBarcode(it.barcode);
    setNote(it.note);
    setPhotos([]);
    setAddDelta(false);
  }

  function handleSaveStock() {
    // Çift gönderim kilidi (senkron, ilk ifade): ikinci tık yok sayılır.
    return saveLock
      .run(() => saveStockNow())
      .catch((e: unknown) => setMsg(ss.exception(e, tS("msg.saveIncomplete"))));
  }

  async function saveStockNow() {
    setMsg(null);
    const beforeIds = new Set(inventory.map((i) => i.id));
    const editingId = editId;
    // "Diğer" + serbest metin → saklanacak etiket (ölçü türü sizeKind serbest girişe AÇILMAZ).
    const productGroupValue = composeOtherValue(productGroup, productGroupCustom, PRODUCT_GROUPS);
    const materialValue = composeOtherValue(material, materialCustom, MATERIALS);
    const signature = stockFormSignature([
      editingId, name, productGroupValue, productModel, materialValue, color, sizeKind, sizeDetail,
      stockQty, costTotal, salePriceTotal, profitPct, barcode, note, photos.length, addDelta,
    ]);
    // Aynı form tekrar gönderildiyse (önceki bulut yazımı başarısız) yerel birleştirme
    // TEKRARLANMAZ; yeni kayıt denemesi aynı id (= client_id) ile sürer → çift kayıt yok.
    const plan = planStockSave(retryRef.current, signature, editingId, beforeIds);
    let items = inventory;
    let target: AccessoryItem | undefined;
    // STK-01: güncellemede stok yalnız formun dayandığı DB stoğu (baseStock) hâlâ geçerliyse yazılır.
    let baseStock: number | null = null;
    let isNew = !editingId;
    if (plan.kind === "retry-cloud") {
      target = inventory.find((it) => it.id === plan.targetId);
      baseStock = retryRef.current?.baseStock ?? null;
      isNew = retryRef.current?.isNew ?? false;
    } else {
      const existing = plan.id ? inventory.find((it) => it.id === plan.id) : undefined;
      if (editingId && existing) baseStock = existing.stockQty;
      const result = addOrUpdateAccessoryItem(inventory, {
        id: plan.id,
        name: turkishUpper(name),
        productGroup: productGroupValue,
        productModel,
        material: materialValue,
        color,
        sizeKind,
        sizeDetail,
        stockQty: toFloat(stockQty, 0),
        costTotal: toFloat(costTotal, 0),
        salePriceTotal: toFloat(salePriceTotal, 0),
        profitPct: toFloat(profitPct, 0),
        barcode,
        photos: plan.forceAbsolute ? newPhotosOnly(photos, existing?.photos) : photos,
        note,
        deltaMode: plan.forceAbsolute ? false : addDelta,
      });
      if (!result.ok) {
        setMsg(ss.text(result.error, tS("msg.invalidInput")));
        return;
      }
      items = result.items;
      target = findSaveTarget(items, beforeIds, plan.id);
      // BUG-021: yeni kayıt önbelleğe yazılmadan önce "bekleyen" işaretlenir → bulut yazımı
      // başarısız olsa bile sonraki yüklemede kaybolmaz; silinmiş kayıtlarla karışmaz.
      if (isNew && target && !isDemo && activeTenantId) markAccessoryPendingSync(activeTenantId, target.id);
      // localStorage: anında geri bildirim + çevrimdışı yedek (DB önbelleği)
      const saved = saveAccessoryInventory(items);
      setInventory(items);
      if (!saved) {
        setMsg(
          tS("msg.storageFull"),
        );
        return;
      }
    }

    // K-2: Demo değilse kaydı kalıcı olarak Supabase'e yaz. Böylece sayfa
    // yenilenince kaybolmaz ve cihazlar arası senkron olur.
    if (!isDemo && activeTenantId) {
      if (target) {
        const res = await upsertAccessoryInventoryItem(
          activeTenantId,
          target,
          isNew
            ? { mode: "create" }
            : { mode: "update", stock: baseStock != null ? { expected: baseStock } : undefined },
        );
        if (!res.ok && (res.conflict || res.notFound)) {
          // STK-01: stok arada değişti (ya da kayıt sunucuda yok) → hiçbir alan yazılmadı;
          // güncel DB durumu yüklenir, kullanıcı formu kontrol edip yeniden kaydeder.
          retryRef.current = null;
          await reloadInv();
          setMsg(
            res.conflict
              ? tS("msg.conflict")
              : tS("msg.updateFailed", { error: ss.detail(res.error) }),
          );
          return;
        }
        if (!res.ok) {
          retryRef.current = { signature, targetId: target.id, isNew, baseStock };
          setMsg(
            tS("msg.cloudAddFailed", { error: ss.detail(res.error) }),
          );
          return; // Alanları temizleme — kullanıcı tekrar deneyebilsin.
        }
        retryRef.current = null;
        // DB'den taze çek: kanonik durum; önbelleğin DB'yi ezme riski kalmaz.
        await reloadInv();
        resetForm();
        setMsg(
          res.created
            ? tS("msg.cloudAdded")
            : tS("msg.cloudUpdated"),
        );
        return;
      }
    }

    resetForm();
    setMsg(editingId ? tS("msg.updated") : tS("msg.added"));
  }

  const deleteBusyRef = useRef(false);
  async function deleteSelected() {
    if (deleteBusyRef.current) return; // çift tıklama → tek silme akışı
    // Yalnız görünür ∩ seçili: aramayla gizlenmiş seçili kayıt habersiz silinmez.
    const removed = displayed.filter((i) => selectedIds.has(i.id));
    if (!removed.length) {
      setMsg(tS("msg.pickToDelete"));
      return;
    }
    deleteBusyRef.current = true;
    setDeleteBusy(true);
    try {
      const removedIds = new Set(removed.map((i) => i.id));
      const ok = await deleteConfirm({
        title: tS("msg.deleteTitle"),
        message: tS("msg.deleteMessage", { count: String(removed.length) }),
        names: removed.map((i) => i.name || tS("msg.unnamed")),
        count: removed.length,
        noun: tS("msg.noun"),
      });
      if (!ok) return;
      const count = removed.length;
      // Gerçek hesap: ÖNCE buluttan sil, sonra DB'den yeniden yükle. Silme başarısızsa kayıtlar
      // ekrandan kaybolmuş gibi gösterilmez (liste DB gerçeğini yansıtır).
      if (!isDemo && activeTenantId) {
        const res = await deleteAccessoryInventoryItems(activeTenantId, removed);
        await reloadInv();
        if (!res.ok) {
          setMsg(tS("msg.deletePartial", { deleted: String(res.deleted), count: String(count), error: ss.detail(res.error) }));
          return;
        }
        setSelectedIds(new Set());
        setMsg(tS("msg.recordsDeleted", { count }));
        return;
      }
      const next = inventory.filter((i) => !removedIds.has(i.id));
      saveAccessoryInventory(next);
      setInventory(next);
      setSelectedIds(new Set());
      setMsg(tS("msg.recordsDeleted", { count }));
    } finally {
      deleteBusyRef.current = false;
      setDeleteBusy(false);
    }
  }

  const [pickId, setPickId] = useState("");
  const [saleQty, setSaleQty] = useState("1");
  const [saleLabel, setSaleLabel] = useState("");
  const [salePhotos, setSalePhotos] = useState<string[]>([]);
  const [basket, setBasket] = useState<AccessorySaleRecord[]>([]);
  const [checkoutProfitPct, setCheckoutProfitPct] = useState("");

  const picked = useMemo(() => inventory.find((i) => i.id === pickId), [inventory, pickId]);

  useEffect(() => {
    if (!picked) return;
    if (!saleLabel) setSaleLabel(formatVariantLabel(picked));
  }, [picked, saleLabel]);

  const previewLine = useMemo(() => {
    if (!picked) return null;
    return calcLineAmounts(picked, toFloat(saleQty, 0));
  }, [picked, saleQty]);

  // STK-02: ön izleme, sepet ve kayıt AYNI kuralı kullanır (boş ek kâr % → ürünün kâr %; o da 0 ise
  // ürünün satış fiyatı; o da yoksa maliyet). Markup yalnız > 0 ise sunucuya gönderilir.
  function linePrice(item: AccessoryItem, qty: number) {
    return saleLinePrice({
      unitCost: item.costPerUnit,
      defaultUnitSale: item.salePerUnit,
      quantity: qty,
      markupPct: toFloat(checkoutProfitPct, item.profitPct),
    });
  }

  function addToBasket() {
    if (!picked) {
      setMsg(tS("msg.pickProduct"));
      return;
    }
    const calc = calcLineAmounts(picked, toFloat(saleQty, 0));
    if ("error" in calc) {
      setMsg(ss.text(calc.error, tS("msg.invalidInput")));
      return;
    }
    const pct = toFloat(checkoutProfitPct, picked.profitPct);
    // STK-02: sunucu fiyat kuralının aynası — ekrandaki tutar = kaydedilen tutar.
    const price = linePrice(picked, calc.saleQty);
    const lineSale = price.lineSale;
    const line: AccessorySaleLine = {
      productId: picked.id,
      productName: formatVariantLabel(picked),
      productGroup: picked.productGroup,
      saleQty: calc.saleQty,
      lineCost: price.lineCost,
      lineSale,
    };
    const rec: AccessorySaleRecord = {
      name: turkishUpper(saleLabel.trim() || picked.name),
      lines: [line],
      total_cost: line.lineCost,
      sale_price: line.lineSale,
      profit_pct: pct,
      photos: [...salePhotos],
      timestamp: new Date().toISOString().slice(0, 19).replace("T", " "),
    };
    setBasket((b) => [...b, rec]);
    setSaleQty("1");
    setSalePhotos([]);
    setMsg(ss.addedToBasket());
  }

  // USM-001/003/004/005: satış artık CANONICAL server RPC üzerinden atomik. Fire-and-forget
  // localStorage senkronu KALDIRILDI; server başarısı olmadan UI başarı göstermez.
  async function commitSale() {
    if (committingRef.current) return;
    if (!basket.length) {
      setMsg(tS("msg.basketEmpty"));
      return;
    }
    committingRef.current = true;
    setIsCommitting(true);
    try {
      if (isDemo) {
        // Demo: server no-op — yalnız localStorage önizleme (showcase).
        const deductLines = basket.flatMap((r) =>
          r.lines.map((l) => ({ productId: l.productId, saleQty: l.saleQty })),
        );
        const updated = deductAccessoryInventory(inventory, deductLines);
        saveAccessoryInventory(updated);
        setInventory(updated);
        appendAccessorySales(basket);
        void reloadSales();
        setBasket([]);
        setMsg(tS("msg.demoPreview"));
        return;
      }

      const lines = basket.flatMap((r) =>
        r.lines.map((l) => ({
          clientId: l.productId,
          quantity: l.saleQty,
          markupPct: r.profit_pct > 0 ? r.profit_pct : undefined,
        })),
      );
      // Satış Öncesi #4: deneme anahtarı yenileme/yeniden açmada korunur (sessionStorage); aynı sepet = aynı satış.
      const { res, attempt } = await submitCategorySale({ category: "accessory", lines, current: saleAttemptRef.current });
      saleAttemptRef.current = attempt;
      if (!res.ok) {
        setMsg(ss.text(res.error, tS("msg.saleFailed")));
        await reloadInv(); // gerçek stok yenilensin (yetersiz stok vb.)
        return;
      }
      setBasket([]);
      await reloadInv(); // stok DB'den (canonical) yeniden yüklenir
      await reloadSales(); // geçmiş DB'den (yeni satış görünür)
      setMsg(res.duplicate ? ss.constant(DUPLICATE_SALE_MESSAGE, tS("msg.duplicateSale")) : tS("msg.saleSaved"));
    } catch {
      setMsg(tS("msg.networkError"));
      await reloadInv();
    } finally {
      committingRef.current = false;
      setIsCommitting(false);
    }
  }

  // USM: iptal artık CANONICAL server RPC (inventory_sale_cancel_atomic) ile.
  // Owner kararı (21.10.2026): SATIŞI İPTAL ET = stok iadesi (atomik iptal RPC'si);
  // LİSTEDEN SİL = yalnız görünürlük (stok / satış durumu / finans DEĞİŞMEZ).
  // Seçim, onaylar ve uygunluk SalesHistorySection'da (satış kimliğiyle) yapılır.
  async function cancelSalesRecords(toCancel: AccessorySaleRecord[]) {
    if (isDemo) {
      const inv = [...inventory];
      const missing: string[] = [];
      for (const rec of toCancel) {
        for (const line of rec.lines) {
          const qty = line.saleQty || 0;
          if (qty <= 0) continue;
          const idx = inv.findIndex((it) => it.id === line.productId);
          if (idx < 0) { missing.push(line.productName); continue; }
          inv[idx] = { ...inv[idx], stockQty: (inv[idx].stockQty || 0) + qty };
        }
      }
      saveAccessoryInventory(inv);
      setInventory(inv);
      const next = sales.filter((r) => !toCancel.includes(r));
      saveAccessorySales(next);
      setSales(next);
      setMsg(missing.length > 0
        ? tS("msg.cancelledMissing", { list: [...new Set(missing)].join(", ") })
        : tS("msg.cancelledDemo"));
      return;
    }

    // STK-06: her iptalin gerçek sonucu (iade edilemeyen kalem dahil) toplanır.
    const outcomes: CancelOutcome[] = [];
    for (const rec of toCancel) {
      if (!rec.saleId) { outcomes.push({ ok: false }); continue; }
      outcomes.push(await cancelSale(rec.saleId));
    }
    await reloadSales();
    await reloadInv();
    setMsg(ss.cancelOutcome(outcomes));
  }

  async function setRecordsVisibility(recs: AccessorySaleRecord[], hide: boolean) {
    if (isDemo) {
      // Demo: kalıcı kayıt yok — yalnız yerel önizlemeden kaldırılır; stok DEĞİŞMEZ.
      if (!hide) return;
      const next = sales.filter((r) => !recs.includes(r));
      saveAccessorySales(next);
      setSales(next);
      setMsg(tS("msg.hiddenDemo", { count: String(recs.length) }));
      return;
    }
    const ids = recs.map((r) => r.saleId).filter((x): x is string => Boolean(x));
    const res = await setSalesVisibility(ids, hide ? "hide" : "unhide");
    await reloadSales();
    setMsg(ss.visibilityOutcome(hide ? "hide" : "unhide", res, recs.length - ids.length));
  }


  if (!hydrated) {
    return (
      <main className={pageBg}>
        <div className="flex min-h-screen items-center justify-center font-semibold text-slate-600">
          {tS("loading")}
        </div>
      </main>
    );
  }

  return (
    <main className={pageBg}>
      <BfcacheRefreshHandler />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-amber-200/40 blur-3xl" />
        <div className="absolute right-0 top-16 h-96 w-96 rounded-full bg-orange-200/30 blur-3xl" />
      </div>

      <div className={pageShell}>
        {isDemo && <DemoUrunStokBanner />}
        <header className={`${panelClass} mb-3`}>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-700">{tP("eyebrow")}</p>
          <h1 className="mt-1 text-2xl font-black xl:text-3xl">{tP("title")}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {tP("subtitle")}
          </p>
        </header>

        <div className="mb-3 flex flex-wrap gap-2">
          {(["stock", "pricing", "history"] as TabId[]).map((t) => (
            <button key={t} type="button" className={tabBtn(tab === t)} onClick={() => setTab(t)}>
              {t === "stock" ? tS("tabs.stock") : t === "pricing" ? tS("tabs.pricing") : tS("tabs.history")}
            </button>
          ))}
        </div>

        {msg ? (
          <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            {msg}
          </p>
        ) : null}

        {tab === "stock" && (
          <div className="w-full space-y-4">
            <section className={panelClass}>
              <h2 className="mb-1 text-base font-black">{editId ? tS("form.editRecord") : tS("form.newRecord")}</h2>
              <p className="mb-3 text-xs font-semibold text-slate-600">
                {tP("variantHint")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-black">{tS("productName")}</span>
                  <input className={inputClass} value={name} onChange={(e) => setName(turkishUpper(e.target.value))} />
                </label>
                <SelectWithOther
                  label={tS("form.productGroup")}
                  options={PRODUCT_GROUPS}
                  value={productGroup}
                  custom={productGroupCustom}
                  onSelect={setProductGroup}
                  onCustom={setProductGroupCustom}
                  selectClassName={inputClass}
                  labelClassName="mb-1 block text-xs font-black"
                  placeholder={tP("groupPh")}
                />
                <label className="block">
                  <span className="mb-1 block text-xs font-black">{tP("model")}</span>
                  <input className={inputClass} value={productModel} onChange={(e) => setProductModel(e.target.value)} />
                </label>
                <SelectWithOther
                  label={tP("material")}
                  options={MATERIALS}
                  value={material}
                  custom={materialCustom}
                  onSelect={setMaterial}
                  onCustom={setMaterialCustom}
                  otherLabel="diğer"
                  selectClassName={inputClass}
                  labelClassName="mb-1 block text-xs font-black"
                  placeholder={tP("materialPh")}
                />
                <label className="block">
                  <span className="mb-1 block text-xs font-black">{tP("colour")}</span>
                  <input className={inputClass} value={color} onChange={(e) => setColor(e.target.value)} placeholder={tP("colourPh")} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">{tP("sizeType")}</span>
                  <select className={inputClass} value={sizeKind} onChange={(e) => setSizeKind(e.target.value)}>
                    {SIZE_KINDS.map((s) => (
                      <option key={s} value={s}>{ss.option(s)}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">{tP("sizeValue")}</span>
                  <input
                    className={inputClass}
                    value={sizeDetail}
                    onChange={(e) => setSizeDetail(e.target.value)}
                    placeholder={tP("sizePh")}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">{tP("stockCount")}</span>
                  <input className={inputClass} type="number" step="1" min="0" value={stockQty} onChange={(e) => setStockQty(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">{tS("form.purchaseCostTl")}</span>
                  <input className={inputClass} type="number" step="0.01" value={costTotal} onChange={(e) => setCostTotal(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">{tS("form.salePriceTl")}</span>
                  <input className={inputClass} type="number" step="0.01" value={salePriceTotal} onChange={(e) => setSalePriceTotal(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">{tS("form.profitPct")}</span>
                  <input className={inputClass} type="number" value={profitPct} onChange={(e) => setProfitPct(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">{tS("form.barcode")}</span>
                  <input className={inputClass} value={barcode} onChange={(e) => setBarcode(e.target.value)} />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-black">{tS("note")}</span>
                  <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
              </div>
              {stockUnitPreview ? (
                <div className="mt-3 rounded-xl border-2 border-amber-200/90 bg-gradient-to-r from-amber-50/90 to-orange-50/80 p-3">
                  <p className="text-xs font-black uppercase tracking-wide text-amber-800">{tS("form.unitSummary")}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {stockUnitPreview.costPer != null ? (
                      <div className="rounded-lg border border-amber-200 bg-white/90 px-3 py-2">
                        <p className="text-xs font-black text-amber-700">{tS("form.unitCost")}</p>
                        <p className="mt-0.5 text-base font-black">{fmtUnitCost(stockUnitPreview.costPer)}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">{tP("unitHint")}</p>
                    )}
                    {stockUnitPreview.salePer != null ? (
                      <div className="rounded-lg border border-orange-200 bg-white/90 px-3 py-2">
                        <p className="text-xs font-black text-orange-700">{tS("form.unitSale")}</p>
                        <p className="mt-0.5 text-base font-black">{fmtUnitCost(stockUnitPreview.salePer)}</p>
                      </div>
                    ) : stockUnitPreview.suggestedSalePer != null ? (
                      <div className="rounded-lg border border-violet-200 bg-white/90 px-3 py-2">
                        <p className="text-xs font-black text-violet-700">{tS("form.profitUnitSale", { pct: String(profitPct) })}</p>
                        <p className="mt-0.5 text-base font-black">{fmtUnitCost(stockUnitPreview.suggestedSalePer)}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm font-bold">
                  <input type="checkbox" checked={addDelta} onChange={(e) => setAddDelta(e.target.checked)} className="h-4 w-4" />
                  {tS("form.adjustStockPlain")}
                </label>
                <label className="cursor-pointer">
                  <span className={btnSecondary}>{tS("photoBtn", { count: String(photos.length) })}</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files;
                      if (f?.length) {
                        const { urls, error } = await filesToDataUrls(f);
                        if (error) setMsg(ss.photo(error));
                        else setPhotos(urls);
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
                <CameraCaptureButton
                  className={btnSecondary}
                  onFiles={async (files) => {
                    // Kamera: çekilen fotoğraf mevcut seçime EKLENİR (adet + toplam boyut sınırı korunur).
                    const { urls, error } = await filesToDataUrls(files, {
                      existingCount: photos.length,
                      existingBytes: dataUrlsByteSize(photos),
                    });
                    if (error) setMsg(ss.photo(error));
                    else setPhotos((prev) => [...prev, ...urls]);
                  }}
                >
                  {tS("capture")}
                </CameraCaptureButton>
                <button type="button" className={btnPrimary} onClick={() => void handleSaveStock()} disabled={saveLock.pending} aria-busy={saveLock.pending}>
                  {saveLock.pending ? tS("saving") : editId ? tS("update") : tS("add")}
                </button>
                {editId ? (
                  <button type="button" className={btnSecondary} onClick={resetForm}>
                    {tS("cancel")}
                  </button>
                ) : null}
                <p className="ml-auto text-sm font-black text-amber-900">{tS("form.stockValue", { value: fmtMoney(stockValue) })}</p>
              </div>
            </section>

            <section className={panelClass}>
              <div className="mb-3 grid gap-3 md:grid-cols-2">
                <input className={inputClass} placeholder={tS("searchDots")} value={search} onChange={(e) => setSearch(e.target.value)} />
                <select className={inputClass} value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
                  <option value="Urun (A->Z)">{tS("sort.productAsc")}</option>
                  <option value="Ürün (Z→A)">{tS("sort.productDesc")}</option>
                  <option value="Stok (Az→Çok)">{tS("sort.stockAsc")}</option>
                  <option value="Stok (Çok→Az)">{tS("sort.stockDesc")}</option>
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1400px] text-sm">
                  <thead>
                    <tr className="text-xs font-black uppercase text-amber-800">
                      <th className="p-1.5">{tS("colSelect")}</th>
                      <th>{tS("colNo")}</th>
                      <th>{tS("colVariant")}</th>
                      <th>{tS("colGroup")}</th>
                      <th>{tP("colModel")}</th>
                      <th>{tP("colMaterial")}</th>
                      <th>{tP("colour")}</th>
                      <th>{tP("colSize")}</th>
                      <th>{tS("colStock")}</th>
                      <th>{tS("colUnitCost")}</th>
                      <th>{tS("colUnitSale")}</th>
                      <th>{tS("colBarcode")}</th>
                      <th>{tS("colPhoto")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {displayed.map((it, idx) => (
                      <tr key={it.id} className="border-t bg-white/80">
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={selectedIds.has(it.id)}
                            onChange={(e) => {
                              setSelectedIds((prev) => {
                                const n = new Set(prev);
                                if (e.target.checked) n.add(it.id);
                                else n.delete(it.id);
                                return n;
                              });
                            }}
                          />
                        </td>
                        <td className="p-2 text-center font-bold">{idx + 1}</td>
                        <td className="p-2 font-black">{formatVariantLabel(it)}</td>
                        <td className="p-2">{it.productGroup}</td>
                        <td className="p-2">{it.productModel || "—"}</td>
                        <td className="p-2">{it.material}</td>
                        <td className="p-2">{it.color || "—"}</td>
                        <td className="p-2">{formatSizeLabel(it)}</td>
                        <td className="p-2 font-semibold">{formatStockDisplay(it)}</td>
                        <td className="p-2 font-semibold">{fmtUnitCost(it.costPerUnit)}</td>
                        <td className="p-2 font-semibold">{fmtUnitCost(it.salePerUnit)}</td>
                        <td className="p-2">{it.barcode || "—"}</td>
                        <td className="p-2">
                          <button type="button" className="font-black text-amber-700 underline" onClick={() => setPhotoModal(it.photos)}>
                            {it.photos.length}
                          </button>
                        </td>
                        <td className="p-2">
                          <button type="button" className="text-xs font-black text-violet-700" onClick={() => loadToForm(it)}>
                            {tS("edit")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" className={`${btnSecondary} mt-3`} disabled={deleteBusy} onClick={() => void deleteSelected()}>
                {deleteBusy ? tS("deleting") : tS("deleteSelected")}
              </button>
            </section>
          </div>
        )}

        {tab === "pricing" && (
          <div className="grid w-full gap-4 xl:grid-cols-[1.55fr_1fr]">
            <section className={`${panelClass} space-y-4`}>
              <div className="grid gap-3 lg:grid-cols-2">
                <select className={inputClass} value={pickId} onChange={(e) => setPickId(e.target.value)}>
                  <option value="">{tS("pickProduct")}</option>
                  {inventory.map((it) => (
                    <option key={it.id} value={it.id}>
                      {formatVariantLabel(it)} — {formatStockDisplay(it)}
                    </option>
                  ))}
                </select>
                <input
                  className={inputClass}
                  placeholder={tP("saleLabelPh")}
                  value={saleLabel}
                  onChange={(e) => setSaleLabel(turkishUpper(e.target.value))}
                />
              </div>
              {picked ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
                  <p className="text-xs font-black text-amber-800">{tP("savedUnitPrice")}</p>
                  <p className="mt-0.5 text-base font-black">
                    {fmtUnitCost(picked.costPerUnit)}
                    <span className="mx-2 text-slate-400">&middot;</span>
                    {tS("sale.salePrice", { value: fmtUnitCost(picked.salePerUnit) })}
                  </p>
                </div>
              ) : null}
              {picked ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-black">{tP("qtyToSell")}</span>
                    <input className={inputClass} type="number" step="1" min="1" value={saleQty} onChange={(e) => setSaleQty(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-black">{tS("sale.extraProfit")}</span>
                    <input className={inputClass} value={checkoutProfitPct} onChange={(e) => setCheckoutProfitPct(e.target.value)} placeholder={String(picked.profitPct)} />
                  </label>
                </div>
              ) : null}
              {previewLine && !("error" in previewLine) && picked ? (
                <div className="space-y-2">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center text-sm font-black">
                      {tS("costLabel", { value: fmtMoney(previewLine.lineCost) })}
                    </div>
                    <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-center text-sm font-black">
                      {tS("saleLabel")}
                      {fmtMoney(
                        linePrice(picked, previewLine.saleQty).lineSale,
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-xs font-semibold">
                      {tP("deduct", { qty: fmtQty(previewLine.saleQty, 0) })}
                    </div>
                  </div>
                  <p className="rounded-lg border border-amber-100 bg-white/90 px-3 py-2 text-center text-xs font-bold text-slate-800">
                    {formatLineCostBreakdown(previewLine.costPerUnit, previewLine.saleQty, previewLine.lineCost)}
                  </p>
                </div>
              ) : previewLine && "error" in previewLine ? (
                <p className="text-sm font-semibold text-red-700">{previewLine.error}</p>
              ) : null}
              <label className="inline-block cursor-pointer">
                <span className={btnSecondary}>{tS("productPhotoBtn", { count: String(salePhotos.length) })}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files;
                    if (f?.length) {
                      const { urls, error } = await filesToDataUrls(f);
                      if (error) setMsg(ss.photo(error));
                      else setSalePhotos(urls);
                    }
                    e.target.value = "";
                  }}
                />
              </label>
              <button type="button" className={`${btnPrimary} w-full`} onClick={addToBasket}>
                {tS("addToBasket")}
              </button>
            </section>
            <section className={panelClass}>
              <h2 className="mb-3 text-base font-black">{tS("basket")}</h2>
              <div className="space-y-2">
                {basket.map((rec, i) => (
                  <div key={i} className="rounded-xl border bg-amber-50/50 p-3">
                    <p className="text-sm font-black">{rec.name}</p>
                    <p className="text-xs">
                      {fmtMoney(rec.total_cost)} &rarr; {fmtMoney(rec.sale_price)}
                    </p>
                    <button type="button" className="mt-1 text-xs font-black text-red-600" onClick={() => setBasket((b) => b.filter((_, j) => j !== i))}>
                      {tS("delete")}
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm font-black">{tS("sale.basketTotal", { value: fmtMoney(basket.reduce((s, r) => s + r.sale_price, 0)) })}</p>
              <div className="mt-4 flex flex-col gap-2">
                <button type="button" className={btnSecondary} onClick={() => setBasket([])}>
                  {tS("clearBasket")}
                </button>
                <button type="button" className={btnPrimary} onClick={() => void commitSale()} disabled={isCommitting}>
                  {isCommitting ? tS("savingDots") : tS("commitSale")}
                </button>
              </div>
            </section>
          </div>
        )}

        {tab === "history" && (
          <section className={panelClass}>
            <SalesHistorySection
              records={sales}
              loadIssue={historyLoadIssue}
              isDemo={isDemo}
              headClassName="text-amber-800"
              extraSummary={(done) => <span>{tP("soldSummary", { count: String(countSoldUnits(done)) })}</span>}
              onCancel={cancelSalesRecords}
              onHide={(recs) => setRecordsVisibility(recs, true)}
              onUnhide={(recs) => setRecordsVisibility(recs, false)}
              onDetail={setSaleDetail}
              onNotice={setMsg}
            />
          </section>
        )}
      </div>

      {photoModal ? <PhotoGalleryModal photos={photoModal} onClose={() => setPhotoModal(null)} /> : null}
      {saleDetail ? <SalesDetailModal record={saleDetail} onClose={() => setSaleDetail(null)} /> : null}
    </main>
  );
}
