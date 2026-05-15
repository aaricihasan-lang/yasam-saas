"use client";

import {
  forwardRef,
  useState,
  useEffect,
  useRef,
  type FormEvent,
  type ReactNode,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { NumerolojiPremiumShell } from "../components/NumerolojiPremiumShell";
import { NumerolojiNavPill } from "../components/NumerolojiNavPill";
import {
  hesaplaNumeroloji,
  ELEMENT_ORDER,
  LETTER_TO_CHAKRA,
  turkishUpper,
  type NumerolojiResult,
  type HarfYankilanisiSegment,
} from "@/lib/numeroloji";
import { gorselRaporuPngYakalaVeIndir } from "../gorselRaporExport";
import { SaveAnalysisButton } from "../components/SaveAnalysisButton";
import { TabSonucOzeti, TabAnalizOzetli } from "../components/NumerolojiAnalizSonucTabs";
import { buildPlainAnalizFull, type NumerolojiMotorOut } from "../utils/numerolojiPlainMetin";
import { GorselRaporInfografik, GORSEL_TEMA_LIST, type GorselTemaId } from "../components/NumerolojiGorselRaporInfografik";

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
    setGorselPortalHazir(true);
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
    if (tab !== "gorsel") setGorselTamEkran(false);
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

  return (
    <NumerolojiPremiumShell maxWidthClass="max-w-5xl">
        <header className="mb-6 rounded-[26px] border border-white/75 bg-white/60 px-5 py-6 text-center shadow-[0_14px_42px_rgba(15,23,42,0.06)] ring-1 ring-violet-100/55 backdrop-blur-xl sm:px-8 sm:py-7">
          <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
            <NumerolojiNavPill href="/numeroloji">← Modül seçimi</NumerolojiNavPill>
            <NumerolojiNavPill href="/numeroloji/liste">Kayıtlı analizler</NumerolojiNavPill>
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-700/90">Numerolojik analiz detayı</p>
          <h1 className="mt-2 text-xl font-black tracking-tight text-slate-900 sm:text-[1.65rem]">Numeroloji Analizi</h1>
          <p className="mx-auto mt-2 max-w-xl text-xs font-medium leading-relaxed text-slate-600 sm:text-[13px]">
            Hesaplama tarayıcıda yapılır; giriş yaptıysanız analizi Supabase üzerinden kaydedebilirsiniz.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded-[26px] border border-white/80 bg-white/70 p-4 shadow-[0_14px_42px_rgba(15,23,42,0.055)] ring-1 ring-amber-100/45 backdrop-blur-xl sm:p-6"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="noj-ad" className="mb-1 block text-xs font-bold text-slate-700">
                Ad / İsim
              </label>
              <input
                id="noj-ad"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(formatFirstNameTurkish(e.target.value))}
                placeholder="Örn. Hasan Ali"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-violet-100 focus:ring-2"
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
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-violet-100 focus:ring-2"
                autoComplete="family-name"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="noj-dt" className="mb-1 block text-xs font-bold text-slate-700">
                Doğum tarihi
              </label>
              <input
                id="noj-dt"
                type="text"
                inputMode="numeric"
                maxLength={10}
                value={birthDate}
                onChange={(e) => setBirthDate(formatBirthDigitsInput(e.target.value))}
                placeholder="GG/AA/YYYY"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-sky-100 focus:ring-2"
                autoComplete="bday"
              />
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="submit"
              className="w-full rounded-2xl bg-gradient-to-r from-violet-600 via-violet-700 to-sky-600 px-6 py-3 text-sm font-black text-white shadow-[0_10px_28px_-6px_rgba(91,33,182,0.45)] ring-1 ring-white/25 transition hover:brightness-[1.05] hover:shadow-[0_14px_32px_-4px_rgba(91,33,182,0.4)] active:scale-[0.99] sm:w-auto"
            >
              Hesapla
            </button>
            <SaveAnalysisButton
              firstName={firstName}
              lastName={lastName}
              birthDateDisplay={birthDate.trim()}
              motorOutput={out}
              className="w-full sm:w-auto"
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
          <div className="overflow-hidden rounded-[26px] border border-slate-200/85 bg-white/80 shadow-[0_20px_50px_-18px_rgba(91,33,182,0.14)] ring-1 ring-violet-100/60 backdrop-blur-md">
            <div className="flex flex-wrap gap-0 border-b border-slate-200/80 bg-gradient-to-r from-violet-50/80 via-amber-50/50 to-sky-50/80 px-1 pt-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`min-h-[2.5rem] shrink-0 rounded-t-lg px-3 py-2 text-left text-[11px] font-black uppercase tracking-wide transition sm:px-4 sm:text-xs ${
                    tab === t.id
                      ? "bg-amber-100 text-amber-950 shadow-inner ring-1 ring-amber-200/90"
                      : "text-slate-600 hover:bg-white/70"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="max-h-[min(70vh,36rem)] overflow-y-auto bg-gradient-to-b from-white/95 via-slate-50/50 to-violet-50/20 p-4 sm:p-6" data-gorsel-rapor-scroll-host>
              {tab === "summary" ? (
                <TabSonucOzeti out={out} isimGoster={isimGoster} dogumGoster={dogumGoster} />
              ) : null}

              {tab === "plain" ? (
                <pre className="whitespace-pre-wrap rounded-xl border border-slate-100 bg-white/70 p-4 font-mono text-[11px] leading-relaxed text-slate-800 shadow-inner sm:p-5 sm:text-xs">
                  {buildPlainAnalizFull(out)}
                </pre>
              ) : null}

              {tab === "detailed" ? <TabAnalizOzetli out={out} /> : null}

              {tab === "tas" ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center text-sm font-medium leading-relaxed text-slate-600">
                  Taş öneri sistemi sonraki aşamada bağlanacak.
                </p>
              ) : null}

              {tab === "gorsel" ? (
                <>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
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
                    <div className="relative min-w-0 flex-1">
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
                          onClick={handleGorselPngIndir}
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
                              onClick={handleGorselPngIndir}
                              disabled={gorselIndirmeKilitli}
                              className="rounded-full border-2 border-emerald-400/75 bg-zinc-950/95 px-3 py-2 text-center text-[9px] font-black uppercase leading-tight tracking-[0.06em] text-emerald-50 shadow-[0_4px_28px_rgba(0,0,0,0.85)] backdrop-blur-md transition hover:border-emerald-300 hover:bg-zinc-900 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 sm:text-[10px] sm:tracking-[0.1em]"
                            >
                              {gorselPngHazirlaniyor ? "Görsel hazırlanıyor..." : "PNG İndir"}
                            </button>
                          </div>
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
    </NumerolojiPremiumShell>
  );
}
