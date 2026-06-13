"use client";

import Link from "next/link";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BOTTLE_VOLUMES,
  INPUT_UNITS,
  MEASURE_TYPES,
  OIL_TYPES,
  PACKAGE_TYPES,
  type OilInputUnit,
  type OilItem,
  type OilMeasureType,
  type OilSaleLine,
  type OilSaleRecord,
  addOrUpdateOilItem,
  appendOilSales,
  calcLineAmounts,
  costPerBaseFromTotal,
  deductOilInventory,
  formatCanonicalStockHint,
  formatLineCostBreakdown,
  fmtUnitCost,
  salePerBaseFromTotal,
  salePerBaseWithProfit,
  filesToDataUrls,
  filterOilItems,
  fmtMoney,
  fmtQty,
  formatStockDisplay,
  fromCanonical,
  inventoryStockValue,
  loadOilInventory,
  loadOilSales,
  measureTypeToBase,
  saveOilInventory,
  saveOilSales,
  sortOilItems,
  toCanonical,
  toFloat,
  turkishUpper,
} from "@/lib/urun-stok/oilStockLogic";

type TabId = "stock" | "pricing" | "history";

const pageBg =
  "relative w-full min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_10%_8%,rgba(167,243,208,0.22),transparent_32%),radial-gradient(circle_at_90%_10%,rgba(52,211,153,0.12),transparent_30%),linear-gradient(160deg,#ecfdf5_0%,#f0fdf4_40%,#f5f3ff_100%)] text-slate-950";

const pageShell = "relative z-10 w-full px-5 py-4 lg:px-8 xl:px-12";

const panelClass =
  "w-full rounded-[18px] border-2 border-emerald-200/80 bg-white/85 p-4 shadow-[0_8px_28px_rgba(15,23,42,0.07)] backdrop-blur-xl";

const inputClass =
  "h-10 w-full rounded-xl border-2 border-emerald-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/50";

const btnPrimary =
  "inline-flex h-10 items-center justify-center rounded-xl border-2 border-emerald-400 bg-gradient-to-r from-emerald-100 to-green-100 px-6 text-sm font-black text-emerald-900 shadow-md transition hover:scale-[1.02]";

const btnSecondary =
  "inline-flex h-9 items-center justify-center rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-slate-800 transition hover:bg-emerald-100";

const tabBtn = (active: boolean) =>
  `rounded-xl px-4 py-2 text-sm font-black transition ${
    active
      ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg"
      : "border-2 border-emerald-200 bg-white/90 text-slate-700 hover:border-emerald-400"
  }`;

function unitsForMeasure(mt: OilMeasureType): OilInputUnit[] {
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
        <h3 className="mb-4 text-xl font-black">Fotoğraf</h3>
        {safe.length ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={safe[idx]} alt="" className="mx-auto max-h-[60vh] rounded-2xl object-contain" />
            <div className="mt-4 flex justify-center gap-3">
              <button type="button" className={btnSecondary} onClick={() => setIdx((i) => (i - 1 + safe.length) % safe.length)}>
                ◀
              </button>
              <button type="button" className={btnSecondary} onClick={() => setIdx((i) => (i + 1) % safe.length)}>
                ▶
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

function SalesDetailModal({ record, onClose }: { record: OilSaleRecord; onClose: () => void }) {
  const [gallery, setGallery] = useState<string[] | null>(null);
  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-md">
        <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border-2 bg-white shadow-2xl">
          <div className="border-b p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h3 className="text-2xl font-black">{record.name}</h3>
              <button type="button" className={btnSecondary} onClick={() => setGallery(record.photos || [])}>
                Foto ({record.photos?.length || 0})
              </button>
            </div>
          </div>
          <div className="overflow-auto p-6">
            <table className="w-full text-base">
              <thead>
                <tr className="text-left text-sm font-black text-emerald-800">
                  <th className="py-2">Ürün</th>
                  <th>Miktar</th>
                  <th>Maliyet</th>
                  <th>Satış</th>
                </tr>
              </thead>
              <tbody>
                {record.lines.map((ln, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-3 font-semibold">{ln.productName}</td>
                    <td>
                      {fmtQty(ln.saleQty, 2)} {ln.saleUnit} ({fmtQty(ln.saleBaseQty, 0)} {ln.saleUnit === "litre" ? "ml" : ln.saleUnit === "kg" ? "g" : "baz"})
                    </td>
                    <td>{fmtMoney(ln.lineCost)}</td>
                    <td>{fmtMoney(ln.lineSale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-right font-black">
              Toplam: {fmtMoney(record.total_cost)} → {fmtMoney(record.sale_price)}
            </p>
          </div>
          <div className="border-t p-4 text-right">
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

export default function YagUrunStokPage() {
  const [tab, setTab] = useState<TabId>("stock");
  const [inventory, setInventory] = useState<OilItem[]>([]);
  const [sales, setSales] = useState<OilSaleRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const reloadInv = useCallback(() => setInventory(loadOilInventory()), []);
  const reloadSales = useCallback(() => setSales(loadOilSales()), []);

  useEffect(() => {
    reloadInv();
    reloadSales();
    setHydrated(true);
  }, [reloadInv, reloadSales]);

  const [msg, setMsg] = useState<string | null>(null);
  const [photoModal, setPhotoModal] = useState<string[] | null>(null);
  const [saleDetail, setSaleDetail] = useState<OilSaleRecord | null>(null);

  // —— Stok formu ——
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [oilType, setOilType] = useState<string>(OIL_TYPES[0]);
  const [measureType, setMeasureType] = useState<OilMeasureType>("ML / Litre");
  const [stockQty, setStockQty] = useState("");
  const [inputUnit, setInputUnit] = useState<OilInputUnit>("ml");
  const [costTotal, setCostTotal] = useState("");
  const [salePriceTotal, setSalePriceTotal] = useState("");
  const [profitPct, setProfitPct] = useState("100");
  const [bottleVolume, setBottleVolume] = useState<string>(BOTTLE_VOLUMES[2]);
  const [bottleCustom, setBottleCustom] = useState("");
  const [packageType, setPackageType] = useState<string>(PACKAGE_TYPES[0]);
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [addDelta, setAddDelta] = useState(true);

  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState("Ürün (A→Z)");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const displayed = useMemo(
    () => sortOilItems(filterOilItems(inventory, search), sortMode),
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
    setNote("");
    setPhotos([]);
    setAddDelta(true);
  }

  function loadToForm(it: OilItem) {
    setEditId(it.id);
    setName(it.name);
    setOilType(it.oilType);
    setMeasureType(it.measureType);
    setStockQty(String(fromCanonical(it.stockBase, it.baseUnit === "ml" ? "ml" : it.baseUnit === "gram" ? "gram" : "adet", it.baseUnit)));
    setInputUnit(it.baseUnit === "ml" ? "ml" : it.baseUnit === "gram" ? "gram" : "adet");
    setCostTotal(String(it.costPerBase * it.stockBase));
    setSalePriceTotal(String(it.salePerBase * it.stockBase));
    setProfitPct(String(it.profitPct));
    setBottleVolume(it.bottleVolume);
    setBottleCustom(it.bottleVolumeCustom);
    setPackageType(it.packageType);
    setNote(it.note);
    setPhotos([]);
    setAddDelta(false);
  }

  function handleSaveStock() {
    setMsg(null);
    const result = addOrUpdateOilItem(inventory, {
      id: editId ?? undefined,
      name: turkishUpper(name),
      oilType,
      measureType,
      stockQty: toFloat(stockQty, 0),
      inputUnit,
      costTotal: toFloat(costTotal, 0),
      salePriceTotal: toFloat(salePriceTotal, 0),
      profitPct: toFloat(profitPct, 0),
      bottleVolume,
      bottleVolumeCustom: bottleCustom,
      packageType,
      photos,
      note,
      deltaMode: addDelta,
    });
    if (!result.ok) {
      setMsg(result.error);
      return;
    }
    saveOilInventory(result.items);
    setInventory(result.items);
    resetForm();
    setMsg(editId ? "Kayıt güncellendi." : "Kayıt eklendi.");
  }

  function deleteSelected() {
    if (!selectedIds.size) {
      setMsg("Silmek için seçim yapın.");
      return;
    }
    const next = inventory.filter((i) => !selectedIds.has(i.id));
    saveOilInventory(next);
    setInventory(next);
    setSelectedIds(new Set());
    setMsg(`${selectedIds.size} kayıt silindi.`);
  }

  // —— Satış ——
  const [pickId, setPickId] = useState("");
  const [saleQty, setSaleQty] = useState("1");
  const [saleUnit, setSaleUnit] = useState<OilInputUnit>("ml");
  const [saleLabel, setSaleLabel] = useState("");
  const [salePhotos, setSalePhotos] = useState<string[]>([]);
  const [basket, setBasket] = useState<OilSaleRecord[]>([]);
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
      setMsg("Ürün seçin.");
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
    const line: OilSaleLine = {
      productId: picked.id,
      productName: picked.name,
      oilType: picked.oilType,
      saleQty: toFloat(saleQty, 0),
      saleUnit,
      saleBaseQty: calc.saleBaseQty,
      lineCost: calc.lineCost,
      lineSale,
    };
    const rec: OilSaleRecord = {
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
    if (!basket.length) {
      setMsg("Sepet boş.");
      return;
    }
    const deductLines = basket.flatMap((r) =>
      r.lines.map((l) => ({ productId: l.productId, saleBaseQty: l.saleBaseQty })),
    );
    const updated = deductOilInventory(inventory, deductLines);
    saveOilInventory(updated);
    setInventory(updated);
    appendOilSales(basket);
    reloadSales();
    setBasket([]);
    setMsg("Satış kaydedildi, stok düşüldü.");
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
          Yükleniyor…
        </div>
      </main>
    );
  }

  return (
    <main className={pageBg}>
      <BfcacheRefreshHandler />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="absolute right-0 top-16 h-96 w-96 rounded-full bg-teal-200/30 blur-3xl" />
      </div>

      <div className={pageShell}>
        <header className={`${panelClass} mb-4`}>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-700">Yağ Ürünleri</p>
          <h1 className="mt-1 text-2xl font-black">Yağ Ürün / Stok</h1>
          <p className="mt-1 text-sm text-slate-600">
            Uçucu, sabit, karışım ve maserasyon yağları — litre/kg girişi otomatik ml/gram birim maliyetine çevrilir.
          </p>
        </header>

        <div className="mb-4 flex flex-wrap gap-2">
          {(["stock", "pricing", "history"] as TabId[]).map((t) => (
            <button key={t} type="button" className={tabBtn(tab === t)} onClick={() => setTab(t)}>
              {t === "stock" ? "Yağ Stok" : t === "pricing" ? "Satış & Fiyatlandırma" : "Satış Geçmişi"}
            </button>
          ))}
        </div>

        {msg ? (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            {msg}
          </p>
        ) : null}

        {tab === "stock" && (
          <div className="w-full space-y-4">
            <section className={panelClass}>
              <h2 className="mb-3 text-base font-black">{editId ? "Kayıt Düzenle" : "Yeni Yağ Ürünü"}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-sm font-black">Ürün adı</span>
                  <input className={inputClass} value={name} onChange={(e) => setName(turkishUpper(e.target.value))} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black">Yağ türü</span>
                  <select className={inputClass} value={oilType} onChange={(e) => setOilType(e.target.value)}>
                    {OIL_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black">Ölçü tipi</span>
                  <select
                    className={inputClass}
                    value={measureType}
                    onChange={(e) => setMeasureType(e.target.value as OilMeasureType)}
                  >
                    {MEASURE_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black">Stok miktarı</span>
                  <input className={inputClass} type="number" step="any" value={stockQty} onChange={(e) => setStockQty(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black">Birim</span>
                  <select className={inputClass} value={inputUnit} onChange={(e) => setInputUnit(e.target.value as OilInputUnit)}>
                    {unitsForMeasure(measureType).map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black">Alış maliyeti (₺, toplam)</span>
                  <input className={inputClass} type="number" step="0.01" value={costTotal} onChange={(e) => setCostTotal(e.target.value)} />
                  <span className="mt-1 block text-xs font-semibold text-slate-500">
                    Litre/kg girseniz bile birim maliyet ml veya gram üzerinden hesaplanır.
                  </span>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black">Satış fiyatı (₺, toplam)</span>
                  <input className={inputClass} type="number" step="0.01" value={salePriceTotal} onChange={(e) => setSalePriceTotal(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black">Kâr oranı %</span>
                  <input className={inputClass} type="number" value={profitPct} onChange={(e) => setProfitPct(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black">Şişe hacmi</span>
                  <select className={inputClass} value={bottleVolume} onChange={(e) => setBottleVolume(e.target.value)}>
                    {BOTTLE_VOLUMES.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                {bottleVolume === "özel" ? (
                  <label className="block">
                    <span className="mb-1 block text-sm font-black">Özel hacim</span>
                    <input className={inputClass} value={bottleCustom} onChange={(e) => setBottleCustom(e.target.value)} />
                  </label>
                ) : null}
                <label className="block">
                  <span className="mb-1 block text-sm font-black">Paket tipi</span>
                  <select className={inputClass} value={packageType} onChange={(e) => setPackageType(e.target.value)}>
                    {PACKAGE_TYPES.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-sm font-black">Not</span>
                  <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
              </div>
              {stockUnitPreview ? (
                <div className="mt-3 rounded-xl border-2 border-emerald-200/90 bg-gradient-to-r from-emerald-50/90 to-teal-50/80 p-3">
                  <p className="text-xs font-black uppercase tracking-wide text-emerald-800">Birim maliyet özeti</p>
                  {stockUnitPreview.canonicalHint ? (
                    <p className="mt-1.5 text-sm font-semibold text-slate-700">{stockUnitPreview.canonicalHint}</p>
                  ) : null}
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {stockUnitPreview.costPer != null ? (
                      <div className="rounded-lg border border-emerald-200 bg-white/90 px-3 py-2">
                        <p className="text-xs font-black text-emerald-700">Birim maliyet</p>
                        <p className="mt-1 text-lg font-black text-slate-900">
                          {fmtUnitCost(stockUnitPreview.costPer, stockUnitPreview.base)}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 sm:col-span-2">Alış maliyeti ve stok girildiğinde birim maliyet hesaplanır.</p>
                    )}
                    {stockUnitPreview.salePer != null ? (
                      <div className="rounded-lg border border-teal-200 bg-white/90 px-3 py-2">
                        <p className="text-xs font-black text-teal-700">Birim satış</p>
                        <p className="mt-1 text-lg font-black text-slate-900">
                          {fmtUnitCost(stockUnitPreview.salePer, stockUnitPreview.base)}
                        </p>
                      </div>
                    ) : stockUnitPreview.suggestedSalePer != null ? (
                      <div className="rounded-lg border border-violet-200 bg-white/90 px-3 py-2">
                        <p className="text-xs font-black text-violet-700">Kâr %{profitPct} ile birim satış</p>
                        <p className="mt-1 text-lg font-black text-slate-900">
                          {fmtUnitCost(stockUnitPreview.suggestedSalePer, stockUnitPreview.base)}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 font-bold">
                  <input type="checkbox" checked={addDelta} onChange={(e) => setAddDelta(e.target.checked)} className="h-5 w-5" />
                  Mevcut stoğa ekle / düş (işaretli)
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
                <button type="button" className={btnPrimary} onClick={handleSaveStock}>
                  {editId ? "Güncelle" : "Ekle"}
                </button>
                {editId ? (
                  <button type="button" className={btnSecondary} onClick={resetForm}>
                    İptal
                  </button>
                ) : null}
                <p className="ml-auto font-black text-emerald-900">Stok değeri: {fmtMoney(stockValue)}</p>
              </div>
            </section>

            <section className={panelClass}>
              <div className="mb-3 grid gap-3 md:grid-cols-2">
                <input className={inputClass} placeholder="Ara…" value={search} onChange={(e) => setSearch(e.target.value)} />
                <select className={inputClass} value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
                  <option>Ürün (A→Z)</option>
                  <option>Ürün (Z→A)</option>
                  <option>Stok (Az→Çok)</option>
                  <option>Stok (Çok→Az)</option>
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-base">
                  <thead>
                    <tr className="text-sm font-black uppercase text-emerald-800">
                      <th className="p-2">Seç</th>
                      <th>No</th>
                      <th>Ürün</th>
                      <th>Tür</th>
                      <th>Stok</th>
                      <th>Birim maliyet</th>
                      <th>Birim satış</th>
                      <th>Şişe</th>
                      <th>Paket</th>
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
                            className="h-5 w-5"
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
                        <td className="p-2">{it.oilType}</td>
                        <td className="p-2 font-semibold">{formatStockDisplay(it)}</td>
                        <td className="p-2 font-semibold">{fmtUnitCost(it.costPerBase, it.baseUnit)}</td>
                        <td className="p-2 font-semibold">{fmtUnitCost(it.salePerBase, it.baseUnit)}</td>
                        <td className="p-2">{it.bottleVolume === "özel" ? it.bottleVolumeCustom || "özel" : it.bottleVolume}</td>
                        <td className="p-2">{it.packageType}</td>
                        <td className="p-2">
                          <button type="button" className="font-black text-emerald-700 underline" onClick={() => setPhotoModal(it.photos)}>
                            {it.photos.length}
                          </button>
                        </td>
                        <td className="p-2">
                          <button type="button" className="text-sm font-black text-violet-700" onClick={() => loadToForm(it)}>
                            Düzenle
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" className={`${btnSecondary} mt-4`} onClick={deleteSelected}>
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
                      {it.name} ({it.oilType}) — {formatStockDisplay(it)}
                    </option>
                  ))}
                </select>
                <input
                  className={inputClass}
                  placeholder="Satış etiketi / ürün adı"
                  value={saleLabel}
                  onChange={(e) => setSaleLabel(turkishUpper(e.target.value))}
                />
              </div>
              {picked ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
                  <p className="text-sm font-black text-emerald-800">Kayıtlı birim maliyet</p>
                  <p className="mt-1 text-lg font-black text-slate-900">
                    {fmtUnitCost(picked.costPerBase, picked.baseUnit)}
                    <span className="mx-2 text-slate-400">·</span>
                    Satış: {fmtUnitCost(picked.salePerBase, picked.baseUnit)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">
                    Satışta miktar otomatik ml/gram/adet bazına çevrilir; stok aynı birimle düşer.
                  </p>
                </div>
              ) : null}
              {picked ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-sm font-black">Satılacak miktar</span>
                    <input className={inputClass} type="number" step="any" value={saleQty} onChange={(e) => setSaleQty(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-black">Birim</span>
                    <select className={inputClass} value={saleUnit} onChange={(e) => setSaleUnit(e.target.value as OilInputUnit)}>
                      {unitsForMeasure(picked.measureType).map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-black">Ek kâr % (opsiyonel)</span>
                    <input className={inputClass} value={checkoutProfitPct} onChange={(e) => setCheckoutProfitPct(e.target.value)} placeholder={String(picked.profitPct)} />
                  </label>
                </div>
              ) : null}
              {previewLine && !("error" in previewLine) && picked ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center font-black">
                      Maliyet: {fmtMoney(previewLine.lineCost)}
                    </div>
                    <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-center font-black">
                      Satış:{" "}
                      {fmtMoney(
                        toFloat(checkoutProfitPct, 0) > 0
                          ? previewLine.lineCost * (1 + toFloat(checkoutProfitPct, 0) / 100)
                          : previewLine.lineSale,
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-sm font-semibold">
                      İç stok düşümü: {fmtQty(previewLine.saleBaseQty, 2)} {picked.baseUnit}
                    </div>
                  </div>
                  <p className="rounded-xl border border-emerald-100 bg-white/90 px-4 py-3 text-center text-sm font-bold text-slate-800">
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
                <p className="text-red-700 font-semibold">{previewLine.error}</p>
              ) : null}
              <label className="cursor-pointer inline-block">
                <span className={btnSecondary}>({salePhotos.length}) Ürün fotoğrafı</span>
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
              <h2 className="mb-4 text-xl font-black">Sepet</h2>
              <div className="space-y-3">
                {basket.map((rec, i) => (
                  <div key={i} className="rounded-2xl border bg-emerald-50/50 p-4">
                    <p className="font-black">{rec.name}</p>
                    <p className="text-sm">
                      {fmtMoney(rec.total_cost)} → {fmtMoney(rec.sale_price)}
                    </p>
                    <button type="button" className="mt-2 text-sm font-black text-red-600" onClick={() => setBasket((b) => b.filter((_, j) => j !== i))}>
                      Sil
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-4 font-black">
                Toplam satış: {fmtMoney(basket.reduce((s, r) => s + r.sale_price, 0))}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <button type="button" className={btnSecondary} onClick={() => setBasket([])}>
                  Sepeti Temizle
                </button>
                <button type="button" className={btnPrimary} onClick={commitSale}>
                  Satışı Kaydet
                </button>
              </div>
            </section>
          </div>
        )}

        {tab === "history" && (
          <section className={panelClass}>
            <div className="mb-4 flex flex-wrap gap-4 text-base font-black">
              <span>Toplam Satış: {fmtMoney(histSummary.totalSale)}</span>
              <span>Toplam Kâr: {fmtMoney(histSummary.profit)}</span>
              <span>Satılan: {histSummary.count}</span>
            </div>
            <button
              type="button"
              className={`${btnSecondary} mb-4`}
              onClick={() => {
                if (!histSel.size) {
                  setMsg("Silmek için seçin.");
                  return;
                }
                const next = sales.filter((_, i) => !histSel.has(i));
                saveOilSales(next);
                setSales(next);
                setHistSel(new Set());
              }}
            >
              Seçilenleri Sil
            </button>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-base">
                <thead>
                  <tr className="text-sm font-black uppercase text-emerald-800">
                    <th className="p-2">No</th>
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
                          className="h-5 w-5"
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
                        <button type="button" className="font-black text-emerald-700 underline" onClick={() => setSaleDetail(rec)}>
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
