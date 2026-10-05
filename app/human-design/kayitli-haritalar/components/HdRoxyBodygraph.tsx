"use client";

// RoxyAPI RESMİ BodyGraph renderer'ı — <roxy-bodygraph> (@roxyapi/ui 0.48.0, MIT, Roxy Labs).
//
//   • Self-host: bileşen dosyası public/vendor/roxy-ui/0.48.0/ altından, KENDİ origin'imizden
//     yüklenir (Roxy'nin belgelediği self-host yolu). CDN / üçüncü taraf script YOK.
//   • Kontrollü mod: veri `data` property'si ile verilir (KAYITLI yanıttan yapısal yük); bileşen
//     kendi isteğini YAPMAZ → yeni Bodygraph çağrısı / kredi YOK; API anahtarı tarayıcıda YOK.
//   • Yalnız grafik: hide-readings + header/details/legend/themes/facts gizli.
//   • Yüklenemezse eski Yaşam Sistemi renderer'ına DÜŞMEZ; anlaşılır mesaj gösterir.

import { createElement, useEffect, useRef, useState } from "react";

export const ROXY_UI_VERSION = "0.48.0";
const SCRIPT_SRC = `/vendor/roxy-ui/${ROXY_UI_VERSION}/bodygraph.js`;
const SCRIPT_ID = "roxy-ui-bodygraph";
const STYLE_ID = "roxy-ui-bodygraph-fit";
/** Roxy grafiğinin viewBox oranı (432×612) — yükseklik-öncelikli sığdırma için. */
export const ROXY_BODYGRAPH_ASPECT = "432 / 612";

let loader: Promise<void> | null = null;
function loadRoxyBodygraph(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (customElements.get("roxy-bodygraph")) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => customElements.whenDefined("roxy-bodygraph").then(() => resolve());
    s.onerror = () => {
      loader = null;
      reject(new Error("roxy-bodygraph load failed"));
    };
    document.head.appendChild(s);
  });
  // Kart çerçevesini sıfırla: yalnız grafik kabı doldurur (shadow ::part — resmi tema yolu).
  if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent =
      "roxy-bodygraph.hd-fit{display:block;width:100%}" +
      "roxy-bodygraph.hd-fit::part(card){border:0;padding:0;margin:0;background:transparent;box-shadow:none;border-radius:0}" +
      "roxy-bodygraph.hd-fit::part(layout){display:block;margin:0;padding:0}" +
      // chart parçası (SVG) varsayılan max-width:480px taşır → kaldırılır; grafik kabı tam doldurur.
      "roxy-bodygraph.hd-fit::part(chart){margin:0;padding:0;width:100%;max-width:none;height:auto}";
    document.head.appendChild(st);
  }
  return loader;
}

export function HdRoxyBodygraph({ data }: { data: Record<string, unknown> }) {
  const ref = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let alive = true;
    loadRoxyBodygraph()
      .then(() => {
        if (!alive || !ref.current) return;
        (ref.current as HTMLElement & { data?: unknown }).data = data;
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [data]);

  return (
    <div className="relative h-full w-full" data-hd-roxy-bodygraph={state}>
      {createElement("roxy-bodygraph", {
        ref,
        className: "hd-fit",
        "hide-readings": "",
        "hide-sections": "header,details,legend,themes,facts",
        lang: "tr",
      })}
      {state === "loading" ? (
        <p className="absolute inset-0 m-0 flex items-center justify-center text-xs text-slate-500">BodyGraph yükleniyor…</p>
      ) : null}
      {state === "error" ? (
        <p role="alert" className="absolute inset-0 m-0 flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 p-4 text-center text-xs font-semibold text-rose-700">
          BodyGraph görseli yüklenemedi. Sayfayı yenileyip tekrar deneyin. Harita verileri (Design / Personality) kayıtlıdır.
        </p>
      ) : null}
    </div>
  );
}
