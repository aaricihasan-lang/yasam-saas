"use client";

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
      return { taban, yanIc, yanDis, total: taban + yanIc + yanDis };
    } catch {
      return { taban: 0, yanIc: 0, yanDis: 0, total: 0 };
    }
    // atlasVersion bilinçli bağımlılık: kaydetten sonra sayıları tazelemek için.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgan, atlasVersion]);

  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col rounded-2xl border border-white/90 bg-white/80 p-2.5 shadow-[0_16px_40px_-18px_rgba(91,33,182,0.2)] ring-1 ring-violet-100/70 backdrop-blur-md lg:w-[240px]">
      <h2 className="text-xs font-black uppercase tracking-[0.2em] text-violet-900">Organ Atlası</h2>

      <div className="mt-1.5 rounded-xl border border-violet-200/70 bg-gradient-to-r from-violet-100/60 to-fuchsia-50/50 px-2.5 py-2">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-800">Seçili Organ:</p>
        <p
          className={`mt-0.5 text-sm font-bold leading-snug ${
            selectedOrgan ? "text-violet-950" : "font-semibold italic text-slate-600"
          }`}
        >
          {selectedOrgan ?? "Organ seçiniz"}
        </p>
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
          Kayıtlı Bölgeler
        </span>
        {selectedOrgan && counts ? (
          counts.total > 0 ? (
            <div className="mt-1 space-y-1.5">
              {([
                { label: "Taban görünümü", value: counts.taban },
                { label: "Yan İç görünümü", value: counts.yanIc },
                { label: "Yan Dış görünümü", value: counts.yanDis },
              ]).map(({ label, value }) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-lg border border-violet-200/60 bg-violet-50/40 px-2.5 py-1.5"
                >
                  <span className="text-xs font-semibold text-violet-900">{label}</span>
                  <span className="text-sm font-black text-violet-950">{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-1 rounded-xl border border-dashed border-violet-200/70 bg-violet-50/40 px-2.5 py-2 text-xs font-medium leading-relaxed text-violet-900">
              Bu organ için henüz bölge çizilmedi. Ayak üzerinde bölge işaretleyip Kaydet ile
              ekleyebilirsiniz.
            </p>
          )
        ) : (
          <p className="mt-1 rounded-xl border border-dashed border-violet-200/70 bg-violet-50/40 px-2.5 py-2 text-xs font-medium leading-relaxed text-violet-900">
            Bir organ seçtiğinizde atlas bilgisi burada görüntülenir.
          </p>
        )}
      </div>
    </aside>
  );
}
