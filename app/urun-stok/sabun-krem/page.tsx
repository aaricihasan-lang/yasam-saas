"use client";

import Link from "next/link";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
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
  fmtMoney,
  fmtQty,
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
import { readYasamUser } from "@/lib/auth/yasamUser";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import {
  deleteSoapCreamInventoryItems,
  loadSoapCreamInventoryForTenant,
  syncSoapCreamInventoryToDb,
  upsertSoapCreamInventoryItem,
} from "@/lib/urun-stok/soapCreamInventoryDb";
import { seedDemoUrunStok } from "@/lib/demo/demoUrunStok";
import { DemoUrunStokBanner } from "@/components/demo/DemoUrunStokBanner";

type TabId = "stock" | "pricing" | "history";

const pageBg =
  "relative w-full min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_10%_8%,rgba(186,230,253,0.28),transparent_32%),radial-gradient(circle_at_90%_10%,rgba(96,165,250,0.14),transparent_30%),linear-gradient(160deg,#eff6ff_0%,#f0f9ff_40%,#f5f3ff_100%)] text-slate-950";

const pageShell = "relative z-10 w-full px-4 py-4 lg:px-8 xl:px-12";

const panelClass =
  "w-full rounded-2xl border-2 border-sky-200/80 bg-white/85 p-4 shadow-[0_8px_30px_rgba(15,23,42,0.07)] backdrop-blur-xl sm:p-5";

const inputClass =
  "h-9 w-full rounded-xl border-2 border-sky-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200/50";

const btnPrimary =
  "inline-flex h-9 items-center justify-center rounded-xl border-2 border-sky-400 bg-gradient-to-r from-sky-100 to-blue-100 px-5 text-sm font-black text-sky-900 shadow-md transition hover:scale-[1.02]";

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
  const [idx, setIdx] = useState(0);
  const safe = photos.length ? photos : [];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-md">
      <div className="relative max-h-[90vh] w-full max-w-3xl rounded-[28px] border-2 border-white/90 bg-white p-6 shadow-2xl">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-xl border px-4 py-2 text-sm font-black">
          Kapat
        </button>
        <h3 className="mb-4 text-xl font-black">Fotograf</h3>
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
          <p className="py-12 text-center text-slate-500">Fotograf yok</p>
        )}
      </div>
    </div>
  );
}

function SalesDetailModal({ record, onClose }: { record: SoapCreamSaleRecord; onClose: () => void }) {
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
                <tr className="text-left text-xs font-black text-sky-800">
                  <th className="py-1.5">Ürün</th>
                  <th>Miktar</th>
                  <th>Maliyet</th>
                  <th>Satış</th>
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

export default function SabunKremUrunStokPage() {
  const deleteConfirm = useDeleteConfirm();
  const committingRef = useRef(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [tab, setTab] = useState<TabId>("stock");
  const [inventory, setInventory] = useState<SoapCreamItem[]>([]);
  const [sales, setSales] = useState<SoapCreamSaleRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [isDemo, setIsDemo] = useState(false);
  // K-2: Supabase sync için tenantId state'de tutulur
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);

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
  }, []);
  const reloadSales = useCallback(() => setSales(loadSoapCreamSales()), []);

  useEffect(() => {
    const demo = readYasamUser()?.is_demo_account === true;
    if (demo) seedDemoUrunStok();
    setIsDemo(demo);
    void reloadInv();
    reloadSales();
    setHydrated(true);
  }, [reloadInv, reloadSales]);

  const [msg, setMsg] = useState<string | null>(null);
  const [photoModal, setPhotoModal] = useState<string[] | null>(null);
  const [saleDetail, setSaleDetail] = useState<SoapCreamSaleRecord | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [productGroup, setProductGroup] = useState<string>(PRODUCT_GROUPS[0]);
  const [measureType, setMeasureType] = useState<ScMeasureType>("Gram / KG");
  const [stockQty, setStockQty] = useState("");
  const [inputUnit, setInputUnit] = useState<ScInputUnit>("gram");
  const [costTotal, setCostTotal] = useState("");
  const [salePriceTotal, setSalePriceTotal] = useState("");
  const [profitPct, setProfitPct] = useState("100");
  const [packagingType, setPackagingType] = useState<string>(PACKAGING_TYPES[0]);
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
    setPhotos([]);
    setAddDelta(true);
  }

  function loadToForm(it: SoapCreamItem) {
    setEditId(it.id);
    setName(it.name);
    setProductGroup(it.productGroup);
    setMeasureType(it.measureType);
    setStockQty(String(fromCanonical(it.stockBase, it.baseUnit === "ml" ? "ml" : it.baseUnit === "gram" ? "gram" : "adet", it.baseUnit)));
    setInputUnit(it.baseUnit === "ml" ? "ml" : it.baseUnit === "gram" ? "gram" : "adet");
    setCostTotal(String(it.costPerBase * it.stockBase));
    setSalePriceTotal(String(it.salePerBase * it.stockBase));
    setProfitPct(String(it.profitPct));
    setPackagingType(it.packagingType);
    setNetAmount(it.netAmount);
    setExpiryDate(it.expiryDate);
    setLotNo(it.lotNo);
    setNote(it.note);
    setPhotos([]);
    setAddDelta(false);
  }

  async function handleSaveStock() {
    setMsg(null);
    const beforeIds = new Set(inventory.map((i) => i.id));
    const editingId = editId;
    const result = addOrUpdateSoapCreamItem(inventory, {
      id: editingId ?? undefined,
      name: turkishUpper(name),
      productGroup,
      measureType,
      stockQty: toFloat(stockQty, 0),
      inputUnit,
      costTotal: toFloat(costTotal, 0),
      salePriceTotal: toFloat(salePriceTotal, 0),
      profitPct: toFloat(profitPct, 0),
      packagingType,
      netAmount,
      expiryDate,
      lotNo,
      photos,
      note,
      deltaMode: addDelta,
    });
    if (!result.ok) {
      setMsg(result.error);
      return;
    }
    // localStorage: anında geri bildirim + çevrimdışı yedek (DB önbelleği)
    const saved = saveSoapCreamInventory(result.items);
    setInventory(result.items);
    if (!saved) {
      setMsg(
        "⚠ Tarayıcı depolama alanı doldu. Fotoğraf boyutlarını küçültün veya bazı kayıtları silin.",
      );
      return;
    }

    // K-2: Demo değilse kaydı kalıcı olarak Supabase'e yaz. Böylece sayfa
    // yenilenince kaybolmaz ve cihazlar arası senkron olur.
    if (!isDemo && activeTenantId) {
      const target = editingId
        ? result.items.find((it) => it.id === editingId)
        : result.items.find((it) => !beforeIds.has(it.id));
      if (target) {
        const res = await upsertSoapCreamInventoryItem(activeTenantId, target);
        if (!res.ok) {
          setMsg(
            `Kayıt cihazınıza eklendi ancak buluta yazılamadı: ${res.error}. İnternet bağlantınızı kontrol edip kaydı yeniden ekleyin.`,
          );
          return; // Alanları temizleme — kullanıcı tekrar deneyebilsin.
        }
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
    setMsg(editingId ? "Kayit guncellendi." : "Kayit eklendi.");
  }

  async function deleteSelected() {
    if (!selectedIds.size) {
      setMsg("Silmek icin secim yapin.");
      return;
    }
    const ok = await deleteConfirm({
      title: "Stok kaydı silinecek",
      message: `Seçili ${selectedIds.size} stok kaydı kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
    });
    if (!ok) return;
    const removed = inventory.filter((i) => selectedIds.has(i.id));
    const next = inventory.filter((i) => !selectedIds.has(i.id));
    saveSoapCreamInventory(next);
    setInventory(next);
    const count = selectedIds.size;
    setSelectedIds(new Set());
    // K-2: silmeyi DB ile uyumlu yap; aksi halde kayıt yenilemede DB'den geri gelir.
    if (!isDemo && activeTenantId && removed.length > 0) {
      const res = await deleteSoapCreamInventoryItems(activeTenantId, removed);
      await reloadInv();
      if (!res.ok) {
        setMsg(`${count} kayit cihazınızdan silindi ancak buluttan silmede hata: ${res.error}`);
        return;
      }
    }
    setMsg(`${count} kayit silindi.`);
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

  function addToBasket() {
    if (!picked) {
      setMsg("Urun secin.");
      return;
    }
    const calc = calcLineAmounts(picked, toFloat(saleQty, 0), saleUnit);
    if ("error" in calc) {
      setMsg(calc.error);
      return;
    }
    const pct = toFloat(checkoutProfitPct, picked.profitPct);
    const lineSale =
      pct > 0 ? calc.lineCost * (1 + pct / 100) : calc.lineSale;
    const line: SoapCreamSaleLine = {
      productId: picked.id,
      productName: picked.name,
      productGroup: picked.productGroup,
      saleQty: toFloat(saleQty, 0),
      saleUnit,
      saleBaseQty: calc.saleBaseQty,
      lineCost: calc.lineCost,
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
    setMsg("Sepete eklendi.");
  }

  function commitSale() {
    if (committingRef.current) return;
    if (!basket.length) {
      setMsg("Sepet bos.");
      return;
    }
    committingRef.current = true;
    setIsCommitting(true);
    try {
      const deductLines = basket.flatMap((r) =>
        r.lines.map((l) => ({ productId: l.productId, saleBaseQty: l.saleBaseQty })),
      );
      const updated = deductSoapCreamInventory(inventory, deductLines);
      saveSoapCreamInventory(updated);
      setInventory(updated);
      appendSoapCreamSales(basket);
      reloadSales();
      setBasket([]);
      setMsg("Satis kaydedildi, stok dusuldu.");
      // K-2: Demo modda Supabase'e yazma; gerçek hesaplarda stok düşümünü senkronla
      if (!isDemo && activeTenantId) {
        void syncSoapCreamInventoryToDb(activeTenantId, updated).then(({ error }) => {
          if (error) console.warn("[soap_cream] Supabase sync hatası (satış):", error);
        });
      }
    } finally {
      committingRef.current = false;
      setIsCommitting(false);
    }
  }

  async function deleteSelectedSales() {
    if (!histSel.size) { setMsg("Silmek icin secin."); return; }
    const ok = await deleteConfirm({
      title: "Satış kaydı silinecek",
      message: `Seçili ${histSel.size} satış kaydı silinecek. Satılan miktarlar stoğa geri eklenecektir.`,
    });
    if (!ok) return;
    const toDelete = sales.filter((_, i) => histSel.has(i));
    const inv = [...inventory];
    const missing: string[] = [];
    for (const rec of toDelete) {
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
    const next = sales.filter((_, i) => !histSel.has(i));
    saveSoapCreamSales(next);
    setSales(next);
    setHistSel(new Set());
    // K-2: Demo modda Supabase'e yazma; gerçek hesaplarda stok iadesini senkronla
    if (!isDemo && activeTenantId) {
      void syncSoapCreamInventoryToDb(activeTenantId, inv).then(({ error }) => {
        if (error) console.warn("[soap_cream] Supabase sync hatası (stok iadesi):", error);
      });
    }
    setMsg(missing.length > 0
      ? `Silindi. Uyari: ${[...new Set(missing)].join(", ")} stoku bulunamadi, iade yapilamadi.`
      : "Satis silindi, stok guncellendi.");
  }

  const [histSel, setHistSel] = useState<Set<number>>(new Set());
  const histSummary = useMemo(() => {
    const totalSale = sales.reduce((s, r) => s + r.sale_price, 0);
    const totalCost = sales.reduce((s, r) => s + r.total_cost, 0);
    return { totalSale, totalCost, profit: totalSale - totalCost, count: sales.length };
  }, [sales]);

  if (!hydrated) {
    return (
      <main className={pageBg}>
        <div className="flex min-h-screen items-center justify-center font-semibold text-slate-600">
          Yukleniyor&hellip;
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
          <p className="text-xs font-black uppercase tracking-[0.3em] text-sky-700">Sabun &amp; Krem</p>
          <h1 className="mt-1 text-2xl font-black xl:text-3xl">Sabun / Krem Urunleri</h1>
          <p className="mt-1 text-sm text-slate-600">
            Dogal sabun, krem ve bakim urunleri &mdash; gram/kg ve ml/litre otomatik donusur; birim maliyet satis miktarina gore hesaplanir.
          </p>
        </header>

        <div className="mb-3 flex flex-wrap gap-2">
          {(["stock", "pricing", "history"] as TabId[]).map((t) => (
            <button key={t} type="button" className={tabBtn(tab === t)} onClick={() => setTab(t)}>
              {t === "stock" ? "Urun/Stok" : t === "pricing" ? "Satis & Fiyatlandirma" : "Satis Gecmisi"}
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
              <h2 className="mb-3 text-base font-black">{editId ? "Kayit Duzenle" : "Yeni Urun Kaydi"}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-black">Urun adi</span>
                  <input className={inputClass} value={name} onChange={(e) => setName(turkishUpper(e.target.value))} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">Urun grubu</span>
                  <select className={inputClass} value={productGroup} onChange={(e) => setProductGroup(e.target.value)}>
                    {PRODUCT_GROUPS.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">Olcu tipi</span>
                  <select
                    className={inputClass}
                    value={measureType}
                    onChange={(e) => setMeasureType(e.target.value as ScMeasureType)}
                  >
                    {MEASURE_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">Stok miktari</span>
                  <input className={inputClass} type="number" step="any" value={stockQty} onChange={(e) => setStockQty(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">Birim</span>
                  <select className={inputClass} value={inputUnit} onChange={(e) => setInputUnit(e.target.value as ScInputUnit)}>
                    {unitsForMeasure(measureType).map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">Alis maliyeti (TL, toplam)</span>
                  <input className={inputClass} type="number" step="0.01" value={costTotal} onChange={(e) => setCostTotal(e.target.value)} />
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Litre/kg girsenz bile birim maliyet ml veya gram uzerinden hesaplanir.
                  </span>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">Satis fiyati (TL, toplam)</span>
                  <input className={inputClass} type="number" step="0.01" value={salePriceTotal} onChange={(e) => setSalePriceTotal(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">Kar orani %</span>
                  <input className={inputClass} type="number" value={profitPct} onChange={(e) => setProfitPct(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">Ambalaj tipi</span>
                  <select className={inputClass} value={packagingType} onChange={(e) => setPackagingType(e.target.value)}>
                    {PACKAGING_TYPES.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">Net miktar</span>
                  <input
                    className={inputClass}
                    placeholder="orn. 100 gram, 50 ml, 1 adet"
                    value={netAmount}
                    onChange={(e) => setNetAmount(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">Son kullanma (opsiyonel)</span>
                  <input className={inputClass} type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black">Parti / lot no (opsiyonel)</span>
                  <input className={inputClass} value={lotNo} onChange={(e) => setLotNo(e.target.value)} />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-black">Not</span>
                  <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
              </div>
              {stockUnitPreview ? (
                <div className="mt-3 rounded-xl border-2 border-sky-200/90 bg-gradient-to-r from-sky-50/90 to-blue-50/80 p-3">
                  <p className="text-xs font-black uppercase tracking-wide text-sky-800">Birim maliyet ozeti</p>
                  {stockUnitPreview.canonicalHint ? (
                    <p className="mt-1 text-xs font-semibold text-slate-700">{stockUnitPreview.canonicalHint}</p>
                  ) : null}
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {stockUnitPreview.costPer != null ? (
                      <div className="rounded-lg border border-sky-200 bg-white/90 px-3 py-2">
                        <p className="text-xs font-black text-sky-700">Birim maliyet</p>
                        <p className="mt-0.5 text-base font-black text-slate-900">
                          {fmtUnitCost(stockUnitPreview.costPer, stockUnitPreview.base)}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 sm:col-span-2">Alis maliyeti ve stok girildiginde birim maliyet hesaplanir.</p>
                    )}
                    {stockUnitPreview.salePer != null ? (
                      <div className="rounded-lg border border-blue-200 bg-white/90 px-3 py-2">
                        <p className="text-xs font-black text-blue-700">Birim satis</p>
                        <p className="mt-0.5 text-base font-black text-slate-900">
                          {fmtUnitCost(stockUnitPreview.salePer, stockUnitPreview.base)}
                        </p>
                      </div>
                    ) : stockUnitPreview.suggestedSalePer != null ? (
                      <div className="rounded-lg border border-violet-200 bg-white/90 px-3 py-2">
                        <p className="text-xs font-black text-violet-700">Kar %{profitPct} ile birim satis</p>
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
                  Mevcut stoga ekle / dus (isaretli)
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
                      if (f?.length) setPhotos(await filesToDataUrls(f));
                      e.target.value = "";
                    }}
                  />
                </label>
                <button type="button" className={btnPrimary} onClick={() => void handleSaveStock()}>
                  {editId ? "Guncelle" : "Ekle"}
                </button>
                {editId ? (
                  <button type="button" className={btnSecondary} onClick={resetForm}>
                    Iptal
                  </button>
                ) : null}
                <p className="ml-auto text-sm font-black text-sky-900">Stok degeri: {fmtMoney(stockValue)}</p>
              </div>
            </section>

            <section className={panelClass}>
              <div className="mb-3 grid gap-3 md:grid-cols-2">
                <input className={inputClass} placeholder="Ara..." value={search} onChange={(e) => setSearch(e.target.value)} />
                <select className={inputClass} value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
                  <option>Urun (A-&gt;Z)</option>
                  <option>Urun (Z-&gt;A)</option>
                  <option>Stok (Az-&gt;Cok)</option>
                  <option>Stok (Cok-&gt;Az)</option>
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1280px] text-sm">
                  <thead>
                    <tr className="text-xs font-black uppercase text-sky-800">
                      <th className="p-1.5">Seç</th>
                      <th>No</th>
                      <th>Ürün</th>
                      <th>Grup</th>
                      <th>Stok</th>
                      <th>Birim Maliyet</th>
                      <th>Birim Satış</th>
                      <th>Net</th>
                      <th>Ambalaj</th>
                      <th>SKT</th>
                      <th>Lot</th>
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
                            Duzenle
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" className={`${btnSecondary} mt-3`} onClick={() => void deleteSelected()}>
                Secilenleri Sil
              </button>
            </section>
          </div>
        )}

        {tab === "pricing" && (
          <div className="grid w-full gap-4 xl:grid-cols-[1.55fr_1fr]">
            <section className={`${panelClass} space-y-4`}>
              <div className="grid gap-3 lg:grid-cols-2">
                <select className={inputClass} value={pickId} onChange={(e) => setPickId(e.target.value)}>
                  <option value="">— Urun sec —</option>
                  {inventory.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name} ({it.productGroup}) — {formatStockDisplay(it)}
                    </option>
                  ))}
                </select>
                <input
                  className={inputClass}
                  placeholder="Satis etiketi / urun adi"
                  value={saleLabel}
                  onChange={(e) => setSaleLabel(turkishUpper(e.target.value))}
                />
              </div>
              {picked ? (
                <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3">
                  <p className="text-xs font-black text-sky-800">Kayitli birim maliyet</p>
                  <p className="mt-0.5 text-base font-black text-slate-900">
                    {fmtUnitCost(picked.costPerBase, picked.baseUnit)}
                    <span className="mx-2 text-slate-400">&middot;</span>
                    Satis: {fmtUnitCost(picked.salePerBase, picked.baseUnit)}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-600">
                    Satista miktar otomatik ml/gram/adet bazina cevrilir; stok ayni birimle duser.
                  </p>
                </div>
              ) : null}
              {picked ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-black">Satilacak miktar</span>
                    <input className={inputClass} type="number" step="any" value={saleQty} onChange={(e) => setSaleQty(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-black">Birim</span>
                    <select className={inputClass} value={saleUnit} onChange={(e) => setSaleUnit(e.target.value as ScInputUnit)}>
                      {unitsForMeasure(picked.measureType).map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
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
                    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-center font-black text-sm">
                      Maliyet: {fmtMoney(previewLine.lineCost)}
                    </div>
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-center font-black text-sm">
                      Satis:{" "}
                      {fmtMoney(
                        toFloat(checkoutProfitPct, 0) > 0
                          ? previewLine.lineCost * (1 + toFloat(checkoutProfitPct, 0) / 100)
                          : previewLine.lineSale,
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-xs font-semibold">
                      Ic stok dusumu: {fmtQty(previewLine.saleBaseQty, 2)} {picked.baseUnit}
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
                <span className={btnSecondary}>({salePhotos.length}) Urun fotografi</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files;
                    if (f?.length) setSalePhotos(await filesToDataUrls(f));
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
                  <div key={i} className="rounded-xl border bg-sky-50/50 p-3">
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
              <p className="mt-3 text-sm font-black">
                Toplam satis: {fmtMoney(basket.reduce((s, r) => s + r.sale_price, 0))}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <button type="button" className={btnSecondary} onClick={() => setBasket([])}>
                  Sepeti Temizle
                </button>
                <button type="button" className={btnPrimary} onClick={commitSale} disabled={isCommitting}>
                  {isCommitting ? "Kaydediliyor..." : "Satisi Kaydet"}
                </button>
              </div>
            </section>
          </div>
        )}

        {tab === "history" && (
          <section className={panelClass}>
            <div className="mb-4 flex flex-wrap gap-4 text-sm font-black">
              <span>Toplam Satis: {fmtMoney(histSummary.totalSale)}</span>
              <span>Toplam Kar: {fmtMoney(histSummary.profit)}</span>
              <span>Satilan: {histSummary.count}</span>
            </div>
            <button
              type="button"
              className={`${btnSecondary} mb-3`}
              onClick={() => void deleteSelectedSales()}
            >
              Secilenleri Sil
            </button>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-sm">
                <thead>
                  <tr className="text-xs font-black uppercase text-sky-800">
                    <th className="p-1.5">No</th>
                    <th>Sec</th>
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
                        <button type="button" className="font-black text-sky-700 underline" onClick={() => setSaleDetail(rec)}>
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
