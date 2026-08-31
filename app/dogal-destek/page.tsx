import DogalDestekCards from "./DogalDestekCards";

export default function DogalDestekPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#071226] text-slate-100 antialiased">
      <div
        className="pointer-events-none absolute left-[-80px] top-[-80px] h-80 w-80 rounded-full bg-emerald-600/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-[-60px] top-0 h-72 w-72 rounded-full bg-amber-400/15 blur-3xl"
        aria-hidden
      />

      <div className="relative z-10 flex min-h-[calc(100vh-90px)] w-full flex-col px-4 py-4 sm:px-6 xl:px-10">
        <header className="shrink-0 py-4 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-emerald-300/90">
            YAŞAM SİSTEMİ
          </p>
          <h1 className="mt-2 bg-gradient-to-r from-emerald-300 via-teal-200 to-amber-300 bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-5xl xl:text-6xl">
            Doğal Destek &amp; Rehber
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
            Doğal destek yöntemleri ve profesyonel başvuru kaynakları
          </p>
          <div
            className="mx-auto mt-4 h-1 w-full max-w-sm rounded-full bg-gradient-to-r from-transparent via-emerald-400/80 to-transparent"
            aria-hidden
          />
        </header>

        <div className="flex flex-1 items-center justify-center py-6">
          <DogalDestekCards />
        </div>
      </div>
    </main>
  );
}
