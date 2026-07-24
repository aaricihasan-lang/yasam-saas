"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { resolveNumerolojiSurface } from "./helpers/mobileUxLogic";

// NUM-MOB-2-FIX2: modül-launcher yüzey sınıfları — karar TEK KAYNAK resolveNumerolojiSurface
// modelinden gelir (mobil "flat-row" düz satır / masaüstü "existing-card" koyu premium kart).
// Her iki sınıf da kaynakta literaldir (runtime Tailwind üretimi yok).
const LAUNCHER_ROW =
  "group relative flex min-h-[56px] flex-col justify-between overflow-hidden border-b border-violet-500/20 py-3 transition-all duration-300";
const LAUNCHER_CARD =
  "group relative flex min-h-[180px] flex-col justify-between overflow-hidden rounded-[18px] border border-violet-500/25 bg-[rgba(15,8,35,0.55)] p-4 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.65)] ring-1 ring-inset ring-violet-400/10 backdrop-blur-2xl transition-all duration-300 will-change-transform lg:min-h-0 lg:p-3.5 xl:p-4";

const cardHover =
  "hover:z-[1] hover:scale-[1.03] hover:border-amber-300/50 hover:bg-[rgba(20,10,45,0.72)] hover:shadow-[0_0_40px_-8px_rgba(167,139,250,0.40),0_0_60px_-20px_rgba(251,191,36,0.10),0_24px_48px_-16px_rgba(0,0,0,0.65)] active:scale-[0.98]";

const cardIcon =
  "inline-flex h-12 w-12 items-center justify-center rounded-xl border border-violet-400/35 bg-gradient-to-br from-violet-900/60 to-[#0c0618] text-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_28px_-8px_rgba(0,0,0,0.5)] backdrop-blur-md lg:h-12 lg:w-12 lg:text-2xl";

const cardTitle = "mt-2.5 text-lg font-black tracking-tight text-white sm:mt-2.5 sm:text-lg lg:mt-2.5 lg:text-lg lg:leading-tight";

const cardDesc =
  "mt-1.5 line-clamp-3 text-xs font-medium leading-relaxed text-violet-100/88 lg:mt-1.5 lg:text-xs";

const cardCta =
  "relative mt-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-amber-200 transition-all duration-300 group-hover:text-amber-100 lg:mt-3";

/** Numeroloji — 8 köşeli yıldız / kutsal-sayı sembolü */
function IconAnaliz() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 text-amber-200" fill="none" aria-hidden>
      <path
        d="M12 2.2l1.9 4.6 4.6 1.9-4.6 1.9L12 15.2l-1.9-4.6L5.5 8.7l4.6-1.9L12 2.2z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.18"
      />
      <circle cx="12" cy="19.4" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M12 13.5v4.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** Kayıtlı Analizler — arşiv / katmanlı liste sembolü */
function IconArsiv() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 text-violet-100" fill="none" aria-hidden>
      <rect x="3.5" y="4" width="17" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3" fill="currentColor" fillOpacity="0.12" />
      <path d="M5 9v9.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V9" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9.5 13h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** Bilgi Bankası — açık kitap sembolü */
function IconBilgi() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 text-sky-100" fill="none" aria-hidden>
      <path d="M12 6.5C10.4 5.2 8.2 4.8 5.5 5v12c2.7-.2 4.9.2 6.5 1.5 1.6-1.3 3.8-1.7 6.5-1.5V5c-2.7-.2-4.9.2-6.5 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="currentColor" fillOpacity="0.1" />
      <path d="M12 6.5v12" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export default function NumerolojiHubPage() {
  // NUM-MOB-2-FIX2: viewport → modül-launcher yüzey kararı saf model üzerinden (tek kaynak).
  const [viewportW, setViewportW] = useState<number>(() => (typeof window !== "undefined" ? window.innerWidth : 1024));
  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const launcher = resolveNumerolojiSurface(viewportW, "module-launcher");
  const launcherBase = launcher === "flat-row" ? LAUNCHER_ROW : `${LAUNCHER_CARD} ${cardHover}`;
  const launcherAmber =
    launcher === "existing-card"
      ? "border-amber-300/45 ring-amber-300/20 shadow-[0_0_50px_-14px_rgba(251,191,36,0.30),0_8px_40px_-12px_rgba(0,0,0,0.65)]"
      : "";

  return (
    <div className="relative min-h-screen overflow-y-auto bg-[#040210] text-white antialiased">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_100%_70%_at_50%_-15%,rgba(124,58,237,0.42),transparent_50%),linear-gradient(185deg,#0a0524_0%,#0c0828_35%,#060314_100%)]"
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        <div className="absolute -left-[15%] top-0 h-[22rem] w-[22rem] rounded-full bg-violet-600/28 blur-[90px]" />
        <div className="absolute right-[-8%] top-[18%] h-[26rem] w-[26rem] rounded-full bg-indigo-700/20 blur-[100px]" />
        <div className="absolute bottom-[-12%] left-[20%] h-[20rem] w-[20rem] rounded-full bg-fuchsia-700/16 blur-[80px]" />
        <div className="absolute right-[12%] top-[45%] h-[14rem] w-[14rem] rounded-full bg-amber-500/10 blur-[60px]" />
      </div>
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.5)_100%)]" aria-hidden />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1400px] flex-col px-4 pb-6 pt-2 sm:px-6 sm:pb-8 sm:pt-3 lg:px-8 lg:pb-6 lg:pt-2">
        <header className="shrink-0 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-200/85">Yaşam Sistemi</p>
          <h1
            className="mt-1 font-black tracking-tight text-white text-3xl sm:text-4xl lg:text-4xl xl:text-5xl"
            style={{
              fontFamily: "Georgia, 'Palatino Linotype', Palatino, serif",
              lineHeight: 1.02,
              textShadow:
                "0 0 30px rgba(167,139,250,0.50), 0 0 60px rgba(109,40,217,0.28), 0 3px 0 rgba(0,0,0,0.45)",
            }}
          >
            Numeroloji
          </h1>
          <div
            className="mx-auto mt-2 h-px max-w-lg bg-gradient-to-r from-transparent via-amber-400/45 to-transparent"
            aria-hidden
          />
          <p className="mx-auto mt-2 max-w-xl text-xs font-medium leading-snug text-violet-100/92">
            Yaşam haritanızı hesaplayın, raporunuzu oluşturun ve analizlerinizi saklayın. Modülü seçin.
          </p>
        </header>

        <div className="mt-4 flex flex-1 flex-col lg:justify-center lg:mt-4">
          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3 lg:gap-4">
            <Link
              href="/numeroloji/analiz"
              className={`${launcherBase} no-underline ${launcherAmber}`}
            >
              <span className="absolute right-3 top-3 z-[2] rounded-full border border-amber-300/60 bg-amber-400/15 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-amber-100 shadow-sm backdrop-blur-md">
                Buradan başlayın
              </span>
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/14 via-violet-600/12 to-sky-600/10 opacity-60 transition-all duration-300 group-hover:opacity-100"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amber-500/18 blur-3xl transition-all duration-300 group-hover:bg-amber-400/28"
                aria-hidden
              />
              <div className="relative flex flex-1 flex-col">
                <div className={`${cardIcon} border-amber-300/40 from-amber-900/40`}>
                  <IconAnaliz />
                </div>
                <h2 className={cardTitle}>Numeroloji Analizi</h2>
                <p className={cardDesc}>
                  Ad, soyad ve doğum tarihi ile tam motor çıktısı; sekmeli analiz, premium yaşam haritası görseli ve yüksek çözünürlüklü PNG dışa aktarım tek ekranda.
                </p>
              </div>
              <span className={cardCta}>
                Analizi aç
                <span className="text-lg transition-transform duration-300 group-hover:translate-x-1.5" aria-hidden>
                  →
                </span>
              </span>
            </Link>

            <Link href="/numeroloji/liste" className={`${launcherBase} no-underline`}>
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
                  <IconArsiv />
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

            <Link href="/numeroloji/bilgi-bankasi" className={`${launcherBase} no-underline`}>
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
                  <IconBilgi />
                </div>
                <h2 className={cardTitle}>Bilgi Bankası</h2>
                <p className={cardDesc}>
                  Numeroloji eğitim notları, açıklamalar, yorum metinleri ve bilgi içeriklerini tek merkezde düzenleyin.
                </p>
              </div>
              <span className={cardCta}>
                Bilgi Bankasını aç
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
