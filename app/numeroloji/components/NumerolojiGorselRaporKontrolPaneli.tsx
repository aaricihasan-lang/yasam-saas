"use client";

import { GORSEL_TEMA_LIST, type GorselTemaId } from "./NumerolojiGorselRaporInfografik";

export type GorselRaporKontrolYanPanelProps = {
  gorselTaslariGoster: boolean;
  setGorselTaslariGoster: (value: boolean) => void;
  uzmanAdi: string;
  setUzmanAdi: (value: string) => void;
  tasBileklik: string;
  setTasBileklik: (value: string) => void;
  tasKolye: string;
  setTasKolye: (value: string) => void;
  tasKutle: string;
  setTasKutle: (value: string) => void;
};

export function GorselRaporKontrolYanPanel({
  gorselTaslariGoster,
  setGorselTaslariGoster,
  uzmanAdi,
  setUzmanAdi,
  tasBileklik,
  setTasBileklik,
  tasKolye,
  setTasKolye,
  tasKutle,
  setTasKutle,
}: GorselRaporKontrolYanPanelProps) {
  return (
    <aside className="shrink-0 space-y-3 rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-sm ring-1 ring-violet-100/50 lg:sticky lg:top-2 lg:w-[min(100%,280px)]">
      <label className="flex cursor-pointer items-start gap-2 text-xs font-semibold text-slate-800">
        <input
          type="checkbox"
          checked={gorselTaslariGoster}
          onChange={(e) => setGorselTaslariGoster(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
        />
        <span>Taş önerilerini görsel raporda göster</span>
      </label>
      <div>
        <label htmlFor="noj-uzman" className="mb-1 block text-xs font-bold text-slate-700">
          Uzman adı
        </label>
        <input
          id="noj-uzman"
          type="text"
          value={uzmanAdi}
          onChange={(e) => setUzmanAdi(e.target.value)}
          placeholder="Örn. Hasan Arıcı"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-violet-100 focus:ring-2"
          autoComplete="name"
        />
      </div>
      <div>
        <label htmlFor="noj-tas-bileklik" className="mb-1 block text-xs font-bold text-slate-700">
          Bileklik taşları
        </label>
        <textarea
          id="noj-tas-bileklik"
          value={tasBileklik}
          onChange={(e) => setTasBileklik(e.target.value)}
          rows={2}
          placeholder="Virgülle ayırarak yazın"
          className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none ring-violet-100 focus:ring-2"
        />
      </div>
      <div>
        <label htmlFor="noj-tas-kolye" className="mb-1 block text-xs font-bold text-slate-700">
          Kolye taşları
        </label>
        <textarea
          id="noj-tas-kolye"
          value={tasKolye}
          onChange={(e) => setTasKolye(e.target.value)}
          rows={2}
          placeholder="Virgülle ayırarak yazın"
          className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none ring-violet-100 focus:ring-2"
        />
      </div>
      <div>
        <label htmlFor="noj-tas-kutle" className="mb-1 block text-xs font-bold text-slate-700">
          Kütle taşları
        </label>
        <textarea
          id="noj-tas-kutle"
          value={tasKutle}
          onChange={(e) => setTasKutle(e.target.value)}
          rows={2}
          placeholder="Virgülle ayırarak yazın"
          className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none ring-violet-100 focus:ring-2"
        />
      </div>
    </aside>
  );
}

export type GorselRaporKontrolCubuguProps = {
  gorselTema: GorselTemaId;
  setGorselTema: (id: GorselTemaId) => void;
  onGorselPngIndir: () => void;
  gorselIndirmeKilitli: boolean;
  gorselPngHazirlaniyor: boolean;
  gorselTamEkran: boolean;
  setGorselTamEkran: (value: boolean) => void;
};

export function GorselRaporKontrolCubugu({
  gorselTema,
  setGorselTema,
  onGorselPngIndir,
  gorselIndirmeKilitli,
  gorselPngHazirlaniyor,
  gorselTamEkran,
  setGorselTamEkran,
}: GorselRaporKontrolCubuguProps) {
  return (
    <div className="absolute right-0 top-0 z-20 flex max-w-[min(100%,28rem)] flex-col items-stretch gap-2 sm:right-0 sm:top-0 sm:max-w-none sm:flex-row sm:items-start sm:justify-end">
      <div
        role="group"
        aria-label="Görsel rapor teması"
        className="flex flex-wrap justify-end gap-1.5 rounded-2xl border-2 border-amber-400/55 bg-zinc-950/95 px-2.5 py-2 shadow-[0_4px_24px_rgba(0,0,0,0.65)] backdrop-blur-md sm:gap-2"
      >
        {GORSEL_TEMA_LIST.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setGorselTema(t.id)}
            className={`rounded-full border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide shadow-sm transition sm:px-3 sm:text-[11px] ${
              gorselTema === t.id
                ? "border-amber-300/90 bg-amber-400 text-zinc-950 ring-2 ring-amber-200/90"
                : "border-zinc-600/80 bg-zinc-900/95 text-zinc-100 hover:border-amber-500/50 hover:bg-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onGorselPngIndir}
        disabled={gorselIndirmeKilitli}
        className="shrink-0 self-end rounded-full border-2 border-emerald-400/75 bg-zinc-950 px-3 py-2 text-[10px] font-black uppercase leading-tight tracking-[0.08em] text-emerald-50 shadow-[0_0_20px_rgba(52,211,153,0.28)] backdrop-blur-md transition hover:border-emerald-300 hover:bg-zinc-900 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:text-xs sm:tracking-[0.1em]"
      >
        {gorselPngHazirlaniyor ? "Görsel hazırlanıyor..." : "PNG İndir"}
      </button>
      {!gorselTamEkran ? (
        <button
          type="button"
          onClick={() => setGorselTamEkran(true)}
          className="shrink-0 self-end rounded-full border-2 border-amber-400/80 bg-zinc-950 px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-amber-100 shadow-[0_0_20px_rgba(251,191,36,0.25)] backdrop-blur-md transition hover:border-amber-300 hover:bg-zinc-900 hover:text-amber-50 sm:px-5 sm:text-xs"
        >
          Tam Ekran
        </button>
      ) : null}
    </div>
  );
}

export type GorselRaporTamEkranKontrolCubuguProps = {
  gorselTema: GorselTemaId;
  setGorselTema: (id: GorselTemaId) => void;
  onGorselPngIndir: () => void;
  gorselIndirmeKilitli: boolean;
  gorselPngHazirlaniyor: boolean;
};

export function GorselRaporTamEkranKontrolCubugu({
  gorselTema,
  setGorselTema,
  onGorselPngIndir,
  gorselIndirmeKilitli,
  gorselPngHazirlaniyor,
}: GorselRaporTamEkranKontrolCubuguProps) {
  return (
    <div className="fixed left-6 top-6 z-[10050] flex flex-col gap-2">
      <div
        role="group"
        aria-label="Tam ekran teması"
        className="flex max-w-[min(calc(100vw-8rem),36rem)] flex-wrap gap-1.5 rounded-2xl border-2 border-amber-400/55 bg-zinc-950/95 px-2 py-1.5 shadow-[0_4px_28px_rgba(0,0,0,0.85)] backdrop-blur-md"
      >
        {GORSEL_TEMA_LIST.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setGorselTema(t.id)}
            className={`rounded-full border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide shadow-sm transition sm:px-3 sm:text-[11px] ${
              gorselTema === t.id
                ? "border-amber-300/90 bg-amber-400 text-zinc-950 ring-2 ring-amber-200/90"
                : "border-zinc-600/80 bg-zinc-900/95 text-zinc-100 hover:border-amber-500/50 hover:bg-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onGorselPngIndir}
        disabled={gorselIndirmeKilitli}
        className="rounded-full border-2 border-emerald-400/75 bg-zinc-950/95 px-3 py-2 text-center text-[9px] font-black uppercase leading-tight tracking-[0.06em] text-emerald-50 shadow-[0_4px_28px_rgba(0,0,0,0.85)] backdrop-blur-md transition hover:border-emerald-300 hover:bg-zinc-900 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 sm:text-[10px] sm:tracking-[0.1em]"
      >
        {gorselPngHazirlaniyor ? "Görsel hazırlanıyor..." : "PNG İndir"}
      </button>
    </div>
  );
}
