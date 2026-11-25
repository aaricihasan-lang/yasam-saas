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
  MEASURE_TYPES,
  PRODUCT_GROUPS,
  PACKAGING_TYPES,
  type ScInputUnit,
  type SoapCreamItem,
  type ScMeasureType,
  type SoapCreamSaleLine,
  type SoapCreamSaleRecord,
  addOrUpdateSoapCreamItem,
  appendSoapCreamSales,
  calcLineAmounts,
  costPerBaseFromTotal,
  deductSoapCreamInventory,
  formatCanonicalStockHint,
  formatLineCostBreakdown,
  fmtUnitCost,
  salePerBaseFromTotal,
  salePerBaseWithProfit,
  filesToDataUrls,
  filterSoapCreamItems,
  fmtMoney as libFmtMoney,
  fmtQty as libFmtQty,
  formatStockDisplay,
  fromCanonical,
  inventoryStockValue,
  loadSoapCreamInventory,
  loadSoapCreamSales,
  measureTypeToBase,
  saveSoapCreamInventory,
  saveSoapCreamSales,
  sortSoapCreamItems,
  toCanonical,
  toFloat,
  turkishUpper,
} from "@/lib/urun-stok/soapCreamStockLogic";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import {
  findSaveTarget,
  newPhotosOnly,
  planStockSave,
  stockFormSignature,
  type StockRetryState,
} from "../stockSaveAttempt";
import { pruneSelection } from "@/lib/ui/selection";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import {
  deleteSoapCreamInventoryItems,
  loadSoapCreamInventoryForTenant,
  markSoapCreamPendingSync,
  takeSoapCreamQuarantineNotice,
  upsertSoapCreamInventoryItem,
} from "@/lib/urun-stok/soapCreamInventoryDb";
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

/** Canonical DB kategori satışları → SoapCreamSaleRecord (snapshot; iptal için saleId). */
function dbToSoapRecords(dbSales: DbCategorySale[]): SoapCreamSaleRecord[] {
  return dbSales.map((s) => {
    const lines: SoapCreamSaleLine[] = s.items.map((it) => ({
      productId: it.inventory_id,
      productName: it.product_name_snapshot,
      productGroup: it.product_subtitle_snapshot,
      saleQty: dbNum(it.quantity),
      saleUnit: (it.unit || "gram") as ScInputUnit,
      saleBaseQty: dbNum(it.quantity),
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
  "relative w-full min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_10%_8%,rgba(186,230,253,0.28),transparent_32%),radial-gradient(circle_at_90%_10%,rgba(96,165,250,0.14),transparent_30%),linear-gradient(160deg,#eff6ff_0%,#f0f9ff_40%,#f5f3ff_100%)] text-slate-950";

const pageShell = "relative z-10 w-full px-4 py-4 lg:px-8 xl:px-12";

const panelClass =
  "w-full rounded-2xl border-2 border-sky-200/80 bg-white/85 p-4 shadow-[0_8px_30px_rgba(15,23,42,0.07)] backdrop-blur-xl sm:p-5";

const inputClass =
  "h-9 w-full rounded-xl border-2 border-sky-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200/50";

const btnPrimary =
  "inline-flex h-9 items-center justify-center rounded-xl border-2 border-sky-400 bg-gradient-to-r from-sky-100 to-blue-100 px-5 text-sm font-black text-sky-900 shadow-md transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100";

const btnSecondary =
  "inline-flex h-8 items-center justify-center rounded-xl border-2 border-sky-200 bg-sky-50 px-4 text-xs font-black text-slate-800 transition hover:bg-sky-100";

const tabBtn = (active: boolean) =>
  `rounded-xl px-4 py-1.5 text-sm font-black transition ${
    active
      ? "bg-gradient-to-r from-sky-500 to-blue-500 text-white shadow-md"
      : "border-2 border-sky-200 bg-white/90 text-slate-700 hover:border-sky-400"
  }`;

function unitsForMeasure(mt: ScMeasureType): ScInputUnit[] {
  if (mt === "Adet") return ["adet"];
  if (mt === "Gram / KG") return ["gram", "kg"];
  return ["ml", "litre"];
}

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

function SalesDetailModal({ record, onClose }: { record: SoapCreamSaleRecord; onClose: () => void }) {
  const { fmtMoney, fmtQty } = useStockFormat({ fmtMoney: libFmtMoney, fmtQty: libFmtQty });
  const tS = useTranslations("stock.common");
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
                <tr className="text-left text-xs font-black text-sky-800">
                  <th className="py-1.5">{tS("colProduct")}</th>
                  <th>{tS("colQty")}</th>
                  <th>{tS("colCost")}</th>
                  <th>{tS("colSale")}</th>
                </tr>
              </thead>
              <tbody>
                {record.lines.map((ln, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-2 font-semibold">{ln.productName}</td>
                    <td>
                      {fmtQty(ln.saleQty, 2)} {ln.saleUnit} ({fmtQty(ln.saleBaseQty, 0)} {ln.saleUnit === "litre" ? "ml" : ln.saleUnit === "kg" ? "g" : "baz"})
                    </td>
                    <td>{fmtMoney(ln.lineCost)}</td>
                    <td>{fmtMoney(ln.lineSale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-right font-black text-sm">
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

export default function SabunKremUrunStokPage() {
  const ss = useStockServerText();
  const { fmtMoney, fmtQty } = useStockFormat({ fmtMoney: libFmtMoney, fmtQty: libFmtQty });
  const tS = useTranslations("stock.common");
  const tP = useTranslations("stock.pages.soapCream");
  const deleteConfirm = useDeleteConfirm();
  const committingRef = useRef(false);
  const saveLock = useSubmitLock();
  const retryRef = useRef<StockRetryState | null>(null);
  // STK-03: aynı sepetin tekrar denemesi aynı idempotency anahtarını kullanır.
  const saleAttemptRef = useRef<SaleAttempt | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [tab, setTab] = useState<TabId>("stock");
  const [inventory, setInventory] = useState<SoapCreamItem[]>([]);
  const [sales, setSales] = useState<SoapCreamSaleRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [isDemo, setIsDemo] = useState(false);
  // K-2: Supabase sync için tenantId state'de tutulur
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);

  const [msg, setMsg] = useState<string | null>(null);
  const reloadInv = useCallback(async () => {
    const demo = readYasamUser()?.is_demo_account === true;
    if (demo) {
      // Demo modda: yalnızca localStorage; Supabase'e dokunma
      setInventory(loadSoapCreamInventory());
      return;
    }
    const tenantId = await getSyncedTenantId();
    setActiveTenantId(tenantId);
    const { items } = await loadSoapCreamInventoryForTenant(tenantId);
    setInventory(items);
    // BUG-021: eski önbellekten otomatik geri oluşturulmayan kalemler kullanıcıya bildirilir.
    const quarantined = takeSoapCreamQuarantineNotice(tenantId);
    if (quarantined.length) setMsg(quarantineNoticeText(quarantined));
  }, []);
  // Satış Öncesi Hata #3: geçmiş eksik yüklendiyse SalesHistorySection toplamları göstermez.
  const [historyLoadIssue, setHistoryLoadIssue] = useState<string | null>(null);
  // USM: kategori "Satış Geçmişi" canonical DB'den (merkezî ile aynı veri). Demo localStorage.
  const reloadSales = useCallback(async () => {
    const demo = readYasamUser()?.is_demo_account === true;
    if (demo) { setSales(loadSoapCreamSales()); setHistoryLoadIssue(null); return; }
    const res = await loadDbCategorySales("soap_cream");
    setSales(dbToSoapRecords(res.sales));
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
  const [saleDetail, setSaleDetail] = useState<SoapCreamSaleRecord | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [productGroup, setProductGroup] = useState<string>(PRODUCT_GROUPS[0]);
  const [productGroupCustom, setProductGroupCustom] = useState("");
  const [measureType, setMeasureType] = useState<ScMeasureType>("Gram / KG");
  const [stockQty, setStockQty] = useState("");
  const [inputUnit, setInputUnit] = useState<ScInputUnit>("gram");
  const [costTotal, setCostTotal] = useState("");
  const [salePriceTotal, setSalePriceTotal] = useState("");
  const [profitPct, setProfitPct] = useState("100");
  const [packagingType, setPackagingType] = useState<string>(PACKAGING_TYPES[0]);
  const [packagingTypeCustom, setPackagingTypeCustom] = useState("");
  const [netAmount, setNetAmount] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [lotNo, setLotNo] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [addDelta, setAddDelta] = useState(true);

  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState("Urun (A->Z)");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const displayed = useMemo(
    () => sortSoapCreamItems(filterSoapCreamItems(inventory, search), sortMode),
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
    const canonicalHint = formatCanonicalStockHint(qty, inputUnit);
    const costPer = costPerBaseFromTotal(toFloat(costTotal, 0), qty, inputUnit);
    const salePer = salePerBaseFromTotal(toFloat(salePriceTotal, 0), qty, inputUnit);
    const pct = toFloat(profitPct, 0);
    const suggestedSalePer =
      costPer && pct > 0 ? salePerBaseWithProfit(costPer, pct) : salePer ?? null;
    const base = measureTypeToBase(measureType);
    return { canonicalHint, costPer, salePer, suggestedSalePer, base };
  }, [stockQty, inputUnit, costTotal, salePriceTotal, profitPct, measureType]);

  useEffect(() => {
    const allowed = unitsForMeasure(measureType);
    if (!allowed.includes(inputUnit)) setInputUnit(allowed[0]);
  }, [measureType, inputUnit]);

  function resetForm() {
    retryRef.current = null;
    setEditId(null);
    setName("");
    setStockQty("");
    setCostTotal("");
    setSalePriceTotal("");
    setProfitPct("100");
    setNetAmount("");
    setExpiryDate("");
    setLotNo("");
    setNote("");
    setProductGroupCustom("");
    setPackagingTypeCustom("");
    setPhotos([]);
    setAddDelta(true);
  }

  function loadToForm(it: SoapCreamItem) {
    retryRef.current = null;
    setEditId(it.id);
    setName(it.name);
    // Liste dışı (serbest metin) değer → "Diğer" + metin (düzenlemede kaybolmaz).
    const pg = splitOtherValue(it.productGroup, PRODUCT_GROUPS);
    setProductGroup(pg.select);
    setProductGroupCustom(pg.custom);
    setMeasureType(it.measureType);
    setStockQty(String(fromCanonical(it.stockBase, it.baseUnit === "ml" ? "ml" : it.baseUnit === "gram" ? "gram" : "adet", it.baseUnit)));
    setInputUnit(it.baseUnit === "ml" ? "ml" : it.baseUnit === "gram" ? "gram" : "adet");
    setCostTotal(String(it.costPerBase * it.stockBase));
    setSalePriceTotal(String(it.salePerBase * it.stockBase));
    setProfitPct(String(it.profitPct));
    const pk = splitOtherValue(it.packagingType, PACKAGING_TYPES);
    setPackagingType(pk.select);
    setPackagingTypeCustom(pk.custom);
    setNetAmount(it.netAmount);
    setExpiryDate(it.expiryDate);
    setLotNo(it.lotNo);
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
    // "Diğer" + serbest metin → saklanacak etiket (birim/ölçü alanlarına dokunulmaz).
    const productGroupValue = composeOtherValue(productGroup, productGroupCustom, PRODUCT_GROUPS);
    const packagingTypeValue = composeOtherValue(packagingType, packagingTypeCustom, PACKAGING_TYPES);
    const signature = stockFormSignature([
      editingId, turkishUpper(name), productGroupValue, measureType, toFloat(stockQty, 0), inputUnit, toFloat(costTotal, 0), toFloat(salePriceTotal, 0), toFloat(profitPct, 0), packagingTypeValue, netAmount, expiryDate, lotNo, note,
      photos.length, addDelta,
    ]);
    // Aynı form tekrar gönderildiyse (önceki bulut yazımı başarısız) yerel birleştirme
    // TEKRARLANMAZ; yeni kayıt denemesi aynı id (= client_id) ile sürer → çift kayıt yok.
    const plan = planStockSave(retryRef.current, signature, editingId, beforeIds);
    let items = inventory;
    let target: SoapCreamItem | undefined;
    // STK-01: güncellemede stok yalnız formun dayandığı DB stoğu (baseStock) hâlâ geçerliyse yazılır.
    let baseStock: number | null = null;
    let isNew = !editingId;
    if (plan.kind === "retry-cloud") {
      target = inventory.find((it) => it.id === plan.targetId);
      baseStock = retryRef.current?.baseStock ?? null;
      isNew = retryRef.current?.isNew ?? false;
    } else {
      const existing = plan.id ? inventory.find((it) => it.id === plan.id) : undefined;
      if (editingId && existing) baseStock = existing.stockBase;
      const result = addOrUpdateSoapCreamItem(inventory, {
        id: plan.id,
        name: turkishUpper(name),
        productGroup: productGroupValue,
        measureType,
        stockQty: toFloat(stockQty, 0),
        inputUnit,
        costTotal: toFloat(costTotal, 0),
        salePriceTotal: toFloat(salePriceTotal, 0),
        profitPct: toFloat(profitPct, 0),
        packagingType: packagingTypeValue,
        netAmount,
        expiryDate,
        lotNo,
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
      if (isNew && target && !isDemo && activeTenantId) markSoapCreamPendingSync(activeTenantId, target.id);
      // localStorage: anında geri bildirim + çevrimdışı yedek (DB önbelleği)
      const saved = saveSoapCreamInventory(items);
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
        const res = await upsertSoapCreamInventoryItem(
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
        const res = await deleteSoapCreamInventoryItems(activeTenantId, removed);
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
      saveSoapCreamInventory(next);
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
  const [saleUnit, setSaleUnit] = useState<ScInputUnit>("ml");
  const [saleLabel, setSaleLabel] = useState("");
  const [salePhotos, setSalePhotos] = useState<string[]>([]);
  const [basket, setBasket] = useState<SoapCreamSaleRecord[]>([]);
  const [checkoutProfitPct, setCheckoutProfitPct] = useState("");

  const picked = useMemo(() => inventory.find((i) => i.id === pickId), [inventory, pickId]);

  useEffect(() => {
    if (!picked) return;
    const u = unitsForMeasure(picked.measureType);
    if (!u.includes(saleUnit)) setSaleUnit(u[0]);
    if (!saleLabel) setSaleLabel(picked.name);
  }, [picked, saleUnit, saleLabel]);

  const previewLine = useMemo(() => {
    if (!picked) return null;
    const result = calcLineAmounts(picked, toFloat(saleQty, 0), saleUnit);
    if ("error" in result) return result;
    const costPerBase =
      result.saleBaseQty > 0 ? result.lineCost / result.saleBaseQty : picked.costPerBase;
    return {
      saleBaseQty: result.saleBaseQty,
      costPerBase,
      lineCost: result.lineCost,
      lineSale: result.lineSale,
    };
  }, [picked, saleQty, saleUnit]);

  // STK-02: ön izleme, sepet ve kayıt AYNI kuralı kullanır (boş ek kâr % → ürünün kâr %; o da 0 ise
  // ürünün satış fiyatı; o da yoksa maliyet). Markup yalnız > 0 ise sunucuya gönderilir.
  function linePrice(item: SoapCreamItem, qty: number) {
    return saleLinePrice({
      unitCost: item.costPerBase,
      defaultUnitSale: item.salePerBase,
      quantity: qty,
      markupPct: toFloat(checkoutProfitPct, item.profitPct),
    });
  }

  function addToBasket() {
    if (!picked) {
      setMsg(tS("msg.pickProduct"));
      return;
    }
    const calc = calcLineAmounts(picked, toFloat(saleQty, 0), saleUnit);
    if ("error" in calc) {
      setMsg(ss.text(calc.error, tS("msg.invalidInput")));
      return;
    }
    const pct = toFloat(checkoutProfitPct, picked.profitPct);
    // STK-02: sunucu fiyat kuralının aynası — ekrandaki tutar = kaydedilen tutar.
    const price = linePrice(picked, calc.saleBaseQty);
    const lineSale = price.lineSale;
    const line: SoapCreamSaleLine = {
      productId: picked.id,
      productName: picked.name,
      productGroup: picked.productGroup,
      saleQty: toFloat(saleQty, 0),
      saleUnit,
      saleBaseQty: calc.saleBaseQty,
      lineCost: price.lineCost,
      lineSale,
    };
    const rec: SoapCreamSaleRecord = {
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
          r.lines.map((l) => ({ productId: l.productId, saleBaseQty: l.saleBaseQty })),
        );
        const updated = deductSoapCreamInventory(inventory, deductLines);
        saveSoapCreamInventory(updated);
        setInventory(updated);
        appendSoapCreamSales(basket);
        void reloadSales();
        setBasket([]);
        setMsg(tS("msg.demoPreview"));
        return;
      }

      const lines = basket.flatMap((r) =>
        r.lines.map((l) => ({
          clientId: l.productId,
          quantity: l.saleBaseQty,
          markupPct: r.profit_pct > 0 ? r.profit_pct : undefined,
        })),
      );
      // Satış Öncesi #4: deneme anahtarı yenileme/yeniden açmada korunur (sessionStorage); aynı sepet = aynı satış.
      const { res, attempt } = await submitCategorySale({ category: "soap_cream", lines, current: saleAttemptRef.current });
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
  async function cancelSalesRecords(toCancel: SoapCreamSaleRecord[]) {
    if (isDemo) {
      const inv = [...inventory];
      const missing: string[] = [];
      for (const rec of toCancel) {
        for (const line of rec.lines) {
          const baseQty = line.saleBaseQty || 0;
          if (baseQty <= 0) continue;
          const idx = inv.findIndex((it) => it.id === line.productId);
          if (idx < 0) { missing.push(line.productName); continue; }
          inv[idx] = { ...inv[idx], stockBase: (inv[idx].stockBase || 0) + baseQty };
        }
      }
      saveSoapCreamInventory(inv);
      setInventory(inv);
      const next = sales.filter((r) => !toCancel.includes(r));
      saveSoapCreamSales(next);
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

  async function setRecordsVisibility(recs: SoapCreamSaleRecord[], hide: boolean) {
    if (isDemo) {
      // Demo: kalıcı kayıt yok — yalnız yerel önizlemeden kaldırılır; stok DEĞİŞMEZ.
      if (!hide) return;
      const next = sales.filter((r) => !recs.includes(r));
      saveSoapCreamSales(next);
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
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-sky-200/40 blur-3xl" />
        <div className="absolute right-0 top-16 h-96 w-96 rounded-full bg-blue-200/30 blur-3xl" />
      </div>

      <div className={pageShell}>
        {isDemo && <DemoUrunStokBanner />}
        <header className={`${panelClass} mb-3`}>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-sky-700">{tP("eyebrow")}</p>
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
              <h2 className="mb-3 text-base font-black">{editId ? tS("form.editRecord") : tS("form.newRecord")}</h2>
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
                  <span className="mb-1 block text-xs font-black">{tS("form.measureType")}</span>
                  <select
                    className={inputClass}
                    value={measureType}
                    onChange={(e) => setMeasureType(e.target.value as ScMeasureType)}
                  >
                    {MEASURE_TYPES.map((t) => (
                      <option key={t} value={t}>{ss.option(t)}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">{tS("form.stockQty")}</span>
                  <input className={inputClass} type="number" step="any" value={stockQty} onChange={(e) => setStockQty(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">{tS("unit")}</span>
                  <select className={inputClass} value={inputUnit} onChange={(e) => setInputUnit(e.target.value as ScInputUnit)}>
                    {unitsForMeasure(measureType).map((u) => (
                      <option key={u} value={u}>
                        {ss.option(u)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">{tS("form.purchaseCostTl")}</span>
                  <input className={inputClass} type="number" step="0.01" value={costTotal} onChange={(e) => setCostTotal(e.target.value)} />
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {tS("form.baseUnitHint")}
                  </span>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">{tS("form.salePriceTl")}</span>
                  <input className={inputClass} type="number" step="0.01" value={salePriceTotal} onChange={(e) => setSalePriceTotal(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">{tS("form.profitPct")}</span>
                  <input className={inputClass} type="number" value={profitPct} onChange={(e) => setProfitPct(e.target.value)} />
                </label>
                <SelectWithOther
                  label={tP("packagingType")}
                  options={PACKAGING_TYPES}
                  value={packagingType}
                  custom={packagingTypeCustom}
                  onSelect={setPackagingType}
                  onCustom={setPackagingTypeCustom}
                  otherLabel="diğer"
                  selectClassName={inputClass}
                  labelClassName="mb-1 block text-xs font-black"
                  placeholder={tP("packagingPh")}
                />
                <label className="block">
                  <span className="mb-1 block text-xs font-black">{tP("netQty")}</span>
                  <input
                    className={inputClass}
                    placeholder={tP("netQtyPh")}
                    value={netAmount}
                    onChange={(e) => setNetAmount(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">{tP("expiry")}</span>
                  <input className={inputClass} type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">{tP("lot")}</span>
                  <input className={inputClass} value={lotNo} onChange={(e) => setLotNo(e.target.value)} />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-black">{tS("note")}</span>
                  <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
              </div>
              {stockUnitPreview ? (
                <div className="mt-3 rounded-xl border-2 border-sky-200/90 bg-gradient-to-r from-sky-50/90 to-blue-50/80 p-3">
                  <p className="text-xs font-black uppercase tracking-wide text-sky-800">{tS("form.unitSummary")}</p>
                  {stockUnitPreview.canonicalHint ? (
                    <p className="mt-1 text-xs font-semibold text-slate-700">{stockUnitPreview.canonicalHint}</p>
                  ) : null}
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {stockUnitPreview.costPer != null ? (
                      <div className="rounded-lg border border-sky-200 bg-white/90 px-3 py-2">
                        <p className="text-xs font-black text-sky-700">{tS("form.unitCost")}</p>
                        <p className="mt-0.5 text-base font-black text-slate-900">
                          {fmtUnitCost(stockUnitPreview.costPer, stockUnitPreview.base)}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 sm:col-span-2">{tS("form.unitHint")}</p>
                    )}
                    {stockUnitPreview.salePer != null ? (
                      <div className="rounded-lg border border-blue-200 bg-white/90 px-3 py-2">
                        <p className="text-xs font-black text-blue-700">{tS("form.unitSale")}</p>
                        <p className="mt-0.5 text-base font-black text-slate-900">
                          {fmtUnitCost(stockUnitPreview.salePer, stockUnitPreview.base)}
                        </p>
                      </div>
                    ) : stockUnitPreview.suggestedSalePer != null ? (
                      <div className="rounded-lg border border-violet-200 bg-white/90 px-3 py-2">
                        <p className="text-xs font-black text-violet-700">{tS("form.profitUnitSale", { pct: String(profitPct) })}</p>
                        <p className="mt-0.5 text-base font-black text-slate-900">
                          {fmtUnitCost(stockUnitPreview.suggestedSalePer, stockUnitPreview.base)}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm font-bold">
                  <input type="checkbox" checked={addDelta} onChange={(e) => setAddDelta(e.target.checked)} className="h-4 w-4" />
                  {tS("form.adjustStock")}
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
                  {editId ? tS("update") : tS("add")}
                </button>
                {editId ? (
                  <button type="button" className={btnSecondary} onClick={resetForm}>
                    {tS("cancel")}
                  </button>
                ) : null}
                <p className="ml-auto text-sm font-black text-sky-900">{tS("form.stockValue", { value: fmtMoney(stockValue) })}</p>
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
                <table className="w-full min-w-[1280px] text-sm">
                  <thead>
                    <tr className="text-xs font-black uppercase text-sky-800">
                      <th className="p-1.5">{tS("colSelect")}</th>
                      <th>{tS("colNo")}</th>
                      <th>{tS("colProduct")}</th>
                      <th>{tS("colGroup")}</th>
                      <th>{tS("colStock")}</th>
                      <th>{tS("colUnitCost")}</th>
                      <th>{tS("colUnitSale")}</th>
                      <th>{tP("colNet")}</th>
                      <th>{tP("colPackaging")}</th>
                      <th>{tP("colExpiry")}</th>
                      <th>{tP("colLot")}</th>
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
                        <td className="p-2 font-black">{it.name}</td>
                        <td className="p-2">{it.productGroup}</td>
                        <td className="p-2 font-semibold">{formatStockDisplay(it)}</td>
                        <td className="p-2 font-semibold">{fmtUnitCost(it.costPerBase, it.baseUnit)}</td>
                        <td className="p-2 font-semibold">{fmtUnitCost(it.salePerBase, it.baseUnit)}</td>
                        <td className="p-2">{it.netAmount || "—"}</td>
                        <td className="p-2">{it.packagingType}</td>
                        <td className="p-2">{it.expiryDate || "—"}</td>
                        <td className="p-2">{it.lotNo || "—"}</td>
                        <td className="p-2">
                          <button type="button" className="font-black text-sky-700 underline" onClick={() => setPhotoModal(it.photos)}>
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
                      {it.name} ({it.productGroup}) — {formatStockDisplay(it)}
                    </option>
                  ))}
                </select>
                <input
                  className={inputClass}
                  placeholder={tS("sale.labelPlaceholder")}
                  value={saleLabel}
                  onChange={(e) => setSaleLabel(turkishUpper(e.target.value))}
                />
              </div>
              {picked ? (
                <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3">
                  <p className="text-xs font-black text-sky-800">{tS("sale.savedUnitCost")}</p>
                  <p className="mt-0.5 text-base font-black text-slate-900">
                    {fmtUnitCost(picked.costPerBase, picked.baseUnit)}
                    <span className="mx-2 text-slate-400">&middot;</span>
                    {tS("sale.salePrice", { value: fmtUnitCost(picked.salePerBase, picked.baseUnit) })}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-600">
                    {tS("sale.baseHint")}
                  </p>
                </div>
              ) : null}
              {picked ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-black">{tS("sale.qtyToSell")}</span>
                    <input className={inputClass} type="number" step="any" value={saleQty} onChange={(e) => setSaleQty(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-black">{tS("unit")}</span>
                    <select className={inputClass} value={saleUnit} onChange={(e) => setSaleUnit(e.target.value as ScInputUnit)}>
                      {unitsForMeasure(picked.measureType).map((u) => (
                        <option key={u} value={u}>
                          {ss.option(u)}
                        </option>
                      ))}
                    </select>
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
                    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-center font-black text-sm">
                      {tS("costLabel", { value: fmtMoney(previewLine.lineCost) })}
                    </div>
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-center font-black text-sm">
                      {tS("saleLabel")}
                      {fmtMoney(
                        linePrice(picked, previewLine.saleBaseQty).lineSale,
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-xs font-semibold">
                      {tS("sale.internalDeduct", { qty: fmtQty(previewLine.saleBaseQty, 2), unit: picked.baseUnit })}
                    </div>
                  </div>
                  <p className="rounded-lg border border-sky-100 bg-white/90 px-3 py-2 text-center text-xs font-bold text-slate-800">
                    {formatLineCostBreakdown(
                      previewLine.costPerBase,
                      toFloat(saleQty, 0),
                      saleUnit,
                      picked.baseUnit,
                      previewLine.lineCost,
                    )}
                  </p>
                </div>
              ) : previewLine && "error" in previewLine ? (
                <p className="text-red-700 font-semibold text-sm">{previewLine.error}</p>
              ) : null}
              <label className="cursor-pointer inline-block">
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
                  <div key={i} className="rounded-xl border bg-sky-50/50 p-3">
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
              <p className="mt-3 text-sm font-black">
                {tS("sale.basketTotal", { value: fmtMoney(basket.reduce((s, r) => s + r.sale_price, 0)) })}
              </p>
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
              headClassName="text-sky-800"
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
