"use client";

import { useState, type ReactNode } from "react";
import type { NumerolojiResult } from "@/lib/numeroloji";
import {
  buildPlainAnalizFull,
  harfSegmentsToText,
  nrDisplay,
  elementShort,
  pinOneLine,
  type NumerolojiMotorOut,
} from "../utils/numerolojiPlainMetin";

const OZET_VERI_YOK = "Bu bölüm için veri üretilemedi.";

function OzetRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-slate-100/90 py-3 last:border-b-0 sm:grid-cols-[minmax(9rem,12rem)_1fr] sm:items-baseline sm:gap-4">
      <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="text-sm font-semibold leading-snug text-slate-900">{value}</div>
    </div>
  );
}

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

export function TabSonucOzeti({
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

export function TabAnalizOzetli({ out }: { out: NumerolojiMotorOut }) {
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

const KAYIT_TABS = [
  { id: "summary" as const, label: "Sonuç Özeti" },
  { id: "plain" as const, label: "Tam analiz" },
  { id: "detailed" as const, label: "Detaylı analiz" },
];

type KayitTabId = (typeof KAYIT_TABS)[number]["id"];

export function NumerolojiKayitSonucPanel({
  out,
  name,
  surname,
  birthDate,
}: {
  out: NumerolojiMotorOut;
  name: string;
  surname: string;
  birthDate: string;
}) {
  const [tab, setTab] = useState<KayitTabId>("summary");
  const isimGoster = `${name} ${surname}`.replace(/\s+/g, " ").trim();

  return (
    <div className="overflow-hidden rounded-[26px] border border-slate-200/85 bg-white/80 shadow-[0_20px_50px_-18px_rgba(91,33,182,0.14)] ring-1 ring-violet-100/60 backdrop-blur-md">
      <div className="flex flex-wrap gap-0 border-b border-slate-200/80 bg-gradient-to-r from-violet-50/80 via-amber-50/50 to-sky-50/80 px-1 pt-1">
        {KAYIT_TABS.map((t) => (
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
      <div className="max-h-[min(70vh,36rem)] overflow-y-auto bg-gradient-to-b from-white/95 via-slate-50/50 to-violet-50/20 p-4 sm:p-6">
        {tab === "summary" ? <TabSonucOzeti out={out} isimGoster={isimGoster} dogumGoster={birthDate} /> : null}
        {tab === "plain" ? (
          <pre className="whitespace-pre-wrap rounded-xl border border-slate-100 bg-white/70 p-4 font-mono text-[11px] leading-relaxed text-slate-800 shadow-inner sm:p-5 sm:text-xs">
            {buildPlainAnalizFull(out)}
          </pre>
        ) : null}
        {tab === "detailed" ? <TabAnalizOzetli out={out} /> : null}
      </div>
    </div>
  );
}
