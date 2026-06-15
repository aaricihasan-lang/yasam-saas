"use client";

import { useState, useCallback } from "react";
import { hesaplaPinKodu, reduceToDigit, parseBirthDate } from "@/lib/numeroloji";
import type { PinKoduBoxes } from "@/lib/numeroloji";
import {
  resolveNumerolojiTenantId,
  listNumerologyAnalyses,
  type NumerologyRecordListItem,
} from "../helpers/numerolojiKayit";

// --- Types ---

type Pin8 = [number, number, number, number, number, number, number, number];
type ElementName = "Hava" | "Su" | "Ateş" | "Toprak" | "Nötr";
type ElementCounts = Record<ElementName, number>;

// --- Calculation helpers ---

function pinBoxesTo8(pin: PinKoduBoxes): Pin8 {
  return [pin.k1, pin.k2, pin.k3, pin.k4, pin.k5, pin.k6, pin.k7, pin.k8];
}

function calcRelationPin(p1: Pin8, p2: Pin8): Pin8 {
  return [
    reduceToDigit(p1[0] + p2[0]),
    reduceToDigit(p1[1] + p2[1]),
    reduceToDigit(p1[2] + p2[2]),
    reduceToDigit(p1[3] + p2[3]),
    reduceToDigit(p1[4] + p2[4]),
    reduceToDigit(p1[5] + p2[5]),
    reduceToDigit(p1[6] + p2[6]),
    reduceToDigit(p1[7] + p2[7]),
  ];
}

const DIGIT_ELEMENT: Record<number, ElementName> = {
  1: "Hava", 5: "Hava",
  2: "Su", 7: "Su",
  3: "Ateş", 6: "Ateş",
  4: "Toprak", 8: "Toprak",
  9: "Nötr",
};

const ELEMENT_ORDER: ElementName[] = ["Hava", "Su", "Ateş", "Toprak", "Nötr"];

const ELEMENT_COLORS: Record<ElementName, { bg: string; text: string; bar: string; ring: string }> = {
  Hava:   { bg: "bg-sky-50",    text: "text-sky-800",    bar: "bg-sky-400",    ring: "ring-sky-200/60" },
  Su:     { bg: "bg-blue-50",   text: "text-blue-800",   bar: "bg-blue-500",   ring: "ring-blue-200/60" },
  Ateş:   { bg: "bg-orange-50", text: "text-orange-800", bar: "bg-orange-500", ring: "ring-orange-200/60" },
  Toprak: { bg: "bg-amber-50",  text: "text-amber-800",  bar: "bg-amber-600",  ring: "ring-amber-200/60" },
  Nötr:   { bg: "bg-violet-50", text: "text-violet-800", bar: "bg-violet-400", ring: "ring-violet-200/60" },
};

const BASKIN_DIGITS = new Set([1, 3, 6, 8]);
const EDILGEN_DIGITS = new Set([2, 4, 5, 7]);

function calcElementCounts(pin: Pin8): ElementCounts {
  const counts: ElementCounts = { Hava: 0, Su: 0, Ateş: 0, Toprak: 0, Nötr: 0 };
  for (const d of pin) {
    const el = DIGIT_ELEMENT[d];
    if (el) counts[el]++;
  }
  return counts;
}

function calcDominance(pin: Pin8): { baskin: number; edilgen: number } {
  let baskin = 0;
  let edilgen = 0;
  for (const d of pin) {
    if (BASKIN_DIGITS.has(d)) baskin++;
    else if (EDILGEN_DIGITS.has(d)) edilgen++;
    else if (d === 9) { baskin += 0.5; edilgen += 0.5; }
  }
  return { baskin, edilgen };
}

function elementLevelText(count: number): string {
  if (count === 0) return "Yok/Eksik";
  if (count === 1) return "Zayıf";
  if (count === 2) return "Yeterli";
  if (count === 3) return "Dengeli";
  return "Baskın/Fazla";
}

function generateComment(
  el: ElementCounts,
  dom: { baskin: number; edilgen: number },
): { genel: string; guclu: string[]; zor: string[]; oneri: string } {
  const guclu: string[] = [];
  const zor: string[] = [];

  if (el.Hava >= 3)   guclu.push("İletişim, fikir alışverişi ve zihinsel bağ bu ilişkide güçlüdür.");
  if (el.Su >= 3)     guclu.push("Duygusal derinlik, sezgi ve empati bu ilişkiyi besler.");
  if (el.Ateş >= 3)   guclu.push("Tutku, motivasyon ve dinamizm bu ilişkiyi hareketli kılar.");
  if (el.Toprak >= 3) guclu.push("Güven, istikrar ve pratik yaklaşım bu ilişkiyi güçlendirir.");
  if (el.Nötr >= 2)   guclu.push("Dönüşüm ve karmasal öğrenme bu ilişkide belirgindir.");

  if (el.Hava === 0)   zor.push("İletişim ve fikir paylaşımı zorlanabilir.");
  if (el.Su === 0)     zor.push("Duygusal bağ kurmak ve empati geliştirmek çaba gerektirebilir.");
  if (el.Ateş === 0)   zor.push("Motivasyon ve tutku alanında destek gerekebilir.");
  if (el.Toprak === 0) zor.push("Pratik kararlar ve maddi konularda zorluk yaşanabilir.");

  if (dom.baskin > dom.edilgen + 2)
    zor.push("Her iki taraf da yön vermek isteyebilir; güç paylaşımına dikkat edilmeli.");
  if (dom.edilgen > dom.baskin + 2)
    zor.push("Bekleme, pasiflik ve karar erteleme eğilimi olabilir; teşvik ve netlik önemlidir.");

  const diff = Math.abs(dom.baskin - dom.edilgen);
  const genel =
    diff <= 1
      ? "İlişki enerjisi genel olarak dengeli bir akış göstermektedir."
      : dom.baskin > dom.edilgen
      ? "İlişkide baskın enerji ön plandadır; liderlik ve yön verme eğilimi güçlüdür."
      : "İlişkide alıcı ve destekleyici enerji ön plandadır; sabır ve empati öne çıkar.";

  const oneri =
    guclu.length > 0 && zor.length > 0
      ? "Güçlü yönlerinizi koruyarak eksik elementleri birlikte geliştirmeye odaklanın."
      : guclu.length > 0
      ? "Mevcut uyumu canlı tutun; birbirinizin güçlü enerjisinden beslenin."
      : "Farklı enerji alanlarını keşfederek ilişkiyi zenginleştirin; karşıtlık da bir öğretmendir.";

  return { genel, guclu, zor, oneri };
}

// --- Shared style constants ---

const inputClass =
  "h-9 w-full rounded-lg border border-violet-200/80 bg-white px-3 text-sm font-medium text-slate-900 outline-none ring-1 ring-violet-100/60 transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-200/50";

const labelClass = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500";

// --- Sub-components ---

function PinChips({
  pin,
  color,
}: {
  pin: Pin8;
  color: "violet" | "fuchsia";
}) {
  const cls =
    color === "violet"
      ? "bg-violet-100 text-violet-800"
      : "bg-fuchsia-100 text-fuchsia-800";
  return (
    <div className="flex flex-wrap gap-1 pt-0.5">
      {pin.map((d, i) => (
        <span
          key={i}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-sm font-black ${cls}`}
        >
          {d}
        </span>
      ))}
    </div>
  );
}

// --- Main export ---

export interface NumerolojiIliskiAnaliziTabProps {
  kisi1Name: string;
  kisi1Surname: string;
  kisi1BirthDate: string;
  kisi1Pin: PinKoduBoxes;
}

export function NumerolojiIliskiAnaliziTab({
  kisi1Name,
  kisi1Surname,
  kisi1BirthDate,
  kisi1Pin,
}: NumerolojiIliskiAnaliziTabProps) {
  const [kisi2Name, setKisi2Name] = useState("");
  const [kisi2Surname, setKisi2Surname] = useState("");
  const [kisi2BirthDate, setKisi2BirthDate] = useState("");

  const [showDanisan, setShowDanisan] = useState(false);
  const [danisanList, setDanisanList] = useState<NumerologyRecordListItem[]>([]);
  const [danisanLoading, setDanisanLoading] = useState(false);
  const [danisanSearch, setDanisanSearch] = useState("");

  const kisi1Pin8 = pinBoxesTo8(kisi1Pin);

  const normalizedBirthDate = kisi2BirthDate.trim().replace(/\//g, ".");
  const kisi2Valid = normalizedBirthDate ? parseBirthDate(normalizedBirthDate) !== null : false;
  const kisi2PinBoxes = kisi2Valid ? hesaplaPinKodu(normalizedBirthDate) : null;
  const kisi2Pin8: Pin8 | null = kisi2PinBoxes ? pinBoxesTo8(kisi2PinBoxes) : null;
  const iliskiPin: Pin8 | null = kisi2Pin8 ? calcRelationPin(kisi1Pin8, kisi2Pin8) : null;

  const iliskiEl = iliskiPin ? calcElementCounts(iliskiPin) : null;
  const iliskiDom = iliskiPin ? calcDominance(iliskiPin) : null;
  const iliskiYorum = iliskiEl && iliskiDom ? generateComment(iliskiEl, iliskiDom) : null;

  const loadDanisan = useCallback(async () => {
    setDanisanLoading(true);
    const tenantId = await resolveNumerolojiTenantId();
    if (tenantId) {
      const { data } = await listNumerologyAnalyses(tenantId);
      if (data) setDanisanList(data);
    }
    setDanisanLoading(false);
  }, []);

  const handleDanisanToggle = () => {
    if (!showDanisan && danisanList.length === 0) {
      void loadDanisan();
    }
    setShowDanisan((v) => !v);
    setDanisanSearch("");
  };

  const handleDanisanSec = (item: NumerologyRecordListItem) => {
    setKisi2Name(item.name);
    setKisi2Surname(item.surname);
    setKisi2BirthDate(item.birth_date);
    setShowDanisan(false);
    setDanisanSearch("");
  };

  const filteredDanisan = danisanSearch.trim()
    ? danisanList.filter(
        (d) =>
          `${d.name} ${d.surname}`.toLowerCase().includes(danisanSearch.toLowerCase()) ||
          d.birth_date.includes(danisanSearch),
      )
    : danisanList;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="rounded-[12px] border border-violet-200/60 bg-gradient-to-r from-violet-50/80 to-fuchsia-50/60 px-4 py-2.5">
        <p className="text-xs font-black uppercase tracking-wider text-violet-600">İlişki Analizi</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          İki kişinin PIN kodundan ortak ilişki enerjisini hesaplar.
        </p>
      </div>

      {/* Person cards */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {/* Kişi 1 — readonly */}
        <div className="min-w-0 rounded-[12px] border border-violet-200/70 bg-white/90 p-3">
          <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-violet-500">
            1. Kişi (Mevcut Kayıt)
          </p>
          <p className="text-sm font-bold text-slate-900">
            {`${kisi1Name} ${kisi1Surname}`.trim() || "—"}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Doğum: {kisi1BirthDate || "—"}</p>
          <PinChips pin={kisi1Pin8} color="violet" />
        </div>

        {/* Kişi 2 — editable */}
        <div className="min-w-0 rounded-[12px] border border-fuchsia-200/70 bg-white/90 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-fuchsia-600">2. Kişi</p>
            <button
              type="button"
              onClick={handleDanisanToggle}
              className="rounded-md border border-violet-200/80 bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 transition hover:bg-violet-100"
            >
              {showDanisan ? "Kapat" : "Danışandan Seç"}
            </button>
          </div>

          {showDanisan ? (
            <div className="space-y-1.5">
              <input
                type="text"
                value={danisanSearch}
                onChange={(e) => setDanisanSearch(e.target.value)}
                placeholder="İsim veya tarih ile ara..."
                className={inputClass}
                autoFocus
              />
              <div className="max-h-40 overflow-y-auto rounded-lg border border-violet-100 bg-white">
                {danisanLoading ? (
                  <p className="px-3 py-2 text-xs text-slate-500">Yükleniyor…</p>
                ) : filteredDanisan.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-slate-500">Kayıt bulunamadı.</p>
                ) : (
                  filteredDanisan.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => handleDanisanSec(d)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-violet-50"
                    >
                      <span className="font-bold text-slate-900 truncate">
                        {d.name} {d.surname}
                      </span>
                      <span className="shrink-0 text-slate-400 tabular-nums">{d.birth_date}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className={labelClass}>Ad</label>
                  <input
                    type="text"
                    value={kisi2Name}
                    onChange={(e) => setKisi2Name(e.target.value)}
                    placeholder="Ad"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Soyad</label>
                  <input
                    type="text"
                    value={kisi2Surname}
                    onChange={(e) => setKisi2Surname(e.target.value)}
                    placeholder="Soyad"
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Doğum Tarihi (GG.AA.YYYY)</label>
                <input
                  type="text"
                  value={kisi2BirthDate}
                  onChange={(e) => setKisi2BirthDate(e.target.value)}
                  placeholder="15.03.1990"
                  className={inputClass}
                />
              </div>
              {kisi2Pin8 ? (
                <PinChips pin={kisi2Pin8} color="fuchsia" />
              ) : normalizedBirthDate ? (
                <p className="text-[10px] text-rose-500 font-semibold">
                  Geçerli bir tarih girin (GG.AA.YYYY)
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Results — shown only when person 2 is valid */}
      {iliskiPin && kisi2Pin8 ? (
        <>
          {/* İlişki PIN kartı */}
          <div className="min-w-0 rounded-[12px] border border-violet-200/70 bg-white/90 p-3">
            <p className="mb-2.5 text-[10px] font-black uppercase tracking-wider text-violet-500">
              İlişki PIN Kodu
            </p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {iliskiPin.map((d, i) => {
                const p1 = kisi1Pin8[i];
                const p2 = kisi2Pin8[i];
                const sum = p1 + p2;
                const formula =
                  sum > 9 ? `${p1}+${p2}=${sum}→${d}` : `${p1}+${p2}=${d}`;
                return (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xl font-black text-white shadow-[0_2px_8px_rgba(139,92,246,0.28)]">
                      {d}
                    </span>
                    <span className="text-[8px] text-slate-400 whitespace-nowrap tabular-nums text-center leading-tight">
                      {formula}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Hane karşılaştırma tablosu */}
          <div className="min-w-0 rounded-[12px] border border-violet-200/70 bg-white/90 p-3">
            <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
              Hane Karşılaştırması
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[280px] text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="py-1 pr-2 text-left font-black text-slate-400">Hane</th>
                    <th className="py-1 px-2 text-center font-black text-violet-500">Kişi 1</th>
                    <th className="py-1 px-2 text-center font-black text-fuchsia-500">Kişi 2</th>
                    <th className="py-1 px-2 text-center font-black text-slate-400">Toplam</th>
                    <th className="py-1 pl-2 text-center font-black text-violet-700">Sonuç</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 8 }, (_, i) => {
                    const p1 = kisi1Pin8[i];
                    const p2 = kisi2Pin8[i];
                    const sum = p1 + p2;
                    const result = iliskiPin[i];
                    return (
                      <tr
                        key={i}
                        className="border-b border-slate-50 last:border-b-0 hover:bg-violet-50/30 transition-colors"
                      >
                        <td className="py-1.5 pr-2 font-semibold text-slate-500">
                          {i + 1}. Hane
                        </td>
                        <td className="py-1.5 px-2 text-center font-black text-violet-700">
                          {p1}
                        </td>
                        <td className="py-1.5 px-2 text-center font-black text-fuchsia-700">
                          {p2}
                        </td>
                        <td className="py-1.5 px-2 text-center tabular-nums text-slate-500">
                          {sum}
                        </td>
                        <td className="py-1.5 pl-2 text-center font-black text-violet-900">
                          {result}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Element dağılımı */}
          {iliskiEl && (
            <div className="min-w-0 rounded-[12px] border border-violet-200/70 bg-white/90 p-3">
              <p className="mb-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
                Element Dağılımı
              </p>
              <div className="space-y-2">
                {ELEMENT_ORDER.map((el) => {
                  const count = iliskiEl[el];
                  const c = ELEMENT_COLORS[el];
                  const pct = count === 0 ? 0 : Math.max(8, (count / 8) * 100);
                  return (
                    <div key={el} className="flex min-w-0 items-center gap-2">
                      <span className={`w-14 shrink-0 text-xs font-bold ${c.text}`}>{el}</span>
                      <div className="min-w-0 flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${c.bar}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="shrink-0 w-4 text-center text-xs font-black text-slate-700 tabular-nums">
                        {count}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1 ${c.bg} ${c.text} ${c.ring}`}
                      >
                        {elementLevelText(count)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Baskın / Edilgen */}
          {iliskiDom && (
            <div className="min-w-0 rounded-[12px] border border-violet-200/70 bg-white/90 p-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
                Baskın / Edilgen Dengesi
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-rose-50 p-2.5 text-center ring-1 ring-rose-200/60">
                  <p className="text-[9px] font-black uppercase tracking-wide text-rose-500">
                    Baskın
                  </p>
                  <p className="text-2xl font-black text-rose-700 tabular-nums">
                    {iliskiDom.baskin}
                  </p>
                  <p className="text-[9px] text-rose-400">1, 3, 6, 8</p>
                </div>
                <div className="rounded-lg bg-sky-50 p-2.5 text-center ring-1 ring-sky-200/60">
                  <p className="text-[9px] font-black uppercase tracking-wide text-sky-500">
                    Edilgen
                  </p>
                  <p className="text-2xl font-black text-sky-700 tabular-nums">
                    {iliskiDom.edilgen}
                  </p>
                  <p className="text-[9px] text-sky-400">2, 4, 5, 7</p>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-slate-600">
                {iliskiDom.baskin > iliskiDom.edilgen + 2
                  ? "Her iki taraf da yön vermek isteyebilir; güç paylaşımına dikkat edilmeli."
                  : iliskiDom.edilgen > iliskiDom.baskin + 2
                  ? "Bekleme ve pasiflik eğilimi olabilir; teşvik ve netlik değerlidir."
                  : "Baskın ve edilgen enerji dengeli dağılmıştır."}
              </p>
            </div>
          )}

          {/* Otomatik yorum */}
          {iliskiYorum && (
            <div className="min-w-0 rounded-[12px] border border-violet-200/70 bg-white/90 p-3 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                Otomatik Yorum
              </p>

              <div className="rounded-lg bg-violet-50/80 px-3 py-2">
                <p className="mb-1 text-[9px] font-black uppercase tracking-wide text-violet-500">
                  İlişki Genel Enerjisi
                </p>
                <p className="text-xs text-slate-800">{iliskiYorum.genel}</p>
              </div>

              {iliskiYorum.guclu.length > 0 && (
                <div className="rounded-lg bg-emerald-50/80 px-3 py-2">
                  <p className="mb-1 text-[9px] font-black uppercase tracking-wide text-emerald-600">
                    Güçlü Taraflar
                  </p>
                  <ul className="space-y-0.5">
                    {iliskiYorum.guclu.map((s, i) => (
                      <li key={i} className="text-xs text-slate-800">
                        • {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {iliskiYorum.zor.length > 0 && (
                <div className="rounded-lg bg-amber-50/80 px-3 py-2">
                  <p className="mb-1 text-[9px] font-black uppercase tracking-wide text-amber-600">
                    Zorlayıcı Taraflar
                  </p>
                  <ul className="space-y-0.5">
                    {iliskiYorum.zor.map((s, i) => (
                      <li key={i} className="text-xs text-slate-800">
                        • {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-lg bg-sky-50/80 px-3 py-2">
                <p className="mb-1 text-[9px] font-black uppercase tracking-wide text-sky-600">
                  Öneri
                </p>
                <p className="text-xs text-slate-800">{iliskiYorum.oneri}</p>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-[12px] border-2 border-dashed border-violet-200/70 bg-white/60 px-4 py-6 text-center">
          <p className="text-xs text-slate-500">
            2. kişinin doğum tarihini girerek ilişki PIN kodunu hesaplayın.
          </p>
        </div>
      )}
    </div>
  );
}
