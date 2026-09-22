"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { runInEffect } from "@/lib/runInEffect";
import { getSyncedTenantId, MISSING_SESSION_TENANT_MESSAGE } from "@/lib/auth/sessionTenant";
import { readYasamUser, getYasamUserDisplayName } from "@/lib/auth/yasamUser";
import { BlendRecetePrint, type PrintableBlend } from "./_components/BlendRecetePrint";
import { AromaterapiModuleNav } from "@/app/aromaterapi/_components/AromaterapiModuleNav";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { useAromaterapiDirtyGuard } from "@/app/aromaterapi/_components/write/useAromaterapiDirtyGuard";
import { downloadWord } from "@/lib/aromaterapi/wordExport";
import {
  fetchOilSearch,
  fetchOilDetail,
  type OilListRow,
} from "@/lib/aromaterapi/aromatherapyData";
import {
  BOTTLE_ML_PRESETS,
  DILUTION_PERCENT_PRESETS,
  DEFAULT_DROPS_PER_ML,
  calcTotalDrops,
  distributeEqually,
  sumDrops,
  fillStatus,
  collectSafetyWarnings,
  makeBlendItem,
  validateBlendInput,
  fetchBlends,
  saveBlend,
  updateBlend,
  deleteBlend,
  blendToInput,
  BLEND_STALE_MESSAGE,
  type BlendItem,
  type Blend,
} from "@/lib/aromaterapi/blendData";
import { derivePhotosensitivity, type PhotosensitivityStatus } from "@/lib/aromaterapi/oilFields";

const pageBg =
  "relative min-h-screen bg-[radial-gradient(ellipse_at_top_left,#fdf4ff_0%,#fff7ed_50%,#f8fafc_100%)] text-slate-950";
const panel =
  "rounded-[20px] border border-amber-200/50 bg-white/85 p-4 shadow-sm backdrop-blur-xl";
const label = "block text-[11px] font-black uppercase tracking-[0.1em] text-amber-800 mb-1";
const input =
  "w-full rounded-xl border border-amber-200/70 bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200";
const chip = (active: boolean) =>
  `rounded-full border px-3 py-1 text-[12px] font-bold transition ${
    active ? "border-amber-400 bg-amber-500 text-white shadow-sm" : "border-amber-200 bg-white/80 text-slate-600 hover:border-amber-300"
  }`;

// eşit dağıt yardımcısı
function redistribute(items: BlendItem[], total: number): BlendItem[] {
  const drops = distributeEqually(total, items.length);
  return items.map((it, i) => ({ ...it, drops: drops[i] ?? 0 }));
}

// ARO-020 — güvenli sayı ayrıştırıcı. Türkçe virgülü noktaya çevirir; NaN → 0.
// Opsiyonel üst sınır (ARO-022 clamp) uygulanır.
function parseNum(v: string | number, max?: number): number {
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  const nonNeg = Math.max(0, n);
  return typeof max === "number" ? Math.min(max, nonNeg) : nonNeg;
}

const MAX_BOTTLE_ML = 2000; // ARO-022
const MAX_DILUTION_PCT = 100; // ARO-022

export default function KarisimOlusturucuPage() {
  const { showToast } = useToast();
  const deleteConfirm = useDeleteConfirm();

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Sol panel
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const [carrierId, setCarrierId] = useState<string | null>(null);
  // ARO-024 — taşıyıcı yağ güvenlik snapshot'ı (fotosensitivite/kontrendikasyon/not).
  const [carrierPhoto, setCarrierPhoto] = useState<PhotosensitivityStatus>("unknown");
  const [carrierContra, setCarrierContra] = useState("");
  const [carrierNotes, setCarrierNotes] = useState("");
  const [bottleMl, setBottleMl] = useState<number>(30);
  const [dilution, setDilution] = useState<number>(2);
  // ARO-021 — kayıttan yüklenen drops_per_ml korunur (20 hardcode etmeyiz).
  const [dropsPerMl, setDropsPerMl] = useState<number>(DEFAULT_DROPS_PER_ML);
  // ARO-019 — kullanıcı damlaları elle düzenlediyse ekle/çıkar otomatik dağıtmaz.
  const [manualDrops, setManualDrops] = useState(false);

  // Orta panel (uçucu yağ arama) — FAZ 2: server typeahead (fetch-all YOK).
  const [searchResults, setSearchResults] = useState<OilListRow[]>([]);
  const [carrierOils, setCarrierOils] = useState<OilListRow[]>([]);
  const [search, setSearch] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);

  // Sağ panel (sepet)
  const [items, setItems] = useState<BlendItem[]>([]);

  // Kaydedilenler
  const [saved, setSaved] = useState<Blend[]>([]);
  const [savedError, setSavedError] = useState<string | null>(null); // ARO-017
  const [saving, setSaving] = useState(false);
  const [copyingId, setCopyingId] = useState<string | null>(null); // ARO-007 çift-tık kilidi
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingUpdatedAt, setEditingUpdatedAt] = useState<string | null>(null); // ARO-008
  const [staleConflict, setStaleConflict] = useState(false); // ARO-008 çakışma bandı

  // Yazdırılabilir reçete
  const [printBlend, setPrintBlend] = useState<PrintableBlend | null>(null);
  const [printDate, setPrintDate] = useState("");
  const expertName = useMemo(() => getYasamUserDisplayName(readYasamUser()), []);

  // FAZ 3 — kaydedilmemiş karışım koruması (beforeunload). Boş/pristine builder'da
  // guard YOK (false-positive yok); ad/not/taşıyıcı/yağ girildiyse aktifleşir. Kayıt
  // başarılı → resetForm() içerikleri temizler → isBlendDirty false olur.
  const isBlendDirty =
    name.trim() !== "" || notes.trim() !== "" || carrierName.trim() !== "" || items.length > 0;
  useAromaterapiDirtyGuard(isBlendDirty);

  // FAZ Word — karışım export (tek / tümü). Çift-tık kilidi.
  const [blendExporting, setBlendExporting] = useState(false);
  async function exportBlendWord(url: string, body?: unknown) {
    if (blendExporting) return;
    setBlendExporting(true);
    const { ok, error } = await downloadWord(url, body);
    setBlendExporting(false);
    if (ok) showToast({ title: "Word hazırlandı", message: "Karışım raporu indiriliyor.", type: "success" });
    else showToast({ title: "Word oluşturulamadı", message: error ?? "Rapor oluşturulamadı.", type: "error" });
  }

  // printBlend hazır olunca render sonrası yazdır; kullanıcı "PDF olarak kaydet" der.
  useEffect(() => {
    if (!printBlend) return;
    const clear = () => setPrintBlend(null);
    window.addEventListener("afterprint", clear);
    const t = window.setTimeout(() => window.print(), 120);
    return () => { window.removeEventListener("afterprint", clear); window.clearTimeout(t); };
  }, [printBlend]);

  function printReceteFor(blend: PrintableBlend) {
    setPrintDate(new Date().toLocaleDateString("tr-TR"));
    setPrintBlend(blend);
  }
  // Kayıtlı karışımı yazdır — güvenlik snapshot tarihi kaydın updated_at/created_at'idir (ARO-023).
  function printSavedBlend(b: Blend) {
    printReceteFor({
      name: b.name,
      notes: b.notes,
      carrier_oil_name: b.carrier_oil_name,
      carrier_photosensitivity_status: b.carrier_photosensitivity_status ?? "unknown",
      carrier_contraindications: b.carrier_contraindications ?? "",
      carrier_safety_notes: b.carrier_safety_notes ?? "",
      bottle_ml: b.bottle_ml,
      dilution_percent: b.dilution_percent,
      total_drops: b.total_drops,
      items: b.items,
      snapshotDate: b.updated_at ?? b.created_at ?? undefined,
    });
  }
  function printActiveBlend() {
    if (items.length === 0) { showToast({ title: "Boş karışım", message: "Reçete için en az bir yağ ekleyin.", type: "warning" }); return; }
    printReceteFor({
      name: name || "(Adsız karışım)",
      notes,
      carrier_oil_name: carrierName,
      carrier_photosensitivity_status: carrierPhoto,
      carrier_contraindications: carrierContra,
      carrier_safety_notes: carrierNotes,
      bottle_ml: bottleMl,
      dilution_percent: dilution,
      total_drops: targetDrops,
      items,
      snapshotDate: new Date().toLocaleDateString("tr-TR"),
    });
  }

  // Not: useMemo DEĞİL — `printActiveBlend` bu değeri tanımından önce (closure) kullanıyor;
  // React Compiler manuel memoizasyonu bu sırada koruyamıyor (preserve-manual-memoization).
  // Saf/ucuz hesap; React Compiler zaten otomatik memoize eder → davranış aynı.
  const targetDrops = calcTotalDrops(bottleMl, dilution, dropsPerMl);
  const currentDrops = useMemo(() => sumDrops(items), [items]);
  const status = fillStatus(currentDrops, targetDrops);
  const safety = useMemo(
    () =>
      collectSafetyWarnings(
        items,
        carrierName.trim()
          ? {
              oil_name: carrierName,
              photosensitivity_status: carrierPhoto,
              contraindications: carrierContra,
              safety_notes: carrierNotes,
            }
          : null,
      ),
    [items, carrierName, carrierPhoto, carrierContra, carrierNotes],
  );

  const loadSaved = useCallback(async () => {
    const { blends, error } = await fetchBlends();
    // ARO-017 — hatayı yutma; mevcut listeyi koru, hata durumunu göster.
    if (error) { setSavedError(error); return; }
    setSavedError(null);
    setSaved(blends);
  }, []);

  useEffect(() => {
    runInEffect(() => {
      void (async () => {
        const tid = await getSyncedTenantId();
        setTenantId(tid);
        if (!tid) { setErrorMsg(MISSING_SESSION_TENANT_MESSAGE); return; }
        // Taşıyıcı (sabit) yağlar tipik olarak azdır → tek çağrı (limit 100) datalist için yeterli.
        const car = await fetchOilSearch("", "carrier", 100);
        setCarrierOils(car.rows);
        await loadSaved();
      })();
    });
  }, [loadSaved]);

  // FAZ 2 — uçucu yağ typeahead: server-side arama (search_norm), 300ms debounce,
  // stale-response abort, en fazla 40 sonuç. Boş sorgu → ilk 40 (başlangıç listesi).
  useEffect(() => {
    if (!tenantId) return;
    const controller = new AbortController();
    const h = window.setTimeout(() => {
      void (async () => {
        const { rows } = await fetchOilSearch(search.trim(), "essential", 40, controller.signal);
        if (!controller.signal.aborted) setSearchResults(rows);
      })();
    }, 300);
    return () => { window.clearTimeout(h); controller.abort(); };
  }, [search, tenantId]);

  async function addOil(row: OilListRow) {
    if (items.some((it) => it.oil_id === row.id)) {
      showToast({ title: "Zaten ekli", message: `${row.name} karışımda mevcut.`, type: "info" });
      return;
    }
    // ARO-005 — güvenlik bilgisi eksik snapshot kabul edilmez. Detay ZORUNLU; row'a düşülmez.
    if (!tenantId) {
      showToast({ title: "Yağ eklenemedi", message: "Yağ detayı yüklenemedi; güvenlik bilgisi eksik olabilir. Tekrar deneyin.", type: "error" });
      return;
    }
    setAddingId(row.id);
    const { oil, error } = await fetchOilDetail(tenantId, row.id);
    if (error || !oil) {
      showToast({ title: "Yağ eklenemedi", message: "Yağ detayı yüklenemedi; güvenlik bilgisi eksik olabilir. Tekrar deneyin.", type: "error" });
      setAddingId(null);
      return; // mevcut kalemler korunur
    }
    const item = makeBlendItem(oil, 0);
    setAddingId(null);
    // ARO-019 — elle düzenlenmişse diğer damlaları koru (0 damla ile ekle); değilse otomatik dağıt.
    setItems((prev) => (manualDrops ? [...prev, item] : redistribute([...prev, item], targetDrops)));
  }

  function removeOil(oilId: string | null, idx: number) {
    // ARO-019 — elle düzenlenmişse diğer damlaları koru (yalnız filtrele); değilse yeniden dağıt.
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return manualDrops ? next : redistribute(next, targetDrops);
    });
  }

  function setDrops(idx: number, value: string | number) {
    setManualDrops(true); // ARO-019 — elle düzenleme başladı
    const n = Math.floor(parseNum(value)); // ARO-020 güvenli ayrıştırma
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, drops: Math.max(0, n) } : it)));
  }

  function equalize() {
    setManualDrops(false); // ARO-019 — açık yeniden dağıtım manuel bayrağını sıfırlar
    setItems((prev) => redistribute(prev, targetDrops));
  }

  // ARO-024 — taşıyıcı seçilince güvenlik detayını çek; başarısız olursa 'unknown'/'' (güvenli DEME).
  async function pickCarrier(value: string) {
    setCarrierName(value);
    const match = carrierOils.find((o) => o.name.toLocaleLowerCase("tr") === value.toLocaleLowerCase("tr"));
    const cid = match ? match.id : null;
    setCarrierId(cid);
    if (cid && tenantId) {
      const { oil, error } = await fetchOilDetail(tenantId, cid);
      if (error || !oil) {
        setCarrierPhoto("unknown");
        setCarrierContra("");
        setCarrierNotes("");
      } else {
        setCarrierPhoto(derivePhotosensitivity(oil));
        setCarrierContra(oil.contraindications ?? "");
        setCarrierNotes(oil.safety_notes ?? "");
      }
    } else {
      setCarrierPhoto("unknown");
      setCarrierContra("");
      setCarrierNotes("");
    }
  }

  function resetForm() {
    setName("");
    setNotes("");
    setItems([]);
    setManualDrops(false);
  }

  // ARO-009 — kaydedilmemiş değişiklik varsa, mevcut düzenlemeyi atmadan önce onay iste.
  async function confirmDiscardIfDirty(): Promise<boolean> {
    if (!isBlendDirty) return true;
    return deleteConfirm({
      title: "Kaydedilmemiş değişiklikler",
      message: "Üzerinde çalıştığınız karışım kaydedilmedi.",
      secondMessage: "Devam ederseniz bu değişiklikler kaybolur.",
    });
  }

  // Kayıtlı blend'i builder'a yükle → düzenleme modu (editingId aktif).
  async function loadBlend(blend: Blend) {
    if (!(await confirmDiscardIfDirty())) return; // ARO-009
    setName(blend.name);
    setNotes(blend.notes);
    setCarrierName(blend.carrier_oil_name);
    setCarrierId(blend.carrier_oil_id);
    // ARO-024 — taşıyıcı güvenlik snapshot'ını kayıttan geri yükle.
    setCarrierPhoto(blend.carrier_photosensitivity_status ?? "unknown");
    setCarrierContra(blend.carrier_contraindications ?? "");
    setCarrierNotes(blend.carrier_safety_notes ?? "");
    setBottleMl(blend.bottle_ml);
    setDilution(blend.dilution_percent);
    setDropsPerMl(blend.drops_per_ml || DEFAULT_DROPS_PER_ML); // ARO-021
    setItems(blend.items);
    setManualDrops(true); // kaydedilmiş damla dağılımı korunur
    setEditingId(blend.id);
    setEditingUpdatedAt(blend.updated_at ?? null); // ARO-008 token
    setStaleConflict(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    showToast({ title: "Yüklendi", message: `“${blend.name}” düzenleniyor.`, type: "info" });
  }

  // Düzenleme modundan çık → yeni blend modu.
  async function cancelEdit() {
    if (!(await confirmDiscardIfDirty())) return; // ARO-009
    setEditingId(null);
    setEditingUpdatedAt(null);
    setStaleConflict(false);
    resetForm();
  }

  // Tek tıkla kopya: "Ad (Kopya)" adıyla YENİ kayıt; orijinal değişmez.
  async function copyBlend(blend: Blend) {
    if (copyingId) return; // ARO-007 çift-tık kilidi
    setCopyingId(blend.id);
    const input = { ...blendToInput(blend), name: `${blend.name} (Kopya)` };
    const { blend: created, error, demo } = await saveBlend(input);
    setCopyingId(null);
    if (demo) { showToast({ title: "Demo", message: "Demo hesabında kayıt yapılmaz.", type: "info" }); return; }
    if (error || !created) { showToast({ title: "Kopyalanamadı", message: error ?? "Bilinmeyen hata", type: "error" }); return; }
    showToast({ title: "Kopyalandı", message: `“${created.name}” oluşturuldu.`, type: "success" });
    await loadSaved();
  }

  async function handleSave() {
    if (saving) return;
    const input = {
      name, notes,
      carrier_oil_id: carrierId,
      carrier_oil_name: carrierName,
      carrier_photosensitivity_status: carrierPhoto, // ARO-024
      carrier_contraindications: carrierContra,
      carrier_safety_notes: carrierNotes,
      bottle_ml: bottleMl,
      dilution_percent: dilution,
      drops_per_ml: dropsPerMl, // ARO-021
      total_drops: targetDrops,
      items,
      expected_updated_at: editingId ? editingUpdatedAt : null, // ARO-008
    };
    const err = validateBlendInput(input);
    if (err) { showToast({ title: "Eksik bilgi", message: err, type: "warning" }); return; }
    setSaving(true);
    const result = editingId
      ? await updateBlend(editingId, input)
      : await saveBlend(input);
    setSaving(false);
    const { blend, error, demo } = result;
    if (demo) { showToast({ title: "Demo", message: "Demo hesabında kayıt yapılmaz.", type: "info" }); return; }
    // ARO-008 — çakışma: formu SIFIRLAMA, kullanıcı düzenlemeleri korunur.
    if ("stale" in result && result.stale) {
      setStaleConflict(true);
      showToast({ title: "Çakışma", message: BLEND_STALE_MESSAGE, type: "error" });
      return;
    }
    if (error || !blend) { showToast({ title: editingId ? "Güncellenemedi" : "Kaydedilemedi", message: error ?? "Bilinmeyen hata", type: "error" }); return; }
    showToast({ title: editingId ? "Güncellendi" : "Kaydedildi", message: `“${blend.name}” ${editingId ? "güncellendi" : "kaydedildi"}.`, type: "success" });
    setStaleConflict(false);
    setEditingId(null);
    setEditingUpdatedAt(blend.updated_at ?? null); // ARO-008 — dönen taze token
    resetForm();
    await loadSaved();
  }

  async function handleDeleteSaved(blend: Blend) {
    const ok = await deleteConfirm({
      title: "Karışımı sil",
      message: `“${blend.name}” karışımını silmek istediğinize emin misiniz?`,
      secondMessage: "Bu işlem geri alınamaz.",
    });
    if (!ok) return;
    const { error } = await deleteBlend(blend.id);
    if (error) { showToast({ title: "Silinemedi", message: error, type: "error" }); return; }
    showToast({ title: "Silindi", message: "Karışım silindi.", type: "success" });
    setSaved((prev) => prev.filter((b) => b.id !== blend.id));
    if (editingId === blend.id) { setEditingId(null); resetForm(); }
  }

  const statusBadge =
    status === "exact" ? "bg-emerald-100 text-emerald-800 border-emerald-300"
    : status === "over" ? "bg-rose-100 text-rose-800 border-rose-300"
    : status === "under" ? "bg-amber-100 text-amber-800 border-amber-300"
    : "bg-slate-100 text-slate-600 border-slate-200";
  const statusText =
    status === "exact" ? "Hedefe eşit ✓"
    : status === "over" ? `Hedefi ${currentDrops - targetDrops} damla aşıyor`
    : status === "under" ? `${targetDrops - currentDrops} damla eksik`
    : "Yağ ekleyin";

  return (
    <>
    <main className={`${pageBg} print:hidden`}>
      <div className="relative z-10 mx-auto w-full max-w-[1500px] space-y-4 px-3 py-4 sm:px-5 lg:px-7">
        <AromaterapiModuleNav />
        {/* Header */}
        <header className={`${panel} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
          <div className="min-w-0">
            <div className="mb-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-amber-700">
              ⚗️ Karışım Oluşturucu
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-950">Karışım / Blend Oluşturucu</h1>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              Yağları siz seçin; sistem yalnız damla hesabını yapar ve bilinen uyarıları gösterir. Öneri/tedavi amaçlı değildir.
            </p>
          </div>
          <Link href="/aromaterapi" className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-lg border border-amber-200/60 bg-gradient-to-r from-amber-500 to-rose-500 px-3.5 text-[12px] font-black text-white shadow-md sm:self-auto">
            <span aria-hidden>←</span> Aromaterapi
          </Link>
        </header>

        {errorMsg ? (
          <div className="rounded-2xl bg-rose-50 px-4 py-2 text-[13px] font-black text-rose-700 ring-1 ring-rose-100">{errorMsg}</div>
        ) : null}

        {editingId ? (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2 text-[12px] font-black text-amber-800">
            <span>✏️ Düzenleme modu — kaydedince mevcut karışım güncellenecek.</span>
            <button type="button" onClick={() => void cancelEdit()} className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1 text-[11px] font-black text-amber-700 hover:bg-amber-100">İptal</button>
          </div>
        ) : null}

        {staleConflict ? (
          <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-2 text-[12px] font-black text-rose-700 ring-1 ring-rose-100">
            ⚠️ {BLEND_STALE_MESSAGE}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* SOL PANEL */}
          <section className={panel}>
            <h2 className="mb-3 text-[13px] font-black text-slate-900">1 · Karışım Ayarları</h2>
            <div className="space-y-3">
              <div>
                <label className={label}>Karışım adı</label>
                <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn. Sakinleştirici Masaj Yağı" />
              </div>
              <div>
                <label className={label}>Taşıyıcı (sabit) yağ</label>
                <input className={input} list="carrier-oils" value={carrierName} onChange={(e) => void pickCarrier(e.target.value)} placeholder="Örn. Jojoba" />
                <datalist id="carrier-oils">
                  {carrierOils.map((o) => <option key={o.id} value={o.name} />)}
                </datalist>
              </div>
              <div>
                <label className={label}>Şişe hacmi (ml)</label>
                <div className="mb-1.5 flex flex-wrap gap-1.5">
                  {BOTTLE_ML_PRESETS.map((v) => (
                    <button key={v} type="button" className={chip(bottleMl === v)} onClick={() => setBottleMl(v)}>{v} ml</button>
                  ))}
                </div>
                <input type="number" min={1} max={MAX_BOTTLE_ML} className={input} value={bottleMl} onChange={(e) => setBottleMl(parseNum(e.target.value, MAX_BOTTLE_ML))} placeholder="Özel ml" />
              </div>
              <div>
                <label className={label}>Seyreltme oranı (%)</label>
                <div className="mb-1.5 flex flex-wrap gap-1.5">
                  {DILUTION_PERCENT_PRESETS.map((v) => (
                    <button key={v} type="button" className={chip(dilution === v)} onClick={() => setDilution(v)}>%{v}</button>
                  ))}
                </div>
                <input type="number" min={0} max={MAX_DILUTION_PCT} step={0.1} className={input} value={dilution} onChange={(e) => setDilution(parseNum(e.target.value, MAX_DILUTION_PCT))} placeholder="Özel oran" />
              </div>
              <div>
                <label className={label}>Notlar</label>
                <textarea className={`${input} min-h-[64px] resize-y`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="İsteğe bağlı" />
              </div>
              <div className="rounded-xl border border-amber-200/60 bg-amber-50/60 px-3 py-2 text-[11px] font-bold text-amber-800">
                Hedef: <span className="text-sm font-black">{targetDrops}</span> damla
                <span className="ml-1 font-medium text-amber-700">(1 ml ≈ {dropsPerMl} damla varsayımı)</span>
              </div>
            </div>
          </section>

          {/* ORTA PANEL */}
          <section className={panel}>
            <h2 className="mb-3 text-[13px] font-black text-slate-900">2 · Uçucu Yağ Ekle</h2>
            <input className={`${input} mb-2`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Yağ adı, özellik, etki ara…" />
            <div className="max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
              {searchResults.length === 0 ? (
                <p className="py-8 text-center text-xs font-bold text-slate-400">Sonuç yok</p>
              ) : searchResults.map((o) => {
                const added = items.some((it) => it.oil_id === o.id);
                return (
                  <div key={o.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white/80 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-black text-slate-900">{o.name}</p>
                      {o.latin_name.trim() ? <p className="truncate text-[11px] italic text-slate-400">{o.latin_name}</p> : null}
                    </div>
                    <button
                      type="button"
                      disabled={added || addingId === o.id}
                      onClick={() => void addOil(o)}
                      className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-black transition ${added ? "bg-slate-100 text-slate-400" : "bg-gradient-to-r from-amber-500 to-rose-500 text-white hover:brightness-105"}`}
                    >
                      {added ? "Ekli" : addingId === o.id ? "…" : "+ Ekle"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* SAĞ PANEL */}
          <section className={panel}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-black text-slate-900">3 · Karışım Sepeti</h2>
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-black ${statusBadge}`}>{statusText}</span>
            </div>

            <div className="mb-2 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-600">
              <span>Toplam: <b className="text-slate-900">{currentDrops}</b> / hedef {targetDrops} damla</span>
              {items.length > 1 ? (
                <button type="button" onClick={equalize} className="rounded-lg border border-amber-200 bg-white px-2 py-0.5 text-[10px] font-black text-amber-700 hover:bg-amber-50">Eşit dağıt</button>
              ) : null}
            </div>

            {items.length === 0 ? (
              <p className="py-8 text-center text-xs font-bold text-slate-400">Ortadan yağ ekleyin</p>
            ) : (
              <div className="space-y-1.5">
                {items.map((it, idx) => (
                  <div key={(it.oil_id ?? "x") + idx} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white/80 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-black text-slate-900">
                        {it.oil_name}
                        {it.is_photosensitive ? <span className="ml-1 text-[9px] font-bold text-amber-600">☀️</span> : null}
                      </p>
                      {it.latin_name.trim() ? <p className="truncate text-[10px] italic text-slate-400">{it.latin_name}</p> : null}
                    </div>
                    <input type="number" min={0} value={it.drops} onChange={(e) => setDrops(idx, e.target.value)} aria-label={`${it.oil_name} damla sayısı`} className="w-14 rounded-lg border border-amber-200 bg-white px-1.5 py-1 text-center text-[12px] font-black text-slate-900" />
                    <span className="text-[10px] font-bold text-slate-400">damla</span>
                    <button type="button" onClick={() => removeOil(it.oil_id, idx)} aria-label={`${it.oil_name} karışımdan çıkar`} title="Çıkar" className="shrink-0 rounded-lg px-1.5 py-1 text-[12px] font-black text-rose-500 hover:bg-rose-50">✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Güvenlik paneli */}
            <div className="mt-3 rounded-xl border border-amber-200/60 bg-amber-50/50 p-3">
              <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-amber-800">Güvenlik bilgisi</p>
              <p className="text-[11px] font-medium leading-snug text-slate-600">{safety.summary}</p>
              {safety.hasWarnings ? (
                <ul className="mt-2 space-y-1.5">
                  {safety.warnings.map((w, i) => (
                    <li key={i} className="rounded-lg bg-white/80 px-2.5 py-1.5 text-[11px] text-slate-700">
                      <b className="text-amber-800">{w.oil_name}</b> — {w.label}
                      {w.detail ? <span className="block text-[10px] text-slate-500">{w.detail}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className={`mt-3 w-full rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 py-2.5 text-[13px] font-black text-white shadow-md transition hover:brightness-105 ${saving ? "pointer-events-none opacity-70" : ""}`}
            >
              {saving ? "Kaydediliyor…" : editingId ? "Değişiklikleri Kaydet" : "Karışımı Kaydet"}
            </button>
            <button
              type="button"
              onClick={printActiveBlend}
              className="mt-2 w-full rounded-xl border border-amber-300 bg-white py-2 text-[12px] font-black text-amber-700 transition hover:bg-amber-50"
            >
              🖨 Reçete / Yazdır
            </button>
          </section>
        </div>

        {/* KAYDEDİLEN KARIŞIMLAR */}
        <section className={panel}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-[13px] font-black text-slate-900">Kaydedilen Karışımlar ({saved.length})</h2>
            {saved.length > 0 ? (
              <button type="button" onClick={() => void exportBlendWord("/api/aromaterapi/blends/word-report", { mode: "all" })} disabled={blendExporting}
                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
                title="Tüm karışımları Word'e aktar">
                📄 {blendExporting ? "…" : "Tümünü Word'e Aktar"}
              </button>
            ) : null}
          </div>
          {savedError && saved.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <p className="text-xs font-black text-rose-600">Kayıtlı karışımlar yüklenemedi.</p>
              <p className="text-[11px] font-medium text-slate-500">{savedError}</p>
              <button type="button" onClick={() => void loadSaved()} className="rounded-lg border border-amber-300 bg-white px-3 py-1 text-[11px] font-black text-amber-700 transition hover:bg-amber-50">Tekrar dene</button>
            </div>
          ) : saved.length === 0 ? (
            <p className="py-6 text-center text-xs font-bold text-slate-400">Henüz kayıtlı karışım yok.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {saved.map((b) => (
                <div key={b.id} className="rounded-xl border border-amber-100 bg-white/85 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-[13px] font-black text-slate-900">{b.name}</p>
                    <button type="button" onClick={() => void handleDeleteSaved(b)} aria-label={`${b.name} karışımını sil`} title="Sil" className="shrink-0 rounded-lg px-1.5 py-0.5 text-[12px] font-black text-rose-500 hover:bg-rose-50">✕</button>
                  </div>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                    {b.bottle_ml} ml · %{b.dilution_percent} · Hedef {b.total_drops} · Yağ toplamı {sumDrops(b.items)} damla · {b.items.length} yağ
                  </p>
                  {b.carrier_oil_name ? <p className="text-[10px] text-slate-400">Taşıyıcı: {b.carrier_oil_name}</p> : null}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {b.items.slice(0, 6).map((it, i) => (
                      <span key={i} className="rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        {it.oil_name} · {it.drops}d
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <button type="button" onClick={() => void loadBlend(b)} className="flex-1 rounded-lg border border-amber-200 bg-white px-2 py-1 text-[11px] font-black text-amber-700 transition hover:bg-amber-50">Düzenle</button>
                    <button type="button" onClick={() => void copyBlend(b)} disabled={copyingId === b.id} className="flex-1 rounded-lg border border-sky-200 bg-white px-2 py-1 text-[11px] font-black text-sky-700 transition hover:bg-sky-50 disabled:opacity-60">{copyingId === b.id ? "…" : "Kopyala"}</button>
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    <button type="button" onClick={() => printSavedBlend(b)} className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-black text-slate-600 transition hover:bg-slate-50">🖨 Yazdır</button>
                    <button type="button" onClick={() => void exportBlendWord(`/api/aromaterapi/blends/${b.id}/word-report`)} disabled={blendExporting} className="flex-1 rounded-lg border border-blue-200 bg-white px-2 py-1 text-[11px] font-black text-blue-700 transition hover:bg-blue-50 disabled:opacity-60" title="Bu karışımı Word'e aktar">📄 Word</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>

    {printBlend ? (
      <div className="hidden print:block">
        <BlendRecetePrint blend={printBlend} expertName={expertName} dateStr={printDate} />
      </div>
    ) : null}
    </>
  );
}
