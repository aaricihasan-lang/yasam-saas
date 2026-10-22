"use client";

import { BookOpen, Info } from "lucide-react";
import { REFLEXOLOGY_DISCLAIMER_TEXT } from "@/app/refleksoloji/components/ReflexologyDisclaimer";

import { useMemo } from "react";
import { getRegionsForOrgan, loadAtlas } from "@/lib/atlasStorage";

type RegionNotesPanelProps = {
  selectedOrgan: string | null;
  /** Atlas kaydedilince değişip yeniden okumayı tetikleyen sürüm (opsiyonel). */
  atlasVersion?: number;
};

/**
 * Seçili organ için SALT-OKUMA atlas bilgisi.
 *
 * Önceden bu panelde düzenlenebilir izlenimi veren ama hiçbir yere yazılamayan
 * ölü bir textarea vardı ("notlar buraya yazılacak"). Sahte UX kaldırıldı; yerine
 * organın gerçek atlas verisi (taban/yan bölge sayıları) salt-okuma gösterilir.
 * Bölge koordinatları harita üzerinde çizilerek yönetilir.
 */
export function RegionNotesPanel({ selectedOrgan, atlasVersion = 0 }: RegionNotesPanelProps) {
  const counts = useMemo(() => {
    if (!selectedOrgan) return null;
    try {
      const atlas = loadAtlas();
      const taban = getRegionsForOrgan(atlas, selectedOrgan, { view: "taban" }).length;
      const yanIc = getRegionsForOrgan(atlas, selectedOrgan, { view: "yan_ic" }).length;
      const yanDis = getRegionsForOrgan(atlas, selectedOrgan, { view: "yan_dis" }).length;
      const elAvuc = getRegionsForOrgan(atlas, selectedOrgan, { view: "el_avuc" }).length;
      const elSirt = getRegionsForOrgan(atlas, selectedOrgan, { view: "el_sirt" }).length;
      return { taban, yanIc, yanDis, elAvuc, elSirt, total: taban + yanIc + yanDis + elAvuc + elSirt };
    } catch {
      return { taban: 0, yanIc: 0, yanDis: 0, elAvuc: 0, elSirt: 0, total: 0 };
    }
    // atlasVersion bilinçli bağımlılık: kaydetten sonra sayıları tazelemek için.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgan, atlasVersion]);

  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col overflow-y-auto rounded-3xl border border-[#e5e0f7] bg-white/90 p-4 shadow-[0_16px_36px_-20px_rgba(76,61,140,0.28)] lg:w-[300px] 2xl:w-[330px]">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600" aria-hidden>
          <BookOpen className="h-5 w-5" strokeWidth={2} />
        </span>
        <h2 className="text-[15px] font-extrabold tracking-[0.04em] text-[#1b1638]">ORGAN ATLASI</h2>
      </div>

      <div className="mt-3 rounded-2xl border border-[#efedf7] bg-white px-3.5 py-3">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.06em] text-violet-600">Seçili Organ</p>
        <p
          className={`mt-1 text-[15px] font-bold leading-snug ${
            selectedOrgan ? "text-violet-950" : "font-semibold italic text-slate-600"
          }`}
        >
          {selectedOrgan ?? "Organ seçiniz"}
        </p>
      </div>

      <div className="mt-3 flex flex-col">
        <span className="text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#1b1638]">
          Kayıtlı Bölgeler
        </span>
        {selectedOrgan && counts ? (
          counts.total > 0 ? (
            <div className="mt-1 space-y-1.5">
              {([
                { label: "Taban görünümü", value: counts.taban },
                { label: "Yan İç görünümü", value: counts.yanIc },
                { label: "Yan Dış görünümü", value: counts.yanDis },
                // El satırları yalnız bölge varsa (ayak-only organda panel aynen kalır).
                ...(counts.elAvuc > 0 ? [{ label: "Avuç İçi görünümü", value: counts.elAvuc }] : []),
                ...(counts.elSirt > 0 ? [{ label: "El Sırtı görünümü", value: counts.elSirt }] : []),
              ]).map(({ label, value }) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-xl border border-[#efedf7] bg-white px-3 py-2"
                >
                  <span className="text-xs font-semibold text-violet-900">{label}</span>
                  <span className="text-sm font-black text-violet-950">{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-1.5 rounded-2xl border border-[#efedf7] bg-white px-3.5 py-3 text-[13px] font-medium leading-relaxed text-[#5b5873]">
              Bu organ için henüz bölge çizilmedi. Ayak üzerinde bölge işaretleyip Kaydet ile
              ekleyebilirsiniz.
            </p>
          )
        ) : (
          <p className="mt-1.5 rounded-2xl border border-[#efedf7] bg-white px-3.5 py-3 text-[13px] font-medium leading-relaxed text-[#5b5873]">
            Bir organ seçtiğinizde atlas bilgisi burada görüntülenir.
          </p>
        )}
      </div>

      {/* Onaylı tasarımdaki bilgilendirme kutusu — mevcut REF-002 metni (değişmedi). */}
      <div className="mt-3 rounded-2xl border border-[#dfe4fb] bg-[#eef1ff] px-3.5 py-3">
        <p className="flex items-center gap-2 text-[14px] font-bold text-[#3b3a8f]">
          <Info className="h-4 w-4 text-indigo-600" strokeWidth={2} aria-hidden />
          Bilgilendirme
        </p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#3f3d6b]">{REFLEXOLOGY_DISCLAIMER_TEXT}</p>
      </div>
    </aside>
  );
}
