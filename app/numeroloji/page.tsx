"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import {
  hesaplaNumeroloji,
  type NumerolojiResult,
  type HarfYankilanisiSegment,
  type ElementResult,
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

type NumerolojiMotorOut = ReturnType<typeof hesaplaNumeroloji>;

function buildPlainAnalizFull(out: NumerolojiMotorOut): string {
  const chunks: string[] = [];

  const pushNum = (title: string, r: NumerolojiResult) => {
    chunks.push(title, "", r.display || "—");
    if (r.steps?.length) chunks.push("", ...r.steps);
    chunks.push("", "——————————", "");
  };

  pushNum("ANA KULVAR", out.anaKulvar);
  pushNum("YAN KULVAR", out.yanKulvar);
  pushNum("İFADE SAYISI", out.ifadeSayisi);
  pushNum("HAYAT YOLU / DM", out.hayatYolu);

  chunks.push("PIN KODU", "", pinOneLine(out.pinKodu), "", out.pinKoduMetni || "—", "", "——————————", "");
  chunks.push("ÇAKRA OMURGASI", "", out.cakraOmurgasiMetni || "—", "", "——————————", "");
  chunks.push("ELEMENTLER", "", out.elementlerMetni || "—");
  if (out.elementler.steps?.length) chunks.push("", ...out.elementler.steps);
  chunks.push("", "——————————", "");
  chunks.push("DEĞİŞİM — DÖNÜŞÜM", "", out.degisimDonusumMetni || "—", "", "——————————", "");
  chunks.push("ZİRVE YILLARI", "", out.zirveYillariMetni || "—", "", "——————————", "");
  chunks.push("MÜCADELE YILLARI", "", out.mucadeleYillariMetni || "—", "", "——————————", "");

  chunks.push("HARFLERİN YANKILANIŞI", "");
  const hy = out.harflerinYankilanisi;
  if (Array.isArray(hy) && hy.length) chunks.push(harfSegmentsToText(hy), "");
  if (out.harflerinYankilanisiMetni?.trim()) chunks.push(out.harflerinYankilanisiMetni);

  return chunks.join("\n").trim();
}

function OzetRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-slate-100/90 py-3 last:border-b-0 sm:grid-cols-[minmax(9rem,12rem)_1fr] sm:items-baseline sm:gap-4">
      <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="text-sm font-semibold leading-snug text-slate-900">{value}</div>
    </div>
  );
}

const OZET_VERI_YOK = "Bu bölüm için veri üretilemedi.";

function OzetSectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-4 shadow-sm ring-1 ring-slate-100/70 sm:p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-700/90">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function OzetMetinPre(s: string | undefined | null) {
  const t = (s || "").trim();
  if (!t) return <p className="text-sm leading-relaxed text-slate-600">{OZET_VERI_YOK}</p>;
  return <pre className="whitespace-pre-wrap text-xs leading-relaxed text-slate-800 sm:text-sm">{s}</pre>;
}

function TabSonucOzeti({
  out,
  isimGoster,
  dogumGoster,
}: {
  out: NumerolojiMotorOut;
  isimGoster: string;
  dogumGoster: string;
}) {
  const pinMetin = (out.pinKoduMetni || "—").trim() || "—";
  const elementMetinKisa = (out.elementlerMetni || "").trim().split("\n").slice(0, 3).join("\n") || "—";

  const zirveStr = out.zirveYillariMetni?.trim() ?? "";
  const zirveObj = out.zirveYillari;
  const zirveHasArray = Boolean(zirveObj?.peaks?.length);

  const mucadeleStr = out.mucadeleYillariMetni?.trim() ?? "";
  const mucadeleObj = out.mucadeleYillari;
  const mucadeleHasArray = Boolean(mucadeleObj?.method1?.length);

  const hy = out.harflerinYankilanisi;
  const harfStr = out.harflerinYankilanisiMetni?.trim() ?? "";
  const harfIsArray = Array.isArray(hy);
  const harfHasSegments = harfIsArray && hy.length > 0;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50/95 via-white to-amber-50/25 p-4 shadow-sm ring-1 ring-violet-100/50 sm:p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-700/90">Numerolojik sonuç özeti</p>
        <p className="mt-2 text-base font-bold tracking-tight text-slate-900">{isimGoster}</p>
        <p className="mt-0.5 text-xs font-medium text-slate-600">Doğum tarihi: {dogumGoster}</p>
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-1 px-4 shadow-sm ring-1 ring-slate-100/80 sm:px-5">
        <OzetRow label="Ana Kulvar" value={nrDisplay(out.anaKulvar)} />
        <OzetRow label="Yan Kulvar" value={nrDisplay(out.yanKulvar)} />
        <OzetRow label="İfade Sayısı" value={nrDisplay(out.ifadeSayisi)} />
        <OzetRow label="Hayat Yolu / DM" value={nrDisplay(out.hayatYolu)} />
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50/90 to-white p-4 shadow-sm ring-1 ring-sky-100/50 sm:p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-800/90">PIN özeti</p>
        <p className="mt-2 break-all font-mono text-[11px] font-semibold leading-relaxed text-slate-800 sm:text-xs">
          {pinOneLine(out.pinKodu)}
        </p>
        <pre className="mt-3 max-h-36 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-100 bg-white/80 p-3 font-mono text-[11px] leading-relaxed text-slate-700 sm:text-xs">
          {pinMetin}
        </pre>
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-4 shadow-sm ring-1 ring-amber-100/60 sm:p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-900/85">Elementler (kısa)</p>
        <p className="mt-2 text-sm font-semibold text-slate-900">{elementShort(out.elementler)}</p>
        <pre className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{elementMetinKisa}</pre>
      </div>

      <OzetSectionCard title="Çakra Omurgası Özeti">{OzetMetinPre(out.cakraOmurgasiMetni)}</OzetSectionCard>

      <OzetSectionCard title="Değişim-Dönüşüm Yılları Özeti">{OzetMetinPre(out.degisimDonusumMetni)}</OzetSectionCard>

      <OzetSectionCard title="Zirve Yılları Özeti">
        {zirveStr ? (
          OzetMetinPre(out.zirveYillariMetni)
        ) : zirveHasArray && zirveObj ? (
          <ul className="space-y-1.5 text-xs font-medium leading-snug text-slate-800 sm:text-sm">
            {zirveObj.peaks.map((p) => (
              <li key={p.index} className="border-b border-slate-100/80 pb-1.5 last:border-b-0 last:pb-0">
                {p.index}. zirve — yaş {p.age}, konu {p.topic}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-relaxed text-slate-600">{OZET_VERI_YOK}</p>
        )}
      </OzetSectionCard>

      <OzetSectionCard title="Mücadele Yılları Özeti">
        {mucadeleStr ? (
          OzetMetinPre(out.mucadeleYillariMetni)
        ) : mucadeleHasArray && mucadeleObj ? (
          <ul className="space-y-1.5 text-xs font-medium leading-snug text-slate-800 sm:text-sm">
            {mucadeleObj.method1.map((m) => (
              <li key={m.index} className="border-b border-slate-100/80 pb-1.5 last:border-b-0 last:pb-0">
                {m.index}. mücadele — yaş {m.age}, konu {m.topic}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-relaxed text-slate-600">{OZET_VERI_YOK}</p>
        )}
      </OzetSectionCard>

      <OzetSectionCard title="Harflerin Yankılanışı Özeti">
        {harfHasSegments ? (
          <ul className="space-y-1.5 text-xs font-medium leading-snug text-slate-800 sm:text-sm">
            {hy.map((seg, idx) => {
              const y =
                seg.yearStart != null
                  ? ` · yıl ${seg.yearStart}${seg.yearEnd != null ? `–${seg.yearEnd}` : ""}`
                  : "";
              return (
                <li key={`${seg.letter}-${idx}`} className="border-b border-slate-100/80 pb-1.5 last:border-b-0 last:pb-0">
                  {idx + 1}. {seg.letter} — çakra {seg.chakra} — yaş {seg.ageStart}–{seg.ageEnd}
                  {y}
                </li>
              );
            })}
          </ul>
        ) : null}
        {harfStr ? (
          <div className={harfHasSegments ? "mt-3 border-t border-slate-100 pt-3" : ""}>{OzetMetinPre(out.harflerinYankilanisiMetni)}</div>
        ) : null}
        {!harfHasSegments && !harfStr ? <p className="text-sm leading-relaxed text-slate-600">{OZET_VERI_YOK}</p> : null}
      </OzetSectionCard>
    </div>
  );
}

function DetayCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-white to-violet-50/30 p-4 shadow-md ring-1 ring-violet-100/35 sm:p-5">
      <h3 className="border-b border-amber-200/50 pb-2.5 text-[11px] font-black uppercase tracking-[0.16em] text-amber-950/90">
        {title}
      </h3>
      <div className="pt-4">{children}</div>
    </section>
  );
}

function NumeroCardBody({ r }: { r: NumerolojiResult }) {
  const k = (r.key || "").trim();
  return (
    <div className="space-y-2">
      <p className="text-xl font-black tracking-tight text-violet-900 sm:text-2xl">{nrDisplay(r)}</p>
      {k ? <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Anahtar: {k}</p> : null}
      {r.steps?.length ? (
        <pre className="mt-2 max-h-[min(50vh,24rem)] overflow-y-auto whitespace-pre-wrap border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-800">
          {r.steps.join("\n")}
        </pre>
      ) : null}
    </div>
  );
}

function TabAnalizOzetli({ out }: { out: NumerolojiMotorOut }) {
  const hy = out.harflerinYankilanisi;
  const harfListe = Array.isArray(hy) && hy.length ? harfSegmentsToText(hy) : "";
  const harfMetin = out.harflerinYankilanisiMetni?.trim() ?? "";

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <DetayCard title="Ana Kulvar">
        <NumeroCardBody r={out.anaKulvar} />
      </DetayCard>
      <DetayCard title="Yan Kulvar">
        <NumeroCardBody r={out.yanKulvar} />
      </DetayCard>
      <DetayCard title="İfade Sayısı">
        <NumeroCardBody r={out.ifadeSayisi} />
      </DetayCard>
      <DetayCard title="Hayat Yolu">
        <NumeroCardBody r={out.hayatYolu} />
      </DetayCard>
      <DetayCard title="PIN">
        <p className="break-all font-mono text-xs font-semibold text-slate-800 sm:text-sm">{pinOneLine(out.pinKodu)}</p>
        <pre className="mt-3 max-h-[min(55vh,28rem)] overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-xs leading-relaxed text-slate-800 sm:text-sm">
          {out.pinKoduMetni || "—"}
        </pre>
      </DetayCard>
      <DetayCard title="Çakra">
        <pre className="max-h-[min(55vh,28rem)] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
          {out.cakraOmurgasiMetni || "—"}
        </pre>
      </DetayCard>
      <DetayCard title="Elementler">
        <pre className="max-h-[min(55vh,28rem)] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
          {out.elementlerMetni || "—"}
        </pre>
        {out.elementler.steps?.length ? (
          <pre className="mt-3 max-h-[min(40vh,20rem)] overflow-y-auto whitespace-pre-wrap border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-700">
            {out.elementler.steps.join("\n")}
          </pre>
        ) : null}
      </DetayCard>
      <DetayCard title="Değişim Dönüşüm">
        <pre className="max-h-[min(55vh,28rem)] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
          {out.degisimDonusumMetni || "—"}
        </pre>
      </DetayCard>
      <DetayCard title="Zirve">
        <pre className="max-h-[min(55vh,28rem)] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
          {out.zirveYillariMetni || "—"}
        </pre>
      </DetayCard>
      <DetayCard title="Mücadele">
        <pre className="max-h-[min(55vh,28rem)] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
          {out.mucadeleYillariMetni || "—"}
        </pre>
      </DetayCard>
      <DetayCard title="Harflerin Yankılanışı">
        {harfListe ? (
          <pre className="mb-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/40 p-3 text-xs leading-relaxed text-slate-800 sm:text-sm">
            {harfListe}
          </pre>
        ) : null}
        {harfMetin ? (
          <pre className="max-h-[min(55vh,28rem)] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
            {harfMetin}
          </pre>
        ) : !harfListe ? (
          <p className="text-sm text-slate-600">—</p>
        ) : null}
      </DetayCard>
    </div>
  );
}

const TABS: { id: TabId; label: string }[] = [
  { id: "summary", label: "Sonuç Özeti" },
  { id: "plain", label: "Analiz (Hesap Özetsiz)" },
  { id: "detailed", label: "Analiz (Hesap Özetli)" },
  { id: "tas", label: "Taş Açıklamaları" },
  { id: "gorsel", label: "Görsel Rapor" },
];

export default function NumerolojiPage() {
  const [firstName, setFirstName] = useState("Hasan");
  const [lastName, setLastName] = useState("ARICI");
  const [birthDate, setBirthDate] = useState("14/02/1987");
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<ReturnType<typeof hesaplaNumeroloji> | null>(null);
  const [tab, setTab] = useState<TabId>("summary");

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
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-amber-50/30 to-sky-50 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-700/85">Numerolojik analiz detayı</p>
          <h1 className="mt-1 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Numeroloji</h1>
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
                <div className="relative w-full max-w-none overflow-hidden rounded-xl border border-violet-500/30 bg-gradient-to-b from-violet-950 via-[#070312] to-black p-2 text-violet-50 shadow-[0_0_32px_-10px_rgba(139,92,246,0.45)] ring-1 ring-violet-500/15 sm:rounded-2xl sm:p-2.5">
                  <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-violet-600/15 blur-2xl" aria-hidden />
                  <div className="pointer-events-none absolute -bottom-12 -right-12 h-36 w-36 rounded-full bg-fuchsia-600/10 blur-2xl" aria-hidden />

                  <div className="relative z-[1] flex flex-wrap items-end justify-between gap-1 border-b border-violet-500/25 pb-1">
                    <div>
                      <p className="text-[7px] font-black uppercase tracking-[0.22em] text-violet-400/95 sm:text-[8px]">İnfografik özet</p>
                      <h2 className="text-xs font-black uppercase tracking-[0.1em] text-white sm:text-sm">Numerolojik yaşam haritası</h2>
                    </div>
                  </div>

                  <div className="relative z-[1] mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] leading-tight text-violet-100/95 sm:text-[10px]">
                    <span>
                      <span className="font-black uppercase tracking-wide text-violet-400/90">Danışan </span>
                      <span className="font-semibold text-white">{(isimGoster || "").trim() || "—"}</span>
                    </span>
                    <span className="hidden text-violet-500/40 sm:inline">|</span>
                    <span>
                      <span className="font-black uppercase tracking-wide text-violet-400/90">Doğum </span>
                      <span className="font-mono font-semibold">{(dogumGoster || "").trim() || "—"}</span>
                    </span>
                  </div>

                  <div className="relative z-[1] mt-1 grid grid-cols-2 gap-1 sm:grid-cols-4">
                    {(
                      [
                        ["Ana Kulvar", out.anaKulvar],
                        ["Yan Kulvar", out.yanKulvar],
                        ["İfade Sayısı", out.ifadeSayisi],
                        ["Hayat Yolu / DM", out.hayatYolu],
                      ] as const
                    ).map(([label, r]) => {
                      const k = (r.key || "").trim();
                      return (
                        <section
                          key={label}
                          className="flex min-h-[4.25rem] flex-col rounded-md border border-violet-500/25 bg-black/55 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                        >
                          <h3 className="text-[7px] font-black uppercase leading-tight tracking-[0.12em] text-violet-300/90 sm:text-[8px]">
                            {label}
                          </h3>
                          <p className="mt-0.5 flex-1 text-lg font-black leading-none tracking-tight text-white sm:text-xl">{nrDisplay(r)}</p>
                          <p className="truncate text-[8px] font-semibold uppercase tracking-wide text-violet-300/80 sm:text-[9px]" title={k || undefined}>
                            {k || "—"}
                          </p>
                        </section>
                      );
                    })}
                  </div>

                  <div className="relative z-[1] mt-1 grid grid-cols-1 gap-1 sm:grid-cols-3">
                    <section className="rounded-md border border-violet-500/25 bg-black/50 p-1.5">
                      <h3 className="border-b border-violet-500/15 pb-0.5 text-[7px] font-black uppercase tracking-[0.14em] text-violet-300/95 sm:text-[8px]">
                        PIN kodu
                      </h3>
                      <p className="mt-0.5 break-all font-mono text-[8px] font-bold leading-tight text-violet-50 sm:text-[9px]">{pinOneLine(out.pinKodu)}</p>
                      <pre className="mt-0.5 max-h-[4.5rem] overflow-y-auto whitespace-pre-wrap font-mono text-[7px] leading-snug text-violet-200/85 sm:max-h-20 sm:text-[8px]">
                        {(out.pinKoduMetni || "").trim() || "—"}
                      </pre>
                    </section>

                    <section className="rounded-md border border-violet-500/25 bg-black/50 p-1.5">
                      <h3 className="border-b border-violet-500/15 pb-0.5 text-[7px] font-black uppercase tracking-[0.14em] text-violet-300/95 sm:text-[8px]">
                        Elementler
                      </h3>
                      <p className="mt-0.5 text-[10px] font-bold leading-tight text-white sm:text-[11px]">{elementShort(out.elementler)}</p>
                      <p className="mt-0.5 line-clamp-3 text-[7px] leading-snug text-violet-200/88 sm:text-[8px]">
                        {(out.elementlerMetni || "").trim() || "—"}
                      </p>
                    </section>

                    <section className="rounded-md border border-violet-500/30 bg-gradient-to-b from-black/55 to-violet-950/35 p-1.5 sm:col-span-1">
                      <h3 className="border-b border-violet-400/20 pb-0.5 text-[7px] font-black uppercase tracking-[0.14em] text-violet-200/95 sm:text-[8px]">
                        Çakra omurgası
                      </h3>
                      <div className="mt-0.5 max-h-[5.5rem] space-y-px overflow-y-auto pr-0.5 sm:max-h-24">
                        {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((cNo) => {
                          const left = out.cakraOmurgasi.sayilar[cNo] ?? 0;
                          const right = out.cakraOmurgasi.harfler[cNo] ?? 0;
                          const emptyRow = left === 0 && right === 0;
                          return (
                            <div
                              key={cNo}
                              className="grid grid-cols-[minmax(0,1fr)_1.25rem_minmax(0,1fr)] items-center gap-0.5 rounded border border-violet-500/15 bg-black/35 px-1 py-px"
                            >
                              <div className="flex flex-wrap justify-end gap-px text-[8px] leading-none text-white/90" aria-hidden>
                                {emptyRow ? <span className="text-violet-600/50">—</span> : Array.from({ length: left }, (_, i) => <span key={`i-${cNo}-${i}`}>○</span>)}
                              </div>
                              <span className="text-center text-[7px] font-black text-violet-200">{cNo}</span>
                              <div className="flex flex-wrap justify-start gap-px text-[8px] leading-none text-violet-300" aria-hidden>
                                {emptyRow ? <span className="text-violet-600/50">—</span> : Array.from({ length: right }, (_, i) => <span key={`d-${cNo}-${i}`}>●</span>)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <pre className="mt-0.5 max-h-16 overflow-y-auto whitespace-pre-wrap rounded border border-white/5 bg-black/30 p-1 text-[7px] leading-snug text-violet-200/85 sm:text-[8px]">
                        {(out.cakraOmurgasiMetni || "").trim() || "—"}
                      </pre>
                    </section>
                  </div>

                  <div className="relative z-[1] mt-1 grid grid-cols-2 gap-1 lg:grid-cols-4">
                    <section className="rounded-md border border-violet-500/25 bg-black/50 p-1.5">
                      <h3 className="border-b border-violet-500/15 pb-0.5 text-[7px] font-black uppercase tracking-[0.12em] text-violet-300/95 sm:text-[8px]">
                        Değişim-dönüşüm
                      </h3>
                      <pre className="mt-0.5 max-h-20 overflow-y-auto whitespace-pre-wrap text-[7px] leading-snug text-violet-200/90 sm:max-h-[4.5rem] sm:text-[8px]">
                        {(out.degisimDonusumMetni || "").trim() || "—"}
                      </pre>
                    </section>

                    <section className="rounded-md border border-violet-500/25 bg-black/50 p-1.5">
                      <h3 className="border-b border-violet-500/15 pb-0.5 text-[7px] font-black uppercase tracking-[0.12em] text-violet-300/95 sm:text-[8px]">
                        Zirve yılları
                      </h3>
                      {out.zirveYillariMetni?.trim() ? (
                        <pre className="mt-0.5 max-h-20 overflow-y-auto whitespace-pre-wrap text-[7px] leading-snug text-violet-200/90 sm:max-h-[4.5rem] sm:text-[8px]">
                          {out.zirveYillariMetni}
                        </pre>
                      ) : out.zirveYillari?.peaks?.length ? (
                        <p className="mt-0.5 line-clamp-4 text-[7px] leading-snug text-violet-200/90 sm:text-[8px]">
                          {out.zirveYillari.peaks.map((p) => `${p.index}:${p.age}/${p.topic}`).join(" · ")}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[8px] text-violet-500/80">—</p>
                      )}
                    </section>

                    <section className="rounded-md border border-violet-500/25 bg-black/50 p-1.5">
                      <h3 className="border-b border-violet-500/15 pb-0.5 text-[7px] font-black uppercase tracking-[0.12em] text-violet-300/95 sm:text-[8px]">
                        Mücadele yılları
                      </h3>
                      {out.mucadeleYillariMetni?.trim() ? (
                        <pre className="mt-0.5 max-h-20 overflow-y-auto whitespace-pre-wrap text-[7px] leading-snug text-violet-200/90 sm:max-h-[4.5rem] sm:text-[8px]">
                          {out.mucadeleYillariMetni}
                        </pre>
                      ) : out.mucadeleYillari?.method1?.length ? (
                        <p className="mt-0.5 line-clamp-4 text-[7px] leading-snug text-violet-200/90 sm:text-[8px]">
                          {out.mucadeleYillari.method1.map((m) => `${m.index}:${m.age}/${m.topic}`).join(" · ")}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[8px] text-violet-500/80">—</p>
                      )}
                    </section>

                    <section className="rounded-md border border-violet-500/25 bg-black/50 p-1.5 lg:col-span-1">
                      <h3 className="border-b border-violet-500/15 pb-0.5 text-[7px] font-black uppercase tracking-[0.12em] text-violet-300/95 sm:text-[8px]">
                        Harflerin yankılanışı
                      </h3>
                      {Array.isArray(out.harflerinYankilanisi) && out.harflerinYankilanisi.length > 0 ? (
                        <p className="mt-0.5 text-[7px] font-semibold text-violet-100/90 sm:text-[8px]">
                          {out.harflerinYankilanisi.length} dönem ·{" "}
                          <span className="font-mono text-violet-200/85">
                            {out.harflerinYankilanisi
                              .slice(0, 4)
                              .map((s) => s.letter)
                              .join(" ")}
                            {out.harflerinYankilanisi.length > 4 ? "…" : ""}
                          </span>
                        </p>
                      ) : null}
                      <pre className="mt-0.5 max-h-20 overflow-y-auto whitespace-pre-wrap text-[7px] leading-snug text-violet-200/88 sm:max-h-[4.5rem] sm:text-[8px]">
                        {Array.isArray(out.harflerinYankilanisi) && out.harflerinYankilanisi.length > 0
                          ? harfSegmentsToText(out.harflerinYankilanisi)
                          : (out.harflerinYankilanisiMetni || "").trim() || "—"}
                      </pre>
                      {Array.isArray(out.harflerinYankilanisi) && out.harflerinYankilanisi.length > 0 ? (
                        <pre className="mt-0.5 line-clamp-2 max-h-10 overflow-hidden text-[7px] leading-snug text-violet-300/75 sm:text-[8px]">
                          {(out.harflerinYankilanisiMetni || "").trim() || ""}
                        </pre>
                      ) : null}
                    </section>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
