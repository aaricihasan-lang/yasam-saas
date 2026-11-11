"use client";
// KANIT SAYFASI (yalnız CI runner'ında; ürüne girmez). Gerçek PrepCenter (Göksel Analiz Hazırlık Merkezi) — sentetik doğum
// profili (gerçek kişi değil), plan / çalıştırma yok, geri çağrılar boş. İstek ve hesaplama yapılmaz.
import { useState } from "react";
import PrepCenter, { type PrepRevision } from "@/app/admin/astroloji/_components/atlas/PrepCenter";
import { atlasDisplay, atlasText } from "@/app/admin/astroloji/_components/atlas/fonts";
import { ap } from "@/app/admin/astroloji/_components/atlas/premium/AtlasPremium";
import { DEFAULT_WESTERN_METHOD, defaultParams, type TechniqueParams, type UiTechniqueId, type WesternMethod } from "@/app/admin/astroloji/_lib/techniques";

const REV: PrepRevision = {
  birthDate: "1990-03-14",
  birthTime: "08:30",
  timeKnown: true,
  timeAccuracyLabel: "dakika",
  locationLabel: "Kadıköy, İstanbul, Türkiye",
  latitude: 40.99,
  longitude: 29.03,
  timezone: "Europe/Istanbul",
  utcOffsetSeconds: 7200,
};
const bos = () => {};

export default function Page() {
  const [checked, setChecked] = useState<Partial<Record<UiTechniqueId, boolean>>>({});
  const [params, setParams] = useState<TechniqueParams>(() => defaultParams(new Date("2026-11-08T12:00:00Z")));
  const [method, setMethod] = useState<WesternMethod>({ ...DEFAULT_WESTERN_METHOD });
  return (
    <main className={`${atlasDisplay.variable} ${atlasText.variable} min-h-screen w-full overflow-x-hidden ${ap.page}`}>
      <PrepCenter
        profile={{ id: "ornek", label: "Örnek Danışan (Şükrü Ağaoğlu)", clientName: "Örnek Danışan" }}
        rev={REV}
        picker={<span className="text-sm">Örnek Danışan (Şükrü Ağaoğlu)</span>}
        onCreateClient={bos}
        onEditBirth={bos}
        onDeleteProfile={bos}
        checked={checked}
        onChecked={setChecked}
        params={params}
        onParams={setParams}
        method={method}
        onMethod={setMethod}
        partners={[]}
        partnerQuery=""
        onPartnerQuery={bos}
        lunarReturns={null}
        selections={[]}
        plan={null}
        planError={null}
        running={false}
        runError={null}
        runFailures={null}
        onDismissFailures={bos}
        onRun={bos}
        labelOf={() => null}
        onOpenHorary={bos}
      />
    </main>
  );
}
