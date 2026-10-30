"use client";

import { runInEffect } from "@/lib/runInEffect";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CalendarDays, FileText, Sparkles, User } from "lucide-react";
import { energyFontVars } from "@/app/_premium/enerji-beden/fonts";
import styles from "@/app/_premium/numeroloji/numerolojiAnaliz.module.css";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { isMobileViewport, resolveViewerControls } from "../helpers/mobileUxLogic";
import { formatFirstNameTurkish, formatLastNameTurkish } from "../helpers/nameInputFormat";
import {
  readDemoNumerolojiAnaliz,
  saveDemoNumerolojiAnaliz,
} from "@/lib/demo/demoNumerolojiAnaliz";
import Link from "next/link";
import { hesaplaNumeroloji, isValidBirthDateDisplay } from "@/lib/numeroloji";
import { gorselRaporuPngYakalaVeIndir } from "../gorselRaporExport";
import { SaveAnalysisButton } from "../components/SaveAnalysisButton";
import {
  TabSonucOzeti,
  TabAnalizOzetli,
  TabPlainAnaliz,
  TabTasAtamalari,
} from "../components/NumerolojiAnalizSonucTabs";
import { NumerolojiZamanlamaGelisimTab } from "../components/NumerolojiZamanlamaGelisimTab";
import {
  ContentFontSizeProvider,
  NumerolojiFontSizeControl,
  type ContentFontSize,
} from "../components/numerolojiContentTypography";
import type { NumerolojiMotorOut } from "../utils/numerolojiPlainMetin";
import { type GorselTemaId } from "../components/NumerolojiGorselRaporInfografik";
import { GorselScaleFit } from "../components/GorselScaleFit";
import { NumerolojiTarihInput } from "@/components/numeroloji/NumerolojiTarihInput";
import {
  GorselRaporKontrolCubugu,
  GorselRaporKontrolYanPanel,
  GorselRaporTamEkranKontrolCubugu,
} from "../components/NumerolojiGorselRaporKontrolPaneli";

type TabId = "summary" | "plain" | "detailed" | "zamanlama" | "tas" | "gorsel";

const DEMO_LIMIT_TEXT =
  "Demo hesapta her bağlantı için yalnızca 1 örnek numeroloji analizi oluşturulabilir.\n\nDaha fazla analiz oluşturmak için uzman hesabı talebinde bulunun.";

function birthDateForMotor(display: string): string {
  return display.trim().replace(/\//g, ".");
}

/** ISO "YYYY-MM-DD" → display "GG.AA.YYYY" için analiz formu input'u (30.10.2026 Numeroloji tarih standardı) */
function isoBirthDateToDisplay(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return "";
  const [y, m, d] = parts;
  if (y.length !== 4 || m.length !== 2 || d.length !== 2) return "";
  if (!/^\d+$/.test(y) || !/^\d+$/.test(m) || !/^\d+$/.test(d)) return "";
  return `${d}.${m}.${y}`;
}


const TABS: { id: TabId; label: string }[] = [
  { id: "summary", label: "Sonuç Özeti" },
  { id: "plain", label: "Numerolojik Analiz" },
  { id: "detailed", label: "Sayısal Hesaplama" },
  { id: "zamanlama", label: "Zamanlama & Gelişim" },
  { id: "tas", label: "Taş Notlarım" },
  { id: "gorsel", label: "Görsel Rapor" },
];

export default function NumerolojiAnalizPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<NumerolojiMotorOut | null>(null);
  // NUM-F01: sonucun HANGİ girdilerle hesaplandığı. Form sonradan değişirse sonuç "bayat"tır
  // ve kaydedilemez (yeni kişi + eski kişinin sayıları ASLA birleşmez).
  const [computedFor, setComputedFor] = useState<{ fn: string; ln: string; bd: string } | null>(null);
  const [tab, setTab] = useState<TabId>("summary");
  const [formAcik, setFormAcik] = useState(true);
  const sonucRef = useRef<HTMLDivElement>(null);
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

  // NUM-MOB-2-FIX2: reaktif viewport → viewer kontrol kararı saf model üzerinden.
  const [viewportW, setViewportW] = useState<number>(() => (typeof window !== "undefined" ? window.innerWidth : 1024));
  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const viewerCtl = resolveViewerControls(viewportW);

  const isDemo = readYasamUser()?.is_demo_account === true;
  // Demo'da IP bazlı tek-analiz limiti aşıldığında gösterilen uyarı
  const [demoLimitMsg, setDemoLimitMsg] = useState<string | null>(null);

  // URL parametrelerinden form prefill — ?ad=...&soyad=...&dogum=YYYY-MM-DD
  // window.location.search kullanımı Suspense gerektirmez, "use client" ile güvenli.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ad    = params.get("ad");
    const soyad = params.get("soyad");
    const dogum = params.get("dogum");
    if (ad)    setFirstName(formatFirstNameTurkish(ad));
    if (soyad) setLastName(formatLastNameTurkish(soyad));
    if (dogum) {
      const display = isoBirthDateToDisplay(dogum);
      if (display) setBirthDate(display);
    }
  // Sadece mount'ta bir kez çalışır — URL param'ları yeniden izlemeye gerek yok.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Demo: bu oturumda oluşturulmuş analiz varsa geri yükle ve göster
  // (kullanıcı çıkış yapana kadar kendi analizini görebilir).
  useEffect(() => {
    if (!isDemo) return;
    const stored = readDemoNumerolojiAnaliz();
    if (!stored) return;
    setFirstName(stored.firstName);
    setLastName(stored.lastName);
    setBirthDate(stored.birthDate);
    computeAndShow(stored.firstName, stored.lastName, stored.birthDate);
  // Yalnızca mount'ta — isDemo render başına stabil boolean.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo]);

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
      setError(err instanceof Error ? err.message : "PNG görsel indirilemedi. Lütfen tekrar deneyin.");
    } finally {
      if (scrollHost) {
        scrollHost.style.maxHeight = prevMaxH;
        scrollHost.style.overflow = prevOverflow;
        scrollHost.style.minHeight = prevMinH;
      }
      setGorselPngHazirlaniyor(false);
    }
  }

  /** Hesaplama sonucunu üretip gösterir (girdiler önceden normalize edilmiş olmalı). */
  function computeAndShow(fn: string, ln: string, bd: string): void {
    try {
      setOut(
        hesaplaNumeroloji({
          firstName: fn,
          lastName: ln,
          birthDate: birthDateForMotor(bd),
        }),
      );
      setComputedFor({ fn: fn.trim(), ln: ln.trim(), bd: bd.trim() });
      setTab("summary");
    } catch (err) {
      console.error(err);
      setError("Hesaplama sırasında bir hata oluştu.");
    }
  }

  /**
   * Demo'da IP bazlı tek-analiz hakkını yönetir.
   * - Bu oturumda zaten bir analiz oluşturulmuşsa: aynı girdi → görüntülemeye izin;
   *   farklı girdi → limit uyarısı + kayıtlı analizi geri göster.
   * - Henüz oluşturulmamışsa: server'dan hak ister (IP bazlı). İzin varsa kaydeder.
   * @returns hesaplamaya izin verilirse true
   */
  async function ensureDemoCreateAllowed(fn: string, ln: string, bd: string): Promise<boolean> {
    const stored = readDemoNumerolojiAnaliz();
    if (stored) {
      const same =
        stored.firstName === fn && stored.lastName === ln && stored.birthDate === bd;
      if (same) return true; // kendi oluşturduğu analizi tekrar görüntülüyor
      // Farklı bir analiz oluşturmaya çalışıyor → limit; kayıtlı analizi geri yükle
      setDemoLimitMsg(DEMO_LIMIT_TEXT);
      setFirstName(stored.firstName);
      setLastName(stored.lastName);
      setBirthDate(stored.birthDate);
      computeAndShow(stored.firstName, stored.lastName, stored.birthDate);
      return false;
    }

    // İlk oluşturma → server'dan IP bazlı hak iste
    try {
      // FAZ1 FINAL HARDENING (AUTH): kimlik header'dan (x-user-id + x-session-token);
      // body.userId sunucuda artık okunmaz.
      const res = await fetch("/api/numeroloji/demo-analiz", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": readYasamUser()?.id ?? "",
          "x-session-token": readSessionToken() ?? "",
        },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => ({}))) as {
        allowed?: boolean;
        message?: string;
      };
      if (res.ok && json.allowed) {
        saveDemoNumerolojiAnaliz({ firstName: fn, lastName: ln, birthDate: bd });
        return true;
      }
      setDemoLimitMsg(typeof json.message === "string" ? json.message : DEMO_LIMIT_TEXT);
      return false;
    } catch {
      setDemoLimitMsg("Bağlantı doğrulanamadı. Lütfen tekrar deneyin.");
      return false;
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDemoLimitMsg(null);
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
      setError("Doğum tarihini GG.AA.YYYY formatında tamamlayın.");
      return;
    }
    if (!isValidBirthDateDisplay(bd)) {
      setError("Geçerli bir doğum tarihi girin (gün 1–31, ay 1–12; örn. 30/02 gibi tarihler geçersizdir).");
      return;
    }

    const fn = formatFirstNameTurkish(fnRaw);
    const ln = formatLastNameTurkish(lnRaw);
    setFirstName(fn);
    setLastName(ln);

    // Demo: IP bazlı tek-analiz hakkı kontrolü (normal kullanıcı etkilenmez)
    if (isDemo) {
      const allowed = await ensureDemoCreateAllowed(fn, ln, bd);
      if (!allowed) return;
    }

    computeAndShow(fn, ln, bd);
    // Hesap sonrası: giriş formunu katla ve odağı sonuca kaydır (danışan akışı)
    setFormAcik(false);
    runInEffect(() => {
      setTimeout(() => {
        sonucRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    });
  }

  // NUM-F01: sonuç paneli ve kayıt, HESAPLANAN kişinin bilgilerini kullanır (formdaki taslağı değil).
  const sonucBilgisi = out && computedFor ? computedFor : { fn: firstName.trim(), ln: lastName.trim(), bd: birthDate.trim() };
  const sonucBayat =
    out !== null &&
    computedFor !== null &&
    (formatFirstNameTurkish(firstName.trim()) !== computedFor.fn ||
      formatLastNameTurkish(lastName.trim()) !== computedFor.ln ||
      birthDate.trim() !== computedFor.bd);
  const isimGoster = `${sonucBilgisi.fn} ${sonucBilgisi.ln}`.replace(/\s+/g, " ").trim();
  const dogumGoster = sonucBilgisi.bd;

  return (
    <main className={`${styles.page} ${energyFontVars}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.waves} src="/premium/numeroloji/analiz-dalga-alt.webp" alt="" aria-hidden decoding="async" draggable={false} />
      <div className={styles.inner}>
      <BfcacheRefreshHandler />
      {isDemo && (
        <DemoModuleBanner message="Numeroloji analizini deneyebilirsiniz. Demo hesapta her bağlantı için yalnızca 1 örnek analiz oluşturulabilir; kaydetme işlemi devre dışıdır." />
      )}
      <div className="space-y-3">
        {/* 2026-10-20 premium görünüm (owner GÖRSEL PASS prototipi numeroloji-analizi). Yalnız sunum. */}
        <header className={styles.hero}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.artL} src="/premium/numeroloji/analiz-hero-cark.webp" width={836} height={580} alt="" aria-hidden decoding="async" draggable={false} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.artR} src="/premium/numeroloji/analiz-hero-kristal.webp" width={860} height={424} alt="" aria-hidden decoding="async" draggable={false} />
          <nav className={styles.heroNav} aria-label="Sayfa gezinmesi">
            <Link href="/numeroloji/liste" className={styles.pill}>
              <FileText className={styles.ico} width={18} height={18} strokeWidth={2} aria-hidden />
              Kayıtlı analizler
            </Link>
          </nav>
          <div className={styles.heroBody}>
            <p className={styles.eyebrow}>YAŞAM SİSTEMİ &middot; NUMEROLOJİ</p>
            <h1 className={styles.title}>
              Numeroloji <span className={styles.accent}>Analizi</span>
            </h1>
            <p className={styles.sub}>Yaşam haritanızı hesaplayın, görsel raporunuzu oluşturun ve analizlerinizi kaydedin.</p>
            <div className={styles.divider} aria-hidden>
              <span />
              <i>✦</i>
              <span />
            </div>
          </div>
        </header>

        {out && !formAcik ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-[clamp(8px,2.5vw,14px)] py-2 md:rounded-2xl md:border md:border-violet-200/70 md:bg-gradient-to-r md:from-violet-100/70 md:via-white/80 md:to-amber-50/60 md:px-4 md:py-3 md:shadow-[0_8px_24px_-12px_rgba(91,33,182,0.18)] md:ring-1 md:ring-violet-100/55 md:backdrop-blur-xl">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-500">Aktif analiz</p>
              <p className="mt-0.5 truncate text-base font-black text-slate-900">{isimGoster || "—"}</p>
              <p className="text-xs font-medium text-slate-500">Doğum: {dogumGoster || "—"}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <SaveAnalysisButton
                firstName={sonucBilgisi.fn}
                lastName={sonucBilgisi.ln}
                birthDateDisplay={sonucBilgisi.bd}
                motorOutput={sonucBayat ? null : out}
                variant="premium"
              />
              <button
                type="button"
                onClick={() => setFormAcik(true)}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-violet-300/80 bg-white/90 px-4 text-xs font-black uppercase tracking-wide text-violet-800 shadow-sm transition hover:border-violet-400 hover:bg-white"
              >
                ✎ Bilgileri Düzenle
              </button>
            </div>
          </div>
        ) : (
        <form
          onSubmit={handleSubmit}
          className={styles.card}
        >
          <div className={styles.row2}>
            <div>
              <label htmlFor="noj-ad" className={styles.lbl}>
                Ad
              </label>
              <span className={styles.inWrap}>
                <User className={styles.inIcon} strokeWidth={1.8} aria-hidden />
                <input
                  id="noj-ad"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(formatFirstNameTurkish(e.target.value))}
                  placeholder="Örn. Hasan Ali"
                  className={styles.input}
                  autoComplete="given-name"
                />
              </span>
            </div>
            <div>
              <label htmlFor="noj-soyad" className={styles.lbl}>
                Soyad
              </label>
              <span className={styles.inWrap}>
                <User className={styles.inIcon} strokeWidth={1.8} aria-hidden />
                <input
                  id="noj-soyad"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(formatLastNameTurkish(e.target.value))}
                  placeholder="Örn. YILMAZ"
                  className={styles.input}
                  autoComplete="family-name"
                />
              </span>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="noj-dt" className={styles.lbl}>
                Doğum Tarihi
              </label>
              <span className={styles.inWrap}>
                <CalendarDays className={styles.inIcon} strokeWidth={1.8} aria-hidden />
                {/* 30.10.2026: ortak Numeroloji tarih girişi — GG.AA.YYYY, noktalar otomatik (yalnız giriş arayüzü). */}
                <NumerolojiTarihInput
                  id="noj-dt"
                  value={birthDate}
                  onChange={setBirthDate}
                  className={styles.input}
                  autoComplete="bday"
                />
              </span>
            </div>
          </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.calc}>
              <Sparkles className={styles.ico} width={20} height={20} strokeWidth={2} aria-hidden />
              HESAPLA
              <ArrowRight className={styles.ico} width={20} height={20} strokeWidth={2.2} aria-hidden />
            </button>
            <span className={styles.saveSlot}>
              <SaveAnalysisButton
                firstName={sonucBilgisi.fn}
                lastName={sonucBilgisi.ln}
                birthDateDisplay={sonucBilgisi.bd}
                motorOutput={sonucBayat ? null : out}
                variant="premium"
              />
            </span>
          </div>
          {sonucBayat ? (
            <p role="status" className={styles.warn}>
              Bilgiler değişti. Aşağıdaki sonuç önceki bilgilere aittir; kaydetmeden önce HESAPLA&apos;ya basın.
            </p>
          ) : null}
        </form>
        )}

        {error ? (
          <div
            role="alert"
            className="mb-4 rounded-2xl border border-rose-200/80 bg-rose-50/90 px-4 py-3 text-center text-sm font-semibold text-rose-900 shadow-sm ring-1 ring-rose-100/60 backdrop-blur-sm"
          >
            {error}
          </div>
        ) : null}

        {demoLimitMsg ? (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 whitespace-pre-line rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-900 shadow-sm"
          >
            {demoLimitMsg}
          </div>
        ) : null}

        {out ? (
          <div
            ref={sonucRef}
            className="scroll-mt-4 overflow-hidden md:rounded-2xl md:border md:border-slate-200/80 md:bg-white/85 md:shadow-[0_12px_36px_-14px_rgba(91,33,182,0.18)] md:ring-1 md:ring-violet-100/55 md:backdrop-blur-md"
          >
            {/* NUM-MOB-2-FIX1: mobilde sekme paneli kutusuz (bg/border/shadow yok); md+ korunur. */}
            <div className="pb-2 pt-0 md:border-b md:border-slate-200/80 md:bg-gradient-to-r md:from-violet-100/70 md:via-white/50 md:to-amber-50/60 md:p-3">
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
                      ? t.id === "gorsel"
                        ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-[0_6px_18px_-4px_rgba(217,119,6,0.5)] ring-2 ring-amber-300/55"
                        : "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_6px_18px_-4px_rgba(91,33,182,0.5)] ring-2 ring-violet-300/45"
                      : t.id === "gorsel"
                        ? "border border-amber-300/60 bg-amber-50/80 text-amber-800 hover:bg-amber-100"
                        : "bg-white/60 text-slate-600 hover:bg-white hover:text-violet-800"
                  }`}
                >
                  {t.id === "gorsel" ? <span className="mr-1" aria-hidden>✦</span> : null}
                  {t.label}
                </button>
              ))}
              </div>
            </div>

            <div className="px-[clamp(8px,2.5vw,14px)] py-3 md:bg-gradient-to-b md:from-white/98 md:via-slate-50/40 md:to-violet-50/25 md:p-5" data-gorsel-rapor-scroll-host>
              {tab === "summary" || tab === "plain" || tab === "detailed" || tab === "tas" ? (
                <ContentFontSizeProvider size={contentFontSize}>
                  {tab === "summary" ? (
                    <TabSonucOzeti
                      out={out}
                      isimGoster={isimGoster}
                      dogumGoster={dogumGoster}
                      firstName={sonucBilgisi.fn}
                      lastName={sonucBilgisi.ln}
                      layout="premium"
                    />
                  ) : null}

                  {tab === "plain" ? <TabPlainAnaliz out={out} /> : null}

                  {tab === "detailed" ? <TabAnalizOzetli out={out} layout="detay" /> : null}

                  {tab === "tas" ? <TabTasAtamalari out={out} /> : null}
                </ContentFontSizeProvider>
              ) : null}

              {tab === "zamanlama" ? (
                <NumerolojiZamanlamaGelisimTab
                  firstName={sonucBilgisi.fn}
                  lastName={sonucBilgisi.ln}
                  birthDate={sonucBilgisi.bd}
                />
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
                      {/* NUM-MOB-1: mobilde önizlemeye dokununca tam ekran viewer açılır. */}
                      <p className="mb-1 mt-1 text-center text-[11px] font-bold text-violet-700/80 md:hidden">
                        Tam ekran görüntülemek için rapora dokunun
                      </p>
                      <div
                        className="pt-14 sm:pt-[4.5rem] max-md:cursor-zoom-in"
                        onClick={() => {
                          // Yalnız viewport <768 iken tam ekran aç (masaüstünde no-op).
                          if (typeof window !== "undefined" && isMobileViewport(window.innerWidth)) {
                            setGorselTamEkran(true);
                          }
                        }}
                      >
                        <GorselScaleFit
                          ref={gorselTamEkran ? null : gorselRaporRef}
                          out={out}
                          isimGoster={isimGoster}
                          dogumGoster={dogumGoster}
                          firstName={sonucBilgisi.fn}
                          lastName={sonucBilgisi.ln}
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
                            <div className="flex min-h-full flex-col items-center px-1 pb-8 pt-8 sm:px-6 sm:pb-12 sm:pt-12">
                              <div className="w-full max-w-[min(760px,210mm)] shrink-0">
                                <GorselScaleFit
                                  key={gorselTema}
                                  ref={gorselTamEkran ? gorselRaporRef : null}
                                  out={out}
                                  isimGoster={isimGoster}
                                  dogumGoster={dogumGoster}
                                  firstName={sonucBilgisi.fn}
                                  lastName={sonucBilgisi.ln}
                                  temaId={gorselTema}
                                  uzmanAdi={uzmanAdi}
                                  gorselTaslariGoster={gorselTaslariGoster}
                                  tasBileklik={tasBileklik}
                                  tasKolye={tasKolye}
                                  tasKutle={tasKutle}
                                />
                              </div>
                              {/* NUM-MOB-2-FIX2: kapatma yerleşimi saf model kararıyla. Mobilde YALNIZ
                                  altta, normal akışta, görselden sonra ≥40px boşlukla. */}
                              {viewerCtl.footerCloseVisible ? (
                                <div
                                  className="mt-10 flex w-full justify-center"
                                  style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => setGorselTamEkran(false)}
                                    className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-yellow-300/60 bg-black/70 px-8 text-sm font-black uppercase tracking-wider text-white shadow-lg transition hover:bg-yellow-300 hover:text-black"
                                  >
                                    Kapat
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                          {/* Tema kontrolü ve yüzen X yalnız masaüstünde (saf model kararı). */}
                          {viewerCtl.themeControlsVisible ? (
                            <GorselRaporTamEkranKontrolCubugu
                              gorselTema={gorselTema}
                              setGorselTema={setGorselTema}
                              onGorselPngIndir={handleGorselPngIndir}
                              gorselIndirmeKilitli={gorselIndirmeKilitli}
                              gorselPngHazirlaniyor={gorselPngHazirlaniyor}
                            />
                          ) : null}
                          {viewerCtl.floatingCloseVisible ? (
                            <button
                              type="button"
                              onClick={() => setGorselTamEkran(false)}
                              className="fixed right-6 top-6 z-[10050] flex h-[52px] w-[52px] items-center justify-center rounded-full border border-yellow-300/60 bg-black/80 text-2xl font-light leading-none text-white shadow-lg transition hover:bg-yellow-300 hover:text-black"
                              aria-label="Tam ekranı kapat"
                            >
                              ×
                            </button>
                          ) : null}
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
      </div>
    </main>
  );
}
