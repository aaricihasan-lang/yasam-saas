"use client";

import { useState } from "react";
import { calcPlaceNumber } from "@/lib/numeroloji/place";
import { analyzeBusinessCompatibility } from "@/lib/numeroloji/business";
import type { BusinessCompatibilityLayer, BusinessIdentityVariant } from "@/lib/numeroloji/business";
import { NumerolojiCalculationInfo } from "./NumerolojiCalculationInfo";
import { CONCEPT_HELP } from "../helpers/conceptHelp";

// ─────────────────────────────────────────────────────────────────────────────
// EV / OFİS SAYISI (Motor A, kitap 1) + İŞYERİ UYUMU (Motor B, kitap 2)
// İKİ MOTOR BİRBİRİNDEN BAĞIMSIZDIR — ortak/global skor YOKTUR.
// Hesaplar lib/numeroloji/place + lib/numeroloji/business'ten gelir.
// ─────────────────────────────────────────────────────────────────────────────

const SAYI_RENK: Record<number, { chip: string; border: string; glow: string }> = {
  1: { chip: "from-rose-500 to-red-500",      border: "md:border-rose-200/70",   glow: "md:shadow-[0_8px_28px_rgba(244,63,94,0.32)]" },
  2: { chip: "from-orange-500 to-amber-400",  border: "md:border-orange-200/70", glow: "md:shadow-[0_8px_28px_rgba(249,115,22,0.30)]" },
  3: { chip: "from-amber-400 to-yellow-400",  border: "md:border-amber-200/70",  glow: "md:shadow-[0_8px_28px_rgba(251,191,36,0.30)]" },
  4: { chip: "from-lime-500 to-green-500",    border: "md:border-lime-200/70",   glow: "md:shadow-[0_8px_28px_rgba(132,204,22,0.30)]" },
  5: { chip: "from-emerald-500 to-teal-500",  border: "md:border-emerald-200/70",glow: "md:shadow-[0_8px_28px_rgba(16,185,129,0.30)]" },
  6: { chip: "from-teal-500 to-cyan-500",     border: "md:border-teal-200/70",   glow: "md:shadow-[0_8px_28px_rgba(20,184,166,0.30)]" },
  7: { chip: "from-sky-500 to-blue-500",      border: "md:border-sky-200/70",    glow: "md:shadow-[0_8px_28px_rgba(14,165,233,0.30)]" },
  8: { chip: "from-indigo-500 to-violet-500", border: "md:border-indigo-200/70", glow: "md:shadow-[0_8px_28px_rgba(99,102,241,0.32)]" },
  9: { chip: "from-violet-600 to-fuchsia-500",border: "md:border-violet-200/70", glow: "md:shadow-[0_8px_28px_rgba(139,92,246,0.35)]" },
};

const inputClass =
  "h-9 w-full rounded-lg border border-violet-200/80 bg-white px-3 text-sm font-medium text-slate-900 outline-none ring-1 ring-violet-100/60 transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-200/50";
const labelClass = "mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500";
const cardClass =
  "min-w-0 border-b border-slate-100/70 pb-3 last:border-b-0 last:pb-0 md:border md:border-violet-200/70 md:rounded-[12px] md:bg-white/90 md:p-3 md:pb-3 md:shadow-[0_0_10px_rgba(139,92,246,0.05)] md:last:border md:last:pb-3";

function formatAdInput(raw: string): string {
  return raw.replace(/(?:^|[ ])[\wğüşıöçĞÜŞİÖÇ]/gu, (ch) => ch.toLocaleUpperCase("tr-TR"));
}
function formatTarihInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Bir işyeri katmanının sonucunu (yüzde/etiket veya nötr kaynak mesajı) render eder. */
function LayerResult({ layer }: { layer: BusinessCompatibilityLayer }) {
  if (layer.resultStatus === "COMPUTED" && layer.compatibilityLabel) {
    return (
      <span className={`text-sm font-black ${layer.polarity === "UYUMLU" ? "text-emerald-600" : "text-rose-600"}`}>
        {layer.compatibilityLabel}
      </span>
    );
  }
  return (
    <span className="text-[11px] font-semibold text-slate-400">
      Bu toplam için kaynak notlarda yüzde değerlendirme kuralı tanımlanmamıştır.
    </span>
  );
}

function VariantCard({ variant }: { variant: BusinessIdentityVariant }) {
  const title = variant.mode === "name" ? "AD İLE ANALİZ" : "AD + SOYAD İLE ANALİZ";
  return (
    <div className="min-w-0 space-y-2 rounded-[12px] border border-teal-200/60 bg-teal-50/30 p-2.5 md:p-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-teal-700">{title}</p>

      {/* ① Kişi Temel Uyumu */}
      <div className="rounded-lg bg-white/80 p-2 ring-1 ring-slate-200/60">
        <p className="text-[10px] font-bold text-slate-700">① İsim + Doğum Tarihi Uyumu</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          İsim: <b className="text-slate-700">{variant.personNameValue}</b> · Doğum Tarihi: <b className="text-slate-700">{variant.birthDateRawSum}</b> · Toplam: <b className="text-slate-700">{variant.personBaseValue}</b>
        </p>
        <div className="mt-1"><LayerResult layer={variant.personBase} /></div>
      </div>

      {/* ② İşyeri Adı Uyumu */}
      <div className="rounded-lg bg-white/80 p-2 ring-1 ring-slate-200/60">
        <p className="text-[10px] font-bold text-slate-700">② İşyeri Adı Uyumu</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          İşyeri: <b className="text-slate-700">{variant.businessNameValue}</b> · {variant.personBaseValue} + {variant.businessNameValue} = <b className="text-slate-700">{variant.personBusinessTotal}</b>
        </p>
        <div className="mt-1"><LayerResult layer={variant.businessName} /></div>
      </div>

      {/* ③ Açılış Tarihi Etkisi */}
      <div className="rounded-lg bg-white/80 p-2 ring-1 ring-slate-200/60">
        <p className="text-[10px] font-bold text-slate-700">③ Açılış Tarihi Etkisi</p>
        {variant.openingDate === null ? (
          <p className="mt-0.5 text-[11px] text-slate-400">Açılış tarihi girilmedi.</p>
        ) : !variant.openingDate.valid ? (
          <p className="mt-0.5 text-[11px] font-semibold text-rose-500">Geçerli açılış tarihi girin (GG/AA/YYYY).</p>
        ) : (
          <>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Açılış Tarihi: <b className="text-slate-700">{variant.openingDate.rawSum}</b> · {variant.personBusinessTotal} + {variant.openingDate.rawSum} = <b className="text-slate-700">{variant.openingDate.finalTotal}</b>
            </p>
            <div className="mt-1">{variant.openingDate.classification && <LayerResult layer={variant.openingDate.classification} />}</div>
          </>
        )}
      </div>
    </div>
  );
}

export function NumerolojiEvIsYeriSayisiTab() {
  // ── Motor A state ──
  const [kapiNoRaw, setKapiNoRaw] = useState("");
  const [daireNoRaw, setDaireNoRaw] = useState("");
  const [not, setNot] = useState("");

  // ── Motor B state ──
  const [bName, setBName] = useState("");
  const [bSurname, setBSurname] = useState("");
  const [bBirth, setBBirth] = useState("");
  const [bBusiness, setBBusiness] = useState("");
  const [bOpening, setBOpening] = useState("");

  const kapiNo = parseInt(kapiNoRaw, 10);
  const daireNo = parseInt(daireNoRaw, 10);
  const place =
    kapiNoRaw.trim() && daireNoRaw.trim() && !isNaN(kapiNo) && !isNaN(daireNo)
      ? calcPlaceNumber(kapiNo, daireNo)
      : null;
  const renkSet = place ? (SAYI_RENK[place.reducedNumber] ?? SAYI_RENK[9]) : null;

  const business = analyzeBusinessCompatibility({
    name: bName,
    surname: bSurname || undefined,
    birthDate: bBirth,
    businessName: bBusiness,
    openingDate: bOpening || undefined,
  });
  const businessAttempted = bName.trim() !== "" && bBusiness.trim() !== "" && bBirth.trim() !== "";

  return (
    <div className="space-y-4">
      {/* ══════════ A) EV / OFİS SAYISI ══════════ */}
      <div className="space-y-3">
        <div className="px-[clamp(8px,2.5vw,14px)] py-2.5 md:rounded-[12px] md:border md:border-violet-200/60 md:bg-gradient-to-r md:from-violet-50/80 md:to-fuchsia-50/60 md:px-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-xs font-black uppercase tracking-wider text-violet-600">A · Ev / Ofis Sayısı</p>
            <NumerolojiCalculationInfo title="Ev / Ofis Sayısı" meaning={CONCEPT_HELP.evOfisSayisi} tone="violet" />
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Kapı/apartman numarası ile daire numarası toplanarak ev veya ofis numeroloji sayısı hesaplanır.
          </p>
        </div>

        <div className={cardClass}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Kapı / Apartman No</label>
              <input type="text" inputMode="numeric" value={kapiNoRaw} onChange={(e) => setKapiNoRaw(e.target.value.replace(/\D/g, ""))} placeholder="4" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Daire No</label>
              <input type="text" inputMode="numeric" value={daireNoRaw} onChange={(e) => setDaireNoRaw(e.target.value.replace(/\D/g, ""))} placeholder="11" className={inputClass} />
            </div>
          </div>
          <div className="mt-2">
            <label className={labelClass}>Not / Açıklama (opsiyonel)</label>
            <input type="text" value={not} onChange={(e) => setNot(e.target.value)} placeholder="Örn. Ana ofis, kiralık daire…" className={inputClass} />
          </div>
        </div>

        {place && renkSet ? (
          <>
            <div className={cardClass}>
              <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-violet-600">Hesap Adımları</p>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-black text-slate-700">
                <span className="rounded-md bg-violet-100 px-2 py-0.5 text-violet-800">{place.buildingNumber}</span>
                <span className="text-slate-400">+</span>
                <span className="rounded-md bg-fuchsia-100 px-2 py-0.5 text-fuchsia-800">{place.unitNumber}</span>
                <span className="text-slate-400">=</span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">{place.rawTotal}</span>
                {place.steps.map((adim, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <span className="text-slate-300">→</span>
                    <span className="text-[11px] font-semibold text-slate-500">{adim}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className={`relative min-w-0 overflow-hidden md:rounded-[14px] md:border md:bg-white/95 md:p-4 ${renkSet.border} ${renkSet.glow}`}>
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-500">Ev / Ofis Sayısı</p>
              <div className="flex items-center gap-3">
                <span className={`inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-4xl font-black text-white shadow-lg ${renkSet.chip}`}>
                  {place.reducedNumber}
                </span>
                <div className="min-w-0">
                  {not.trim() && <p className="mb-0.5 text-[11px] font-semibold text-slate-400">{not.trim()}</p>}
                  <p className="text-xs text-slate-500 leading-snug">
                    No:{place.buildingNumber} · D:{place.unitNumber}
                    {place.rawTotal !== place.reducedNumber ? ` → ${place.rawTotal} → ${place.reducedNumber}` : ` → ${place.reducedNumber}`}
                  </p>
                </div>
              </div>
            </div>

            {place.interpretation && (
              <div className={cardClass}>
                <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-violet-600">{place.reducedNumber} Sayısının Anlamı</p>
                <p className="text-xs leading-[1.75] text-slate-700">{place.interpretation}</p>
              </div>
            )}
          </>
        ) : (
          <div className="min-w-0 px-[clamp(8px,2.5vw,14px)] py-6 text-center md:rounded-[12px] md:border-2 md:border-dashed md:border-violet-200/60 md:bg-white/60 md:px-4">
            <p className="text-xs font-semibold text-slate-400">Kapı ve daire numarasını girerek hesaplamayı başlatın.</p>
          </div>
        )}
      </div>

      {/* ══════════ B) İŞYERİ UYUMU ══════════ */}
      <div className="space-y-3">
        <div className="px-[clamp(8px,2.5vw,14px)] py-2.5 md:rounded-[12px] md:border md:border-teal-200/60 md:bg-gradient-to-r md:from-teal-50/80 md:to-emerald-50/60 md:px-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-xs font-black uppercase tracking-wider text-teal-700">B · İşyeri Uyumu</p>
            <NumerolojiCalculationInfo title="İşyeri Uyumu" meaning={CONCEPT_HELP.isyeriUyumu} tone="emerald" />
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Kişi (ad{` `}+{` `}doğum tarihi) ile işyeri/marka adının uyumu değerlendirilir. Ev/Ofis Sayısından ayrı bir hesaptır.
          </p>
        </div>

        <div className={cardClass}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Ad</label>
              <input type="text" value={bName} onChange={(e) => setBName(formatAdInput(e.target.value))} placeholder="Ahmed" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Soyad (opsiyonel)</label>
              <input type="text" value={bSurname} onChange={(e) => setBSurname(e.target.value.toLocaleUpperCase("tr-TR"))} placeholder="—" className={inputClass} />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Doğum Tarihi (GG/AA/YYYY)</label>
              <input type="text" inputMode="numeric" value={bBirth} onChange={(e) => setBBirth(formatTarihInput(e.target.value))} placeholder="23/05/1974" maxLength={10} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>İşyeri / Marka Adı</label>
              <input type="text" value={bBusiness} onChange={(e) => setBBusiness(e.target.value.toLocaleUpperCase("tr-TR"))} placeholder="CANTAŞ" className={inputClass} />
            </div>
          </div>
          <div className="mt-2">
            <label className={labelClass}>Açılış Tarihi (GG/AA/YYYY) — opsiyonel</label>
            <input type="text" inputMode="numeric" value={bOpening} onChange={(e) => setBOpening(formatTarihInput(e.target.value))} placeholder="19/12/2019" maxLength={10} className={inputClass} />
            <p className="mt-1 text-[10px] text-slate-400">Açılış tarihi bilinmiyorsa boş bırakabilirsiniz.</p>
          </div>
        </div>

        {business ? (
          <>
            {business.variants.map((v) => (
              <VariantCard key={v.mode} variant={v} />
            ))}
            {business.unsupportedCharacters.length > 0 && (
              <p className="text-[10px] text-amber-600">Kaynak alfabede desteklenmeyen harf: {business.unsupportedCharacters.join(", ")}</p>
            )}
            <div className="flex min-w-0 items-start gap-2 rounded-[10px] border border-slate-200/80 bg-slate-50/80 px-3 py-2">
              <span className="mt-px shrink-0 text-slate-400 text-sm">ℹ</span>
              <p className="text-[10px] leading-[1.6] text-slate-500">
                İşyeri uyumu kişi temel uyumu, işyeri adı ve (varsa) açılış tarihi katmanlarından oluşur. Tek bir genel uyum puanı üretilmez; yorumlama uzman tarafından yapılmalıdır.
              </p>
            </div>
          </>
        ) : (
          <div className="min-w-0 px-[clamp(8px,2.5vw,14px)] py-6 text-center md:rounded-[12px] md:border-2 md:border-dashed md:border-teal-200/60 md:bg-white/60 md:px-4">
            <p className="text-xs font-semibold text-slate-400">
              {businessAttempted ? "Geçerli bir doğum tarihi girin (GG/AA/YYYY)." : "Ad, doğum tarihi ve işyeri adını girerek uyumu hesaplayın."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
