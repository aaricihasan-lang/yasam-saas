"use client";

// Transit — KONUM VE SAAT DİLİMİ paneli + UTC karşılığı önizlemesi.
//
//   • Türkiye saati varsayılan: Türkiye'deki uzman hiçbir seçim yapmaz.
//   • Tarayıcı saat dilimi algılanır (IANA doğrulamasıyla), ekranda açıkça gösterilir ve değiştirilebilir;
//     algılanamazsa Türkiye saati kullanılır ve bu durum yazılır.
//   • Şehir arama: mevcut HD konum seçici (yerel il/ilçe + dünya şehirleri; açık eylemle sunucu konum servisi). Seçilen
//     şehrin YALNIZ IANA saat dilimi kullanılır; tarihsel ofset her sorguda seçilen tarih için hesaplanır (servisteki anlık
//     ofset kullanılmaz). Elle IANA saat dilimi seçimi her zaman mümkün (konum servisi çalışmazsa da).
//   • UTC karşılığı tarayıcıda SAF fonksiyonla önizlenir; kesin dönüşüm ve doğrulama SUNUCUDA yapılır.

import { useState } from "react";
import { HdBirthLocationPicker, type HdPickedLocation } from "../../components/HdBirthLocationPicker";
import { isTransitTimeZone, resolveTransitMoment, TRANSIT_TIME_ZONE, utcOffsetLabel } from "@/lib/human-design/transit/transitMoment";

export type TransitZone = {
  tz: string;
  /** Şehir aramasından seçildiyse görünen ad (ör. "London, England, United Kingdom"). */
  label: string | null;
  source: "default" | "detected" | "undetected" | "city" | "manual";
};

export const ZONE_INTRO = [
  "Türkiye saatine göre transit hesaplaması yapıyorsanız herhangi bir konum veya saat dilimi seçmenize gerek yoktur.",
  "Farklı bir ülkenin yerel tarih ve saatine göre hesaplama yapmak istiyorsanız ilgili şehir veya saat dilimini seçiniz.",
  "Sistem, seçtiğiniz bölgenin geçmiş ve güncel yaz/kış saati uygulamalarını dikkate alarak doğru zamanı otomatik hesaplar.",
];

/** Türkiye'nin IANA eş adları tek ada indirgenir (Asia/Istanbul ve Turkey = Europe/Istanbul). */
export function canonicalTz(tz: string): string {
  return tz === "Asia/Istanbul" || tz === "Turkey" ? TRANSIT_TIME_ZONE : tz;
}

/** Tarayıcı saat dilimi (yalnız geçerli IANA ise); algılanamazsa "". */
export function detectBrowserTimeZone(): string {
  try {
    const tz = canonicalTz(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
    return isTransitTimeZone(tz) ? tz : "";
  } catch {
    return "";
  }
}

/** Başlangıç saat dilimi: geçerli tarayıcı saat dilimi; yoksa Türkiye. */
export function initialZone(detected: string): TransitZone {
  if (!detected) return { tz: TRANSIT_TIME_ZONE, label: null, source: "undetected" };
  return { tz: detected, label: null, source: detected === TRANSIT_TIME_ZONE ? "default" : "detected" };
}

export function zoneName(tz: string): string {
  return tz === TRANSIT_TIME_ZONE ? "Türkiye saati" : tz;
}

const FALLBACK_ZONES = [TRANSIT_TIME_ZONE, "UTC", "Europe/London", "Europe/Berlin", "Europe/Paris", "America/New_York", "America/Los_Angeles", "Asia/Dubai", "Asia/Tokyo", "Australia/Sydney"];
function allZones(current: string): string[] {
  let list: string[] = [];
  try {
    list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    list = [];
  }
  if (!list.length) list = FALLBACK_ZONES;
  const set = new Set(list.filter((z) => isTransitTimeZone(z)));
  set.add(current);
  set.add(TRANSIT_TIME_ZONE);
  return [...set].sort((a, b) => a.localeCompare(b, "en"));
}

const SOURCE_NOTE: Record<TransitZone["source"], string> = {
  default: "Varsayılan",
  detected: "Tarayıcınızın saat diliminden algılandı",
  undetected: "Tarayıcı saat dilimi algılanamadı; Türkiye saati kullanılıyor",
  city: "Şehir aramasından seçildi",
  manual: "Elle seçildi",
};

export function TransitZonePanel({ zone, onZone, testId }: { zone: TransitZone; onZone: (z: TransitZone) => void; testId: string }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<HdPickedLocation | null>(null);
  const [cityErr, setCityErr] = useState<string | null>(null);
  const zones = open ? allZones(zone.tz) : [];
  const title = zone.label ? `${zone.label} · ${zone.tz}` : zone.tz === TRANSIT_TIME_ZONE ? `Türkiye saati (${zone.tz})` : zone.tz;
  return (
    <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2.5" data-hd-transit-zone={testId}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-widest text-indigo-700">
            <span aria-hidden>🌍 </span>Konum ve Saat Dilimi
          </p>
          <p className="mt-0.5 break-words text-sm font-bold text-slate-900" data-hd-transit-zone-current={zone.tz}>{title}</p>
          <p className="text-[11px] text-slate-500" data-hd-transit-zone-source={zone.source}>{SOURCE_NOTE[zone.source]}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {zone.tz !== TRANSIT_TIME_ZONE ? (
            <button
              type="button"
              onClick={() => {
                setPicked(null);
                onZone({ tz: TRANSIT_TIME_ZONE, label: null, source: "manual" });
              }}
              className="min-h-[36px] rounded-lg border border-indigo-200 bg-white px-3 text-xs font-bold text-indigo-700"
              data-hd-transit-zone-reset
            >
              Türkiye saatine dön
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="min-h-[36px] rounded-lg border border-indigo-200 bg-white px-3 text-xs font-bold text-indigo-700"
            data-hd-transit-zone-toggle
          >
            {open ? "Kapat" : "Konum / saat dilimi değiştir"}
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600" data-hd-transit-zone-intro>{ZONE_INTRO.join(" ")}</p>
      {open ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2" data-hd-transit-zone-editor>
          <div className="block text-xs font-bold text-slate-700">
            <span className="mb-1 block">Şehir ara</span>
            <HdBirthLocationPicker
              id={`hd-transit-city-${testId}`}
              value={picked}
              placeholder="Şehir yazın… (ör. Londra, New York, Tokyo)"
              unselectedHint="Listeden bir şehir seçin; seçilmeyen metin saat dilimini değiştirmez."
              onChange={(l) => {
                setPicked(l);
                if (!l) return;
                const tz = canonicalTz(l.tz);
                if (!isTransitTimeZone(tz)) {
                  setCityErr("Bu konumun saat dilimi doğrulanamadı; lütfen saat dilimini listeden seçin.");
                  return;
                }
                setCityErr(null);
                onZone({ tz, label: l.label, source: "city" });
              }}
            />
            {cityErr ? <p role="alert" className="mt-1 text-[11px] font-semibold text-rose-700">{cityErr}</p> : null}
          </div>
          <label className="block text-xs font-bold text-slate-700">
            <span className="mb-1 block">Saat dilimi (IANA)</span>
            <select
              value={zone.tz}
              onChange={(e) => {
                setPicked(null);
                if (isTransitTimeZone(e.target.value)) onZone({ tz: e.target.value, label: null, source: "manual" });
              }}
              className="h-9 w-full rounded-xl border border-indigo-200 bg-white px-2 text-base text-slate-900 sm:text-sm"
              data-hd-transit-zone-select
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Seçilen yerel tarih/saatin UTC karşılığı (tarayıcı önizlemesi; aynı saf fonksiyon sunucuda da çalışır).
 * İki kez yaşanan saatte iki olası an AÇIKÇA sunulur; biri seçilmeden hesap yapılmaz (sessiz seçim yok).
 */
export function UtcPreview({
  date,
  time,
  tz,
  offset,
  onOffset,
  testId,
}: {
  date: string;
  time: string;
  tz: string;
  offset: number | null;
  onOffset: (o: number | null) => void;
  testId: string;
}) {
  const r = resolveTransitMoment(date, time, tz);
  if (r.ok) {
    return (
      <p className="mt-2 text-[11px] text-slate-600" data-hd-transit-utc-preview={testId} data-hd-transit-utc={r.moment.utcIso}>
        UTC karşılığı: <b className="font-semibold text-slate-800">{r.moment.utcIso.slice(0, 16).replace("T", " ")}</b> · {zoneName(tz)} ({utcOffsetLabel(r.moment.offsetSeconds)})
      </p>
    );
  }
  if (r.code === "LOCAL_TIME_AMBIGUOUS" && r.offsetsSeconds) {
    // Büyük ofset (yaz saati) ilk yaşanan andır.
    const opts = [...r.offsetsSeconds].sort((a, b) => b - a);
    return (
      <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-900 ring-1 ring-amber-200" data-hd-transit-utc-preview={testId} data-hd-transit-ambiguous>
        <p className="font-semibold">{r.error}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="İki kez yaşanan saat">
          {opts.map((o, i) => {
            const c = resolveTransitMoment(date, time, tz, o);
            const utc = c.ok ? c.moment.utcIso.slice(0, 16).replace("T", " ") : "";
            return (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={offset === o}
                onClick={() => onOffset(o)}
                className={`min-h-[36px] rounded-lg px-3 text-xs font-bold ring-1 ${offset === o ? "bg-amber-600 text-white ring-amber-600" : "bg-white text-amber-900 ring-amber-300"}`}
                data-hd-transit-offset={o}
              >
                {i === 0 ? "İlk kez" : "İkinci kez"} ({utcOffsetLabel(o)}) · UTC {utc}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  if (!date || !time) return null;
  return (
    <p className="mt-2 text-[11px] font-semibold text-rose-700" data-hd-transit-utc-preview={testId} data-hd-transit-utc-error={r.code}>
      {r.error}
    </p>
  );
}
