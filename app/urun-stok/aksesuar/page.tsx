"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
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
  fmtMoney,
  fmtQty,
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
  upsertAccessoryInventoryItem,
} from "@/lib/urun-stok/accessoryInventoryDb";
import { cancelSale, createCategorySale, newIdempotencyKey } from "@/lib/urun-stok/salesApi";
import { loadDbCategorySales, type DbCategorySale } from "@/lib/urun-stok/salesHistoryDb";
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
  const [idx, setIdx] = useState(0);
  const safe = photos.length ? photos : [];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-md">
      <div className="relative max-h-[90vh] w-full max-w-3xl rounded-[28px] border-2 border-white/90 bg-white p-6 shadow-2xl">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-xl border px-4 py-2 text-sm font-black">
          Kapat
        </button>
        <h3 className="mb-4 text-xl font-black">Fotoğraf</h3>
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
          <p className="py-12 text-center text-slate-500">Fotoğraf yok</p>
        )}
      </div>
    </div>
  );
}

function SalesDetailModal({ record, onClose }: { record: AccessorySaleRecord; onClose: () => void }) {
  const [gallery, setGallery] = useState<string[] | null>(null);
  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-md">
        <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border-2 bg-white shadow-2xl">
          <div className="border-b p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-black">{record.name}</h3>
              <button type="button" className={btnSecondary} onClick={() => setGallery(record.photos || [])}>
                Foto ({record.photos?.length || 0})
              </button>
            </div>
          </div>
          <div className="overflow-auto p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-black text-amber-800">
                  <th className="py-1.5">Ürün</th>
                  <th>Adet</th>
                  <th>Maliyet</th>
                  <th>Satış</th>
                </tr>
              </thead>
              <tbody>
                {record.lines.map((ln, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-2 font-semibold">{ln.productName}</td>
                    <td>{fmtQty(ln.saleQty, 0)} adet</td>
                    <td>{fmtMoney(ln.lineCost)}</td>
                    <td>{fmtMoney(ln.lineSale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-right text-sm font-black">
              Toplam: {fmtMoney(record.total_cost)} &rarr; {fmtMoney(record.sale_price)}
            </p>
          </div>
          <div className="border-t p-3 text-right">
            <button type="button" className={btnSecondary} onClick={onClose}>
              Kapat
            </button>
          </div>
        </div>
      </div>
      {gallery?.length ? <PhotoGalleryModal photos={gallery} onClose={() => setGallery(null)} /> : null}
    </>
  );
}

export default function AksesuarUrunStokPage() {
  const deleteConfirm = useDeleteConfirm();
  const committingRef = useRef(false);
  const saveLock = useSubmitLock();
  const retryRef = useRef<StockRetryState | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [tab, setTab] = useState<TabId>("stock");
  const [inventory, setInventory] = useState<AccessoryItem[]>([]);
  const [sales, setSales] = useState<AccessorySaleRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [isDemo, setIsDemo] = useState(false);
  // K-2: Supabase sync için tenantId state'de tutulur
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);

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
  }, []);
  // USM: kategori "Satış Geçmişi" canonical DB'den (merkezî ile aynı veri). Demo localStorage.
  const reloadSales = useCallback(async () => {
    const demo = readYasamUser()?.is_demo_account === true;
    if (demo) { setSales(loadAccessorySales()); return; }
    const { sales: dbSales } = await loadDbCategorySales("accessory");
    setSales(dbToAccessoryRecords(dbSales));
  }, []);

  useEffect(() => {
    const demo = readYasamUser()?.is_demo_account === true;
    if (demo) seedDemoUrunStok();
    setIsDemo(demo);
    void reloadInv();
    void reloadSales();
    setHydrated(true);
  }, [reloadInv, reloadSales]);

  const [msg, setMsg] = useState<string | null>(null);
  const [photoModal, setPhotoModal] = useState<string[] | null>(null);
  const [saleDetail, setSaleDetail] = useState<AccessorySaleRecord | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [productGroup, setProductGroup] = useState<string>(PRODUCT_GROUPS[0]);
  const [productModel, setProductModel] = useState("");
  const [material, setMaterial] = useState<string>(MATERIALS[0]);
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
    setPhotos([]);
    setAddDelta(true);
  }

  function loadToForm(it: AccessoryItem) {
    retryRef.current = null;
    setEditId(it.id);
    setName(it.name);
    setProductGroup(it.productGroup);
    setProductModel(it.productModel);
    setMaterial(it.material);
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
      .catch((e: unknown) => setMsg(e instanceof Error ? e.message : "Kayıt tamamlanamadı."));
  }

  async function saveStockNow() {
    setMsg(null);
    const beforeIds = new Set(inventory.map((i) => i.id));
    const editingId = editId;
    const signature = stockFormSignature([
      editingId, name, productGroup, productModel, material, color, sizeKind, sizeDetail,
      stockQty, costTotal, salePriceTotal, profitPct, barcode, note, photos.length, addDelta,
    ]);
    // Aynı form tekrar gönderildiyse (önceki bulut yazımı başarısız) yerel birleştirme
    // TEKRARLANMAZ; yeni kayıt denemesi aynı id (= client_id) ile sürer → çift kayıt yok.
    const plan = planStockSave(retryRef.current, signature, editingId, beforeIds);
    let items = inventory;
    let target: AccessoryItem | undefined;
    if (plan.kind === "retry-cloud") {
      target = inventory.find((it) => it.id === plan.targetId);
    } else {
      const existing = plan.id ? inventory.find((it) => it.id === plan.id) : undefined;
      const result = addOrUpdateAccessoryItem(inventory, {
        id: plan.id,
        name: turkishUpper(name),
        productGroup,
        productModel,
        material,
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
        setMsg(result.error);
        return;
      }
      items = result.items;
      target = findSaveTarget(items, beforeIds, plan.id);
      // localStorage: anında geri bildirim + çevrimdışı yedek (DB önbelleği)
      const saved = saveAccessoryInventory(items);
      setInventory(items);
      if (!saved) {
        setMsg(
          "⚠ Tarayıcı depolama alanı doldu. Fotoğraf boyutlarını küçültün veya bazı kayıtları silin.",
        );
        return;
      }
    }

    // K-2: Demo değilse kaydı kalıcı olarak Supabase'e yaz. Böylece sayfa
    // yenilenince kaybolmaz ve cihazlar arası senkron olur.
    if (!isDemo && activeTenantId) {
      if (target) {
        const res = await upsertAccessoryInventoryItem(activeTenantId, target);
        if (!res.ok) {
          retryRef.current = { signature, targetId: target.id, isNew: !editingId };
          setMsg(
            `Kayıt cihazınıza eklendi ancak buluta yazılamadı: ${res.error}. İnternet bağlantınızı kontrol edip kaydı yeniden ekleyin.`,
          );
          return; // Alanları temizleme — kullanıcı tekrar deneyebilsin.
        }
        retryRef.current = null;
        // DB'den taze çek: kanonik durum; önbelleğin DB'yi ezme riski kalmaz.
        await reloadInv();
        resetForm();
        setMsg(
          res.created
            ? "Kayıt eklendi ve buluta kaydedildi (tüm cihazlarda görünür)."
            : "Kayıt güncellendi ve buluta kaydedildi.",
        );
        return;
      }
    }

    resetForm();
    setMsg(editingId ? "Kayıt güncellendi." : "Kayıt eklendi.");
  }

  async function deleteSelected() {
    // Yalnız görünür ∩ seçili: aramayla gizlenmiş seçili kayıt habersiz silinmez.
    const removed = displayed.filter((i) => selectedIds.has(i.id));
    if (!removed.length) {
      setMsg("Silmek için seçim yapın.");
      return;
    }
    const removedIds = new Set(removed.map((i) => i.id));
    const ok = await deleteConfirm({
      title: "Stok kaydı silinecek",
      message: `Seçili ${removed.length} stok kaydı kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      names: removed.map((i) => i.name || "(adsız ürün)"),
    });
    if (!ok) return;
    const next = inventory.filter((i) => !removedIds.has(i.id));
    saveAccessoryInventory(next);
    setInventory(next);
    const count = removed.length;
    setSelectedIds(new Set());
    // K-2: silmeyi DB ile uyumlu yap; aksi halde kayıt yenilemede DB'den geri gelir.
    if (!isDemo && activeTenantId && removed.length > 0) {
      const res = await deleteAccessoryInventoryItems(activeTenantId, removed);
      await reloadInv();
      if (!res.ok) {
        setMsg(`${count} kayıt cihazınızdan silindi ancak buluttan silmede hata: ${res.error}`);
        return;
      }
    }
    setMsg(`${count} kayıt silindi.`);
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

  function addToBasket() {
    if (!picked) {
      setMsg("Ürün seçin.");
      return;
    }
    const calc = calcLineAmounts(picked, toFloat(saleQty, 0));
    if ("error" in calc) {
      setMsg(calc.error);
      return;
    }
    const pct = toFloat(checkoutProfitPct, picked.profitPct);
    const lineSale = pct > 0 ? calc.lineCost * (1 + pct / 100) : calc.lineSale;
    const line: AccessorySaleLine = {
      productId: picked.id,
      productName: formatVariantLabel(picked),
      productGroup: picked.productGroup,
      saleQty: calc.saleQty,
      lineCost: calc.lineCost,
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
    setMsg("Sepete eklendi.");
  }

  // USM-001/003/004/005: satış artık CANONICAL server RPC üzerinden atomik. Fire-and-forget
  // localStorage senkronu KALDIRILDI; server başarısı olmadan UI başarı göstermez.
  async function commitSale() {
    if (committingRef.current) return;
    if (!basket.length) {
      setMsg("Sepet boş.");
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
        setMsg("Demo: satış önizlendi (kalıcı kayıt yapılmaz).");
        return;
      }

      const lines = basket.flatMap((r) =>
        r.lines.map((l) => ({ clientId: l.productId, quantity: l.saleQty, markupPct: r.profit_pct })),
      );
      const res = await createCategorySale({ category: "accessory", idempotencyKey: newIdempotencyKey(), lines });
      if (!res.ok) {
        setMsg(res.error ?? "Satış kaydedilemedi.");
        await reloadInv(); // gerçek stok yenilensin (yetersiz stok vb.)
        return;
      }
      setBasket([]);
      await reloadInv(); // stok DB'den (canonical) yeniden yüklenir
      await reloadSales(); // geçmiş DB'den (yeni satış görünür)
      setMsg("Satış kaydedildi, stok düşüldü.");
    } catch {
      setMsg("Satış sırasında ağ hatası. Lütfen tekrar deneyin.");
      await reloadInv();
    } finally {
      committingRef.current = false;
      setIsCommitting(false);
    }
  }

  // USM: iptal artık CANONICAL server RPC (inventory_sale_cancel_atomic) ile.
  async function deleteSelectedSales() {
    if (!histSel.size) { setMsg("İptal için seçin."); return; }
    const ok = await deleteConfirm({
      title: "Satış iptal edilecek",
      message: `Seçili ${histSel.size} satış iptal edilecek. Satılan miktarlar stoğa geri eklenecektir.`,
      names: sales.filter((_, i) => histSel.has(i)).map((r) => `${r.name || "Satış"} (${r.timestamp})`),
    });
    if (!ok) return;
    const toCancel = sales.filter((_, i) => histSel.has(i));

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
      const next = sales.filter((_, i) => !histSel.has(i));
      saveAccessorySales(next);
      setSales(next);
      setHistSel(new Set());
      setMsg(missing.length > 0
        ? `İptal edildi. Uyarı: ${[...new Set(missing)].join(", ")} stoğu bulunamadı.`
        : "Satış iptal edildi (demo).");
      return;
    }

    let failed = 0;
    for (const rec of toCancel) {
      if (!rec.saleId) { failed++; continue; }
      const res = await cancelSale(rec.saleId);
      if (!res.ok) failed++;
    }
    setHistSel(new Set());
    await reloadSales();
    await reloadInv();
    setMsg(
      failed > 0
        ? `${toCancel.length - failed} satış iptal edildi, ${failed} işlem başarısız.`
        : "Satış iptal edildi, stok stoğa geri eklendi.",
    );
  }

  const [histSel, setHistSel] = useState<Set<number>>(new Set());
  // Seçim sıra-indekslidir: satış listesi yeniden yüklenince (yeni satış/iptal) indeksler
  // başka satışa kayabilir → seçim temizlenir (yanlış satışın iptali engellenir).
  useEffect(() => {
    runInEffect(() => setHistSel((prev) => (prev.size ? new Set() : prev)));
  }, [sales]);
  const histSummary = useMemo(() => {
    const totalSale = sales.reduce((s, r) => s + r.sale_price, 0);
    const totalCost = sales.reduce((s, r) => s + r.total_cost, 0);
    return {
      totalSale,
      profit: totalSale - totalCost,
      soldUnits: countSoldUnits(sales),
      count: sales.length,
    };
  }, [sales]);

  if (!hydrated) {
    return (
      <main className={pageBg}>
        <div className="flex min-h-screen items-center justify-center font-semibold text-slate-600">
          Yükleniyor&hellip;
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
          <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-700">Tespih &amp; Takı</p>
          <h1 className="mt-1 text-2xl font-black xl:text-3xl">Tespih / Takı / Aksesuar</h1>
          <p className="mt-1 text-sm text-slate-600">
            Renk, ölçü ve model varyasyonları ayrı stok satırı olarak tutulur; satış adet bazlı, maliyet ve kar otomatik hesaplanır.
          </p>
        </header>

        <div className="mb-3 flex flex-wrap gap-2">
          {(["stock", "pricing", "history"] as TabId[]).map((t) => (
            <button key={t} type="button" className={tabBtn(tab === t)} onClick={() => setTab(t)}>
              {t === "stock" ? "Ürün/Stok" : t === "pricing" ? "Satış & Fiyatlandırma" : "Satış Geçmişi"}
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
              <h2 className="mb-1 text-base font-black">{editId ? "Kayıt Düzenle" : "Yeni Ürün Kaydı"}</h2>
              <p className="mb-3 text-xs font-semibold text-slate-600">
                Aynı ürünün farklı renk / ölçü / modeli için ayrı satır açın (ör. Kaplan Gözü Bileklik | 18 cm | Kahverengi).
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-black">Ürün adı</span>
                  <input className={inputClass} value={name} onChange={(e) => setName(turkishUpper(e.target.value))} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">Ürün grubu</span>
                  <select className={inputClass} value={productGroup} onChange={(e) => setProductGroup(e.target.value)}>
                    {PRODUCT_GROUPS.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">Ürün tipi / model</span>
                  <input className={inputClass} value={productModel} onChange={(e) => setProductModel(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">Malzeme</span>
                  <select className={inputClass} value={material} onChange={(e) => setMaterial(e.target.value)}>
                    {MATERIALS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">Renk</span>
                  <input className={inputClass} value={color} onChange={(e) => setColor(e.target.value)} placeholder="Kahverengi, Gümüş..." />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">Ölçü / beden türü</span>
                  <select className={inputClass} value={sizeKind} onChange={(e) => setSizeKind(e.target.value)}>
                    {SIZE_KINDS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">Ölçü değeri</span>
                  <input
                    className={inputClass}
                    value={sizeDetail}
                    onChange={(e) => setSizeDetail(e.target.value)}
                    placeholder="18 cm, 45 cm, 33 tane..."
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">Stok adedi</span>
                  <input className={inputClass} type="number" step="1" min="0" value={stockQty} onChange={(e) => setStockQty(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">Alış maliyeti (TL, toplam)</span>
                  <input className={inputClass} type="number" step="0.01" value={costTotal} onChange={(e) => setCostTotal(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">Satış fiyatı (TL, toplam)</span>
                  <input className={inputClass} type="number" step="0.01" value={salePriceTotal} onChange={(e) => setSalePriceTotal(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">Kar oranı %</span>
                  <input className={inputClass} type="number" value={profitPct} onChange={(e) => setProfitPct(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">Barkod / ürün kodu (opsiyonel)</span>
                  <input className={inputClass} value={barcode} onChange={(e) => setBarcode(e.target.value)} />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-black">Not</span>
                  <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
              </div>
              {stockUnitPreview ? (
                <div className="mt-3 rounded-xl border-2 border-amber-200/90 bg-gradient-to-r from-amber-50/90 to-orange-50/80 p-3">
                  <p className="text-xs font-black uppercase tracking-wide text-amber-800">Birim maliyet özeti</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {stockUnitPreview.costPer != null ? (
                      <div className="rounded-lg border border-amber-200 bg-white/90 px-3 py-2">
                        <p className="text-xs font-black text-amber-700">Birim maliyet</p>
                        <p className="mt-0.5 text-base font-black">{fmtUnitCost(stockUnitPreview.costPer)}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">Alış maliyeti ve stok adedi girildiğinde hesaplanır.</p>
                    )}
                    {stockUnitPreview.salePer != null ? (
                      <div className="rounded-lg border border-orange-200 bg-white/90 px-3 py-2">
                        <p className="text-xs font-black text-orange-700">Birim satış</p>
                        <p className="mt-0.5 text-base font-black">{fmtUnitCost(stockUnitPreview.salePer)}</p>
                      </div>
                    ) : stockUnitPreview.suggestedSalePer != null ? (
                      <div className="rounded-lg border border-violet-200 bg-white/90 px-3 py-2">
                        <p className="text-xs font-black text-violet-700">Kar %{profitPct} ile birim satış</p>
                        <p className="mt-0.5 text-base font-black">{fmtUnitCost(stockUnitPreview.suggestedSalePer)}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm font-bold">
                  <input type="checkbox" checked={addDelta} onChange={(e) => setAddDelta(e.target.checked)} className="h-4 w-4" />
                  Mevcut stoğa ekle / düş
                </label>
                <label className="cursor-pointer">
                  <span className={btnSecondary}> ({photos.length}) Foto</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files;
                      if (f?.length) {
                        const { urls, error } = await filesToDataUrls(f);
                        if (error) setMsg(error);
                        else setPhotos(urls);
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
                <button type="button" className={btnPrimary} onClick={() => void handleSaveStock()} disabled={saveLock.pending} aria-busy={saveLock.pending}>
                  {saveLock.pending ? "Kaydediliyor…" : editId ? "Güncelle" : "Ekle"}
                </button>
                {editId ? (
                  <button type="button" className={btnSecondary} onClick={resetForm}>
                    İptal
                  </button>
                ) : null}
                <p className="ml-auto text-sm font-black text-amber-900">Stok değeri: {fmtMoney(stockValue)}</p>
              </div>
            </section>

            <section className={panelClass}>
              <div className="mb-3 grid gap-3 md:grid-cols-2">
                <input className={inputClass} placeholder="Ara..." value={search} onChange={(e) => setSearch(e.target.value)} />
                <select className={inputClass} value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
                  <option value="Urun (A->Z)">Ürün (A→Z)</option>
                  <option value="Ürün (Z→A)">Ürün (Z→A)</option>
                  <option value="Stok (Az→Çok)">Stok (Az→Çok)</option>
                  <option value="Stok (Çok→Az)">Stok (Çok→Az)</option>
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1400px] text-sm">
                  <thead>
                    <tr className="text-xs font-black uppercase text-amber-800">
                      <th className="p-1.5">Seç</th>
                      <th>No</th>
                      <th>Varyant</th>
                      <th>Grup</th>
                      <th>Model</th>
                      <th>Malzeme</th>
                      <th>Renk</th>
                      <th>Ölçü</th>
                      <th>Stok</th>
                      <th>Birim Maliyet</th>
                      <th>Birim Satış</th>
                      <th>Barkod</th>
                      <th>Foto</th>
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
                            Düzenle
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" className={`${btnSecondary} mt-3`} onClick={() => void deleteSelected()}>
                Seçilenleri Sil
              </button>
            </section>
          </div>
        )}

        {tab === "pricing" && (
          <div className="grid w-full gap-4 xl:grid-cols-[1.55fr_1fr]">
            <section className={`${panelClass} space-y-4`}>
              <div className="grid gap-3 lg:grid-cols-2">
                <select className={inputClass} value={pickId} onChange={(e) => setPickId(e.target.value)}>
                  <option value="">— Ürün seç —</option>
                  {inventory.map((it) => (
                    <option key={it.id} value={it.id}>
                      {formatVariantLabel(it)} — {formatStockDisplay(it)}
                    </option>
                  ))}
                </select>
                <input
                  className={inputClass}
                  placeholder="Satış etiketi"
                  value={saleLabel}
                  onChange={(e) => setSaleLabel(turkishUpper(e.target.value))}
                />
              </div>
              {picked ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
                  <p className="text-xs font-black text-amber-800">Kayıtlı birim fiyat</p>
                  <p className="mt-0.5 text-base font-black">
                    {fmtUnitCost(picked.costPerUnit)}
                    <span className="mx-2 text-slate-400">&middot;</span>
                    Satış: {fmtUnitCost(picked.salePerUnit)}
                  </p>
                </div>
              ) : null}
              {picked ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-black">Satılacak adet</span>
                    <input className={inputClass} type="number" step="1" min="1" value={saleQty} onChange={(e) => setSaleQty(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-black">Ek kar % (opsiyonel)</span>
                    <input className={inputClass} value={checkoutProfitPct} onChange={(e) => setCheckoutProfitPct(e.target.value)} placeholder={String(picked.profitPct)} />
                  </label>
                </div>
              ) : null}
              {previewLine && !("error" in previewLine) && picked ? (
                <div className="space-y-2">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center text-sm font-black">
                      Maliyet: {fmtMoney(previewLine.lineCost)}
                    </div>
                    <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-center text-sm font-black">
                      Satış:{" "}
                      {fmtMoney(
                        toFloat(checkoutProfitPct, 0) > 0
                          ? previewLine.lineCost * (1 + toFloat(checkoutProfitPct, 0) / 100)
                          : previewLine.lineSale,
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-xs font-semibold">
                      Stok düşümü: {fmtQty(previewLine.saleQty, 0)} adet
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
                <span className={btnSecondary}>({salePhotos.length}) Ürün fotoğrafı</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files;
                    if (f?.length) {
                      const { urls, error } = await filesToDataUrls(f);
                      if (error) setMsg(error);
                      else setSalePhotos(urls);
                    }
                    e.target.value = "";
                  }}
                />
              </label>
              <button type="button" className={`${btnPrimary} w-full`} onClick={addToBasket}>
                Sepete Ekle
              </button>
            </section>
            <section className={panelClass}>
              <h2 className="mb-3 text-base font-black">Sepet</h2>
              <div className="space-y-2">
                {basket.map((rec, i) => (
                  <div key={i} className="rounded-xl border bg-amber-50/50 p-3">
                    <p className="text-sm font-black">{rec.name}</p>
                    <p className="text-xs">
                      {fmtMoney(rec.total_cost)} &rarr; {fmtMoney(rec.sale_price)}
                    </p>
                    <button type="button" className="mt-1 text-xs font-black text-red-600" onClick={() => setBasket((b) => b.filter((_, j) => j !== i))}>
                      Sil
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm font-black">Toplam satış: {fmtMoney(basket.reduce((s, r) => s + r.sale_price, 0))}</p>
              <div className="mt-4 flex flex-col gap-2">
                <button type="button" className={btnSecondary} onClick={() => setBasket([])}>
                  Sepeti Temizle
                </button>
                <button type="button" className={btnPrimary} onClick={() => void commitSale()} disabled={isCommitting}>
                  {isCommitting ? "Kaydediliyor..." : "Satışı Kaydet"}
                </button>
              </div>
            </section>
          </div>
        )}

        {tab === "history" && (
          <section className={panelClass}>
            <div className="mb-4 flex flex-wrap gap-4 text-sm font-black">
              <span>Toplam Satış: {fmtMoney(histSummary.totalSale)}</span>
              <span>Toplam Kar: {fmtMoney(histSummary.profit)}</span>
              <span>Satılan Ürün: {histSummary.soldUnits} adet</span>
              <span>Satış Kaydı: {histSummary.count}</span>
            </div>
            <button
              type="button"
              className={`${btnSecondary} mb-3`}
              onClick={() => void deleteSelectedSales()}
            >
              Seçilenleri Sil
            </button>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-sm">
                <thead>
                  <tr className="text-xs font-black uppercase text-amber-800">
                    <th className="p-1.5">No</th>
                    <th>Seç</th>
                    <th>Tarih</th>
                    <th>Ürün</th>
                    <th>Maliyet</th>
                    <th>Satış</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sales.map((rec, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 text-center">{i + 1}</td>
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={histSel.has(i)}
                          onChange={(e) => {
                            setHistSel((prev) => {
                              const n = new Set(prev);
                              if (e.target.checked) n.add(i);
                              else n.delete(i);
                              return n;
                            });
                          }}
                        />
                      </td>
                      <td className="p-2">{rec.timestamp}</td>
                      <td className="p-2 font-semibold">{rec.name}</td>
                      <td className="p-2">{fmtMoney(rec.total_cost)}</td>
                      <td className="p-2">{fmtMoney(rec.sale_price)}</td>
                      <td className="p-2">
                        <button type="button" className="font-black text-amber-700 underline" onClick={() => setSaleDetail(rec)}>
                          Detay
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {photoModal ? <PhotoGalleryModal photos={photoModal} onClose={() => setPhotoModal(null)} /> : null}
      {saleDetail ? <SalesDetailModal record={saleDetail} onClose={() => setSaleDetail(null)} /> : null}
    </main>
  );
}
