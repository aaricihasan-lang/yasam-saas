"use client";

import { runInEffect } from "@/lib/runInEffect";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { NumerolojiPremiumShell } from "../components/NumerolojiPremiumShell";
import { NumerolojiNavPill } from "../components/NumerolojiNavPill";
import { hesaplaNumeroloji } from "@/lib/numeroloji";
import { gorselRaporuPngYakalaVeIndir } from "../gorselRaporExport";
import { SaveAnalysisButton } from "../components/SaveAnalysisButton";
import { TabSonucOzeti, TabAnalizOzetli } from "../components/NumerolojiAnalizSonucTabs";
import { buildPlainAnalizFull, type NumerolojiMotorOut } from "../utils/numerolojiPlainMetin";
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
  return s
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLocaleLowerCase("tr-TR");
      return lower.charAt(0).toLocaleUpperCase("tr-TR") + lower.slice(1);
    })
    .join(" ");
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
  const [firstName, setFirstName] = useState("Hasan");
  const [lastName, setLastName] = useState("ARICI");
  const [birthDate, setBirthDate] = useState("14/02/1987");
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
    "w-full rounded-2xl border border-slate-200/90 bg-white/95 px-5 py-4 text-lg font-medium text-slate-900 shadow-sm outline-none ring-violet-100/80 transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-200/40";

  return (
    <NumerolojiPremiumShell maxWidthClass="max-w-7xl">
      <div className="-mt-2 space-y-6 sm:space-y-8">
        <header className="relative overflow-hidden rounded-[32px] border border-violet-200/50 bg-gradient-to-br from-violet-200/40 via-white/70 to-amber-100/35 px-6 py-10 text-center shadow-[0_20px_60px_-24px_rgba(91,33,182,0.35)] ring-1 ring-white/60 backdrop-blur-xl sm:px-10 sm:py-12">
          <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-violet-400/25 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-amber-300/20 blur-3xl" aria-hidden />
          <div className="relative">
            <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
              <NumerolojiNavPill href="/numeroloji">← Modül seçimi</NumerolojiNavPill>
              <NumerolojiNavPill href="/numeroloji/liste">Kayıtlı analizler</NumerolojiNavPill>
            </div>
            <p className="text-xs font-black uppercase tracking-[0.36em] text-violet-800/95 sm:text-sm sm:tracking-[0.42em]">
              Yaşam Sistemi · Numeroloji
            </p>
            <h1
              className="mt-4 text-4xl font-black tracking-tight text-slate-900 sm:mt-5 sm:text-5xl md:text-6xl lg:text-[3.5rem] lg:leading-[1.06] lg:tracking-[-0.02em]"
              style={{ textShadow: "0 4px 28px rgba(91,33,182,0.22), 0 2px 0 rgba(255,255,255,0.85)" }}
            >
              Numeroloji Analizi
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base font-medium leading-relaxed text-slate-600 sm:mt-5 sm:text-lg sm:leading-[1.65]">
              Yaşam haritanızı hesaplayın, premium görsel raporunuzu oluşturun ve analizlerinizi güvenle kaydedin.
            </p>
            <div className="relative mx-auto mt-8 flex max-w-lg items-center justify-center gap-3 sm:mt-10" aria-hidden>
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-violet-400/70 to-violet-300/30" />
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-100/95 via-white to-amber-50/90 shadow-[0_0_24px_rgba(139,92,246,0.28)] ring-1 ring-violet-200/70">
                <span className="text-base leading-none text-violet-600/90">✦</span>
              </span>
              <span className="h-px flex-1 bg-gradient-to-l from-transparent via-violet-400/70 to-violet-300/30" />
            </div>
          </div>
        </header>

        <form
          onSubmit={handleSubmit}
          className="rounded-[32px] border border-white/85 bg-white/75 p-6 shadow-[0_16px_48px_-20px_rgba(91,33,182,0.2)] ring-1 ring-violet-100/50 backdrop-blur-xl sm:p-8 lg:p-10"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="noj-ad" className="mb-2 block text-sm font-bold text-slate-700">
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
              <label htmlFor="noj-soyad" className="mb-2 block text-sm font-bold text-slate-700">
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
              <label htmlFor="noj-dt" className="mb-2 block text-sm font-bold text-slate-700">
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
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-stretch">
            <button
              type="submit"
              className="min-w-[160px] flex-1 rounded-2xl bg-gradient-to-r from-violet-600 via-violet-700 to-indigo-600 px-8 py-4 text-base font-black uppercase tracking-[0.12em] text-white shadow-[0_14px_36px_-6px_rgba(91,33,182,0.55)] ring-1 ring-white/30 transition duration-200 hover:scale-[1.02] hover:brightness-110 hover:shadow-[0_18px_44px_-4px_rgba(91,33,182,0.5)] active:scale-[0.98] sm:flex-none"
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
          <div className="overflow-hidden rounded-[32px] border border-slate-200/80 bg-white/85 shadow-[0_24px_56px_-20px_rgba(91,33,182,0.22)] ring-1 ring-violet-100/55 backdrop-blur-md">
            <div className="flex flex-wrap gap-2 border-b border-slate-200/80 bg-gradient-to-r from-violet-100/70 via-white/50 to-amber-50/60 p-2 sm:gap-3 sm:p-3">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`min-h-[3rem] shrink-0 rounded-xl px-4 py-2.5 text-left text-[11px] font-black uppercase tracking-wide transition sm:px-5 sm:text-xs ${
                    tab === t.id
                      ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_8px_24px_-4px_rgba(91,33,182,0.45)] ring-1 ring-violet-400/30"
                      : "bg-white/60 text-slate-600 hover:bg-white hover:text-violet-800"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="bg-gradient-to-b from-white/98 via-slate-50/40 to-violet-50/25 p-5 sm:p-8 lg:p-10" data-gorsel-rapor-scroll-host>
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

              {tab === "plain" ? (
                <pre className="whitespace-pre-wrap rounded-2xl border border-slate-200/80 bg-white/90 p-6 font-mono text-sm leading-relaxed text-slate-800 shadow-inner sm:p-8">
                  {buildPlainAnalizFull(out)}
                </pre>
              ) : null}

              {tab === "detailed" ? <TabAnalizOzetli out={out} layout="detay" /> : null}

              {tab === "tas" ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center text-sm font-medium leading-relaxed text-slate-600">
                  Taş öneri sistemi sonraki aşamada bağlanacak.
                </p>
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
