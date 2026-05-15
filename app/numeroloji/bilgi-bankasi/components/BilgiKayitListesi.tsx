"use client";

import { useMemo, useState } from "react";
import {
  ANALIZ_TURU_FILTER_OPTIONS,
  analizTuruLabel,
  formatBilgiBankaTarih,
} from "../helpers/bilgiBankaLabels";
import { listTrainingExplanationRows } from "../helpers/trainingExplanationStore";
import { listStoneAssignmentRows } from "../helpers/stoneAssignmentStore";

type KayitTuru = "aciklama" | "dogaltas";

type ListeSatir = {
  id: string;
  kayitTuru: KayitTuru;
  analizTuruKey: string;
  analizTuru: string;
  deger: string;
  bilgiVeyaAciklama: string;
  guncellemeTarihi: string;
  aramaMetni: string;
};

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

function buildListeSatirlari(): ListeSatir[] {
  const aciklama = listTrainingExplanationRows().map((row): ListeSatir => {
    const { category, value, entry } = row;
    const analiz = analizTuruLabel(category);
    const bilgi = [entry.source, entry.description].filter(Boolean).join(" — ");
    return {
      id: `aciklama:${category}:${value}`,
      kayitTuru: "aciklama",
      analizTuruKey: category,
      analizTuru: analiz,
      deger: value,
      bilgiVeyaAciklama: bilgi || "—",
      guncellemeTarihi: entry.updated_at,
      aramaMetni: [analiz, value, entry.source, entry.description].join(" ").toLocaleLowerCase("tr-TR"),
    };
  });

  const dogaltas = listStoneAssignmentRows().map((row): ListeSatir => {
    const { category, value, entry } = row;
    const analiz = analizTuruLabel(category);
    const taslar = entry.stones.join(", ");
    const bilgi = [entry.reason, taslar ? `Taşlar: ${taslar}` : ""].filter(Boolean).join(" — ");
    return {
      id: `dogaltas:${category}:${value}`,
      kayitTuru: "dogaltas",
      analizTuruKey: category,
      analizTuru: analiz,
      deger: value,
      bilgiVeyaAciklama: bilgi || "—",
      guncellemeTarihi: entry.updated_at,
      aramaMetni: [analiz, value, entry.reason, taslar].join(" ").toLocaleLowerCase("tr-TR"),
    };
  });

  return [...aciklama, ...dogaltas].sort((a, b) =>
    b.guncellemeTarihi.localeCompare(a.guncellemeTarihi),
  );
}

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
  const [kayitTuruFiltre, setKayitTuruFiltre] = useState("");
  const [analizTuruFiltre, setAnalizTuruFiltre] = useState("");
  const [arama, setArama] = useState("");
  const [seciliIds, setSeciliIds] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);

  const tumSatirlar = useMemo(() => {
    void refreshKey;
    return buildListeSatirlari();
  }, [refreshKey]);

  const filtrelenmis = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr-TR");
    return tumSatirlar.filter((row) => {
      if (kayitTuruFiltre && row.kayitTuru !== kayitTuruFiltre) return false;
      if (analizTuruFiltre && row.analizTuruKey !== analizTuruFiltre) return false;
      if (q && !row.aramaMetni.includes(q)) return false;
      return true;
    });
  }, [tumSatirlar, kayitTuruFiltre, analizTuruFiltre, arama]);

  const hicKayitYok = tumSatirlar.length === 0;
  const filtreBos = !hicKayitYok && filtrelenmis.length === 0;

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
            <button type="button" onClick={() => setRefreshKey((k) => k + 1)} className={refreshButtonClass}>
              Listeyi yenile
            </button>
          </div>
        </div>
      </div>

      {hicKayitYok ? (
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
                  <th className="whitespace-nowrap px-4 py-5 text-sm font-black uppercase tracking-wide text-violet-900 sm:px-6 sm:text-base">
                    Güncelleme Tarihi
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
                    <td className="whitespace-nowrap px-4 py-5 text-base font-medium text-slate-600 sm:px-6">
                      {formatBilgiBankaTarih(row.guncellemeTarihi)}
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
    </div>
  );
}
