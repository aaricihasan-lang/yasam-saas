"use client";

import Link from "next/link";

export default function NumerolojiHubPage() {
  const cardBase =
    "group relative flex min-h-[17rem] flex-col justify-between overflow-hidden rounded-3xl border sm:min-h-[19rem] lg:min-h-[22rem]";

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#07051a] text-white antialiased">
      {/* Arka plan: koyu mor / lacivert gradient + derinlik */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(109,40,217,0.45),transparent_55%),linear-gradient(180deg,#0b0628_0%,#120a2e_22%,#0c0824_55%,#050314_100%)]"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 opacity-[0.35]" aria-hidden>
        <div className="absolute -left-[10%] top-[5%] h-[28rem] w-[28rem] rounded-full bg-violet-600/35 blur-[100px]" />
        <div className="absolute right-[-5%] top-[20%] h-[32rem] w-[32rem] rounded-full bg-indigo-600/25 blur-[110px]" />
        <div className="absolute bottom-[-8%] left-[25%] h-[24rem] w-[24rem] rounded-full bg-fuchsia-600/20 blur-[90px]" />
        <div className="absolute right-[15%] bottom-[30%] h-[16rem] w-[16rem] rounded-full bg-amber-500/12 blur-[70px]" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(0,0,0,0.35))]" aria-hidden />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-10 sm:px-8 sm:py-14 lg:px-12 lg:py-16">
        {/* Başlık — büyük hero */}
        <header className="mb-10 text-center sm:mb-14 lg:mb-16">
          <p className="text-[11px] font-black uppercase tracking-[0.35em] text-amber-200/90 sm:text-xs">Yaşam Sistemi</p>
          <div className="mx-auto mt-4 max-w-4xl">
            <h1
              className="text-[clamp(2.5rem,8vw,4.75rem)] font-black leading-[1.05] tracking-tight text-white sm:tracking-tighter"
              style={{
                fontFamily: "Georgia, 'Palatino Linotype', Palatino, serif",
                textShadow:
                  "0 0 42px rgba(167,139,250,0.45), 0 0 80px rgba(109,40,217,0.25), 0 2px 0 rgba(0,0,0,0.4)",
              }}
            >
              Numeroloji
            </h1>
            <div
              className="mx-auto mt-5 h-px max-w-md bg-gradient-to-r from-transparent via-amber-400/50 to-transparent sm:mt-6"
              aria-hidden
            />
            <p className="mx-auto mt-6 max-w-2xl text-base font-medium leading-relaxed text-violet-100/88 sm:text-lg sm:leading-relaxed">
              Yaşam haritanızı hesaplayın, görsel raporunuzu oluşturun ve analizlerinizi güvenle saklayın. Devam etmek için bir modül seçin.
            </p>
          </div>
        </header>

        {/* Kartlar — geniş, yüksek, cam mor */}
        <div className="grid flex-1 grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-2 lg:gap-10 lg:items-stretch">
          <Link
            href="/numeroloji/analiz"
            className={`${cardBase} border-violet-400/25 bg-violet-950/25 p-7 shadow-[0_4px_40px_-8px_rgba(0,0,0,0.5)] ring-1 ring-inset ring-white/5 backdrop-blur-2xl transition duration-500 ease-out will-change-transform hover:z-[1] hover:scale-[1.02] hover:border-amber-400/45 hover:bg-violet-950/35 hover:shadow-[0_0_48px_-8px_rgba(167,139,250,0.35),0_28px_56px_-12px_rgba(0,0,0,0.55)] sm:p-9 lg:p-10 no-underline active:scale-[0.99]`}
          >
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-500/15 via-transparent to-sky-500/10 opacity-60 transition duration-500 group-hover:opacity-100"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-violet-500/20 blur-3xl transition duration-500 group-hover:bg-violet-400/30"
              aria-hidden
            />
            <div className="relative flex flex-1 flex-col">
              <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-[2.75rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-md sm:h-24 sm:w-24 sm:text-[3.25rem]">
                <span aria-hidden>🔢</span>
              </div>
              <h2 className="mt-6 text-2xl font-black tracking-tight text-white sm:mt-8 sm:text-3xl lg:text-[2rem]">
                Numeroloji Analizi
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-violet-100/85 sm:mt-4 sm:text-base sm:leading-relaxed">
                Ad, soyad ve doğum tarihi ile tam motor çıktısı, sekmeli analiz, premium görsel rapor ve yüksek çözünürlüklü PNG dışa aktarım.
              </p>
            </div>
            <span className="relative mt-8 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-amber-200/95 transition group-hover:text-amber-100 sm:text-sm">
              Modülü aç
              <span className="translate-x-0 transition-transform duration-300 group-hover:translate-x-1" aria-hidden>
                →
              </span>
            </span>
          </Link>

          <Link
            href="/numeroloji/liste"
            className={`${cardBase} border-violet-400/25 bg-violet-950/25 p-7 shadow-[0_4px_40px_-8px_rgba(0,0,0,0.5)] ring-1 ring-inset ring-white/5 backdrop-blur-2xl transition duration-500 ease-out will-change-transform hover:z-[1] hover:scale-[1.02] hover:border-amber-400/45 hover:bg-violet-950/35 hover:shadow-[0_0_48px_-8px_rgba(251,191,36,0.18),0_28px_56px_-12px_rgba(0,0,0,0.55)] sm:p-9 lg:p-10 no-underline active:scale-[0.99]`}
          >
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-violet-600/15 opacity-60 transition duration-500 group-hover:opacity-100"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-10 -right-10 h-44 w-44 rounded-full bg-amber-500/15 blur-3xl transition duration-500 group-hover:bg-amber-400/25"
              aria-hidden
            />
            <div className="relative flex flex-1 flex-col">
              <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-[2.75rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-md sm:h-24 sm:w-24 sm:text-[3.25rem]">
                <span aria-hidden>📋</span>
              </div>
              <h2 className="mt-6 text-2xl font-black tracking-tight text-white sm:mt-8 sm:text-3xl lg:text-[2rem]">Kayıtlı Analizler</h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-violet-100/85 sm:mt-4 sm:text-base sm:leading-relaxed">
                Supabase üzerinde saklanan analizlerinizi listeleyin; kayıt tarihi ve özet bilgilerle birlikte tek tıkla detay ekranına geçin.
              </p>
            </div>
            <span className="relative mt-8 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-amber-200/95 transition group-hover:text-amber-100 sm:text-sm">
              Listeyi aç
              <span className="translate-x-0 transition-transform duration-300 group-hover:translate-x-1" aria-hidden>
                →
              </span>
            </span>
          </Link>
        </div>

        <p className="mt-auto pt-12 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-violet-300/50 sm:pt-16">
          Premium numeroloji modülü
        </p>
      </div>
    </div>
  );
}
