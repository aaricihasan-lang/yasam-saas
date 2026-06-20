"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import {
  type InvItem,
  type SaleRecord,
  STONE_TYPES,
  addOrUpdateInventoryItem,
  appendSales,
  calcInventoryTotals,
  deductInventoryForSales,
  filesToDataUrls,
  filterInventory,
  fmtMoney,
  fmtTrim,
  formatTotalsCard,
  isDizi,
  loadSales,
  normalizeDiziInventory,
  saveInventory,
  saveSales,
  sortInventory,
  toFloat,
  turkishUpper,
  unitCostAndCurrency,
} from "@/lib/urun-stok/dogaltasStockLogic";
import { loadDogaltasInventoryForTenant } from "@/lib/urun-stok/dogaltasInventoryDb";
import { calculateCurrencyCost } from "@/lib/urun-stok/calculateCurrencyCost";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";

type TabId = "stock" | "pricing" | "history";

const pageBg =
  "relative w-full min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_12%_8%,rgba(251,191,36,0.14),transparent_32%),radial-gradient(circle_at_88%_12%,rgba(139,92,246,0.12),transparent_30%),linear-gradient(160deg,#fffbeb_0%,#f5f3ff_42%,#f0fdfa_100%)] text-slate-950";

const pageShell = "relative z-10 w-full px-5 py-4 lg:px-8 xl:px-12";

const panelClass =
  "w-full rounded-[18px] border-2 border-sky-200/80 bg-white/85 p-4 shadow-[0_8px_28px_rgba(15,23,42,0.07)] backdrop-blur-xl";

const inputClass =
  "h-10 w-full rounded-xl border-2 border-sky-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-200/40";

const btnPrimary =
  "inline-flex h-10 items-center justify-center rounded-xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-100 to-green-100 px-6 text-sm font-black text-emerald-900 shadow-md transition hover:scale-[1.02]";

const btnSecondary =
  "inline-flex h-9 items-center justify-center rounded-xl border-2 border-sky-200 bg-sky-50 px-4 text-sm font-black text-slate-800 transition hover:bg-sky-100";

const tabBtn = (active: boolean) =>
  `rounded-xl px-4 py-2 text-sm font-black transition ${
    active
      ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg"
      : "border-2 border-violet-200 bg-white/90 text-slate-700 hover:border-violet-400"
  }`;

function PhotoGalleryModal({
  photos,
  onClose,
}: {
  photos: string[];
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const safe = photos.length ? photos : [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-md">
      <div className="relative max-h-[90vh] w-full max-w-3xl rounded-[28px] border-2 border-white/90 bg-white p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black"
        >
          Kapat
        </button>
        <h3 className="mb-4 text-xl font-black text-slate-900">Fotoğraf Galerisi</h3>
        {safe.length === 0 ? (
          <p className="py-16 text-center text-slate-600">Fotoğraf yok.</p>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={safe[idx]}
              alt=""
              className="mx-auto max-h-[60vh] w-auto rounded-2xl object-contain"
            />
            <div className="mt-4 flex justify-center gap-3">
              <button
                type="button"
                className={btnSecondary}
                onClick={() => setIdx((i) => (i - 1 + safe.length) % safe.length)}
              >
                ◀ Önceki
              </button>
              <button
                type="button"
                className={btnSecondary}
                onClick={() => setIdx((i) => (i + 1) % safe.length)}
              >
                Sonraki ▶
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SalesDetailModal({ record, onClose }: { record: SaleRecord; onClose: () => void }) {
  const [gallery, setGallery] = useState<string[] | null>(null);
  const photos = record.photos || [];

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-md">
        <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border-2 border-white/90 bg-white shadow-2xl">
          <div className="border-b border-slate-100 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <h3 className="text-2xl font-black text-slate-900">Satış Detayı — {record.name}</h3>
              <button
                type="button"
                disabled={!photos.length}
                onClick={() => setGallery(photos)}
                className={btnSecondary}
              >
                Fotoğrafları Aç ({photos.length})
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-6">
            <table className="w-full min-w-[520px] border-separate border-spacing-y-2 text-base">
              <thead>
                <tr className="text-left text-sm font-black uppercase tracking-wide text-violet-800">
                  <th className="px-3 py-2">Taş</th>
                  <th className="px-3 py-2">Tür</th>
                  <th className="px-3 py-2 text-center">Birim ₺</th>
                  <th className="px-3 py-2 text-center">Adet</th>
                  <th className="px-3 py-2 text-center">Satır ₺</th>
                </tr>
              </thead>
              <tbody>
                {(record.lines || []).map((ln, i) => (
                  <tr key={i} className="rounded-xl bg-slate-50/80">
                    <td className="px-3 py-3 font-semibold">{ln.stone}</td>
                    <td className="px-3 py-3">{ln.type}</td>
                    <td className="px-3 py-3 text-center">{fmtTrim(ln.unit, 4)}</td>
                    <td className="px-3 py-3 text-center">{fmtTrim(ln.qty, 4)}</td>
                    <td className="px-3 py-3 text-center">{fmtTrim(ln.line_total, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-6 flex flex-wrap justify-end gap-6 text-lg font-black">
              <span>Maliyet: {fmtMoney(record.total_cost)}</span>
              <span className="text-emerald-800">Satış: {fmtMoney(record.sale_price)}</span>
            </div>
          </div>
          <div className="border-t border-slate-100 p-4 text-right">
            <button type="button" onClick={onClose} className={btnSecondary}>
              Kapat
            </button>
          </div>
        </div>
      </div>
      {gallery ? <PhotoGalleryModal photos={gallery} onClose={() => setGallery(null)} /> : null}
    </>
  );
}

type RecipeRow = {
  stone: string;
  type: string;
  currency: string;
  unit: number;
  qty: number;
};

export default function DogaltasUrunStokPage() {
  useBfcacheRefresh();
  const deleteConfirm = useDeleteConfirm();
  const committingRef = useRef(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [tab, setTab] = useState<TabId>("stock");
  const [inventory, setInventory] = useState<InvItem[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const reloadInventory = useCallback(async () => {
    const tenantId = await getSyncedTenantId();
    const { items: loaded } = await loadDogaltasInventoryForTenant(tenantId);
    let items = loaded;
    const { items: normalized, dirty } = normalizeDiziInventory(items);
    if (dirty) saveInventory(normalized);
    setInventory(dirty ? normalized : items);
  }, []);

  const reloadSales = useCallback(() => {
    setSales(loadSales());
  }, []);

  useEffect(() => {
    reloadInventory();
    reloadSales();
    setHydrated(true);
  }, [reloadInventory, reloadSales]);

  const [photoModal, setPhotoModal] = useState<string[] | null>(null);
  const [saleDetail, setSaleDetail] = useState<SaleRecord | null>(null);

  // ——— Stock tab state ———
  const [name, setName] = useState("");
  const [stoneType, setStoneType] = useState<string>(STONE_TYPES[0]);
  const [stokIn, setStokIn] = useState("");
  const [diziTl, setDiziTl] = useState("");
  const [diziUsd, setDiziUsd] = useState("");
  const [diziEur, setDiziEur] = useState("");
  const [stockUsdRate, setStockUsdRate] = useState("");
  const [stockEurRate, setStockEurRate] = useState("");
  const [adetTl, setAdetTl] = useState("");
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState("Taş Adı (A→Z)");
  const [critAdet, setCritAdet] = useState("3");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [stockMsg, setStockMsg] = useState<string | null>(null);

  const displayedStock = useMemo(() => {
    const filtered = filterInventory(inventory, search);
    return sortInventory(filtered, sortMode);
  }, [inventory, search, sortMode]);

  const stockTotals = useMemo(() => calcInventoryTotals(displayedStock), [displayedStock]);

  const critNum = toFloat(critAdet, 3);

  const stockCostPreview = useMemo(
    () =>
      calculateCurrencyCost({
        costTry: diziTl,
        costUsd: diziUsd,
        costEur: diziEur,
        usdRate: stockUsdRate,
        eurRate: stockEurRate,
        stockQty: stokIn,
      }),
    [diziTl, diziUsd, diziEur, stockUsdRate, stockEurRate, stokIn],
  );

  function handleAddStock() {
    setStockMsg(null);
    const result = addOrUpdateInventoryItem(inventory, {
      name: turkishUpper(name.trim()),
      type: stoneType,
      stokIn: toFloat(stokIn, 0),
      diziTlIn: toFloat(diziTl, 0),
      diziUsdIn: toFloat(diziUsd, 0),
      diziEurIn: toFloat(diziEur, 0),
      usdRateIn: toFloat(stockUsdRate, 0),
      eurRateIn: toFloat(stockEurRate, 0),
      adetTlIn: toFloat(adetTl, 0),
      pendingPhotos,
    });
    if (!result.ok) {
      setStockMsg(result.error);
      return;
    }
    let items = result.items;
    const norm = normalizeDiziInventory(items);
    items = norm.items;
    saveInventory(items);
    setInventory(items);
    setName("");
    setStokIn("");
    setDiziTl("");
    setDiziUsd("");
    setDiziEur("");
    setAdetTl("");
    setPendingPhotos([]);
  }

  async function deleteSelectedStock() {
    if (selectedKeys.size === 0) {
      setStockMsg("Silmek için en az bir satır seçin.");
      return;
    }
    const ok = await deleteConfirm({
      title: "Stok kaydı silinecek",
      message: `Seçili ${selectedKeys.size} stok kaydı kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
    });
    if (!ok) return;
    const next = inventory.filter((it) => !selectedKeys.has(`${itemKeyFrom(it)}`));
    saveInventory(next);
    setInventory(next);
    setSelectedKeys(new Set());
    setStockMsg(`${selectedKeys.size} kayıt silindi.`);
  }

  function itemKeyFrom(it: InvItem) {
    return `${(it.name || "").trim().toLowerCase()}|${(it.type || "").trim().toLowerCase()}`;
  }

  function openStockPhotos(it: InvItem) {
    if (!it.photos?.length) {
      setStockMsg("Bu kayıtta fotoğraf yok.");
      return;
    }
    setPhotoModal(it.photos);
  }

  // ——— Pricing tab state ———
  const [invSearch, setInvSearch] = useState("");
  const [pickKey, setPickKey] = useState("");
  const [recipeRows, setRecipeRows] = useState<RecipeRow[]>([]);
  const [productName, setProductName] = useState("");
  const [productPhotos, setProductPhotos] = useState<string[]>([]);
  const [usdRate, setUsdRate] = useState("");
  const [eurRate, setEurRate] = useState("");
  const [profitPct, setProfitPct] = useState("100");
  const [basket, setBasket] = useState<SaleRecord[]>([]);
  const [pricingMsg, setPricingMsg] = useState<string | null>(null);

  const pickList = useMemo(() => {
    const q = invSearch.trim().toLowerCase();
    let list = inventory.filter(
      (it) =>
        !q ||
        (it.name || "").toLowerCase().includes(q) ||
        (it.type || "").toLowerCase().includes(q),
    );
    list = [...list].sort((a, b) => {
      const na = (a.name || "").replace(/İ/g, "i").replace(/I/g, "i").replace(/ı/g, "i");
      const nb = (b.name || "").replace(/İ/g, "i").replace(/I/g, "i").replace(/ı/g, "i");
      return na.localeCompare(nb, "tr", { sensitivity: "base" });
    });
    return list;
  }, [inventory, invSearch]);

  const recipeCost = useMemo(
    () => recipeRows.reduce((s, r) => s + r.unit * r.qty, 0),
    [recipeRows],
  );

  const profitPctNum = toFloat(profitPct, 100);
  const salePrice = recipeCost * (1 + profitPctNum / 100);
  const profitAmount = salePrice - recipeCost;

  function addRecipeLine() {
    const it = inventory.find((i) => itemKeyFrom(i) === pickKey);
    if (!it) {
      setPricingMsg("Önce envanterden bir taş seçin.");
      return;
    }
    const rate = toFloat(usdRate, 0);
    const rateEur = toFloat(eurRate, 0);
    const { unit, currency, warning } = unitCostAndCurrency(it, rate, rateEur);
    if (warning) {
      setPricingMsg(warning);
      return;
    }
    if (unit <= 0) {
      setPricingMsg(
        "Bu taş için geçerli bir birim maliyet hesaplanamadı. Lütfen en az Dizi $, Dizi ₺ veya Adet ₺ değerlerinden biri dolu olsun.",
      );
      return;
    }
    setRecipeRows((prev) => [
      ...prev,
      { stone: it.name, type: it.type, currency, unit, qty: 1 },
    ]);
    setPricingMsg(null);
  }

  function addToBasket() {
    const product = turkishUpper(productName.trim());
    if (!product) {
      setPricingMsg("Ürün adı girin.");
      return;
    }
    if (recipeRows.length === 0) {
      setPricingMsg("Önce ürüne ait taşları ekleyin.");
      return;
    }
    const lines = recipeRows
      .filter((r) => r.unit > 0 && r.qty > 0)
      .map((r) => ({
        stone: r.stone,
        type: r.type,
        currency: r.currency,
        unit: r.unit,
        qty: r.qty,
        line_total: r.unit * r.qty,
      }));
    if (!lines.length) {
      setPricingMsg("Geçerli satır bulunamadı.");
      return;
    }
    const total_cost = lines.reduce((s, l) => s + l.line_total, 0);
    const sale_price = total_cost * (1 + profitPctNum / 100);
    const rec: SaleRecord = {
      name: product,
      lines,
      total_cost,
      sale_price,
      profit_pct: profitPctNum,
      photos: [...productPhotos],
      timestamp: new Date().toISOString().slice(0, 19).replace("T", " "),
    };
    setBasket((b) => [...b, rec]);
    setRecipeRows([]);
    setProductName("");
    setProductPhotos([]);
    setInvSearch("");
    setPickKey("");
    setPricingMsg(null);
  }

  function commitSale() {
    if (committingRef.current) return;
    if (!basket.length) {
      setPricingMsg("Kaydedilecek satış yok.");
      return;
    }
    committingRef.current = true;
    setIsCommitting(true);
    try {
      const updated = deductInventoryForSales(inventory, basket);
      saveInventory(updated);
      setInventory(updated);
      appendSales(basket);
      reloadSales();
      setBasket([]);
      setPricingMsg("Satışlar kaydedildi ve stoktan düşüldü.");
    } finally {
      committingRef.current = false;
      setIsCommitting(false);
    }
  }

  const [historySelected, setHistorySelected] = useState<Set<number>>(new Set());

  const salesSummary = useMemo(() => {
    const totalSale = sales.reduce((s, r) => s + (r.sale_price || 0), 0);
    const totalCost = sales.reduce((s, r) => s + (r.total_cost || 0), 0);
    return { totalSale, totalCost, profit: totalSale - totalCost, count: sales.length };
  }, [sales]);

  async function deleteSelectedSales() {
    if (!historySelected.size) {
      setStockMsg("Silmek için en az bir satır seçin.");
      return;
    }
    const ok = await deleteConfirm({
      title: "Satış kaydı silinecek",
      message: `Seçili ${historySelected.size} satış kaydı silinecek. Satılan miktarlar stoğa geri eklenecektir.`,
    });
    if (!ok) return;
    const toDelete = sales.filter((_, i) => historySelected.has(i));
    let inv = [...inventory];
    const missing: string[] = [];
    let restoredCount = 0;
    for (const rec of toDelete) {
      for (const line of (rec.lines || [])) {
        const qty = line.qty || 0;
        if (qty <= 0) continue;
        const lineKey = `${(line.stone || "").trim().toLowerCase()}|${(line.type || "").trim().toLowerCase()}`;
        const idx = inv.findIndex((it) => itemKeyFrom(it) === lineKey);
        if (idx < 0) { missing.push(line.stone || "?"); continue; }
        const it = { ...inv[idx], photos: [...(inv[idx].photos || [])] };
        it.adet = (it.adet || 0) + qty;
        if (isDizi(it.type) && (it.adet_price || 0) > 0) {
          it.dizi_price = Math.round(it.adet_price * it.adet * 100) / 100;
        }
        inv[idx] = it;
        restoredCount++;
      }
    }
    saveInventory(inv);
    setInventory(inv);
    const next = sales.filter((_, i) => !historySelected.has(i));
    saveSales(next);
    setSales(next);
    setHistorySelected(new Set());
    if (missing.length > 0) {
      setStockMsg(`${toDelete.length} satış silindi. Uyarı: ${[...new Set(missing)].join(", ")} stoğu bulunamadı, iade yapılamadı.`);
    } else {
      setStockMsg(`${toDelete.length} satış silindi, ${restoredCount} stok kalemi güncellendi.`);
    }
  }

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
        <div className="absolute -left-24 top-0 h-80 w-80 rounded-full bg-amber-200/35 blur-3xl" />
        <div className="absolute right-0 top-20 h-96 w-96 rounded-full bg-violet-200/30 blur-3xl" />
      </div>

      <div className={pageShell}>
        <header className={`${panelClass} mb-4 w-full`}>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-800">Doğaltaş</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900">Ürün / Stok Yönetimi</h1>
          <p className="mt-1 text-sm font-medium text-slate-600">
            Mevcut taşlar, satış fiyatlandırma ve satış geçmişi — masaüstü stok mantığıyla.
          </p>
        </header>

        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" className={tabBtn(tab === "stock")} onClick={() => setTab("stock")}>
            Mevcut Taşlarım
          </button>
          <button type="button" className={tabBtn(tab === "pricing")} onClick={() => setTab("pricing")}>
            Satış & Fiyatlandırma
          </button>
          <button type="button" className={tabBtn(tab === "history")} onClick={() => setTab("history")}>
            Satış Geçmişi
          </button>
        </div>

        {tab === "stock" && (
          <div className="w-full space-y-6">
            <section className={`${panelClass} w-full`}>
              <h2 className="mb-3 text-base font-black text-slate-900">Yeni Kayıt Ekle</h2>
              <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-slate-700">Taş adı</span>
                  <input
                    className={inputClass}
                    value={name}
                    onChange={(e) => setName(turkishUpper(e.target.value))}
                    placeholder="Örn. SİTRİN"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-slate-700">Tür</span>
                  <select
                    className={inputClass}
                    value={stoneType}
                    onChange={(e) => setStoneType(e.target.value)}
                  >
                    {STONE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-slate-700">Stok adedi (+/-)</span>
                  <input
                    className={inputClass}
                    type="number"
                    value={stokIn}
                    onChange={(e) => setStokIn(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-slate-700">
                    Dizi / ürün maliyeti TL
                  </span>
                  <input
                    className={inputClass}
                    type="number"
                    step="0.01"
                    value={diziTl}
                    onChange={(e) => setDiziTl(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-slate-700">
                    Dizi / ürün maliyeti USD
                  </span>
                  <input
                    className={inputClass}
                    type="number"
                    step="0.01"
                    value={diziUsd}
                    onChange={(e) => setDiziUsd(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-slate-700">
                    Dizi / ürün maliyeti EUR
                  </span>
                  <input
                    className={inputClass}
                    type="number"
                    step="0.01"
                    value={diziEur}
                    onChange={(e) => setDiziEur(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-black text-slate-700">
                    Adet ₺ (otomatik / manuel)
                  </span>
                  <input
                    className={inputClass}
                    type="number"
                    step="0.01"
                    value={adetTl}
                    onChange={(e) => setAdetTl(e.target.value)}
                  />
                </label>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_1.2fr]">
                <div className="rounded-xl border-2 border-sky-200/90 bg-gradient-to-br from-sky-50 via-white to-violet-50/80 p-3 shadow-sm">
                  <p className="text-xs font-black uppercase tracking-wide text-violet-800">
                    Güncel kurlar
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-sm font-bold text-slate-700">
                        Dolar kuru
                      </span>
                      <input
                        className="h-9 w-full rounded-lg border-2 border-sky-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-violet-400"
                        type="number"
                        step="0.0001"
                        value={stockUsdRate}
                        onChange={(e) => setStockUsdRate(e.target.value)}
                        placeholder="Örn. 34.50"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-bold text-slate-700">
                        Euro kuru
                      </span>
                      <input
                        className="h-9 w-full rounded-lg border-2 border-sky-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-violet-400"
                        type="number"
                        step="0.0001"
                        value={stockEurRate}
                        onChange={(e) => setStockEurRate(e.target.value)}
                        placeholder="Örn. 37.20"
                      />
                    </label>
                  </div>
                </div>
                <div className="rounded-xl border-2 border-emerald-200/90 bg-gradient-to-br from-emerald-50 via-white to-teal-50/80 p-3 shadow-sm lg:col-span-2">
                  <p className="text-xs font-black uppercase tracking-wide text-emerald-900">
                    Anlık maliyet özeti
                  </p>
                  <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    <p className="text-sm font-semibold text-slate-800">
                      Toplam TL maliyet:{" "}
                      <span className="font-black text-emerald-900">
                        {fmtMoney(stockCostPreview.totalCostTry)}
                      </span>
                    </p>
                    <p className="text-base font-semibold text-slate-800">
                      Birim TL maliyet:{" "}
                      <span className="font-black text-emerald-900">
                        {stockCostPreview.unitCostTry != null
                          ? fmtMoney(stockCostPreview.unitCostTry)
                          : "—"}
                      </span>
                    </p>
                  </div>
                  {stockCostPreview.errors.map((msg) => (
                    <p
                      key={msg}
                      className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900"
                    >
                      {msg}
                    </p>
                  ))}
                  {stockCostPreview.warnings.map((msg) => (
                    <p
                      key={msg}
                      className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950"
                    >
                      {msg}
                    </p>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="cursor-pointer">
                  <span className={`${btnSecondary} inline-flex`}>
                    ({pendingPhotos.length} foto) Foto Seç…
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const files = e.target.files;
                      if (!files?.length) return;
                      const urls = await filesToDataUrls(files);
                      setPendingPhotos(urls);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button type="button" className={btnPrimary} onClick={handleAddStock}>
                  Ekle
                </button>
                <p className="ml-auto rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-black text-amber-950">
                  {formatTotalsCard(stockTotals.totalTl, stockTotals.totalUsd)}
                </p>
              </div>
              {stockMsg ? (
                <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                  {stockMsg}
                </p>
              ) : null}
            </section>

            <section className={`${panelClass} w-full`}>
              <div className="mb-3 grid gap-3 md:grid-cols-3">
                <input
                  className={inputClass}
                  placeholder="Ara / Filtre…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select className={inputClass} value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
                  <option>Taş Adı (A→Z)</option>
                  <option>Taş Adı (Z→A)</option>
                  <option>Tür (A→Z)</option>
                  <option>Stok (Az→Çok)</option>
                  <option>Stok (Çok→Az)</option>
                </select>
                <input
                  className={inputClass}
                  type="number"
                  value={critAdet}
                  onChange={(e) => setCritAdet(e.target.value)}
                  placeholder="Kritik (Adet)"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] border-separate border-spacing-y-2 text-base">
                  <thead>
                    <tr className="text-left text-sm font-black uppercase tracking-wide text-violet-800">
                      <th className="w-12 px-2 py-3">Seç</th>
                      <th className="w-12 px-2 py-3">No</th>
                      <th className="px-4 py-3">Taş Adı</th>
                      <th className="px-4 py-3">Tür</th>
                      <th className="px-4 py-3 text-center">Stok</th>
                      <th className="px-4 py-3 text-center">TL ₺</th>
                      <th className="px-4 py-3 text-center">USD $</th>
                      <th className="px-4 py-3 text-center">EUR €</th>
                      <th className="px-4 py-3 text-center">Toplam TL</th>
                      <th className="px-4 py-3 text-center">Birim TL</th>
                      <th className="px-4 py-3 text-center">Adet ₺</th>
                      <th className="px-4 py-3 text-center">Foto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedStock.map((it, idx) => {
                      const key = itemKeyFrom(it);
                      const critical = (it.adet || 0) <= critNum;
                      return (
                        <tr
                          key={key}
                          className={`rounded-xl ${critical ? "bg-red-100/80" : "bg-white/90"} shadow-sm`}
                        >
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              className="h-5 w-5"
                              checked={selectedKeys.has(key)}
                              onChange={(e) => {
                                setSelectedKeys((prev) => {
                                  const n = new Set(prev);
                                  if (e.target.checked) n.add(key);
                                  else n.delete(key);
                                  return n;
                                });
                              }}
                            />
                          </td>
                          <td className="px-2 py-2 text-center font-bold">{idx + 1}</td>
                          <td className="px-4 py-2 font-black">{it.name}</td>
                          <td className="px-4 py-2 font-semibold">{it.type}</td>
                          <td className="px-4 py-2 text-center font-semibold">
                            {Math.round(it.adet || 0)}
                          </td>
                          <td className="px-4 py-2 text-center">{(it.dizi_price || 0).toFixed(2)}</td>
                          <td className="px-4 py-2 text-center">{(it.dizi_price_usd || 0).toFixed(2)}</td>
                          <td className="px-4 py-2 text-center">{(it.dizi_price_eur || 0).toFixed(2)}</td>
                          <td className="px-4 py-2 text-center font-semibold text-emerald-900">
                            {(it.total_cost_try || 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-center font-semibold text-emerald-800">
                            {(it.unit_cost_try || 0).toFixed(4)}
                          </td>
                          <td className="px-4 py-2 text-center">{(it.adet_price || 0).toFixed(2)}</td>
                          <td className="px-4 py-2 text-center">
                            <button
                              type="button"
                              className="font-black text-violet-700 underline"
                              onClick={() => openStockPhotos(it)}
                            >
                              {it.photos?.length || 0} foto
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" className={btnSecondary} onClick={() => void deleteSelectedStock()}>
                  Seçilenleri Sil
                </button>
              </div>
            </section>
          </div>
        )}

        {tab === "pricing" && (
          <div className="grid w-full gap-4 xl:grid-cols-[1.55fr_1fr] 2xl:grid-cols-[1.65fr_1fr]">
            <section className={`${panelClass} w-full space-y-4`}>
              <div className="grid w-full gap-4 lg:grid-cols-2 xl:grid-cols-2">
                <input
                  className={inputClass}
                  placeholder="Taş ara (envanterden)"
                  value={invSearch}
                  onChange={(e) => setInvSearch(turkishUpper(e.target.value))}
                />
                <select
                  className={inputClass}
                  value={pickKey}
                  onChange={(e) => setPickKey(e.target.value)}
                >
                  <option value="">— Taş seç —</option>
                  {pickList.map((it) => (
                    <option key={itemKeyFrom(it)} value={itemKeyFrom(it)}>
                      {it.name} ({it.type})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" className={btnPrimary} onClick={addRecipeLine}>
                  Satıra Ekle
                </button>
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => {
                    setRecipeRows([]);
                    setProductPhotos([]);
                  }}
                >
                  Çalışma Alanını Temizle
                </button>
              </div>

              <input
                className={inputClass}
                placeholder="Ürün adı"
                value={productName}
                onChange={(e) => setProductName(turkishUpper(e.target.value))}
              />
              <label className="inline-block cursor-pointer">
                <span className={btnSecondary}>
                  ({productPhotos.length} foto) Ürün Fotoğrafı Seç
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files;
                    if (!f?.length) return;
                    setProductPhotos(await filesToDataUrls(f));
                    e.target.value = "";
                  }}
                />
              </label>

              <div className="rounded-xl border-2 border-sky-200/90 bg-gradient-to-br from-sky-50 via-white to-violet-50/80 p-3">
                <p className="text-xs font-black uppercase tracking-wide text-violet-800">
                  Satış fiyatlandırma kurları
                </p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold text-slate-700">
                      Güncel Dolar Kuru
                    </span>
                    <input
                      className={inputClass}
                      type="number"
                      step="0.0001"
                      value={usdRate}
                      onChange={(e) => setUsdRate(e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-bold text-slate-700">
                      Güncel Euro Kuru
                    </span>
                    <input
                      className={inputClass}
                      type="number"
                      step="0.0001"
                      value={eurRate}
                      onChange={(e) => setEurRate(e.target.value)}
                    />
                  </label>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-base">
                  <thead>
                    <tr className="text-sm font-black text-violet-800">
                      <th className="px-2 py-2">Taş</th>
                      <th className="px-2 py-2">Tür</th>
                      <th className="px-2 py-2">Para</th>
                      <th className="px-2 py-2">Birim</th>
                      <th className="px-2 py-2">Adet</th>
                      <th className="px-2 py-2">Satır ₺</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {recipeRows.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="py-2 font-semibold">{r.stone}</td>
                        <td className="py-2">{r.type}</td>
                        <td className="py-2 text-center">{r.currency}</td>
                        <td className="py-2 text-center">{fmtTrim(r.unit, 4)}</td>
                        <td className="py-2">
                          <input
                            className="h-10 w-20 rounded-lg border border-sky-200 text-center"
                            type="number"
                            min="0.0001"
                            step="any"
                            value={r.qty}
                            onChange={(e) => {
                              const qty = Math.max(toFloat(e.target.value, 1), 0.0001);
                              setRecipeRows((rows) =>
                                rows.map((row, j) => (j === i ? { ...row, qty } : row)),
                              );
                            }}
                          />
                        </td>
                        <td className="py-2 text-center font-bold">{fmtTrim(r.unit * r.qty, 4)}</td>
                        <td className="py-2">
                          <button
                            type="button"
                            className="text-sm font-black text-red-600"
                            onClick={() => setRecipeRows((rows) => rows.filter((_, j) => j !== i))}
                          >
                            Sil
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-4">
                <label className="flex items-center gap-2 font-black">
                  Kâr Oranı %
                  <input
                    className="h-12 w-24 rounded-xl border-2 border-sky-200 px-3 text-center"
                    value={profitPct}
                    onChange={(e) => setProfitPct(e.target.value)}
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-center">
                  <p className="text-sm font-bold text-slate-500">Toplam Maliyet</p>
                  <p className="text-xl font-black">{fmtMoney(recipeCost)}</p>
                </div>
                <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-center">
                  <p className="text-sm font-bold text-slate-500">Kâr Tutarı</p>
                  <p className="text-xl font-black">{fmtMoney(profitAmount)}</p>
                </div>
                <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-center">
                  <p className="text-sm font-bold text-slate-500">Satış Fiyatı</p>
                  <p className="text-xl font-black text-emerald-900">{fmtMoney(salePrice)}</p>
                </div>
              </div>

              <button type="button" className={`${btnPrimary} w-full`} onClick={addToBasket}>
                Sepete Ekle
              </button>
              {pricingMsg ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                  {pricingMsg}
                </p>
              ) : null}
            </section>

            <section className={`${panelClass} w-full`}>
              <h2 className="mb-4 text-xl font-black">Sepet</h2>
              <div className="space-y-3">
                {basket.map((rec, i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                  >
                    <p className="font-black">{rec.name}</p>
                    <p className="text-sm text-slate-600">
                      Maliyet {fmtMoney(rec.total_cost)} · Satış {fmtMoney(rec.sale_price)}
                    </p>
                    <p className="text-sm">{(rec.photos || []).length} foto</p>
                    <button
                      type="button"
                      className="mt-2 text-sm font-black text-red-600"
                      onClick={() => setBasket((b) => b.filter((_, j) => j !== i))}
                    >
                      Sil
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-4 font-black">
                Ürün: {basket.length} · Toplam Satış:{" "}
                {fmtMoney(basket.reduce((s, r) => s + r.sale_price, 0))}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <button type="button" className={btnSecondary} onClick={() => setBasket([])}>
                  Sepeti Temizle
                </button>
                <button type="button" className={btnPrimary} onClick={commitSale} disabled={isCommitting}>
                  {isCommitting ? "Kaydediliyor…" : "Satışı Kaydet"}
                </button>
              </div>
            </section>
          </div>
        )}

        {tab === "history" && (
          <section className={`${panelClass} w-full`}>
            <div className="mb-4 flex flex-wrap gap-4 text-base font-black">
              <span>Toplam Satış: {fmtMoney(salesSummary.totalSale)}</span>
              <span>Toplam Kâr: {fmtMoney(salesSummary.profit)}</span>
              <span>Satılan Ürün: {salesSummary.count}</span>
            </div>
            <button type="button" className={`${btnSecondary} mb-4`} onClick={() => void deleteSelectedSales()}>
              Seçilenleri Sil
            </button>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-base">
                <thead>
                  <tr className="text-sm font-black uppercase text-violet-800">
                    <th className="px-2 py-3">No</th>
                    <th className="px-2 py-3">Seç</th>
                    <th className="px-4 py-3">Tarih</th>
                    <th className="px-4 py-3">Ürün</th>
                    <th className="px-4 py-3">Maliyet</th>
                    <th className="px-4 py-3">Satış</th>
                    <th className="px-4 py-3">Detay</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((rec, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-2 py-2 text-center">{i + 1}</td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          className="h-5 w-5"
                          checked={historySelected.has(i)}
                          onChange={(e) => {
                            setHistorySelected((prev) => {
                              const n = new Set(prev);
                              if (e.target.checked) n.add(i);
                              else n.delete(i);
                              return n;
                            });
                          }}
                        />
                      </td>
                      <td className="px-4 py-2">{rec.timestamp}</td>
                      <td className="px-4 py-2 font-semibold">{rec.name}</td>
                      <td className="px-4 py-2">{fmtMoney(rec.total_cost)}</td>
                      <td className="px-4 py-2">{fmtMoney(rec.sale_price)}</td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          className="font-black text-violet-700 underline"
                          onClick={() => setSaleDetail(rec)}
                        >
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
