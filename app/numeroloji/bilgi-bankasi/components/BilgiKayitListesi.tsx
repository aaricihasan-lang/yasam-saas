"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { ANALIZ_TURU_FILTER_OPTIONS } from "../helpers/bilgiBankaLabels";
import {
  deleteBilgiBankaKayit,
  deleteBilgiBankaKayitlari,
  listBilgiBankaKayitlari,
  type BilgiBankaListeSatir,
} from "../helpers/bilgiBankaKayit";
import { KayitDetayModal } from "./KayitDetayModal";

type KayitTuru = BilgiBankaListeSatir["kayitTuru"];

const KAYIT_TURU_FILTRE = [
  { value: "", label: "Tüm kayıt türleri" },
  { value: "aciklama", label: "Açıklama Kaydı" },
  { value: "dogaltas", label: "Doğaltaş Atama" },
] as const;

const filterLabelClass = "mb-2.5 block text-base font-bold text-slate-800";

const filterFieldClass =
  "h-14 w-full rounded-2xl border-2 border-violet-200/90 bg-white px-5 text-base font-medium text-slate-900 shadow-md outline-none ring-1 ring-purple-200 transition focus:border-violet-400 focus:ring-2 focus:ring-violet-300/50";

const searchInputClass = `${filterFieldClass} min-w-0 placeholder:text-base placeholder:text-slate-400 xl:min-w-[420px]`;

const refreshButtonClass =
  "inline-flex h-14 w-full items-center justify-center rounded-2xl border-2 border-violet-300/80 bg-gradient-to-r from-violet-600 to-indigo-600 px-8 text-base font-bold text-white shadow-lg ring-2 ring-violet-300/40 transition hover:brightness-105 xl:w-auto xl:shrink-0";

const checkboxClass =
  "h-6 w-6 cursor-pointer rounded-md border-2 border-violet-400/90 bg-white text-violet-600 shadow-sm ring-2 ring-violet-100/70 transition focus:ring-violet-500";

const detayBtnClass =
  "inline-flex items-center justify-center rounded-2xl border-2 border-violet-500/90 bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 text-base font-black text-white shadow-sm transition hover:brightness-110 hover:shadow-md";

const silBtnClass =
  "inline-flex items-center justify-center rounded-2xl border-2 border-rose-500/90 bg-gradient-to-r from-rose-600 to-red-600 px-6 py-3 text-base font-black text-white shadow-sm transition hover:brightness-110 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50";

const tableThClass =
  "border-y-2 border-violet-200/90 bg-violet-100/80 px-6 py-6 text-base font-black tracking-[0.12em] text-violet-800 xl:text-lg";

const tableTdClass =
  "min-h-[86px] border-y-2 border-violet-200/90 px-6 py-6 text-base font-semibold leading-7 text-slate-700 shadow-sm backdrop-blur-sm transition group-hover:border-violet-300 xl:text-lg";

const bilgiKolonMetinClass =
  "line-clamp-3 text-base font-medium leading-8 text-slate-700 xl:text-lg";

const kayitTuruRozetClass =
  "inline-block rounded-full px-5 py-2 text-sm font-black shadow-sm ring-1 xl:text-base";

const secilileriSilBtnClass =
  "inline-flex min-h-[3.25rem] items-center justify-center rounded-2xl border-2 border-rose-400/90 bg-gradient-to-r from-rose-600 to-red-700 px-6 py-2 text-base font-bold text-white shadow-lg ring-2 ring-rose-200/50 transition hover:brightness-105 disabled:cursor-not-allowed disabled:border-slate-300 disabled:from-slate-400 disabled:to-slate-500 disabled:text-slate-100 disabled:opacity-60 disabled:shadow-none";

function kayitTuruBadge(tur: KayitTuru) {
  if (tur === "aciklama") {
    return "bg-violet-100 text-violet-900 ring-violet-200/80";
  }
  return "bg-emerald-100 text-emerald-900 ring-emerald-200/80";
}

function kayitTuruLabel(tur: KayitTuru) {
  return tur === "aciklama" ? "Açıklama Kaydı" : "Doğaltaş Atama";
}

export function BilgiKayitListesi() {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [kayitTuruFiltre, setKayitTuruFiltre] = useState("");
  const [analizTuruFiltre, setAnalizTuruFiltre] = useState("");
  const [arama, setArama] = useState("");
  const [seciliIds, setSeciliIds] = useState<Set<string>>(new Set());
  const [tumSatirlar, setTumSatirlar] = useState<BilgiBankaListeSatir[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [detayRow, setDetayRow] = useState<BilgiBankaListeSatir | null>(null);
  const [siliniyorId, setSiliniyorId] = useState<string | null>(null);
  const [topluSiliniyor, setTopluSiliniyor] = useState(false);
  const [wordBusy, setWordBusy] = useState(false);

  const yukleListe = useCallback(async () => {
    setYukleniyor(true);
    const { rows, error } = await listBilgiBankaKayitlari();
    setYukleniyor(false);
    if (error) {
      showToast({ message: "Kayıt sırasında hata oluştu", type: "error" });
      setTumSatirlar([]);
      return;
    }
    setTumSatirlar(rows);
    setSeciliIds(new Set());
  }, [showToast]);

  const detayGuncelleVeYenile = useCallback(async () => {
    const { rows, error } = await listBilgiBankaKayitlari();
    if (error) {
      showToast({ message: "Kayıt sırasında hata oluştu", type: "error" });
      return;
    }
    setTumSatirlar(rows);
    setDetayRow((prev) => (prev ? rows.find((r) => r.id === prev.id) ?? null : null));
  }, [showToast]);

  useEffect(() => {
    void yukleListe();
  }, [yukleListe]);

  const filtrelenmis = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr-TR");
    return tumSatirlar.filter((row) => {
      if (kayitTuruFiltre && row.kayitTuru !== kayitTuruFiltre) return false;
      if (analizTuruFiltre && row.analizTuruKey !== analizTuruFiltre) return false;
      if (q && !row.aramaMetni.includes(q)) return false;
      return true;
    });
  }, [tumSatirlar, kayitTuruFiltre, analizTuruFiltre, arama]);

  const hicKayitYok = !yukleniyor && tumSatirlar.length === 0;
  const filtreBos = !yukleniyor && !hicKayitYok && filtrelenmis.length === 0;

  const seciliSatirlar = useMemo(
    () => tumSatirlar.filter((r) => seciliIds.has(r.id)),
    [tumSatirlar, seciliIds],
  );
  const seciliSayisi = seciliSatirlar.length;

  const filtrelenmisHepsiSecili = useMemo(() => {
    if (filtrelenmis.length === 0) return false;
    return filtrelenmis.every((r) => seciliIds.has(r.id));
  }, [filtrelenmis, seciliIds]);

  function toggleSec(id: string) {
    setSeciliIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTumunu() {
    if (filtrelenmisHepsiSecili) {
      setSeciliIds((prev) => {
        const next = new Set(prev);
        for (const r of filtrelenmis) next.delete(r.id);
        return next;
      });
    } else {
      setSeciliIds((prev) => {
        const next = new Set(prev);
        for (const r of filtrelenmis) next.add(r.id);
        return next;
      });
    }
  }

  async function handleSecilileriSil() {
    if (seciliSayisi === 0) return;

    const ok = await confirm({
      title: "Seçili kayıtları sil",
      message: "Seçili kayıtları silmek istediğinize emin misiniz?",
      tone: "danger",
      confirmText: "Sil",
      cancelText: "Vazgeç",
    });
    if (!ok) return;

    const knowledgeIds = seciliSatirlar
      .filter((r) => r.kayitTuru === "aciklama")
      .map((r) => r.recordId);
    const stoneIds = seciliSatirlar
      .filter((r) => r.kayitTuru === "dogaltas")
      .map((r) => r.recordId);

    setTopluSiliniyor(true);
    const { error } = await deleteBilgiBankaKayitlari(knowledgeIds, stoneIds);
    setTopluSiliniyor(false);

    if (error) {
      showToast({ message: `Seçili kayıtlar silinemedi: ${error}`, type: "error" });
      return;
    }

    showToast({ message: "Seçili kayıtlar silindi", type: "success" });
    if (detayRow && seciliIds.has(detayRow.id)) setDetayRow(null);
    setSeciliIds(new Set());
    void yukleListe();
  }

  async function exportKnowledgeWord(mode: "all" | "filtered") {
    const { resolveNumerolojiTenantId } = await import("../../helpers/numerolojiKayit");
    const tid = await resolveNumerolojiTenantId();
    if (!tid) return;

    setWordBusy(true);
    try {
      const body: Record<string, unknown> = { tenantId: tid, exportMode: mode };
      if (mode === "filtered") {
        body.knowledgeIds = filtrelenmis.filter((r) => r.kayitTuru === "aciklama").map((r) => r.recordId);
        body.stoneIds = filtrelenmis.filter((r) => r.kayitTuru === "dogaltas").map((r) => r.recordId);
      }
      const res = await fetch("/api/numeroloji/knowledge-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `numeroloji-bilgi-bankasi-${mode === "filtered" ? "filtreli" : "tumu"}-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* sessiz hata */ } finally {
      setWordBusy(false);
    }
  }

  async function handleSil(row: BilgiBankaListeSatir) {
    const ok = await confirm({
      title: "Kaydı sil",
      message: "Bu bilgi bankası kaydını silmek istediğinize emin misiniz?",
      tone: "danger",
      confirmText: "Sil",
      cancelText: "Vazgeç",
    });
    if (!ok) return;

    setSiliniyorId(row.id);
    const { error } = await deleteBilgiBankaKayit(row.kayitTuru, row.recordId);
    setSiliniyorId(null);

    if (error) {
      showToast({ message: `Kayıt silinemedi: ${error}`, type: "error" });
      return;
    }

    showToast({ message: "Kayıt silindi", type: "success" });
    if (detayRow?.id === row.id) setDetayRow(null);
    void yukleListe();
  }

  return (
    <div className="space-y-8">
      <div className="min-h-[140px] rounded-[28px] border-2 border-violet-200/80 bg-white/95 p-8 shadow-xl ring-1 ring-purple-200 backdrop-blur-md md:p-10">
        <div className="grid grid-cols-1 gap-6 md:gap-8 xl:grid-cols-2 xl:items-end 2xl:grid-cols-[1.1fr_1.1fr_2fr_auto_1.3fr]">
          <div className="min-w-0">
            <label htmlFor="liste-kayit-turu" className={filterLabelClass}>
              Kayıt türü
            </label>
            <select
              id="liste-kayit-turu"
              value={kayitTuruFiltre}
              onChange={(e) => setKayitTuruFiltre(e.target.value)}
              className={filterFieldClass}
            >
              {KAYIT_TURU_FILTRE.map((opt) => (
                <option key={opt.value || "tum"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <label htmlFor="liste-analiz-turu" className={filterLabelClass}>
              Analiz türü
            </label>
            <select
              id="liste-analiz-turu"
              value={analizTuruFiltre}
              onChange={(e) => setAnalizTuruFiltre(e.target.value)}
              className={filterFieldClass}
            >
              {ANALIZ_TURU_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value || "tum"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <label htmlFor="liste-arama" className={filterLabelClass}>
              Arama
            </label>
            <input
              id="liste-arama"
              type="search"
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              placeholder="Analiz türü, değer, kaynak, açıklama veya taş adı ile arayın…"
              className={searchInputClass}
            />
          </div>

          <div className="min-w-0">
            <span className="mb-2.5 hidden text-base font-bold text-transparent xl:block" aria-hidden>
              Yenile
            </span>
            <button
              type="button"
              disabled={yukleniyor}
              onClick={() => void yukleListe()}
              className={refreshButtonClass}
            >
              {yukleniyor ? "Yükleniyor…" : "Listeyi yenile"}
            </button>
          </div>

          <div className="min-w-0">
            <span className="mb-2.5 block text-base font-bold text-slate-800">Toplu işlem</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={seciliSayisi === 0 || topluSiliniyor || yukleniyor}
                onClick={() => void handleSecilileriSil()}
                className={secilileriSilBtnClass}
              >
                {topluSiliniyor
                  ? "Siliniyor…"
                  : seciliSayisi > 0
                    ? `Seçilileri Sil (${seciliSayisi})`
                    : "Seçilileri Sil"}
              </button>
              <button
                type="button"
                disabled={wordBusy || yukleniyor || tumSatirlar.length === 0}
                onClick={() => void exportKnowledgeWord("all")}
                className="inline-flex min-h-[3.25rem] items-center justify-center rounded-2xl border-2 border-blue-300/80 bg-blue-600 px-5 py-2 text-base font-bold text-white shadow-lg transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {wordBusy ? "⏳ Hazırlanıyor…" : "📄 Tümünü Word"}
              </button>
              {(kayitTuruFiltre || analizTuruFiltre || arama) && (
                <button
                  type="button"
                  disabled={wordBusy || filtrelenmis.length === 0}
                  onClick={() => void exportKnowledgeWord("filtered")}
                  className="inline-flex min-h-[3.25rem] items-center justify-center rounded-2xl border-2 border-violet-300/80 bg-violet-600 px-5 py-2 text-base font-bold text-white shadow-lg transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {wordBusy ? "⏳…" : `📄 Filtrelenmiş Word (${filtrelenmis.length})`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {yukleniyor ? (
        <div className="rounded-[32px] border-2 border-violet-200/80 bg-white/95 px-10 py-20 text-center shadow-xl ring-1 ring-purple-200">
          <p className="text-lg font-medium text-slate-600">Kayıtlar yükleniyor…</p>
        </div>
      ) : hicKayitYok ? (
        <div className="rounded-[32px] border-2 border-dashed border-violet-300/80 bg-white/95 px-10 py-24 text-center shadow-xl ring-1 ring-purple-200 backdrop-blur-md sm:py-28">
          <p className="mx-auto max-w-2xl text-lg font-medium leading-relaxed text-slate-600 sm:text-xl">
            Henüz kayıtlı bilgi bankası kaydı yok.
          </p>
        </div>
      ) : filtreBos ? (
        <div className="rounded-[32px] border-2 border-dashed border-amber-200/80 bg-amber-50/40 px-10 py-16 text-center shadow-lg ring-1 ring-amber-100/60">
          <p className="text-lg font-medium text-amber-950/85">Filtreye uygun kayıt bulunamadı.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[32px] border-2 border-violet-200/80 bg-white/95 shadow-xl ring-1 ring-purple-200 backdrop-blur-md">
          <div className="overflow-x-auto p-3 sm:p-4">
            <table className="w-full min-w-[960px] border-separate border-spacing-y-2 text-left">
              <thead>
                <tr>
                  <th className={`w-16 rounded-l-2xl border-2 border-violet-200/90 bg-violet-100/80 ${tableThClass}`}>
                    <div className="flex justify-center">
                      <input
                        type="checkbox"
                        checked={filtrelenmisHepsiSecili}
                        onChange={toggleTumunu}
                        className={checkboxClass}
                        aria-label="Tümünü seç veya tümünü kaldır"
                      />
                    </div>
                  </th>
                  <th className={tableThClass}>Kayıt Türü</th>
                  <th className={tableThClass}>Analiz Türü</th>
                  <th className={tableThClass}>Değer</th>
                  <th className={`min-w-[220px] ${tableThClass}`}>Bilgi Kaynağı / Açıklama</th>
                  <th className={`rounded-r-2xl border-2 border-violet-200/90 bg-violet-100/80 text-right ${tableThClass}`}>
                    İşlemler
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtrelenmis.map((row) => {
                  const secili = seciliIds.has(row.id);
                  return (
                  <tr key={row.id} className="group">
                    <td className="min-h-[86px] rounded-l-2xl border-2 border-violet-200/90 bg-white/95 px-6 py-6 shadow-sm backdrop-blur-sm transition group-hover:border-violet-300 group-hover:bg-violet-50/90">
                      <div className="flex justify-center">
                        <input
                          type="checkbox"
                          checked={secili}
                          onChange={() => toggleSec(row.id)}
                          className={checkboxClass}
                          aria-label={`${row.analizTuru} ${row.deger} seç`}
                        />
                      </div>
                    </td>
                    <td
                      className={`${tableTdClass} ${
                        secili ? "bg-violet-100/70" : "bg-white/95 group-hover:bg-violet-50/90"
                      }`}
                    >
                      <span className={`${kayitTuruRozetClass} ${kayitTuruBadge(row.kayitTuru)}`}>
                        {kayitTuruLabel(row.kayitTuru)}
                      </span>
                    </td>
                    <td
                      className={`${tableTdClass} ${
                        secili ? "bg-violet-100/70" : "bg-white/95 group-hover:bg-violet-50/90"
                      }`}
                    >
                      {row.analizTuru}
                    </td>
                    <td
                      className={`${tableTdClass} ${
                        secili ? "bg-violet-100/70" : "bg-white/95 group-hover:bg-violet-50/90"
                      }`}
                    >
                      {row.deger}
                    </td>
                    <td
                      className={`max-w-md ${tableTdClass} ${
                        secili ? "bg-violet-100/70" : "bg-white/95 group-hover:bg-violet-50/90"
                      }`}
                    >
                      <span className={bilgiKolonMetinClass}>{row.bilgiVeyaAciklama}</span>
                    </td>
                    <td
                      className={`min-h-[86px] rounded-r-2xl border-2 border-violet-200/90 px-6 py-6 shadow-sm backdrop-blur-sm transition group-hover:border-violet-300 ${
                        secili ? "bg-violet-100/70" : "bg-white/95 group-hover:bg-violet-50/90"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          className={detayBtnClass}
                          onClick={() => setDetayRow(row)}
                        >
                          Detay
                        </button>
                        <button
                          type="button"
                          className={silBtnClass}
                          disabled={siliniyorId === row.id || topluSiliniyor}
                          onClick={() => void handleSil(row)}
                        >
                          {siliniyorId === row.id ? "Siliniyor…" : "Sil"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-violet-100/90 px-6 py-4 text-base font-medium text-slate-500">
            {filtrelenmis.length} kayıt gösteriliyor
            {tumSatirlar.length !== filtrelenmis.length
              ? ` (toplam ${tumSatirlar.length})`
              : null}
          </p>
        </div>
      )}

      {detayRow ? (
        <KayitDetayModal
          row={detayRow}
          onClose={() => setDetayRow(null)}
          onSaved={detayGuncelleVeYenile}
        />
      ) : null}
    </div>
  );
}
