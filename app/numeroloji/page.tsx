"use client";

import Link from "next/link";

const cardGlass =
  "group relative flex min-h-[280px] flex-col justify-between overflow-hidden rounded-[24px] border border-violet-500/25 bg-[rgba(15,8,35,0.55)] p-6 shadow-[0_8px_48px_-12px_rgba(0,0,0,0.65)] ring-1 ring-inset ring-violet-400/10 backdrop-blur-2xl transition-all duration-300 will-change-transform sm:min-h-[300px] sm:p-7 lg:min-h-0 lg:p-6 xl:p-7";

const cardHover =
  "hover:z-[1] hover:scale-[1.03] hover:border-amber-300/50 hover:bg-[rgba(20,10,45,0.72)] hover:shadow-[0_0_60px_-8px_rgba(167,139,250,0.45),0_0_80px_-20px_rgba(251,191,36,0.12),0_32px_64px_-16px_rgba(0,0,0,0.65)] active:scale-[0.98]";

const cardIcon =
  "inline-flex h-20 w-20 items-center justify-center rounded-2xl border border-violet-400/35 bg-gradient-to-br from-violet-900/60 to-[#0c0618] text-5xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_40px_-8px_rgba(0,0,0,0.5)] backdrop-blur-md lg:h-[4.5rem] lg:w-[4.5rem] lg:text-[2.75rem]";

const cardTitle = "mt-5 text-2xl font-black tracking-tight text-white sm:mt-6 sm:text-[1.65rem] lg:mt-5 lg:text-2xl lg:leading-tight";

const cardDesc =
  "mt-3 text-sm font-medium leading-relaxed text-violet-100/88 sm:text-[0.95rem] lg:mt-3 lg:text-sm lg:leading-relaxed";

const cardCta =
  "relative mt-6 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-amber-200 transition-all duration-300 group-hover:text-amber-100 sm:text-sm lg:mt-7";

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

      <div className="relative z-10 flex min-h-screen w-full flex-col px-4 pb-6 pt-5 sm:px-8 sm:pb-8 sm:pt-6 lg:px-10 lg:pb-8 lg:pt-7 xl:px-12">
        <header className="shrink-0 text-center">
          <p className="text-xs font-black uppercase tracking-[0.4em] text-amber-200/85 sm:text-sm">Yaşam Sistemi</p>
          <h1
            className="mt-2 font-black tracking-tight text-white sm:mt-3 text-4xl sm:text-5xl md:text-6xl lg:text-6xl xl:text-[4.25rem]"
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
            className="mx-auto mt-4 h-px max-w-lg bg-gradient-to-r from-transparent via-amber-400/45 to-transparent sm:mt-5 lg:mt-5"
            aria-hidden
          />
          <p className="mx-auto mt-4 max-w-3xl text-base font-medium leading-relaxed text-violet-100/92 sm:mt-5 sm:text-lg lg:mt-6 lg:text-xl lg:leading-relaxed">
            Yaşam haritanızı hesaplayın, premium görsel raporunuzu oluşturun ve analizlerinizi güvenle saklayın. Aşağıdan devam etmek istediğiniz modülü seçin.
          </p>
        </header>

        <div className="mt-8 flex flex-1 flex-col justify-center sm:mt-10 lg:mt-8">
          <div className="grid grid-cols-1 gap-8 sm:gap-10 lg:grid-cols-3 lg:gap-6 xl:gap-8">
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
                <div className={cardIcon}>
                  <span aria-hidden>🔢</span>
                </div>
                <h2 className={cardTitle}>Numeroloji Analizi</h2>
                <p className={cardDesc}>
                  Ad, soyad ve doğum tarihi ile tam motor çıktısı; sekmeli analiz, premium yaşam haritası görseli ve yüksek çözünürlüklü PNG dışa aktarım tek ekranda.
                </p>
              </div>
              <span className={cardCta}>
                Modülü aç
                <span className="text-lg transition-transform duration-300 group-hover:translate-x-1.5" aria-hidden>
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
                <div className={`${cardIcon} from-indigo-950/80`}>
                  <span aria-hidden>📋</span>
                </div>
                <h2 className={cardTitle}>Kayıtlı Analizler</h2>
                <p className={cardDesc}>
                  Kayıtlarınızı listeleyin; ad soyad, doğum tarihi ve kayıt zamanıyla birlikte her kaydı açıp tam metin özetini anında görüntüleyin.
                </p>
              </div>
              <span className={cardCta}>
                Listeyi aç
                <span className="text-lg transition-transform duration-300 group-hover:translate-x-1.5" aria-hidden>
                  →
                </span>
              </span>
            </Link>

            <Link href="/numeroloji/bilgi-bankasi" className={`${cardGlass} ${cardHover} no-underline`}>
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-500/14 via-transparent to-emerald-600/12 opacity-50 transition-all duration-300 group-hover:opacity-100"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -left-12 bottom-[-3rem] h-48 w-48 rounded-full bg-sky-500/20 blur-3xl transition-all duration-300 group-hover:bg-sky-400/30"
                aria-hidden
              />
              <div className="relative flex flex-1 flex-col">
                <div className={`${cardIcon} from-teal-950/70`}>
                  <span aria-hidden>📚</span>
                </div>
                <h2 className={cardTitle}>Bilgi Bankası</h2>
                <p className={cardDesc}>
                  Numeroloji eğitim notları, açıklamalar, yorum metinleri ve bilgi içeriklerini tek merkezde düzenleyin.
                </p>
              </div>
              <span className={cardCta}>
                BİLGİ BANKASINI AÇ
                <span className="text-lg transition-transform duration-300 group-hover:translate-x-1.5" aria-hidden>
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
