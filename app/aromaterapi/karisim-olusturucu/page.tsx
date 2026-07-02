"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { runInEffect } from "@/lib/runInEffect";
import { getSyncedTenantId, MISSING_SESSION_TENANT_MESSAGE } from "@/lib/auth/sessionTenant";
import { useToast } from "@/components/ui/ToastProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import {
  fetchOilList,
  fetchOilDetail,
  matchesOilSearch,
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
  deleteBlend,
  type BlendItem,
  type Blend,
} from "@/lib/aromaterapi/blendData";

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
  const [bottleMl, setBottleMl] = useState<number>(30);
  const [dilution, setDilution] = useState<number>(2);

  // Orta panel (uçucu yağ arama)
  const [essentialOils, setEssentialOils] = useState<OilListRow[]>([]);
  const [carrierOils, setCarrierOils] = useState<OilListRow[]>([]);
  const [search, setSearch] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);

  // Sağ panel (sepet)
  const [items, setItems] = useState<BlendItem[]>([]);

  // Kaydedilenler
  const [saved, setSaved] = useState<Blend[]>([]);
  const [saving, setSaving] = useState(false);

  const targetDrops = useMemo(() => calcTotalDrops(bottleMl, dilution, DEFAULT_DROPS_PER_ML), [bottleMl, dilution]);
  const currentDrops = useMemo(() => sumDrops(items), [items]);
  const status = fillStatus(currentDrops, targetDrops);
  const safety = useMemo(() => collectSafetyWarnings(items), [items]);

  const loadSaved = useCallback(async () => {
    const { blends, error } = await fetchBlends();
    if (!error) setSaved(blends);
  }, []);

  useEffect(() => {
    runInEffect(() => {
      void (async () => {
        const tid = await getSyncedTenantId();
        setTenantId(tid);
        if (!tid) { setErrorMsg(MISSING_SESSION_TENANT_MESSAGE); return; }
        const [ess, car] = await Promise.all([
          fetchOilList(tid, "essential"),
          fetchOilList(tid, "carrier"),
        ]);
        setEssentialOils(ess.rows);
        setCarrierOils(car.rows);
        await loadSaved();
      })();
    });
  }, [loadSaved]);

  const searchResults = useMemo(() => {
    const q = search.trim();
    const base = q ? essentialOils.filter((o) => matchesOilSearch(o, q)) : essentialOils;
    return base.slice(0, 40);
  }, [essentialOils, search]);

  async function addOil(row: OilListRow) {
    if (items.some((it) => it.oil_id === row.id)) {
      showToast({ title: "Zaten ekli", message: `${row.name} karışımda mevcut.`, type: "info" });
      return;
    }
    setAddingId(row.id);
    // Tam detaydan snapshot (contraindications liste sorgusunda yok).
    let item: BlendItem;
    if (tenantId) {
      const { oil } = await fetchOilDetail(tenantId, row.id);
      item = makeBlendItem(oil ?? row, 0);
    } else {
      item = makeBlendItem(row, 0);
    }
    setAddingId(null);
    setItems((prev) => redistribute([...prev, item], targetDrops));
  }

  function removeOil(oilId: string | null, idx: number) {
    setItems((prev) => redistribute(prev.filter((_, i) => i !== idx), targetDrops));
  }

  function setDrops(idx: number, value: number) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, drops: Math.max(0, Math.floor(value || 0)) } : it)));
  }

  function equalize() {
    setItems((prev) => redistribute(prev, targetDrops));
  }

  function pickCarrier(value: string) {
    setCarrierName(value);
    const match = carrierOils.find((o) => o.name.toLocaleLowerCase("tr") === value.toLocaleLowerCase("tr"));
    setCarrierId(match ? match.id : null);
  }

  function resetForm() {
    setName("");
    setNotes("");
    setItems([]);
  }

  async function handleSave() {
    if (saving) return;
    const input = {
      name, notes,
      carrier_oil_id: carrierId,
      carrier_oil_name: carrierName,
      bottle_ml: bottleMl,
      dilution_percent: dilution,
      drops_per_ml: DEFAULT_DROPS_PER_ML,
      total_drops: targetDrops,
      items,
    };
    const err = validateBlendInput(input);
    if (err) { showToast({ title: "Eksik bilgi", message: err, type: "warning" }); return; }
    setSaving(true);
    const { blend, error, demo } = await saveBlend(input);
    setSaving(false);
    if (demo) { showToast({ title: "Demo", message: "Demo hesabında kayıt yapılmaz.", type: "info" }); return; }
    if (error || !blend) { showToast({ title: "Kaydedilemedi", message: error ?? "Bilinmeyen hata", type: "error" }); return; }
    showToast({ title: "Kaydedildi", message: `“${blend.name}” karışımı kaydedildi.`, type: "success" });
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
    <main className={pageBg}>
      <div className="relative z-10 mx-auto w-full max-w-[1500px] space-y-4 px-3 py-4 sm:px-5 lg:px-7">
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
                <input className={input} list="carrier-oils" value={carrierName} onChange={(e) => pickCarrier(e.target.value)} placeholder="Örn. Jojoba" />
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
                <input type="number" min={1} className={input} value={bottleMl} onChange={(e) => setBottleMl(Math.max(0, Number(e.target.value)))} placeholder="Özel ml" />
              </div>
              <div>
                <label className={label}>Seyreltme oranı (%)</label>
                <div className="mb-1.5 flex flex-wrap gap-1.5">
                  {DILUTION_PERCENT_PRESETS.map((v) => (
                    <button key={v} type="button" className={chip(dilution === v)} onClick={() => setDilution(v)}>%{v}</button>
                  ))}
                </div>
                <input type="number" min={0} step={0.1} className={input} value={dilution} onChange={(e) => setDilution(Math.max(0, Number(e.target.value)))} placeholder="Özel oran" />
              </div>
              <div>
                <label className={label}>Notlar</label>
                <textarea className={`${input} min-h-[64px] resize-y`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="İsteğe bağlı" />
              </div>
              <div className="rounded-xl border border-amber-200/60 bg-amber-50/60 px-3 py-2 text-[11px] font-bold text-amber-800">
                Hedef: <span className="text-sm font-black">{targetDrops}</span> damla
                <span className="ml-1 font-medium text-amber-700">(1 ml ≈ {DEFAULT_DROPS_PER_ML} damla varsayımı)</span>
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
                    <input type="number" min={0} value={it.drops} onChange={(e) => setDrops(idx, Number(e.target.value))} className="w-14 rounded-lg border border-amber-200 bg-white px-1.5 py-1 text-center text-[12px] font-black text-slate-900" />
                    <span className="text-[10px] font-bold text-slate-400">damla</span>
                    <button type="button" onClick={() => removeOil(it.oil_id, idx)} className="shrink-0 rounded-lg px-1.5 py-1 text-[12px] font-black text-rose-500 hover:bg-rose-50">✕</button>
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
              {saving ? "Kaydediliyor…" : "Karışımı Kaydet"}
            </button>
          </section>
        </div>

        {/* KAYDEDİLEN KARIŞIMLAR */}
        <section className={panel}>
          <h2 className="mb-3 text-[13px] font-black text-slate-900">Kaydedilen Karışımlar ({saved.length})</h2>
          {saved.length === 0 ? (
            <p className="py-6 text-center text-xs font-bold text-slate-400">Henüz kayıtlı karışım yok.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {saved.map((b) => (
                <div key={b.id} className="rounded-xl border border-amber-100 bg-white/85 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-[13px] font-black text-slate-900">{b.name}</p>
                    <button type="button" onClick={() => void handleDeleteSaved(b)} className="shrink-0 rounded-lg px-1.5 py-0.5 text-[12px] font-black text-rose-500 hover:bg-rose-50">✕</button>
                  </div>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                    {b.bottle_ml} ml · %{b.dilution_percent} · {b.total_drops} damla · {b.items.length} yağ
                  </p>
                  {b.carrier_oil_name ? <p className="text-[10px] text-slate-400">Taşıyıcı: {b.carrier_oil_name}</p> : null}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {b.items.slice(0, 6).map((it, i) => (
                      <span key={i} className="rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        {it.oil_name} · {it.drops}d
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
