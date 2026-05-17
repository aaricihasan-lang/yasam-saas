"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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

type TabId = "stock" | "pricing" | "history";

const pageBg =
  "relative w-full min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_10%_8%,rgba(253,230,138,0.28),transparent_32%),radial-gradient(circle_at_90%_10%,rgba(251,191,36,0.14),transparent_30%),linear-gradient(160deg,#fffbeb_0%,#fff7ed_40%,#f5f3ff_100%)] text-slate-950";

const pageShell = "relative z-10 w-full px-6 py-8 lg:px-10 xl:px-14";

const panelClass =
  "w-full rounded-[28px] border-2 border-amber-200/80 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const inputClass =
  "h-14 w-full rounded-2xl border-2 border-amber-200 bg-white px-4 text-base font-semibold text-slate-900 outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-200/50";

const btnPrimary =
  "inline-flex h-14 items-center justify-center rounded-2xl border-2 border-amber-400 bg-gradient-to-r from-amber-100 to-orange-100 px-8 text-base font-black text-amber-950 shadow-md transition hover:scale-[1.02]";

const btnSecondary =
  "inline-flex h-12 items-center justify-center rounded-2xl border-2 border-amber-200 bg-amber-50 px-6 text-sm font-black text-slate-800 transition hover:bg-amber-100";

const tabBtn = (active: boolean) =>
  `rounded-2xl px-6 py-3 text-base font-black transition ${
    active
      ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg"
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

function SalesDetailModal({ record, onClose }: { record: AccessorySaleRecord; onClose: () => void }) {
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
                <tr className="text-left text-sm font-black text-amber-800">
                  <th className="py-2">Ürün</th>
                  <th>Adet</th>
                  <th>Maliyet</th>
                  <th>Satış</th>
                </tr>
              </thead>
              <tbody>
                {record.lines.map((ln, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-3 font-semibold">{ln.productName}</td>
                    <td>{fmtQty(ln.saleQty, 0)} adet</td>
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

export default function AksesuarUrunStokPage() {
  const [tab, setTab] = useState<TabId>("stock");
  const [inventory, setInventory] = useState<AccessoryItem[]>([]);
  const [sales, setSales] = useState<AccessorySaleRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const reloadInv = useCallback(() => setInventory(loadAccessoryInventory()), []);
  const reloadSales = useCallback(() => setSales(loadAccessorySales()), []);

  useEffect(() => {
    reloadInv();
    reloadSales();
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
  const [sortMode, setSortMode] = useState("Ürün (A→Z)");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const displayed = useMemo(
    () => sortAccessoryItems(filterAccessoryItems(inventory, search), sortMode),
    [inventory, search, sortMode],
  );

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
    setMsg(null);
    const result = addOrUpdateAccessoryItem(inventory, {
      id: editId ?? undefined,
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
      photos,
      note,
      deltaMode: addDelta,
    });
    if (!result.ok) {
      setMsg(result.error);
      return;
    }
    saveAccessoryInventory(result.items);
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
    saveAccessoryInventory(next);
    setInventory(next);
    setSelectedIds(new Set());
    setMsg(`${selectedIds.size} kayıt silindi.`);
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

  function commitSale() {
    if (!basket.length) {
      setMsg("Sepet boş.");
      return;
    }
    const deductLines = basket.flatMap((r) =>
      r.lines.map((l) => ({ productId: l.productId, saleQty: l.saleQty })),
    );
    const updated = deductAccessoryInventory(inventory, deductLines);
    saveAccessoryInventory(updated);
    setInventory(updated);
    appendAccessorySales(basket);
    reloadSales();
    setBasket([]);
    setMsg("Satış kaydedildi, stok düşüldü.");
  }

  const [histSel, setHistSel] = useState<Set<number>>(new Set());
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
        <div className="flex min-h-screen items-center justify-center text-lg font-semibold text-slate-600">
          Yükleniyor…
        </div>
      </main>
    );
  }

  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-amber-200/40 blur-3xl" />
        <div className="absolute right-0 top-16 h-96 w-96 rounded-full bg-orange-200/30 blur-3xl" />
      </div>

      <div className={pageShell}>
        <div className="mb-8 flex flex-wrap justify-between gap-4">
          <Link href="/urun-stok" className={`${btnSecondary} no-underline`}>
            ← Ürün & Stok Merkezi
          </Link>
          <Link href="/" className={`${btnSecondary} no-underline`}>
            Ana Panele Dön
          </Link>
        </div>

        <header className={`${panelClass} mb-8`}>
          <p className="text-sm font-black uppercase tracking-[0.3em] text-amber-700">Tespih & Takı</p>
          <h1 className="mt-3 text-4xl font-black xl:text-5xl">Tespih / Takı / Aksesuar</h1>
          <p className="mt-4 text-lg text-slate-600">
            Renk, ölçü ve model varyasyonları ayrı stok satırı olarak tutulur; satış adet bazlı, maliyet ve kâr otomatik
            hesaplanır.
          </p>
        </header>

        <div className="mb-6 flex flex-wrap gap-3">
          {(["stock", "pricing", "history"] as TabId[]).map((t) => (
            <button key={t} type="button" className={tabBtn(tab === t)} onClick={() => setTab(t)}>
              {t === "stock" ? "Ürün/Stok" : t === "pricing" ? "Satış & Fiyatlandırma" : "Satış Geçmişi"}
            </button>
          ))}
        </div>

        {msg ? (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base font-semibold text-amber-900">
            {msg}
          </p>
        ) : null}

        {tab === "stock" && (
          <div className="w-full space-y-6">
            <section className={panelClass}>
              <h2 className="mb-2 text-xl font-black">{editId ? "Kayıt Düzenle" : "Yeni Ürün Kaydı"}</h2>
              <p className="mb-6 text-sm font-semibold text-slate-600">
                Aynı ürünün farklı renk / ölçü / modeli için ayrı satır açın (ör. Kaplan Gözü Bileklik | 18 cm |
                Kahverengi).
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                <label className="block sm:col-span-2">
                  <span className="mb-2 block text-sm font-black">Ürün adı</span>
                  <input className={inputClass} value={name} onChange={(e) => setName(turkishUpper(e.target.value))} />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-black">Ürün grubu</span>
                  <select className={inputClass} value={productGroup} onChange={(e) => setProductGroup(e.target.value)}>
                    {PRODUCT_GROUPS.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-black">Ürün tipi / model</span>
                  <input className={inputClass} value={productModel} onChange={(e) => setProductModel(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-black">Malzeme</span>
                  <select className={inputClass} value={material} onChange={(e) => setMaterial(e.target.value)}>
                    {MATERIALS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-black">Renk</span>
                  <input className={inputClass} value={color} onChange={(e) => setColor(e.target.value)} placeholder="Kahverengi, Gümüş…" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-black">Ölçü / beden türü</span>
                  <select className={inputClass} value={sizeKind} onChange={(e) => setSizeKind(e.target.value)}>
                    {SIZE_KINDS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-black">Ölçü değeri</span>
                  <input
                    className={inputClass}
                    value={sizeDetail}
                    onChange={(e) => setSizeDetail(e.target.value)}
                    placeholder="18 cm, 45 cm, 33 tane…"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-black">Stok adedi</span>
                  <input className={inputClass} type="number" step="1" min="0" value={stockQty} onChange={(e) => setStockQty(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-black">Alış maliyeti (₺, toplam)</span>
                  <input className={inputClass} type="number" step="0.01" value={costTotal} onChange={(e) => setCostTotal(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-black">Satış fiyatı (₺, toplam)</span>
                  <input className={inputClass} type="number" step="0.01" value={salePriceTotal} onChange={(e) => setSalePriceTotal(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-black">Kâr oranı %</span>
                  <input className={inputClass} type="number" value={profitPct} onChange={(e) => setProfitPct(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-black">Barkod / ürün kodu (opsiyonel)</span>
                  <input className={inputClass} value={barcode} onChange={(e) => setBarcode(e.target.value)} />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-2 block text-sm font-black">Not</span>
                  <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
              </div>
              {stockUnitPreview ? (
                <div className="mt-4 rounded-2xl border-2 border-amber-200/90 bg-gradient-to-r from-amber-50/90 to-orange-50/80 p-5">
                  <p className="text-sm font-black uppercase tracking-wide text-amber-800">Birim maliyet özeti</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {stockUnitPreview.costPer != null ? (
                      <div className="rounded-xl border border-amber-200 bg-white/90 px-4 py-3">
                        <p className="text-xs font-black text-amber-700">Birim maliyet</p>
                        <p className="mt-1 text-lg font-black">{fmtUnitCost(stockUnitPreview.costPer)}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">Alış maliyeti ve stok adedi girildiğinde hesaplanır.</p>
                    )}
                    {stockUnitPreview.salePer != null ? (
                      <div className="rounded-xl border border-orange-200 bg-white/90 px-4 py-3">
                        <p className="text-xs font-black text-orange-700">Birim satış</p>
                        <p className="mt-1 text-lg font-black">{fmtUnitCost(stockUnitPreview.salePer)}</p>
                      </div>
                    ) : stockUnitPreview.suggestedSalePer != null ? (
                      <div className="rounded-xl border border-violet-200 bg-white/90 px-4 py-3">
                        <p className="text-xs font-black text-violet-700">Kâr %{profitPct} ile birim satış</p>
                        <p className="mt-1 text-lg font-black">{fmtUnitCost(stockUnitPreview.suggestedSalePer)}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-base font-bold">
                  <input type="checkbox" checked={addDelta} onChange={(e) => setAddDelta(e.target.checked)} className="h-5 w-5" />
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
                <p className="ml-auto text-base font-black text-amber-900">Stok değeri: {fmtMoney(stockValue)}</p>
              </div>
            </section>

            <section className={panelClass}>
              <div className="mb-4 grid gap-4 md:grid-cols-2">
                <input className={inputClass} placeholder="Ara…" value={search} onChange={(e) => setSearch(e.target.value)} />
                <select className={inputClass} value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
                  <option>Ürün (A→Z)</option>
                  <option>Ürün (Z→A)</option>
                  <option>Stok (Az→Çok)</option>
                  <option>Stok (Çok→Az)</option>
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1400px] text-base">
                  <thead>
                    <tr className="text-sm font-black uppercase text-amber-800">
                      <th className="p-2">Seç</th>
                      <th>No</th>
                      <th>Varyant</th>
                      <th>Grup</th>
                      <th>Model</th>
                      <th>Malzeme</th>
                      <th>Renk</th>
                      <th>Ölçü</th>
                      <th>Stok</th>
                      <th>Birim maliyet</th>
                      <th>Birim satış</th>
                      <th>Barkod</th>
                      <th>Foto</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {displayed.map((it, idx) => (
                      <tr key={it.id} className="border-t bg-white/80">
                        <td className="p-3 text-center">
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
                        <td className="p-3 text-center font-bold">{idx + 1}</td>
                        <td className="p-3 font-black">{formatVariantLabel(it)}</td>
                        <td className="p-3">{it.productGroup}</td>
                        <td className="p-3">{it.productModel || "—"}</td>
                        <td className="p-3">{it.material}</td>
                        <td className="p-3">{it.color || "—"}</td>
                        <td className="p-3">{formatSizeLabel(it)}</td>
                        <td className="p-3 font-semibold">{formatStockDisplay(it)}</td>
                        <td className="p-3 font-semibold">{fmtUnitCost(it.costPerUnit)}</td>
                        <td className="p-3 font-semibold">{fmtUnitCost(it.salePerUnit)}</td>
                        <td className="p-3">{it.barcode || "—"}</td>
                        <td className="p-3">
                          <button type="button" className="font-black text-amber-700 underline" onClick={() => setPhotoModal(it.photos)}>
                            {it.photos.length}
                          </button>
                        </td>
                        <td className="p-3">
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
          <div className="grid w-full gap-6 xl:grid-cols-[1.55fr_1fr]">
            <section className={`${panelClass} space-y-6`}>
              <div className="grid gap-4 lg:grid-cols-2">
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
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-5 py-4">
                  <p className="text-sm font-black text-amber-800">Kayıtlı birim fiyat</p>
                  <p className="mt-1 text-lg font-black">
                    {fmtUnitCost(picked.costPerUnit)}
                    <span className="mx-2 text-slate-400">·</span>
                    Satış: {fmtUnitCost(picked.salePerUnit)}
                  </p>
                </div>
              ) : null}
              {picked ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-black">Satılacak adet</span>
                    <input className={inputClass} type="number" step="1" min="1" value={saleQty} onChange={(e) => setSaleQty(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-black">Ek kâr % (opsiyonel)</span>
                    <input className={inputClass} value={checkoutProfitPct} onChange={(e) => setCheckoutProfitPct(e.target.value)} placeholder={String(picked.profitPct)} />
                  </label>
                </div>
              ) : null}
              {previewLine && !("error" in previewLine) && picked ? (
                <div className="space-y-3">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center text-base font-black">
                      Maliyet: {fmtMoney(previewLine.lineCost)}
                    </div>
                    <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-center text-base font-black">
                      Satış:{" "}
                      {fmtMoney(
                        toFloat(checkoutProfitPct, 0) > 0
                          ? previewLine.lineCost * (1 + toFloat(checkoutProfitPct, 0) / 100)
                          : previewLine.lineSale,
                      )}
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm font-semibold">
                      Stok düşümü: {fmtQty(previewLine.saleQty, 0)} adet
                    </div>
                  </div>
                  <p className="rounded-xl border border-amber-100 bg-white/90 px-4 py-3 text-center text-sm font-bold text-slate-800">
                    {formatLineCostBreakdown(previewLine.costPerUnit, previewLine.saleQty, previewLine.lineCost)}
                  </p>
                </div>
              ) : previewLine && "error" in previewLine ? (
                <p className="font-semibold text-red-700">{previewLine.error}</p>
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
                  <div key={i} className="rounded-2xl border bg-amber-50/50 p-4">
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
              <p className="mt-4 text-base font-black">Toplam satış: {fmtMoney(basket.reduce((s, r) => s + r.sale_price, 0))}</p>
              <div className="mt-6 flex flex-col gap-3">
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
            <div className="mb-6 flex flex-wrap gap-6 text-lg font-black">
              <span>Toplam Satış: {fmtMoney(histSummary.totalSale)}</span>
              <span>Toplam Kâr: {fmtMoney(histSummary.profit)}</span>
              <span>Satılan Ürün: {histSummary.soldUnits} adet</span>
              <span>Satış Kaydı: {histSummary.count}</span>
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
                saveAccessorySales(next);
                setSales(next);
                setHistSel(new Set());
              }}
            >
              Seçilenleri Sil
            </button>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-base">
                <thead>
                  <tr className="text-sm font-black uppercase text-amber-800">
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
                      <td className="p-3 text-center">{i + 1}</td>
                      <td className="p-3 text-center">
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
                      <td className="p-3">{rec.timestamp}</td>
                      <td className="p-3 font-semibold">{rec.name}</td>
                      <td className="p-3">{fmtMoney(rec.total_cost)}</td>
                      <td className="p-3">{fmtMoney(rec.sale_price)}</td>
                      <td className="p-3">
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
