"use client";

import { runInEffect } from "@/lib/runInEffect";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { NumerolojiPremiumShell } from "../components/NumerolojiPremiumShell";
import Link from "next/link";
import { hesaplaNumeroloji } from "@/lib/numeroloji";
import { gorselRaporuPngYakalaVeIndir } from "../gorselRaporExport";
import { SaveAnalysisButton } from "../components/SaveAnalysisButton";
import {
  TabSonucOzeti,
  TabAnalizOzetli,
  TabPlainAnaliz,
  TabTasAtamalari,
} from "../components/NumerolojiAnalizSonucTabs";
import {
  ContentFontSizeProvider,
  NumerolojiFontSizeControl,
  type ContentFontSize,
} from "../components/numerolojiContentTypography";
import type { NumerolojiMotorOut } from "../utils/numerolojiPlainMetin";
import { GorselRaporInfografik, type GorselTemaId } from "../components/NumerolojiGorselRaporInfografik";
import {
  GorselRaporKontrolCubugu,
  GorselRaporKontrolYanPanel,
  GorselRaporTamEkranKontrolCubugu,
} from "../components/NumerolojiGorselRaporKontrolPaneli";

type TabId = "summary" | "plain" | "detailed" | "tas" | "gorsel";

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ");
}

function formatFirstNameTurkish(value: string): string {
  const s = collapseSpaces(value.trimStart());
  if (!s) return "";
  const trailingSpace = s.endsWith(" ") ? " " : "";
  return (
    s
      .split(" ")
      .filter(Boolean)
      .map((word) => {
        const lower = word.toLocaleLowerCase("tr-TR");
        return lower.charAt(0).toLocaleUpperCase("tr-TR") + lower.slice(1);
      })
      .join(" ") + trailingSpace
  );
}

function formatLastNameTurkish(value: string): string {
  const s = collapseSpaces(value.trimStart());
  if (!s) return "";
  return s
    .split(" ")
    .filter(Boolean)
    .map((word) => word.toLocaleUpperCase("tr-TR"))
    .join(" ");
}

function formatBirthDigitsInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const d = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  const y = digits.slice(4, 8);
  let out = d;
  if (m.length > 0) out += "/" + m;
  if (y.length > 0) out += "/" + y;
  return out;
}

function birthDateForMotor(display: string): string {
  return display.trim().replace(/\//g, ".");
}


const TABS: { id: TabId; label: string }[] = [
  { id: "summary", label: "Sonuç Özeti" },
  { id: "plain", label: "Analiz (Hesap Özetsiz)" },
  { id: "detailed", label: "Analiz (Hesap Özetli)" },
  { id: "tas", label: "Taş Açıklamaları" },
  { id: "gorsel", label: "Görsel Rapor" },
];

export default function NumerolojiAnalizPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<NumerolojiMotorOut | null>(null);
  const [tab, setTab] = useState<TabId>("summary");
  const [gorselTema, setGorselTema] = useState<GorselTemaId>("kozmikMor");
  const [gorselTamEkran, setGorselTamEkran] = useState(false);
  const [gorselPortalHazir, setGorselPortalHazir] = useState(false);
  const [gorselTaslariGoster, setGorselTaslariGoster] = useState(false);
  const [uzmanAdi, setUzmanAdi] = useState("");
  const [tasBileklik, setTasBileklik] = useState("");
  const [tasKolye, setTasKolye] = useState("");
  const [tasKutle, setTasKutle] = useState("");
  const [contentFontSize, setContentFontSize] = useState<ContentFontSize>("normal");
  const gorselRaporRef = useRef<HTMLDivElement>(null);
  const [gorselPngHazirlaniyor, setGorselPngHazirlaniyor] = useState(false);
  const gorselIndirmeKilitli = gorselPngHazirlaniyor;

  useEffect(() => {
    runInEffect(() => {
      setGorselPortalHazir(true);
    });
  }, []);

  useEffect(() => {
    if (!gorselTamEkran) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [gorselTamEkran]);

  useEffect(() => {
    if (!gorselTamEkran) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGorselTamEkran(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gorselTamEkran]);

  useEffect(() => {
    if (tab === "gorsel") return;
    runInEffect(() => {
      setGorselTamEkran(false);
    });
  }, [tab]);

  async function handleGorselPngIndir() {
    if (gorselIndirmeKilitli) return;
    const el0 = gorselRaporRef.current;
    if (!el0) return;

    const scrollHost = el0.closest("[data-gorsel-rapor-scroll-host]") as HTMLElement | null;
    const prevMaxH = scrollHost?.style.maxHeight ?? "";
    const prevOverflow = scrollHost?.style.overflow ?? "";
    const prevMinH = scrollHost?.style.minHeight ?? "";

    setGorselPngHazirlaniyor(true);
    if (scrollHost) {
      scrollHost.style.maxHeight = "none";
      scrollHost.style.overflow = "visible";
      scrollHost.style.minHeight = "0";
    }

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    await new Promise<void>((r) => setTimeout(r, 120));

    const el = gorselRaporRef.current;
    try {
      if (el) await gorselRaporuPngYakalaVeIndir(el);
    } catch (err) {
      console.error(err);
    } finally {
      if (scrollHost) {
        scrollHost.style.maxHeight = prevMaxH;
        scrollHost.style.overflow = prevOverflow;
        scrollHost.style.minHeight = prevMinH;
      }
      setGorselPngHazirlaniyor(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOut(null);

    const fnRaw = firstName.trim();
    const lnRaw = lastName.trim();
    const bd = birthDate.trim();

    if (!fnRaw) {
      setError("Lütfen adınızı girin.");
      return;
    }
    if (!lnRaw) {
      setError("Lütfen soyadınızı girin.");
      return;
    }
    if (!bd) {
      setError("Lütfen doğum tarihini girin.");
      return;
    }
    if (bd.length !== 10) {
      setError("Doğum tarihini GG/AA/YYYY formatında tamamlayın.");
      return;
    }

    const fn = formatFirstNameTurkish(fnRaw);
    const ln = formatLastNameTurkish(lnRaw);
    setFirstName(fn);
    setLastName(ln);

    try {
      setOut(
        hesaplaNumeroloji({
          firstName: fn,
          lastName: ln,
          birthDate: birthDateForMotor(bd),
        }),
      );
      setTab("summary");
    } catch (err) {
      console.error(err);
      setError("Hesaplama sırasında bir hata oluştu.");
    }
  }

  const isimGoster = `${firstName.trim()} ${lastName.trim()}`.replace(/\s+/g, " ").trim();
  const dogumGoster = birthDate.trim();
  const inputClass =
    "h-10 w-full rounded-xl border border-slate-200/90 bg-white/95 px-3 py-0 text-sm font-medium text-slate-900 shadow-sm outline-none ring-violet-100/80 transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-2 focus:ring-violet-200/40";
  const analizNavLinkClass =
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-violet-200/80 bg-white/80 px-3 py-1.5 text-xs font-bold text-violet-900 shadow-sm ring-1 ring-violet-100/60 backdrop-blur-md transition-all hover:scale-[1.02] hover:border-violet-300 hover:bg-white/95 no-underline";

  return (
    <NumerolojiPremiumShell maxWidthClass="max-w-none">
      <BfcacheRefreshHandler />
      <div className="space-y-3">
        <header className="relative overflow-hidden rounded-2xl border border-violet-200/50 bg-gradient-to-br from-violet-200/40 via-white/70 to-amber-100/35 px-4 py-4 text-center shadow-[0_10px_32px_-12px_rgba(91,33,182,0.28)] ring-1 ring-white/60 backdrop-blur-xl sm:px-6 sm:py-5">
          <div className="pointer-events-none absolute -left-14 -top-14 h-40 w-40 rounded-full bg-violet-400/25 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-10 -right-10 h-36 w-36 rounded-full bg-amber-300/20 blur-3xl" aria-hidden />
          <nav
            className="absolute top-3 right-3 z-20 flex flex-row flex-wrap items-center justify-end gap-1.5"
            aria-label="Sayfa gezinmesi"
          >
            <Link href="/numeroloji" className={analizNavLinkClass}>
              ← Modül seçimi
            </Link>
            <Link href="/numeroloji/liste" className={analizNavLinkClass}>
              Kayıtlı analizler
            </Link>
          </nav>
          <div className="relative pt-8">
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-violet-800/90">
              Yaşam Sistemi &middot; Numeroloji
            </p>
            <h1
              className="mt-1.5 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl"
              style={{ textShadow: "0 4px 24px rgba(91,33,182,0.2), 0 2px 0 rgba(255,255,255,0.85)" }}
            >
              Numeroloji Analizi
            </h1>
            <p className="mx-auto mt-1.5 max-w-xl text-xs font-medium leading-relaxed text-slate-600 sm:text-sm">
              Yaşam haritanızı hesaplayın, görsel raporunuzu oluşturun ve analizlerinizi kaydedin.
            </p>
            <div className="relative mx-auto mt-3 flex max-w-xs items-center justify-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-violet-400/70 to-violet-300/30" />
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-100/95 via-white to-amber-50/90 shadow-[0_0_12px_rgba(139,92,246,0.2)] ring-1 ring-violet-200/70">
                <span className="text-xs leading-none text-violet-600/90">✦</span>
              </span>
              <span className="h-px flex-1 bg-gradient-to-l from-transparent via-violet-400/70 to-violet-300/30" />
            </div>
          </div>
        </header>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/85 bg-white/75 p-4 shadow-[0_8px_24px_-10px_rgba(91,33,182,0.15)] ring-1 ring-violet-100/50 backdrop-blur-xl sm:p-5"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="noj-ad" className="mb-1 block text-xs font-bold text-slate-700">
                Ad
              </label>
              <input
                id="noj-ad"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(formatFirstNameTurkish(e.target.value))}
                placeholder="Örn. Hasan Ali"
                className={inputClass}
                autoComplete="given-name"
              />
            </div>
            <div>
              <label htmlFor="noj-soyad" className="mb-1 block text-xs font-bold text-slate-700">
                Soyad
              </label>
              <input
                id="noj-soyad"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(formatLastNameTurkish(e.target.value))}
                placeholder="Örn. YILMAZ"
                className={inputClass}
                autoComplete="family-name"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="noj-dt" className="mb-1 block text-xs font-bold text-slate-700">
                Doğum Tarihi
              </label>
              <input
                id="noj-dt"
                type="text"
                inputMode="numeric"
                maxLength={10}
                value={birthDate}
                onChange={(e) => setBirthDate(formatBirthDigitsInput(e.target.value))}
                placeholder="GG/AA/YYYY"
                className={inputClass}
                autoComplete="bday"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-stretch">
            <button
              type="submit"
              className="min-w-[140px] flex-1 rounded-xl bg-gradient-to-r from-violet-600 via-violet-700 to-indigo-600 px-6 py-2.5 text-sm font-black uppercase tracking-[0.12em] text-white shadow-[0_10px_28px_-6px_rgba(91,33,182,0.5)] ring-1 ring-white/30 transition duration-200 hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] sm:flex-none"
            >
              HESAPLA
            </button>
            <SaveAnalysisButton
              firstName={firstName}
              lastName={lastName}
              birthDateDisplay={birthDate.trim()}
              motorOutput={out}
              variant="premium"
            />
          </div>
        </form>

        {error ? (
          <div
            role="alert"
            className="mb-4 rounded-2xl border border-rose-200/80 bg-rose-50/90 px-4 py-3 text-center text-sm font-semibold text-rose-900 shadow-sm ring-1 ring-rose-100/60 backdrop-blur-sm"
          >
            {error}
          </div>
        ) : null}

        {out ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/85 shadow-[0_12px_36px_-14px_rgba(91,33,182,0.18)] ring-1 ring-violet-100/55 backdrop-blur-md">
            <div className="border-b border-slate-200/80 bg-gradient-to-r from-violet-100/70 via-white/50 to-amber-50/60 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
                <NumerolojiFontSizeControl value={contentFontSize} onChange={setContentFontSize} />
              </div>
              <div className="flex flex-wrap gap-1.5">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`shrink-0 whitespace-nowrap rounded-xl px-4 py-2 text-left text-sm font-black uppercase tracking-wide transition ${
                    tab === t.id
                      ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_6px_18px_-4px_rgba(91,33,182,0.5)] ring-2 ring-violet-300/45"
                      : "bg-white/60 text-slate-600 hover:bg-white hover:text-violet-800"
                  }`}
                >
                  {t.label}
                </button>
              ))}
              </div>
            </div>

            <div className="bg-gradient-to-b from-white/98 via-slate-50/40 to-violet-50/25 p-4 sm:p-5" data-gorsel-rapor-scroll-host>
              {tab === "summary" || tab === "plain" || tab === "detailed" || tab === "tas" ? (
                <ContentFontSizeProvider size={contentFontSize}>
                  {tab === "summary" ? (
                    <TabSonucOzeti
                      out={out}
                      isimGoster={isimGoster}
                      dogumGoster={dogumGoster}
                      firstName={firstName}
                      lastName={lastName}
                      layout="premium"
                    />
                  ) : null}

                  {tab === "plain" ? <TabPlainAnaliz out={out} /> : null}

                  {tab === "detailed" ? <TabAnalizOzetli out={out} layout="detay" /> : null}

                  {tab === "tas" ? <TabTasAtamalari out={out} /> : null}
                </ContentFontSizeProvider>
              ) : null}

              {tab === "gorsel" ? (
                <>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
                    <GorselRaporKontrolYanPanel
                      gorselTaslariGoster={gorselTaslariGoster}
                      setGorselTaslariGoster={setGorselTaslariGoster}
                      uzmanAdi={uzmanAdi}
                      setUzmanAdi={setUzmanAdi}
                      tasBileklik={tasBileklik}
                      setTasBileklik={setTasBileklik}
                      tasKolye={tasKolye}
                      setTasKolye={setTasKolye}
                      tasKutle={tasKutle}
                      setTasKutle={setTasKutle}
                    />
                    <div className="relative min-w-0 flex-1">
                      <GorselRaporKontrolCubugu
                        gorselTema={gorselTema}
                        setGorselTema={setGorselTema}
                        onGorselPngIndir={handleGorselPngIndir}
                        gorselIndirmeKilitli={gorselIndirmeKilitli}
                        gorselPngHazirlaniyor={gorselPngHazirlaniyor}
                        gorselTamEkran={gorselTamEkran}
                        setGorselTamEkran={setGorselTamEkran}
                      />
                      <div className="flex justify-center pt-14 sm:pt-[4.5rem]">
                        <GorselRaporInfografik
                          ref={gorselTamEkran ? null : gorselRaporRef}
                          out={out}
                          isimGoster={isimGoster}
                          dogumGoster={dogumGoster}
                          firstName={firstName}
                          lastName={lastName}
                          temaId={gorselTema}
                          uzmanAdi={uzmanAdi}
                          gorselTaslariGoster={gorselTaslariGoster}
                          tasBileklik={tasBileklik}
                          tasKolye={tasKolye}
                          tasKutle={tasKutle}
                        />
                      </div>
                    </div>
                  </div>
                  {gorselPortalHazir && gorselTamEkran
                    ? createPortal(
                        <>
                          <div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="gorsel-fs-title"
                            className="fixed inset-0 z-[9999] overflow-y-auto overflow-x-hidden bg-black/95"
                            data-gorsel-rapor-scroll-host
                          >
                            <p id="gorsel-fs-title" className="sr-only">
                              Numerolojik yaşam haritası tam ekran görünümü
                            </p>
                            <div className="flex min-h-full justify-center px-4 py-10 sm:px-6 sm:py-12">
                              <div className="w-full max-w-[min(760px,210mm)] shrink-0 pb-8">
                                <GorselRaporInfografik
                                  key={gorselTema}
                                  ref={gorselTamEkran ? gorselRaporRef : null}
                                  out={out}
                                  isimGoster={isimGoster}
                                  dogumGoster={dogumGoster}
                                  firstName={firstName}
                                  lastName={lastName}
                                  temaId={gorselTema}
                                  uzmanAdi={uzmanAdi}
                                  gorselTaslariGoster={gorselTaslariGoster}
                                  tasBileklik={tasBileklik}
                                  tasKolye={tasKolye}
                                  tasKutle={tasKutle}
                                />
                              </div>
                            </div>
                          </div>
                          <GorselRaporTamEkranKontrolCubugu
                            gorselTema={gorselTema}
                            setGorselTema={setGorselTema}
                            onGorselPngIndir={handleGorselPngIndir}
                            gorselIndirmeKilitli={gorselIndirmeKilitli}
                            gorselPngHazirlaniyor={gorselPngHazirlaniyor}
                          />
                          <button
                            type="button"
                            onClick={() => setGorselTamEkran(false)}
                            className="fixed right-6 top-6 z-[10050] flex h-[52px] w-[52px] items-center justify-center rounded-full border border-yellow-300/60 bg-black/80 text-2xl font-light leading-none text-white shadow-lg transition hover:bg-yellow-300 hover:text-black"
                            aria-label="Tam ekranı kapat"
                          >
                            ×
                          </button>
                        </>,
                        document.body,
                      )
                    : null}
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </NumerolojiPremiumShell>
  );
}
