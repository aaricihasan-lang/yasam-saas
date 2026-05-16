"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { ANALIZ_TURU_FILTER_OPTIONS } from "../helpers/bilgiBankaLabels";
import {
  deleteBilgiBankaKayit,
  listBilgiBankaKayitlari,
  type BilgiBankaListeSatir,
} from "../helpers/bilgiBankaKayit";

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

const detayBtnClass =
  "inline-flex min-h-[2.25rem] items-center justify-center rounded-xl border-2 border-violet-200/90 bg-violet-50/90 px-4 py-2 text-sm font-bold text-violet-900 shadow-sm ring-1 ring-violet-100/60 transition hover:border-violet-300 hover:bg-violet-100/90";

const silBtnClass =
  "inline-flex min-h-[2.25rem] items-center justify-center rounded-xl border-2 border-rose-200/90 bg-rose-50/90 px-4 py-2 text-sm font-bold text-rose-900 shadow-sm ring-1 ring-rose-100/60 transition hover:border-rose-300 hover:bg-rose-100/90 disabled:cursor-not-allowed disabled:opacity-50";

function kayitTuruBadge(tur: KayitTuru) {
  if (tur === "aciklama") {
    return "bg-violet-100 text-violet-900 ring-violet-200/80";
  }
  return "bg-emerald-100 text-emerald-900 ring-emerald-200/80";
}

function kayitTuruLabel(tur: KayitTuru) {
  return tur === "aciklama" ? "Açıklama Kaydı" : "Doğaltaş Atama";
}

function KayitDetayModal({ row, onClose }: { row: BilgiBankaListeSatir; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bilgi-detay-baslik"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        aria-label="Kapat"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[min(90vh,820px)] w-full max-w-2xl overflow-y-auto rounded-[28px] border-2 border-violet-200/80 bg-white p-8 shadow-2xl ring-1 ring-purple-200 sm:p-10">
        <div className="mb-6 flex items-start justify-between gap-4 border-b border-violet-100/90 pb-5">
          <div>
            <h2 id="bilgi-detay-baslik" className="text-2xl font-black text-slate-900">
              Kayıt detayı
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Bilgi bankası kayıt özeti</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
          >
            Kapat
          </button>
        </div>

        <dl className="space-y-5">
          <div>
            <dt className="text-xs font-black uppercase tracking-wider text-violet-800/80">Kayıt türü</dt>
            <dd className="mt-1.5">
              <span
                className={`inline-block rounded-xl px-3 py-1.5 text-sm font-bold ring-1 ${kayitTuruBadge(row.kayitTuru)}`}
              >
                {kayitTuruLabel(row.kayitTuru)}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-black uppercase tracking-wider text-violet-800/80">Analiz türü</dt>
            <dd className="mt-1.5 text-lg font-semibold text-slate-900">{row.analizTuru}</dd>
          </div>
          <div>
            <dt className="text-xs font-black uppercase tracking-wider text-violet-800/80">Değer</dt>
            <dd className="mt-1.5 text-lg font-medium text-slate-800">{row.deger}</dd>
          </div>
          {row.kayitTuru === "aciklama" ? (
            <>
              <div>
                <dt className="text-xs font-black uppercase tracking-wider text-violet-800/80">Bilgi kaynağı</dt>
                <dd className="mt-1.5 whitespace-pre-wrap text-base leading-relaxed text-slate-700">
                  {row.source?.trim() || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-black uppercase tracking-wider text-violet-800/80">Açıklama metni</dt>
                <dd className="mt-1.5 whitespace-pre-wrap text-base leading-relaxed text-slate-700">
                  {row.description?.trim() || "—"}
                </dd>
              </div>
            </>
          ) : (
            <>
              <div>
                <dt className="text-xs font-black uppercase tracking-wider text-violet-800/80">Öneri açıklaması</dt>
                <dd className="mt-1.5 whitespace-pre-wrap text-base leading-relaxed text-slate-700">
                  {row.reason?.trim() || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-black uppercase tracking-wider text-violet-800/80">Taş listesi</dt>
                <dd className="mt-1.5">
                  {row.stones && row.stones.length > 0 ? (
                    <ul className="space-y-1.5 rounded-2xl border border-emerald-100/80 bg-emerald-50/50 p-4">
                      {row.stones.map((tas) => (
                        <li key={tas} className="text-base font-medium text-slate-800">
                          {tas}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </dd>
              </div>
            </>
          )}
        </dl>
      </div>
    </div>
  );
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

  function toggleSec(id: string) {
    setSeciliIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTumunu() {
    if (seciliIds.size === filtrelenmis.length && filtrelenmis.length > 0) {
      setSeciliIds(new Set());
    } else {
      setSeciliIds(new Set(filtrelenmis.map((r) => r.id)));
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
        <div className="grid grid-cols-1 gap-6 md:gap-8 xl:grid-cols-[1.1fr_1.1fr_2fr_auto] xl:items-end">
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-violet-200/90 bg-gradient-to-r from-violet-50/95 via-white to-amber-50/80">
                  <th className="w-14 px-4 py-5 sm:px-6">
                    <input
                      type="checkbox"
                      checked={filtrelenmis.length > 0 && seciliIds.size === filtrelenmis.length}
                      onChange={toggleTumunu}
                      className="size-5 rounded border-violet-300 text-violet-600 focus:ring-violet-500"
                      aria-label="Tümünü seç"
                    />
                  </th>
                  <th className="px-4 py-5 text-sm font-black uppercase tracking-wide text-violet-900 sm:px-6 sm:text-base">
                    Kayıt Türü
                  </th>
                  <th className="px-4 py-5 text-sm font-black uppercase tracking-wide text-violet-900 sm:px-6 sm:text-base">
                    Analiz Türü
                  </th>
                  <th className="px-4 py-5 text-sm font-black uppercase tracking-wide text-violet-900 sm:px-6 sm:text-base">
                    Değer
                  </th>
                  <th className="min-w-[220px] px-4 py-5 text-sm font-black uppercase tracking-wide text-violet-900 sm:px-6 sm:text-base">
                    Bilgi Kaynağı / Açıklama
                  </th>
                  <th className="whitespace-nowrap px-4 py-5 text-right text-sm font-black uppercase tracking-wide text-violet-900 sm:px-6 sm:text-base">
                    İşlemler
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtrelenmis.map((row, idx) => (
                  <tr
                    key={row.id}
                    className={`border-b border-violet-100/90 transition hover:bg-violet-50/60 ${
                      idx % 2 === 0 ? "bg-white" : "bg-violet-50/25"
                    } ${seciliIds.has(row.id) ? "ring-1 ring-inset ring-violet-300/50" : ""}`}
                  >
                    <td className="px-4 py-5 sm:px-6">
                      <input
                        type="checkbox"
                        checked={seciliIds.has(row.id)}
                        onChange={() => toggleSec(row.id)}
                        className="size-5 rounded border-violet-300 text-violet-600 focus:ring-violet-500"
                        aria-label={`${row.analizTuru} ${row.deger} seç`}
                      />
                    </td>
                    <td className="px-4 py-5 sm:px-6">
                      <span
                        className={`inline-block rounded-xl px-3 py-1.5 text-sm font-bold ring-1 ${kayitTuruBadge(row.kayitTuru)}`}
                      >
                        {kayitTuruLabel(row.kayitTuru)}
                      </span>
                    </td>
                    <td className="px-4 py-5 text-base font-semibold text-slate-900 sm:px-6 sm:text-lg">
                      {row.analizTuru}
                    </td>
                    <td className="px-4 py-5 text-base font-medium text-slate-800 sm:px-6 sm:text-lg">
                      {row.deger}
                    </td>
                    <td className="max-w-md px-4 py-5 text-base leading-relaxed text-slate-700 sm:px-6">
                      <span className="line-clamp-3">{row.bilgiVeyaAciklama}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-5 sm:px-6">
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
                          disabled={siliniyorId === row.id}
                          onClick={() => void handleSil(row)}
                        >
                          {siliniyorId === row.id ? "Siliniyor…" : "Sil"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-violet-100/90 px-6 py-4 text-sm font-medium text-slate-500">
            {filtrelenmis.length} kayıt gösteriliyor
            {tumSatirlar.length !== filtrelenmis.length
              ? ` (toplam ${tumSatirlar.length})`
              : null}
          </p>
        </div>
      )}

      {detayRow ? <KayitDetayModal row={detayRow} onClose={() => setDetayRow(null)} /> : null}
    </div>
  );
}
