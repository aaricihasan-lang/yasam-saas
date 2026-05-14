"use client";

import { useState, useEffect, type FormEvent, type ReactNode, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  hesaplaNumeroloji,
  ELEMENT_ORDER,
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

/** Görsel rapor — çakra satırı orta başlık (motor sayıları 1–7) */
const GORSEL_CAKRA_LABELS: Record<number, readonly [string, string]> = {
  1: ["Muladhara", "Kök"],
  2: ["Svadhisthana", "Sakral"],
  3: ["Manipura", "Solar pleksus"],
  4: ["Anahata", "Kalp"],
  5: ["Vishuddha", "Boğaz"],
  6: ["Ajna", "Alın"],
  7: ["Sahasrara", "Taç"],
};

type GorselTemaId = "kozmikMor" | "altinMist" | "kuzeyIsiklari" | "okyanusDerinligi";

const GORSEL_TEMA_LIST: { id: GorselTemaId; label: string }[] = [
  { id: "kozmikMor", label: "Kozmik Mor" },
  { id: "altinMist", label: "Altın Mist" },
  { id: "kuzeyIsiklari", label: "Kuzey Işıkları" },
  { id: "okyanusDerinligi", label: "Okyanus Derinliği" },
];

/** Kozmik Mor — yıldız / nokta dokusu */
const KOZMIK_STARFIELD = [
  "radial-gradient(circle at 6% 11%, rgba(255,255,255,0.45) 0.5px, transparent 0.65px)",
  "radial-gradient(circle at 18% 8%, rgba(216,180,254,0.5) 0.45px, transparent 0.6px)",
  "radial-gradient(circle at 92% 14%, rgba(255,255,255,0.38) 0.5px, transparent 0.65px)",
  "radial-gradient(circle at 78% 22%, rgba(196,181,253,0.42) 0.45px, transparent 0.58px)",
  "radial-gradient(circle at 44% 6%, rgba(255,255,255,0.32) 0.4px, transparent 0.55px)",
  "radial-gradient(circle at 12% 38%, rgba(237,233,254,0.36) 0.45px, transparent 0.6px)",
  "radial-gradient(circle at 88% 42%, rgba(255,255,255,0.34) 0.5px, transparent 0.65px)",
  "radial-gradient(circle at 30% 52%, rgba(216,180,254,0.32) 0.4px, transparent 0.55px)",
  "radial-gradient(circle at 65% 58%, rgba(255,255,255,0.38) 0.45px, transparent 0.6px)",
  "radial-gradient(circle at 8% 68%, rgba(196,181,253,0.36) 0.45px, transparent 0.58px)",
  "radial-gradient(circle at 95% 72%, rgba(255,255,255,0.32) 0.5px, transparent 0.65px)",
  "radial-gradient(circle at 52% 78%, rgba(167,139,250,0.4) 0.45px, transparent 0.6px)",
  "radial-gradient(circle at 22% 88%, rgba(255,255,255,0.34) 0.45px, transparent 0.58px)",
  "radial-gradient(circle at 72% 92%, rgba(237,233,254,0.36) 0.5px, transparent 0.65px)",
  "radial-gradient(circle at 40% 34%, rgba(255,255,255,0.24) 0.35px, transparent 0.5px)",
  "radial-gradient(circle at 58% 18%, rgba(196,181,253,0.28) 0.35px, transparent 0.5px)",
].join(", ");

const ALTIN_STARFIELD = [
  "radial-gradient(circle at 10% 20%, rgba(254,243,199,0.35) 0.45px, transparent 0.6px)",
  "radial-gradient(circle at 85% 15%, rgba(252,211,77,0.3) 0.4px, transparent 0.55px)",
  "radial-gradient(circle at 50% 45%, rgba(253,230,138,0.22) 0.35px, transparent 0.5px)",
  "radial-gradient(circle at 22% 78%, rgba(254,249,195,0.28) 0.4px, transparent 0.55px)",
  "radial-gradient(circle at 92% 72%, rgba(251,191,36,0.25) 0.45px, transparent 0.58px)",
].join(", ");

const KUZEY_STARFIELD = [
  "radial-gradient(circle at 14% 12%, rgba(240,253,250,0.4) 0.45px, transparent 0.58px)",
  "radial-gradient(circle at 88% 18%, rgba(204,251,241,0.35) 0.4px, transparent 0.55px)",
  "radial-gradient(circle at 48% 38%, rgba(167,243,208,0.28) 0.35px, transparent 0.5px)",
  "radial-gradient(circle at 70% 82%, rgba(236,254,255,0.32) 0.4px, transparent 0.55px)",
].join(", ");

const OKYANUS_STARFIELD = [
  "radial-gradient(circle at 12% 22%, rgba(224,242,254,0.35) 0.45px, transparent 0.58px)",
  "radial-gradient(circle at 78% 12%, rgba(186,230,253,0.3) 0.4px, transparent 0.55px)",
  "radial-gradient(circle at 40% 58%, rgba(103,232,249,0.22) 0.35px, transparent 0.5px)",
  "radial-gradient(circle at 90% 68%, rgba(165,243,252,0.28) 0.4px, transparent 0.55px)",
].join(", ");

function GorselTemaDekoratif({ temaId }: { temaId: GorselTemaId }) {
  const wrap = "pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]";
  if (temaId === "kozmikMor") {
    return (
      <>
        <div
          className={wrap}
          style={{
            background:
              "radial-gradient(ellipse 125% 80% at 45% -8%, rgba(167,139,250,0.5), transparent 58%), radial-gradient(ellipse 90% 60% at 100% 20%, rgba(109,40,217,0.42), transparent 52%), radial-gradient(ellipse 70% 55% at 0% 85%, rgba(76,29,149,0.4), transparent 50%), radial-gradient(ellipse 55% 45% at 75% 70%, rgba(139,92,246,0.28), transparent 48%)",
            opacity: 0.55,
          }}
          aria-hidden
        />
        <div className={`${wrap} opacity-[0.26]`} style={{ backgroundImage: KOZMIK_STARFIELD, backgroundSize: "100% 100%" }} aria-hidden />
        <div
          className={wrap}
          style={{
            opacity: 0.2,
            backgroundImage:
              "repeating-linear-gradient(88deg, transparent, transparent 72px, rgba(251,191,36,0.045) 72px, rgba(251,191,36,0.045) 73px, transparent 73px, transparent 144px), repeating-linear-gradient(0deg, transparent, transparent 96px, rgba(253,224,71,0.03) 96px, rgba(253,224,71,0.03) 97px, transparent 97px, transparent 192px)",
          }}
          aria-hidden
        />
        <div
          className={`${wrap} mix-blend-screen opacity-[0.1]`}
          style={{ boxShadow: "inset 0 0 100px rgba(192,132,252,0.35)" }}
          aria-hidden
        />
      </>
    );
  }
  if (temaId === "altinMist") {
    return (
      <>
        <div
          className={wrap}
          style={{
            background:
              "radial-gradient(ellipse 95% 50% at 50% -5%, rgba(251,191,36,0.28), transparent 54%), radial-gradient(ellipse 85% 65% at 90% 95%, rgba(180,83,9,0.45), transparent 55%), radial-gradient(ellipse 70% 55% at 8% 88%, rgba(120,53,15,0.38), transparent 50%), radial-gradient(ellipse 50% 40% at 40% 40%, rgba(245,158,11,0.12), transparent 55%)",
            opacity: 0.75,
          }}
          aria-hidden
        />
        <div
          className={wrap}
          style={{
            opacity: 0.35,
            backgroundImage:
              "radial-gradient(ellipse 80% 50% at 25% 35%, rgba(254,249,195,0.08), transparent 60%), radial-gradient(ellipse 70% 45% at 70% 55%, rgba(253,230,138,0.06), transparent 58%)",
          }}
          aria-hidden
        />
        <div className={`${wrap} opacity-[0.22]`} style={{ backgroundImage: ALTIN_STARFIELD, backgroundSize: "100% 100%" }} aria-hidden />
        <div
          className={wrap}
          style={{
            opacity: 0.4,
            backgroundImage:
              "repeating-linear-gradient(115deg, rgba(255,255,255,0.02) 0 1px, transparent 1px 48px), linear-gradient(180deg, rgba(251,191,36,0.04), transparent 35%)",
          }}
          aria-hidden
        />
        <div
          className={wrap}
          style={{ opacity: 0.35, boxShadow: "inset 0 0 0 1px rgba(251,191,36,0.14), inset 0 0 90px rgba(120,53,9,0.2)" }}
          aria-hidden
        />
      </>
    );
  }
  if (temaId === "kuzeyIsiklari") {
    return (
      <>
        <div
          className={wrap}
          style={{
            background:
              "radial-gradient(ellipse 100% 70% at 50% 0%, rgba(15,23,42,0.85), transparent 45%), radial-gradient(ellipse 95% 55% at 5% 25%, rgba(34,197,94,0.35), transparent 52%), radial-gradient(ellipse 90% 60% at 95% 15%, rgba(45,212,191,0.28), transparent 54%), radial-gradient(ellipse 80% 70% at 50% 100%, rgba(30,58,138,0.35), transparent 52%)",
            opacity: 0.88,
          }}
          aria-hidden
        />
        <div
          className={wrap}
          style={{
            opacity: 0.45,
            background:
              "linear-gradient(185deg, rgba(94,234,212,0.12) 0%, transparent 22%), repeating-linear-gradient(8deg, transparent 0 64px, rgba(45,212,191,0.035) 64px, rgba(45,212,191,0.035) 65px, transparent 65px 128px)",
          }}
          aria-hidden
        />
        <div
          className={`${wrap} left-[-20%] top-[-12%] h-[125%] w-[125%] blur-3xl`}
          style={{
            background:
              "conic-gradient(from 200deg at 58% 32%, transparent 0deg, rgba(52,211,153,0.18) 55deg, transparent 110deg, rgba(6,182,212,0.15) 190deg, transparent 250deg, rgba(16,185,129,0.12) 310deg, transparent 360deg)",
            opacity: 0.38,
          }}
          aria-hidden
        />
        <div className={`${wrap} opacity-[0.2]`} style={{ backgroundImage: KUZEY_STARFIELD, backgroundSize: "100% 100%" }} aria-hidden />
        <div
          className={wrap}
          style={{ opacity: 0.1, boxShadow: "inset 0 0 80px rgba(45,212,191,0.2)" }}
          aria-hidden
        />
      </>
    );
  }
  /* okyanusDerinligi */
  return (
    <>
      <div
        className={wrap}
        style={{
          background:
            "radial-gradient(ellipse 100% 60% at 50% 110%, rgba(8,47,73,0.75), transparent 58%), radial-gradient(ellipse 70% 45% at 12% 8%, rgba(30,64,175,0.42), transparent 52%), radial-gradient(ellipse 75% 50% at 92% 18%, rgba(12,74,110,0.4), transparent 50%), radial-gradient(ellipse 55% 40% at 48% 48%, rgba(14,116,144,0.18), transparent 55%)",
          opacity: 0.82,
        }}
        aria-hidden
      />
      <div
        className={wrap}
        style={{
          opacity: 0.4,
          backgroundImage:
            "radial-gradient(circle at 28% 72%, rgba(103,232,249,0.14) 0%, transparent 28%), radial-gradient(circle at 72% 68%, rgba(56,189,248,0.12) 0%, transparent 26%), radial-gradient(circle at 50% 88%, rgba(14,165,233,0.1) 0%, transparent 32%)",
        }}
        aria-hidden
      />
      <div
        className={wrap}
        style={{
          opacity: 0.28,
          backgroundImage:
            "radial-gradient(ellipse 140% 24% at 30% 80%, rgba(103,232,249,0.14), transparent), radial-gradient(ellipse 120% 20% at 75% 88%, rgba(56,189,248,0.1), transparent), linear-gradient(175deg, transparent 55%, rgba(8,145,178,0.08) 100%)",
        }}
        aria-hidden
      />
      <div className={`${wrap} opacity-[0.18]`} style={{ backgroundImage: OKYANUS_STARFIELD, backgroundSize: "100% 100%" }} aria-hidden />
      <div
        className={wrap}
        style={{
          opacity: 0.12,
          background:
            "repeating-linear-gradient(-6deg, transparent 0 40px, rgba(14,165,233,0.025) 40px, rgba(14,165,233,0.025) 41px, transparent 41px 88px)",
        }}
        aria-hidden
      />
      <div className={wrap} style={{ opacity: 0.1, boxShadow: "inset 0 -60px 80px rgba(56,189,248,0.15)" }} aria-hidden />
    </>
  );
}

/** Görsel rapor — renk paleti (CSS değişkenleri) + dekor katmanları ayrı */
const GORSEL_TEMA_VARS = {
  kozmikMor: {
    "--gr-bg-top": "#1a0a2e",
    "--gr-bg-mid": "#0c0614",
    "--gr-bg-bot": "#000000",
    "--gr-blob-1": "rgba(139,92,246,0.14)",
    "--gr-blob-2": "rgba(245,158,11,0.11)",
    "--gr-nebula": "rgba(88,28,135,0.35)",
    "--gr-border-outer": "rgba(139,92,246,0.28)",
    "--gr-shadow": "rgba(139,92,246,0.32)",
    "--gr-ring": "rgba(251,191,36,0.16)",
    "--gr-header-border": "rgba(251,191,36,0.28)",
    "--gr-eyebrow": "rgba(196,181,253,0.92)",
    "--gr-title-shadow": "rgba(167,139,250,0.28)",
    "--gr-header-divider": "rgba(139,92,246,0.22)",
    "--gr-name": "#ffffff",
    "--gr-birth": "rgba(221,214,254,0.9)",
    "--gr-card-bg": "rgba(0,0,0,0.38)",
    "--gr-card-border": "rgba(139,92,246,0.22)",
    "--gr-h3": "rgba(221,214,254,0.96)",
    "--gr-h3-border": "rgba(251,191,36,0.22)",
    "--gr-number": "#ffffff",
    "--gr-key": "rgba(253,230,138,0.92)",
    "--gr-pin-border": "rgba(167,139,250,0.38)",
    "--gr-pin-bg": "rgba(46,16,101,0.52)",
    "--gr-pin-shadow": "rgba(139,92,246,0.22)",
    "--gr-el-bg": "rgba(46,16,101,0.32)",
    "--gr-el-border": "rgba(139,92,246,0.16)",
    "--gr-el-label": "rgba(196,181,253,0.82)",
    "--gr-el-muted": "rgba(167,139,250,0.82)",
    "--gr-cakra-wrap-from": "rgba(46,16,101,0.32)",
    "--gr-cakra-wrap-to": "rgba(0,0,0,0.52)",
    "--gr-cakra-wrap-border": "rgba(139,92,246,0.26)",
    "--gr-row-bg": "rgba(0,0,0,0.38)",
    "--gr-row-border": "rgba(139,92,246,0.16)",
    "--gr-empty": "rgba(124,58,237,0.42)",
    "--gr-cakra-sk": "rgba(221,214,254,1)",
    "--gr-cakra-tr": "rgba(167,139,250,0.9)",
    "--gr-cakra-dot": "rgba(196,181,253,1)",
    "--gr-dot-glow": "rgba(167,139,250,0.48)",
    "--gr-line-border": "rgba(251,191,36,0.48)",
    "--gr-line-bg": "rgba(255,255,255,0.04)",
    "--gr-line-text": "rgba(237,233,254,0.96)",
    "--gr-dash": "rgba(139,92,246,0.72)",
    "--gr-harf-border": "rgba(139,92,246,0.16)",
    "--gr-harf-bg": "rgba(46,16,101,0.28)",
    "--gr-harf-label": "rgba(196,181,253,0.92)",
    "--gr-harf-body": "rgba(237,233,254,0.92)",
    "--gr-harf-meta": "rgba(167,139,250,0.82)",
  },
  altinMist: {
    "--gr-bg-top": "#1c1208",
    "--gr-bg-mid": "#0f0a06",
    "--gr-bg-bot": "#050302",
    "--gr-blob-1": "rgba(217,119,6,0.14)",
    "--gr-blob-2": "rgba(180,83,9,0.1)",
    "--gr-nebula": "rgba(120,53,15,0.32)",
    "--gr-border-outer": "rgba(245,158,11,0.28)",
    "--gr-shadow": "rgba(245,158,11,0.22)",
    "--gr-ring": "rgba(253,224,71,0.18)",
    "--gr-header-border": "rgba(253,224,71,0.26)",
    "--gr-eyebrow": "rgba(253,230,138,0.88)",
    "--gr-title-shadow": "rgba(251,191,36,0.22)",
    "--gr-header-divider": "rgba(180,83,9,0.28)",
    "--gr-name": "#fffbeb",
    "--gr-birth": "rgba(254,243,199,0.88)",
    "--gr-card-bg": "rgba(12,8,4,0.45)",
    "--gr-card-border": "rgba(245,158,11,0.22)",
    "--gr-h3": "rgba(254,243,199,0.94)",
    "--gr-h3-border": "rgba(253,224,71,0.24)",
    "--gr-number": "#fffbeb",
    "--gr-key": "rgba(253,224,71,0.95)",
    "--gr-pin-border": "rgba(251,191,36,0.35)",
    "--gr-pin-bg": "rgba(69,26,3,0.55)",
    "--gr-pin-shadow": "rgba(245,158,11,0.2)",
    "--gr-el-bg": "rgba(69,26,3,0.38)",
    "--gr-el-border": "rgba(245,158,11,0.16)",
    "--gr-el-label": "rgba(253,230,138,0.78)",
    "--gr-el-muted": "rgba(252,211,77,0.72)",
    "--gr-cakra-wrap-from": "rgba(69,26,3,0.35)",
    "--gr-cakra-wrap-to": "rgba(9,6,3,0.55)",
    "--gr-cakra-wrap-border": "rgba(251,191,36,0.24)",
    "--gr-row-bg": "rgba(12,8,4,0.42)",
    "--gr-row-border": "rgba(180,83,9,0.2)",
    "--gr-empty": "rgba(180,83,9,0.45)",
    "--gr-cakra-sk": "rgba(255,251,235,0.98)",
    "--gr-cakra-tr": "rgba(252,211,77,0.88)",
    "--gr-cakra-dot": "rgba(254,240,138,0.95)",
    "--gr-dot-glow": "rgba(251,191,36,0.42)",
    "--gr-line-border": "rgba(253,224,71,0.45)",
    "--gr-line-bg": "rgba(255,255,255,0.035)",
    "--gr-line-text": "rgba(254,243,199,0.95)",
    "--gr-dash": "rgba(180,83,9,0.68)",
    "--gr-harf-border": "rgba(245,158,11,0.18)",
    "--gr-harf-bg": "rgba(69,26,3,0.32)",
    "--gr-harf-label": "rgba(253,230,138,0.88)",
    "--gr-harf-body": "rgba(255,251,235,0.9)",
    "--gr-harf-meta": "rgba(252,211,77,0.78)",
  },
  kuzeyIsiklari: {
    "--gr-bg-top": "#061a1f",
    "--gr-bg-mid": "#040f14",
    "--gr-bg-bot": "#02080a",
    "--gr-blob-1": "rgba(34,211,238,0.12)",
    "--gr-blob-2": "rgba(167,139,250,0.1)",
    "--gr-nebula": "rgba(13,148,136,0.28)",
    "--gr-border-outer": "rgba(45,212,191,0.26)",
    "--gr-shadow": "rgba(34,211,238,0.22)",
    "--gr-ring": "rgba(52,211,153,0.14)",
    "--gr-header-border": "rgba(94,234,212,0.26)",
    "--gr-eyebrow": "rgba(165,243,252,0.9)",
    "--gr-title-shadow": "rgba(34,211,238,0.2)",
    "--gr-header-divider": "rgba(45,212,191,0.22)",
    "--gr-name": "#ecfeff",
    "--gr-birth": "rgba(165,243,252,0.88)",
    "--gr-card-bg": "rgba(4,20,24,0.42)",
    "--gr-card-border": "rgba(45,212,191,0.2)",
    "--gr-h3": "rgba(204,251,241,0.95)",
    "--gr-h3-border": "rgba(94,234,212,0.22)",
    "--gr-number": "#f0fdfa",
    "--gr-key": "rgba(167,243,208,0.92)",
    "--gr-pin-border": "rgba(94,234,212,0.32)",
    "--gr-pin-bg": "rgba(6,78,59,0.42)",
    "--gr-pin-shadow": "rgba(34,211,238,0.18)",
    "--gr-el-bg": "rgba(6,78,59,0.32)",
    "--gr-el-border": "rgba(45,212,191,0.14)",
    "--gr-el-label": "rgba(153,246,228,0.8)",
    "--gr-el-muted": "rgba(110,231,183,0.75)",
    "--gr-cakra-wrap-from": "rgba(6,78,59,0.32)",
    "--gr-cakra-wrap-to": "rgba(2,12,16,0.55)",
    "--gr-cakra-wrap-border": "rgba(45,212,191,0.24)",
    "--gr-row-bg": "rgba(4,20,24,0.4)",
    "--gr-row-border": "rgba(13,148,136,0.18)",
    "--gr-empty": "rgba(13,116,104,0.48)",
    "--gr-cakra-sk": "rgba(236,254,255,0.98)",
    "--gr-cakra-tr": "rgba(153,246,228,0.88)",
    "--gr-cakra-dot": "rgba(167,243,208,0.95)",
    "--gr-dot-glow": "rgba(52,211,153,0.45)",
    "--gr-line-border": "rgba(94,234,212,0.42)",
    "--gr-line-bg": "rgba(255,255,255,0.035)",
    "--gr-line-text": "rgba(204,251,241,0.95)",
    "--gr-dash": "rgba(45,212,191,0.65)",
    "--gr-harf-border": "rgba(45,212,191,0.16)",
    "--gr-harf-bg": "rgba(6,78,59,0.3)",
    "--gr-harf-label": "rgba(167,243,208,0.9)",
    "--gr-harf-body": "rgba(236,254,255,0.9)",
    "--gr-harf-meta": "rgba(110,231,183,0.8)",
  },
  okyanusDerinligi: {
    "--gr-bg-top": "#071426",
    "--gr-bg-mid": "#030c18",
    "--gr-bg-bot": "#01060e",
    "--gr-blob-1": "rgba(14,165,233,0.12)",
    "--gr-blob-2": "rgba(59,130,246,0.1)",
    "--gr-nebula": "rgba(30,58,138,0.32)",
    "--gr-border-outer": "rgba(56,189,248,0.26)",
    "--gr-shadow": "rgba(14,165,233,0.2)",
    "--gr-ring": "rgba(125,211,252,0.14)",
    "--gr-header-border": "rgba(56,189,248,0.24)",
    "--gr-eyebrow": "rgba(186,230,253,0.9)",
    "--gr-title-shadow": "rgba(14,165,233,0.22)",
    "--gr-header-divider": "rgba(37,99,235,0.25)",
    "--gr-name": "#f0f9ff",
    "--gr-birth": "rgba(186,230,253,0.88)",
    "--gr-card-bg": "rgba(3,24,48,0.45)",
    "--gr-card-border": "rgba(56,189,248,0.2)",
    "--gr-h3": "rgba(224,242,254,0.95)",
    "--gr-h3-border": "rgba(125,211,252,0.22)",
    "--gr-number": "#f8fafc",
    "--gr-key": "rgba(125,211,252,0.92)",
    "--gr-pin-border": "rgba(56,189,248,0.32)",
    "--gr-pin-bg": "rgba(12,74,110,0.48)",
    "--gr-pin-shadow": "rgba(14,165,233,0.18)",
    "--gr-el-bg": "rgba(12,74,110,0.35)",
    "--gr-el-border": "rgba(37,99,235,0.16)",
    "--gr-el-label": "rgba(186,230,253,0.8)",
    "--gr-el-muted": "rgba(125,211,252,0.75)",
    "--gr-cakra-wrap-from": "rgba(12,74,110,0.35)",
    "--gr-cakra-wrap-to": "rgba(2,12,28,0.55)",
    "--gr-cakra-wrap-border": "rgba(56,189,248,0.24)",
    "--gr-row-bg": "rgba(3,24,48,0.42)",
    "--gr-row-border": "rgba(30,64,175,0.18)",
    "--gr-empty": "rgba(29,78,216,0.42)",
    "--gr-cakra-sk": "rgba(240,249,255,0.98)",
    "--gr-cakra-tr": "rgba(147,197,253,0.88)",
    "--gr-cakra-dot": "rgba(186,230,253,0.95)",
    "--gr-dot-glow": "rgba(56,189,248,0.45)",
    "--gr-line-border": "rgba(125,211,252,0.4)",
    "--gr-line-bg": "rgba(255,255,255,0.035)",
    "--gr-line-text": "rgba(224,242,254,0.95)",
    "--gr-dash": "rgba(56,189,248,0.68)",
    "--gr-harf-border": "rgba(56,189,248,0.16)",
    "--gr-harf-bg": "rgba(12,74,110,0.32)",
    "--gr-harf-label": "rgba(186,230,253,0.9)",
    "--gr-harf-body": "rgba(240,249,255,0.9)",
    "--gr-harf-meta": "rgba(125,211,252,0.8)",
  },
} as Record<GorselTemaId, CSSProperties>;

function GorselRaporInfografik({
  out,
  isimGoster,
  dogumGoster,
  temaId,
}: {
  out: NumerolojiMotorOut;
  isimGoster: string;
  dogumGoster: string;
  temaId: GorselTemaId;
}) {
  const css = GORSEL_TEMA_VARS[temaId];
  return (
    <div
      style={css}
      className="relative w-full max-w-none overflow-hidden rounded-3xl border border-[color:var(--gr-border-outer)] bg-gradient-to-b from-[color:var(--gr-bg-top)] via-[color:var(--gr-bg-mid)] to-[color:var(--gr-bg-bot)] px-5 py-8 text-[color:var(--gr-line-text)] shadow-[0_0_60px_-16px_var(--gr-shadow)] ring-1 ring-[color:var(--gr-ring)] sm:px-8 sm:py-10"
    >
      <GorselTemaDekoratif temaId={temaId} />

      <header className="relative z-[1] border-b border-[color:var(--gr-header-border)] pb-8 text-center">
        <p className="text-[11px] font-black uppercase tracking-[0.35em]" style={{ color: "var(--gr-eyebrow)" }}>
          Görsel rapor
        </p>
        <h2
          className="mt-3 text-2xl font-black tracking-[0.12em] sm:text-3xl md:text-4xl"
          style={{ color: "var(--gr-name)", textShadow: "0 0 28px var(--gr-title-shadow)" }}
        >
          NUMEROLOJİK YAŞAM HARİTASI
        </h2>
        <div
          className="mx-auto mt-6 max-w-2xl space-y-1 border-t pt-6"
          style={{ borderColor: "var(--gr-header-divider)" }}
        >
          <p className="text-lg font-semibold sm:text-xl" style={{ color: "var(--gr-name)" }}>
            {(isimGoster || "").trim() || "—"}
          </p>
          <p className="text-base font-semibold tabular-nums tracking-wide sm:text-lg" style={{ color: "var(--gr-birth)" }}>
            {(dogumGoster || "").trim() || "—"}
          </p>
        </div>
      </header>

      <div className="relative z-[1] mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
              className="flex flex-col rounded-3xl border p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-[6px]"
              style={{ borderColor: "var(--gr-card-border)", backgroundColor: "var(--gr-card-bg)" }}
            >
              <h3
                className="border-b pb-3 text-xs font-black uppercase tracking-[0.2em]"
                style={{ borderColor: "var(--gr-h3-border)", color: "var(--gr-h3)" }}
              >
                {label}
              </h3>
              <p className="mt-5 text-4xl font-black tabular-nums tracking-tight sm:text-5xl" style={{ color: "var(--gr-number)" }}>
                {nrDisplay(r)}
              </p>
              <p className="mt-3 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--gr-key)" }}>
                {k || "—"}
              </p>
            </section>
          );
        })}
      </div>

      <div className="relative z-[1] mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section
          className="rounded-3xl border p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-[6px]"
          style={{ borderColor: "var(--gr-card-border)", backgroundColor: "var(--gr-card-bg)" }}
        >
          <h3
            className="border-b pb-3 text-xs font-black uppercase tracking-[0.2em]"
            style={{ borderColor: "var(--gr-h3-border)", color: "var(--gr-h3)" }}
          >
            PIN kodu
          </h3>
          <div className="mt-6 flex flex-col items-center gap-3">
            <div className="flex flex-wrap justify-center gap-2">
              {[out.pinKodu.k1, out.pinKodu.k2, out.pinKodu.k3, out.pinKodu.k4].map((v, i) => (
                <span
                  key={`p1-${i}`}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border text-base font-black shadow-[0_0_18px_var(--gr-pin-shadow)]"
                  style={{
                    borderColor: "var(--gr-pin-border)",
                    backgroundColor: "var(--gr-pin-bg)",
                    color: "var(--gr-number)",
                  }}
                >
                  {v || "—"}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {[out.pinKodu.k5, out.pinKodu.k6, out.pinKodu.k7].map((v, i) => (
                <span
                  key={`p2-${i}`}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border text-base font-black shadow-[0_0_18px_var(--gr-pin-shadow)]"
                  style={{
                    borderColor: "var(--gr-pin-border)",
                    backgroundColor: "var(--gr-pin-bg)",
                    color: "var(--gr-number)",
                  }}
                >
                  {v || "—"}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {[out.pinKodu.k8, out.pinKodu.k9].map((v, i) => (
                <span
                  key={`p3-${i}`}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border text-base font-black shadow-[0_0_18px_var(--gr-pin-shadow)]"
                  style={{
                    borderColor: "var(--gr-pin-border)",
                    backgroundColor: "var(--gr-pin-bg)",
                    color: "var(--gr-number)",
                  }}
                >
                  {v || "—"}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section
          className="rounded-3xl border p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-[6px]"
          style={{ borderColor: "var(--gr-card-border)", backgroundColor: "var(--gr-card-bg)" }}
        >
          <h3
            className="border-b pb-3 text-xs font-black uppercase tracking-[0.2em]"
            style={{ borderColor: "var(--gr-h3-border)", color: "var(--gr-h3)" }}
          >
            Elementler
          </h3>
          <div className="mt-6 grid grid-cols-2 gap-4">
            {ELEMENT_ORDER.map((el) => (
              <div
                key={el}
                className="rounded-2xl border px-4 py-3 text-center backdrop-blur-sm"
                style={{ borderColor: "var(--gr-el-border)", backgroundColor: "var(--gr-el-bg)" }}
              >
                <p className="text-xs font-black uppercase tracking-widest" style={{ color: "var(--gr-el-label)" }}>
                  {el}
                </p>
                <p className="mt-2 text-3xl font-black tabular-nums" style={{ color: "var(--gr-number)" }}>
                  {out.elementler.counts[el]}
                </p>
              </div>
            ))}
          </div>
          {out.elementler.neutralCount > 0 ? (
            <p className="mt-4 text-center text-xs" style={{ color: "var(--gr-el-muted)" }}>
              Nötr: {out.elementler.neutralCount}
            </p>
          ) : null}
          {(out.elementler.key || "").trim() ? (
            <p className="mt-2 text-center text-sm font-semibold" style={{ color: "var(--gr-key)" }}>
              Baskın: {out.elementler.key}
            </p>
          ) : null}
        </section>

        <section
          className="rounded-3xl border bg-gradient-to-b p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-[6px]"
          style={{
            borderColor: "var(--gr-cakra-wrap-border)",
            background: `linear-gradient(to bottom, var(--gr-cakra-wrap-from), var(--gr-cakra-wrap-to))`,
          }}
        >
          <h3
            className="border-b pb-3 text-xs font-black uppercase tracking-[0.2em]"
            style={{ borderColor: "var(--gr-h3-border)", color: "var(--gr-h3)" }}
          >
            Çakra omurgası
          </h3>
          <div className="mt-6 space-y-3">
            {[7, 6, 5, 4, 3, 2, 1].map((cNo) => {
              const left = out.cakraOmurgasi.sayilar[cNo] ?? 0;
              const right = out.cakraOmurgasi.harfler[cNo] ?? 0;
              const [sk, tr] = GORSEL_CAKRA_LABELS[cNo] ?? [`${cNo}`, "Çakra"];
              const emptyRow = left === 0 && right === 0;
              return (
                <div
                  key={cNo}
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border px-3 py-3 backdrop-blur-sm"
                  style={{ borderColor: "var(--gr-row-border)", backgroundColor: "var(--gr-row-bg)" }}
                >
                  <div className="flex flex-wrap justify-end gap-1 text-lg leading-none" style={{ color: "var(--gr-number)" }} aria-hidden>
                    {emptyRow ? (
                      <span style={{ color: "var(--gr-empty)" }}>—</span>
                    ) : (
                      Array.from({ length: left }, (_, i) => (
                        <span key={`o-${cNo}-${i}`} className="opacity-95">
                          ○
                        </span>
                      ))
                    )}
                  </div>
                  <div className="min-w-[7.5rem] text-center">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: "var(--gr-cakra-sk)" }}>
                      {sk}
                    </p>
                    <p className="mt-0.5 text-xs font-medium" style={{ color: "var(--gr-cakra-tr)" }}>
                      {tr}
                    </p>
                  </div>
                  <div
                    className="flex flex-wrap justify-start gap-1 text-lg leading-none"
                    style={{ color: "var(--gr-cakra-dot)", filter: "drop-shadow(0 0 10px var(--gr-dot-glow))" }}
                    aria-hidden
                  >
                    {emptyRow ? (
                      <span style={{ color: "var(--gr-empty)" }}>—</span>
                    ) : (
                      Array.from({ length: right }, (_, i) => (
                        <span key={`f-${cNo}-${i}`}>●</span>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="relative z-[1] mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section
          className="rounded-3xl border p-6 backdrop-blur-[6px]"
          style={{ borderColor: "var(--gr-card-border)", backgroundColor: "var(--gr-card-bg)" }}
        >
          <h3
            className="border-b pb-3 text-xs font-black uppercase tracking-[0.2em]"
            style={{ borderColor: "var(--gr-h3-border)", color: "var(--gr-h3)" }}
          >
            Değişim — dönüşüm
          </h3>
          <div className="mt-5 space-y-3">
            {(() => {
              const degLines = (out.degisimDonusumMetni || "")
                .trim()
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean)
                .slice(0, 4);
              if (!degLines.length) {
                return (
                  <p className="text-sm" style={{ color: "var(--gr-dash)" }}>
                    —
                  </p>
                );
              }
              return degLines.map((line, i) => (
                <div
                  key={i}
                  className="rounded-xl border-l-2 px-4 py-3 text-sm leading-relaxed backdrop-blur-sm"
                  style={{
                    borderLeftColor: "var(--gr-line-border)",
                    backgroundColor: "var(--gr-line-bg)",
                    color: "var(--gr-line-text)",
                  }}
                >
                  {line}
                </div>
              ));
            })()}
          </div>
        </section>

        <section
          className="rounded-3xl border p-6 backdrop-blur-[6px]"
          style={{ borderColor: "var(--gr-card-border)", backgroundColor: "var(--gr-card-bg)" }}
        >
          <h3
            className="border-b pb-3 text-xs font-black uppercase tracking-[0.2em]"
            style={{ borderColor: "var(--gr-h3-border)", color: "var(--gr-h3)" }}
          >
            Zirve yılları
          </h3>
          <div className="mt-5 space-y-3">
            {out.zirveYillariMetni?.trim() ? (
              out.zirveYillariMetni
                .trim()
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean)
                .slice(0, 4)
                .map((line, i) => (
                  <div
                    key={i}
                    className="rounded-xl border-l-2 px-4 py-3 text-sm leading-relaxed backdrop-blur-sm"
                    style={{
                      borderLeftColor: "var(--gr-line-border)",
                      backgroundColor: "var(--gr-line-bg)",
                      color: "var(--gr-line-text)",
                    }}
                  >
                    {line}
                  </div>
                ))
            ) : out.zirveYillari?.peaks?.length ? (
              out.zirveYillari.peaks.slice(0, 4).map((p) => (
                <div
                  key={p.index}
                  className="rounded-xl border-l-2 px-4 py-3 text-sm leading-relaxed backdrop-blur-sm"
                  style={{
                    borderLeftColor: "var(--gr-line-border)",
                    backgroundColor: "var(--gr-line-bg)",
                    color: "var(--gr-line-text)",
                  }}
                >
                  {p.index}. zirve · yaş {p.age} · konu {p.topic}
                </div>
              ))
            ) : (
              <p className="text-sm" style={{ color: "var(--gr-dash)" }}>
                —
              </p>
            )}
          </div>
        </section>

        <section
          className="rounded-3xl border p-6 backdrop-blur-[6px]"
          style={{ borderColor: "var(--gr-card-border)", backgroundColor: "var(--gr-card-bg)" }}
        >
          <h3
            className="border-b pb-3 text-xs font-black uppercase tracking-[0.2em]"
            style={{ borderColor: "var(--gr-h3-border)", color: "var(--gr-h3)" }}
          >
            Mücadele yılları
          </h3>
          <div className="mt-5 space-y-3">
            {out.mucadeleYillariMetni?.trim() ? (
              out.mucadeleYillariMetni
                .trim()
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean)
                .slice(0, 4)
                .map((line, i) => (
                  <div
                    key={i}
                    className="rounded-xl border-l-2 px-4 py-3 text-sm leading-relaxed backdrop-blur-sm"
                    style={{
                      borderLeftColor: "var(--gr-line-border)",
                      backgroundColor: "var(--gr-line-bg)",
                      color: "var(--gr-line-text)",
                    }}
                  >
                    {line}
                  </div>
                ))
            ) : out.mucadeleYillari?.method1?.length ? (
              out.mucadeleYillari.method1.slice(0, 4).map((m) => (
                <div
                  key={m.index}
                  className="rounded-xl border-l-2 px-4 py-3 text-sm leading-relaxed backdrop-blur-sm"
                  style={{
                    borderLeftColor: "var(--gr-line-border)",
                    backgroundColor: "var(--gr-line-bg)",
                    color: "var(--gr-line-text)",
                  }}
                >
                  {m.index}. mücadele · yaş {m.age} · konu {m.topic}
                </div>
              ))
            ) : (
              <p className="text-sm" style={{ color: "var(--gr-dash)" }}>
                —
              </p>
            )}
          </div>
        </section>
      </div>

      <section
        className="relative z-[1] mt-10 rounded-3xl border p-6 backdrop-blur-[6px]"
        style={{ borderColor: "var(--gr-card-border)", backgroundColor: "var(--gr-card-bg)" }}
      >
        <h3
          className="border-b pb-3 text-xs font-black uppercase tracking-[0.2em]"
          style={{ borderColor: "var(--gr-h3-border)", color: "var(--gr-h3)" }}
        >
          Harflerin yankılanışı
        </h3>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.isArray(out.harflerinYankilanisi) && out.harflerinYankilanisi.length > 0
            ? out.harflerinYankilanisi.slice(0, 6).map((seg, idx) => (
                <div
                  key={`${seg.letter}-${idx}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border px-5 py-4 backdrop-blur-sm"
                  style={{ borderColor: "var(--gr-harf-border)", backgroundColor: "var(--gr-harf-bg)" }}
                >
                  <span className="text-3xl font-light" style={{ color: "var(--gr-number)" }}>
                    {seg.letter}
                  </span>
                  <div className="text-right">
                    <p className="text-xs font-black uppercase tracking-widest" style={{ color: "var(--gr-harf-label)" }}>
                      Çakra {seg.chakra}
                    </p>
                    <p className="mt-1 text-sm" style={{ color: "var(--gr-harf-body)" }}>
                      Yaş {seg.ageStart}–{seg.ageEnd}
                      {seg.yearStart != null ? (
                        <span style={{ color: "var(--gr-harf-meta)" }}>
                          {" "}
                          · {seg.yearStart}
                          {seg.yearEnd != null ? `–${seg.yearEnd}` : ""}
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
              ))
            : (out.harflerinYankilanisiMetni || "")
                .trim()
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean)
                .slice(0, 6)
                .map((line, i) => (
                  <div
                    key={i}
                    className="rounded-2xl border px-5 py-4 text-sm leading-relaxed backdrop-blur-sm"
                    style={{ borderColor: "var(--gr-harf-border)", backgroundColor: "var(--gr-harf-bg)", color: "var(--gr-harf-body)" }}
                  >
                    {line}
                  </div>
                ))}
          {!Array.isArray(out.harflerinYankilanisi) || out.harflerinYankilanisi.length === 0 ? (
            !(out.harflerinYankilanisiMetni || "").trim() ? (
              <p className="text-sm" style={{ color: "var(--gr-dash)" }}>
                —
              </p>
            ) : null
          ) : null}
        </div>
      </section>
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
  const [gorselTema, setGorselTema] = useState<GorselTemaId>("kozmikMor");
  const [gorselTamEkran, setGorselTamEkran] = useState(false);
  const [gorselPortalHazir, setGorselPortalHazir] = useState(false);

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
                <>
                  <div className="relative">
                    <div className="absolute right-2 top-2 z-20 flex max-w-[min(100%,28rem)] flex-col items-stretch gap-2 sm:right-4 sm:top-4 sm:max-w-none sm:flex-row sm:items-start sm:justify-end">
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
                        onClick={() => setGorselTamEkran(true)}
                        className="shrink-0 self-end rounded-full border-2 border-amber-400/80 bg-zinc-950 px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-amber-100 shadow-[0_0_20px_rgba(251,191,36,0.25)] backdrop-blur-md transition hover:border-amber-300 hover:bg-zinc-900 hover:text-amber-50 sm:px-5 sm:text-xs"
                      >
                        Tam Ekran
                      </button>
                    </div>
                    <div className="pt-14 sm:pt-[4.5rem]">
                      <GorselRaporInfografik
                        out={out}
                        isimGoster={isimGoster}
                        dogumGoster={dogumGoster}
                        temaId={gorselTema}
                      />
                    </div>
                  </div>
                  {gorselPortalHazir && gorselTamEkran
                    ? createPortal(
                        <>
                          <div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="gorsel-fs-title"
                            className="fixed inset-0 z-[9999] flex flex-col overflow-hidden bg-black/90"
                          >
                            <p id="gorsel-fs-title" className="sr-only">
                              Numerolojik yaşam haritası tam ekran görünümü
                            </p>
                            <div className="absolute inset-x-0 top-0 z-[10000] flex flex-col pt-3 pl-3 sm:pt-4 sm:pl-5 sm:pr-28">
                              <div
                                role="group"
                                aria-label="Tam ekran teması"
                                className="pointer-events-auto flex w-full max-w-[min(100%,calc(100vw-7rem))] flex-wrap items-center gap-1.5 rounded-2xl border-2 border-amber-400/55 bg-zinc-950/95 px-2 py-1.5 shadow-[0_4px_28px_rgba(0,0,0,0.75)] backdrop-blur-md sm:gap-2 sm:px-2.5 sm:py-2"
                              >
                                {GORSEL_TEMA_LIST.map((t) => (
                                  <button
                                    key={`fs-${t.id}`}
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
                            </div>
                            <div className="relative z-[10001] flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 pb-3 pt-14 sm:px-4 sm:pb-4 sm:pt-16">
                              <div className="relative w-[96vw] max-w-[1280px] max-h-[86vh] origin-top overflow-y-auto overflow-x-hidden overscroll-y-contain rounded-2xl border-2 border-amber-500/35 shadow-[0_0_56px_rgba(0,0,0,0.9)] ring-1 ring-amber-400/30 md:w-[90vw] md:origin-center md:scale-90">
                                <GorselRaporInfografik
                                  out={out}
                                  isimGoster={isimGoster}
                                  dogumGoster={dogumGoster}
                                  temaId={gorselTema}
                                />
                              </div>
                            </div>
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
      </div>
    </div>
  );
}
