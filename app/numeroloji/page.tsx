"use client";

import Link from "next/link";

const cardGlass =
  "group relative flex min-h-[320px] flex-col justify-between overflow-hidden rounded-[28px] border border-violet-500/25 bg-[rgba(15,8,35,0.55)] p-8 shadow-[0_8px_48px_-12px_rgba(0,0,0,0.65)] ring-1 ring-inset ring-violet-400/10 backdrop-blur-2xl transition-all duration-300 will-change-transform sm:min-h-[340px] sm:p-10 lg:min-h-[380px] lg:p-12";

const cardHover =
  "hover:z-[1] hover:scale-105 hover:border-amber-300/50 hover:bg-[rgba(20,10,45,0.72)] hover:shadow-[0_0_60px_-8px_rgba(167,139,250,0.45),0_0_80px_-20px_rgba(251,191,36,0.12),0_32px_64px_-16px_rgba(0,0,0,0.65)] active:scale-[0.98]";

export default function NumerolojiHubPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#040210] text-white antialiased">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_70%_at_50%_-15%,rgba(124,58,237,0.42),transparent_50%),linear-gradient(185deg,#0a0524_0%,#0c0828_35%,#060314_100%)]"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-[15%] top-0 h-[32rem] w-[32rem] rounded-full bg-violet-600/30 blur-[120px]" />
        <div className="absolute right-[-8%] top-[18%] h-[36rem] w-[36rem] rounded-full bg-indigo-700/22 blur-[130px]" />
        <div className="absolute bottom-[-12%] left-[20%] h-[28rem] w-[28rem] rounded-full bg-fuchsia-700/18 blur-[100px]" />
        <div className="absolute right-[12%] top-[45%] h-[18rem] w-[18rem] rounded-full bg-amber-500/10 blur-[80px]" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.5)_100%)]" aria-hidden />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col px-4 pb-8 pt-6 sm:px-10 sm:pb-10 sm:pt-8 lg:px-14 lg:pb-12 lg:pt-10">
        <header className="shrink-0 text-center">
          <p className="text-xs font-black uppercase tracking-[0.4em] text-amber-200/85 sm:text-sm">Yaşam Sistemi</p>
          <h1
            className="mt-3 font-black tracking-tight text-white sm:mt-4 text-4xl sm:text-5xl md:text-6xl lg:text-7xl"
            style={{
              fontFamily: "Georgia, 'Palatino Linotype', Palatino, serif",
              lineHeight: 1.02,
              textShadow:
                "0 0 50px rgba(167,139,250,0.55), 0 0 100px rgba(109,40,217,0.35), 0 4px 0 rgba(0,0,0,0.45)",
            }}
          >
            Numeroloji
          </h1>
          <div
            className="mx-auto mt-6 h-px max-w-lg bg-gradient-to-r from-transparent via-amber-400/45 to-transparent sm:mt-7"
            aria-hidden
          />
          <p className="mx-auto mt-6 max-w-3xl text-lg font-medium leading-relaxed text-violet-100/92 sm:mt-8 sm:text-xl sm:leading-relaxed lg:text-[1.35rem] lg:leading-relaxed">
            Yaşam haritanızı hesaplayın, premium görsel raporunuzu oluşturun ve analizlerinizi güvenle saklayın. Aşağıdan devam etmek istediğiniz modülü seçin.
          </p>
        </header>

        <div className="mt-10 flex flex-col sm:mt-12 lg:mt-14">
          <div className="grid grid-cols-1 gap-10 sm:gap-12 lg:grid-cols-2 lg:gap-14 xl:gap-16">
            <Link href="/numeroloji/analiz" className={`${cardGlass} ${cardHover} no-underline`}>
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-600/20 via-transparent to-sky-600/10 opacity-50 transition-all duration-300 group-hover:opacity-100"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-violet-500/25 blur-3xl transition-all duration-300 group-hover:bg-violet-400/35"
                aria-hidden
              />
              <div className="relative flex flex-1 flex-col">
                <div className="inline-flex h-28 w-28 items-center justify-center rounded-3xl border border-violet-400/35 bg-gradient-to-br from-violet-900/60 to-[#0c0618] text-6xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_40px_-8px_rgba(0,0,0,0.5)] backdrop-blur-md sm:h-32 sm:w-32 sm:text-7xl">
                  <span aria-hidden>🔢</span>
                </div>
                <h2 className="mt-8 text-3xl font-black tracking-tight text-white sm:mt-10 sm:text-4xl lg:text-[2.5rem] lg:leading-tight">
                  Numeroloji Analizi
                </h2>
                <p className="mt-4 max-w-xl text-base font-medium leading-relaxed text-violet-100/88 sm:mt-5 sm:text-lg lg:text-lg lg:leading-relaxed">
                  Ad, soyad ve doğum tarihi ile tam motor çıktısı; sekmeli analiz, premium yaşam haritası görseli ve yüksek çözünürlüklü PNG dışa aktarım tek ekranda.
                </p>
              </div>
              <span className="relative mt-10 flex items-center gap-3 text-sm font-black uppercase tracking-[0.22em] text-amber-200 transition-all duration-300 group-hover:text-amber-100 sm:text-base">
                Modülü aç
                <span className="text-xl transition-transform duration-300 group-hover:translate-x-2" aria-hidden>
                  →
                </span>
              </span>
            </Link>

            <Link href="/numeroloji/liste" className={`${cardGlass} ${cardHover} no-underline`}>
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/12 via-transparent to-violet-700/18 opacity-50 transition-all duration-300 group-hover:opacity-100"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-amber-500/18 blur-3xl transition-all duration-300 group-hover:bg-amber-400/28"
                aria-hidden
              />
              <div className="relative flex flex-1 flex-col">
                <div className="inline-flex h-28 w-28 items-center justify-center rounded-3xl border border-violet-400/35 bg-gradient-to-br from-indigo-950/80 to-[#0c0618] text-6xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_40px_-8px_rgba(0,0,0,0.5)] backdrop-blur-md sm:h-32 sm:w-32 sm:text-7xl">
                  <span aria-hidden>📋</span>
                </div>
                <h2 className="mt-8 text-3xl font-black tracking-tight text-white sm:mt-10 sm:text-4xl lg:text-[2.5rem] lg:leading-tight">
                  Kayıtlı Analizler
                </h2>
                <p className="mt-4 max-w-xl text-base font-medium leading-relaxed text-violet-100/88 sm:mt-5 sm:text-lg lg:text-lg lg:leading-relaxed">
                  Kayıtlarınızı listeleyin; ad soyad, doğum tarihi ve kayıt zamanıyla birlikte her kaydı açıp tam metin özetini anında görüntüleyin.
                </p>
              </div>
              <span className="relative mt-10 flex items-center gap-3 text-sm font-black uppercase tracking-[0.22em] text-amber-200 transition-all duration-300 group-hover:text-amber-100 sm:text-base">
                Listeyi aç
                <span className="text-xl transition-transform duration-300 group-hover:translate-x-2" aria-hidden>
                  →
                </span>
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
