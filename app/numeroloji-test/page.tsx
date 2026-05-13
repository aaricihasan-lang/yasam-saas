"use client";

import { useState } from "react";
import {
  hesaplaNumeroloji,
  type NumerolojiResult,
  type HarfYankilanisiSegment,
  type ElementResult,
  type ZirveResult,
  type MucadeleResult,
  type PinKoduBoxes,
} from "@/lib/numeroloji";

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

function nrDisplay(r: NumerolojiResult): string {
  return (r.display || "—").trim() || "—";
}

function pinOneLine(pin: PinKoduBoxes): string {
  return `[${pin.k1}] [${pin.k2}] [${pin.k3}] [${pin.k4}] | [${pin.k5}] [${pin.k6}] [${pin.k7}] | [${pin.k8}] [${pin.k9}]`;
}

function elementShort(el: ElementResult): string {
  const d = (el.display || "").trim();
  const k = (el.key || "").trim();
  if (!d && !k) return "—";
  if (k) return `${d}  (Baskın: ${k})`;
  return d || "—";
}

function zirveShort(z: ZirveResult | null): string {
  if (!z) return "—";
  return z.peaks.map((p) => `${p.index}. zirve: yaş ${p.age}, konu ${p.topic}`).join(" | ");
}

function mucadeleShort(m: MucadeleResult | null): string {
  if (!m) return "—";
  const a = m.method1.map((x) => `Y${x.index}: yaş ${x.age}, konu ${x.topic}`).join(" | ");
  return `Yöntem1: ${a}`;
}

function harfSegmentsToText(segments: HarfYankilanisiSegment[]): string {
  if (!segments.length) return "—";
  return segments
    .map((seg, idx) => {
      const y =
        seg.yearStart != null
          ? `  yıl ${seg.yearStart}${seg.yearEnd != null ? `–${seg.yearEnd}` : ""}`
          : "";
      return `${idx + 1}. ${seg.letter}  çakra ${seg.chakra}  yaş ${seg.ageStart}–${seg.ageEnd}${y}`;
    })
    .join("\n");
}

function buildSonucOzeti(
  isimSoyisim: string,
  dogum: string,
  out: ReturnType<typeof hesaplaNumeroloji>,
): string {
  const hy = out.harflerinYankilanisi;
  const harfOzet = Array.isArray(hy)
    ? `${hy.length} dönem${out.harflerinYankilanisiMetni?.trim() ? `\n${out.harflerinYankilanisiMetni}` : ""}`
    : out.harflerinYankilanisiMetni?.trim() || "—";

  return [
    "=== NUMEROLOJİK SONUÇ ÖZETİ ===",
    `İsim Soyisim : ${isimSoyisim}`,
    `Doğum Tarihi : ${dogum}`,
    "",
    `Ana Kulvar : ${nrDisplay(out.anaKulvar)}`,
    `Yan Kulvar : ${nrDisplay(out.yanKulvar)}`,
    `İfade Sayısı : ${nrDisplay(out.ifadeSayisi)}`,
    `Hayat Yolu / DM : ${nrDisplay(out.hayatYolu)}`,
    "",
    "PIN KODU (Özet)",
    out.pinKoduMetni || "—",
    "",
    "ÇAKRA SÜTUNU / OMURGA (Özet)",
    out.cakraOmurgasiMetni || "—",
    "",
    "ELEMENTLER (Özet)",
    out.elementlerMetni || "—",
    "",
    "DEĞİŞİM-DÖNÜŞÜM YILLARI (Özet)",
    out.degisimDonusumMetni || "—",
    "",
    "ZİRVE YILLARI (Özet)",
    out.zirveYillariMetni || "—",
    "",
    "MÜCADELE YILI / YILLARI (Özet)",
    out.mucadeleYillariMetni || "—",
    "",
    "HARFLERİN YANKILANIŞI",
    harfOzet,
  ].join("\n");
}

function buildAnalizOzetsiz(out: ReturnType<typeof hesaplaNumeroloji>): string {
  const hy = out.harflerinYankilanisi;
  const harf = Array.isArray(hy) ? `${hy.length} dönem` : "—";
  const harfExtra = out.harflerinYankilanisiMetni?.trim() ? `\n\n${out.harflerinYankilanisiMetni}` : "";

  return [
    "Ana Kulvar → " + nrDisplay(out.anaKulvar),
    "Yan Kulvar → " + nrDisplay(out.yanKulvar),
    "İfade Sayısı → " + nrDisplay(out.ifadeSayisi),
    "Hayat Yolu / DM → " + nrDisplay(out.hayatYolu),
    "",
    "PIN → " + pinOneLine(out.pinKodu),
    "",
    "Çakra omurgası (kısa) →",
    (out.cakraOmurgasiMetni || "—").split("\n").slice(0, 4).join("\n") || "—",
    "",
    "Elementler → " + elementShort(out.elementler),
    "",
    "Değişim-Dönüşüm →",
    (out.degisimDonusumMetni || "—").split("\n").slice(0, 6).join("\n") || "—",
    "",
    "Zirve yılları → " + zirveShort(out.zirveYillari),
    "",
    "Mücadele → " + mucadeleShort(out.mucadeleYillari),
    "",
    "Harflerin yankılanışı → " + harf + harfExtra,
  ].join("\n");
}

function sectionNumeroloji(title: string, r: NumerolojiResult): string {
  const lines = [title, r.display || "—", ...(r.steps?.length ? ["", ...r.steps] : [])];
  return lines.join("\n");
}

function buildAnalizOzetli(out: ReturnType<typeof hesaplaNumeroloji>): string {
  const hy = out.harflerinYankilanisi;
  const harfDetay = Array.isArray(hy) ? harfSegmentsToText(hy) : "—";
  const parts: string[] = [];

  parts.push(sectionNumeroloji("— Ana Kulvar —", out.anaKulvar), "");
  parts.push(sectionNumeroloji("— Yan Kulvar —", out.yanKulvar), "");
  parts.push(sectionNumeroloji("— İfade Sayısı —", out.ifadeSayisi), "");
  parts.push(sectionNumeroloji("— Hayat Yolu —", out.hayatYolu), "");
  parts.push("— PIN Kodu —", out.pinKoduMetni || "—", "");
  parts.push("— Çakra Omurgası —", out.cakraOmurgasiMetni || "—", "");
  parts.push("— Elementler —", out.elementlerMetni || "—", "");
  if (out.elementler.steps?.length) {
    parts.push("(Adımlar)", ...out.elementler.steps, "");
  }
  parts.push("— Değişim Dönüşüm —", out.degisimDonusumMetni || "—", "");
  parts.push("— Zirve Yılları —", out.zirveYillariMetni || "—", "");
  parts.push("— Mücadele Yılları —", out.mucadeleYillariMetni || "—", "");
  parts.push("— Harflerin Yankılanışı (dönemler) —", harfDetay);
  if (out.harflerinYankilanisiMetni?.trim()) {
    parts.push("", "— Harflerin Yankılanışı (metin) —", out.harflerinYankilanisiMetni);
  }

  return parts.join("\n");
}

const TABS: { id: TabId; label: string }[] = [
  { id: "summary", label: "Sonuç Özeti" },
  { id: "plain", label: "Analiz (Hesap Özetsiz)" },
  { id: "detailed", label: "Analiz (Hesap Özetli)" },
  { id: "tas", label: "Taş Açıklamaları" },
  { id: "gorsel", label: "Görsel Rapor" },
];

export default function NumerolojiTestPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<ReturnType<typeof hesaplaNumeroloji> | null>(null);
  const [tab, setTab] = useState<TabId>("summary");

  function handleSubmit(e: React.FormEvent) {
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
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-amber-50/30 to-sky-50 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-700/85">Numerolojik analiz detayı</p>
          <h1 className="mt-1 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Numeroloji test</h1>
          <p className="mx-auto mt-1 max-w-xl text-xs font-medium text-slate-600">
            Veriler yalnızca tarayıcıda işlenir; kayıt yoktur.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="mb-5 rounded-2xl border border-white/90 bg-white/90 p-4 shadow-md ring-1 ring-violet-100/70 backdrop-blur-sm sm:p-5"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="nm-ad" className="mb-1 block text-xs font-bold text-slate-700">
                Ad / İsim
              </label>
              <input
                id="nm-ad"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(formatFirstNameTurkish(e.target.value))}
                placeholder="Örn. Hasan Ali"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-violet-100 focus:ring-2"
                autoComplete="given-name"
              />
            </div>
            <div>
              <label htmlFor="nm-soyad" className="mb-1 block text-xs font-bold text-slate-700">
                Soyad
              </label>
              <input
                id="nm-soyad"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(formatLastNameTurkish(e.target.value))}
                placeholder="Örn. YILMAZ"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-violet-100 focus:ring-2"
                autoComplete="family-name"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="nm-dt" className="mb-1 block text-xs font-bold text-slate-700">
                Doğum tarihi
              </label>
              <input
                id="nm-dt"
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
          <button
            type="submit"
            className="mt-4 rounded-xl bg-gradient-to-r from-violet-600 to-sky-600 px-6 py-2.5 text-sm font-black text-white shadow-md transition hover:brightness-105"
          >
            Hesapla
          </button>
        </form>

        {error ? (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-sm font-semibold text-rose-900"
          >
            {error}
          </div>
        ) : null}

        {out ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-lg ring-1 ring-amber-100/40">
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

            <div className="max-h-[min(70vh,36rem)] overflow-y-auto bg-gradient-to-b from-white to-slate-50/90 p-4 sm:p-5">
              {tab === "summary" ? (
                <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-slate-800 sm:text-[13px]">
                  {buildSonucOzeti(isimGoster, dogumGoster, out)}
                </pre>
              ) : null}

              {tab === "plain" ? (
                <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-slate-800 sm:text-[13px]">
                  {buildAnalizOzetsiz(out)}
                </pre>
              ) : null}

              {tab === "detailed" ? (
                <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-slate-800 sm:text-[13px]">
                  {buildAnalizOzetli(out)}
                </pre>
              ) : null}

              {(tab === "tas" || tab === "gorsel") && (
                <p className="text-sm font-medium text-slate-600">Bu alan sonraki aşamada bağlanacak.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
