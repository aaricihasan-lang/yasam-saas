"use client";

/**
 * Gökyüzü Atlası — Roxy'nin MIT lisanslı `@roxyapi/ui` ÇİFT HALKA bileşenleri (2026-10-12):
 *   • `<roxy-transit-wheel>`  — iç halka natal, dış halka transit, aralarında açı çizgileri
 *   • `<roxy-synastry-chart>` — dış halka 1. kişi, iç halka 2. kişi (burç dilimleri; EV YOK — Roxy sinastride cusp vermez)
 *
 * KURAL: bileşen yalnız "denetimli kip"te kullanılır — veri bizim KAYITLI teknik katmanımızdan kurulur; self-fetch
 * öznitelikleri (data-endpoint / publishable-key) KULLANILMAZ → tarayıcıda anahtar yok, yeni Roxy isteği / kredi yok.
 * Yalnız TEKNİK alanlar aktarılır (sağlayıcı yorum metni bileşene hiç verilmez; `hide-readings` ek savunma).
 * Bileşen hiçbir astrolojik hesap yapmaz: gezegenleri verilen ekliptik boylamına, açı çizgilerini verilen açı listesine
 * göre çizer; kalabalıkta sembol kaydırılırsa ince gösterge çizgisi GERÇEK boylamdaki işarete bağlanır.
 * Eksik veride (transit natal çerçevesi yok, kişilerden birinin gezegeni yok) harita ÇİZİLMEZ; neden gösterilir.
 */
import { createElement, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  SynastryTechnical,
  TransitTechnical,
} from "@/lib/astrology/model/westernTiming";
import { toSynastryWheelData, toTransitWheelData } from "../_lib/roxyWheelData";

export { toSynastryWheelData, toTransitWheelData };

// Yalnız çark: başlık, gösterge, tablolar ve okuma blokları gizli (Türkçe künye ve tablolar bizim panellerimizde).
const HIDE =
  "header,legend,details,strongest,table,readings,reading,hint,section,inter-aspects,house-overlay,strengths-challenges,catalog";

function RoxyElement({
  kind,
  data,
  testId,
}: {
  kind: "transit" | "synastry";
  data: unknown;
  testId: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.all([
      kind === "transit"
        ? import("@roxyapi/ui/components/transit-wheel")
        : import("@roxyapi/ui/components/synastry-chart"),
      import("@roxyapi/ui/locales/tr"),
    ])
      .then(() => alive && setReady(true))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [kind]);
  useEffect(() => {
    if (ready && ref.current)
      (ref.current as unknown as { data: unknown }).data = data;
  }, [ready, data]);
  // Sinastri bileşeninin kişi kartları (`.people`) bir `part` taşımadığı için hide-sections ile gizlenemez; çarkın
  // üstünde kalıp mobilde kareyi taşırıyordu → yalnız GÖRÜNÜM için gölge köke tek bir stil eklenir (veri/çizim değişmez).
  useEffect(() => {
    const root = ready ? ref.current?.shadowRoot : null;
    if (!root || root.querySelector("style[data-atlas]")) return;
    const st = document.createElement("style");
    st.dataset.atlas = "1";
    st.textContent = ".people{display:none!important}.wrap{padding:0!important;border:0!important;box-shadow:none!important;background:transparent!important}";
    root.appendChild(st);
  }, [ready]);
  if (failed)
    return (
      <p className="p-4 text-sm text-rose-700">
        Harita bileşeni yüklenemedi; teknik tablolar &quot;Teknik ayrıntı&quot;
        sekmesinde.
      </p>
    );
  return (
    <div
      className="roxy-host flex h-full w-full min-w-0 items-center justify-center [--roxy-space-lg:0.25rem]"
      data-testid={testId}
      data-ready={ready ? "1" : "0"}
    >
      {createElement(
        kind === "transit" ? "roxy-transit-wheel" : "roxy-synastry-chart",
        {
          ref,
          lang: "tr",
          "hide-readings": "",
          "hide-sections": HIDE,
          class: "block w-full max-w-full",
        },
      )}
      {!ready && <p className="text-sm text-slate-400">Harita yükleniyor…</p>}
    </div>
  );
}

export function TransitBiWheel({ technical }: { technical: TransitTechnical }) {
  const data = toTransitWheelData(technical);
  if (!data) return null;
  return (
    <RoxyElement kind="transit" data={data} testId="astro-roxy-transit-wheel" />
  );
}

export function SynastryBiWheel({
  technical,
}: {
  technical: SynastryTechnical;
}) {
  const data = toSynastryWheelData(technical);
  if (!data) return null;
  return (
    <RoxyElement
      kind="synastry"
      data={data}
      testId="astro-roxy-synastry-wheel"
    />
  );
}

/** Çark çizilemediğinde (eksik veri) uzmana açık neden — yanlış/eksik harita doğruymuş gibi çizilmez. */
export function transitWheelGap(
  t: TransitTechnical,
  timeUnknownMasked: boolean,
): string | null {
  if (t.natalFrame) return null;
  if (timeUnknownMasked)
    return "Doğum saati bilinmediği için natal evler/Yükselen yok; çift halka çizilmez (açı tablosu Teknik ayrıntı'da).";
  return "Çift halka için bu doğum bilgisinin kayıtlı natal sonucu gerekiyor (aynı düğüm türüyle). Natal hesaplanmadığı ya da bu kayıt eski olduğu için harita çizilmedi; yeni ücretli istek yapılmaz. Natal'ı hesaplayıp transiti yeniden açtığınızda harita gösterilir.";
}

/** Çark altı künye (Türkçe; bileşenin kendi göstergesi gizlidir). */
export function TransitWheelCaption({
  technical,
  natalName,
}: {
  technical: TransitTechnical;
  natalName: string;
}) {
  const f = technical.natalFrame;
  if (!f) return null;
  return (
    <p
      className="text-center text-[11px] leading-snug text-slate-500"
      data-testid="astro-roxy-transit-caption"
    >
      İç halka: {natalName} natal (
      {f.houseSystem === "whole-sign" ? "tam burç" : f.houseSystem} evler) · Dış
      halka: transit · Yükselen solda · kesik çizgiler ev sınırları, düz
      çizgiler burç sınırları · kaydırılmış sembolün ince çizgisi gerçek
      dereceyi gösterir · çizim: RoxyAPI bileşeni
    </p>
  );
}
export function SynastryWheelCaption({ names }: { names: [string, string] }) {
  return (
    <p
      className="text-center text-[11px] leading-snug text-slate-500"
      data-testid="astro-roxy-synastry-caption"
    >
      Dış halka (¹): {names[0]} · İç halka (²): {names[1]} · Koç 0° solda ·
      bölümler BURÇ sınırlarıdır, ev değildir (Roxy sinastride ev cusp&apos;ı
      vermez) · ASC1/ASC2 yükselenler · çizim: RoxyAPI bileşeni
    </p>
  );
}

/**
 * Sonuç / kayıtlı analiz masası için çift halka çizicisi (Transit, Sinastri). Çizilemiyorsa null → masa teknik
 * tabloyu gösterir (ve transit için `transitWheelGap` nedeni).
 */
export function roxyChartFor(
  technique: string,
  technical: unknown,
): ((cls: string) => ReactNode) | null {
  if (!technical) return null;
  if (technique === "western.transit") {
    const t = technical as TransitTechnical;
    if (!toTransitWheelData(t)) return null;
    return function TransitChartView() {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1">
          <div className="min-h-0 w-full flex-1">
            <TransitBiWheel technical={t} />
          </div>
        </div>
      );
    };
  }
  if (technique === "western.synastry") {
    const t = technical as SynastryTechnical;
    if (!toSynastryWheelData(t)) return null;
    return function SynastryChartView() {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1">
          <div className="min-h-0 w-full flex-1">
            <SynastryBiWheel technical={t} />
          </div>
        </div>
      );
    };
  }
  return null;
}
