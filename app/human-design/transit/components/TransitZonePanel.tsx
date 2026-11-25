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
import { useTranslations } from "next-intl";
import { useTransitI18n } from "../helpers/useTransitI18n";
import { HdBirthLocationPicker, type HdPickedLocation } from "../../components/HdBirthLocationPicker";
import { isTransitTimeZone, resolveTransitMoment, TRANSIT_TIME_ZONE, utcOffsetLabel } from "@/lib/human-design/transit/transitMoment";

export type TransitZone = {
  tz: string;
  /** Şehir aramasından seçildiyse görünen ad (ör. "London, England, United Kingdom"). */
  label: string | null;
  source: "default" | "detected" | "undetected" | "city" | "manual";
};

/** Konum / saat dilimi açıklaması: hd.transit.zone.intro (TR = önceki üç cümle, tek boşlukla birleşik). */

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

export function TransitZonePanel({ zone, onZone, testId }: { zone: TransitZone; onZone: (z: TransitZone) => void; testId: string }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<HdPickedLocation | null>(null);
  const [cityErr, setCityErr] = useState<string | null>(null);
  const t = useTranslations("hd.transit.zone");
  const { zoneName } = useTransitI18n();
  const zones = open ? allZones(zone.tz) : [];
  const title = zone.label ? `${zone.label} · ${zone.tz}` : zone.tz === TRANSIT_TIME_ZONE ? `${zoneName(zone.tz)} (${zone.tz})` : zone.tz;
  return (
    <div className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2.5" data-hd-transit-zone={testId}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-widest text-indigo-700">
            <span aria-hidden>🌍 </span>{t("title")}
          </p>
          <p className="mt-0.5 break-words text-sm font-bold text-slate-900" data-hd-transit-zone-current={zone.tz}>{title}</p>
          <p className="text-[11px] text-slate-500" data-hd-transit-zone-source={zone.source}>{t(`source.${zone.source}`)}</p>
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
              {t("resetTurkey")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="min-h-[36px] rounded-lg border border-indigo-200 bg-white px-3 text-xs font-bold text-indigo-700"
            data-hd-transit-zone-toggle
          >
            {open ? t("close") : t("change")}
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600" data-hd-transit-zone-intro>{t("intro")}</p>
      {open ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2" data-hd-transit-zone-editor>
          <div className="block text-xs font-bold text-slate-700">
            <span className="mb-1 block">{t("citySearch")}</span>
            <HdBirthLocationPicker
              id={`hd-transit-city-${testId}`}
              value={picked}
              placeholder={t("cityPlaceholder")}
              unselectedHint={t("cityHint")}
              onChange={(l) => {
                setPicked(l);
                if (!l) return;
                const tz = canonicalTz(l.tz);
                if (!isTransitTimeZone(tz)) {
                  setCityErr(t("cityTzError"));
                  return;
                }
                setCityErr(null);
                onZone({ tz, label: l.label, source: "city" });
              }}
            />
            {cityErr ? <p role="alert" className="mt-1 text-[11px] font-semibold text-rose-700">{cityErr}</p> : null}
          </div>
          <label className="block text-xs font-bold text-slate-700">
            <span className="mb-1 block">{t("tzLabel")}</span>
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
  const t = useTranslations("hd.transit.zone");
  const i18n = useTransitI18n();
  const r = resolveTransitMoment(date, time, tz);
  if (r.ok) {
    return (
      <p className="mt-2 text-[11px] text-slate-600" data-hd-transit-utc-preview={testId} data-hd-transit-utc={r.moment.utcIso}>
        {t("utcEquivalent")} <b className="font-semibold text-slate-800">{r.moment.utcIso.slice(0, 16).replace("T", " ")}</b> · {i18n.zoneName(tz)} ({utcOffsetLabel(r.moment.offsetSeconds)})
      </p>
    );
  }
  if (r.code === "LOCAL_TIME_AMBIGUOUS" && r.offsetsSeconds) {
    // Büyük ofset (yaz saati) ilk yaşanan andır.
    const opts = [...r.offsetsSeconds].sort((a, b) => b - a);
    return (
      <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-900 ring-1 ring-amber-200" data-hd-transit-utc-preview={testId} data-hd-transit-ambiguous>
        <p className="font-semibold">{i18n.error(r)}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("ambiguousAria")}>
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
                {i === 0 ? t("firstTime") : t("secondTime")} ({utcOffsetLabel(o)}{") · UTC "}{utc}
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
      {i18n.error(r)}
    </p>
  );
}
