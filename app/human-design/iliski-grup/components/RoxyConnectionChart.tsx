"use client";

// Connection — Roxy'nin resmî silüetli birleşik BodyGraph'ı (<roxy-hd-connection>, self-host, kontrollü mod).
//   • Veri: YALNIZ kayıtlı + doğrulanmış sonuç (toRoxyConnectionData). Bileşen istek atmaz; anahtar yok.
//   • Çizim sonrası doğrulama: işaretli kapılar (A/B) + tanımlı merkez sayısı = kayıtlı sonuç; değilse
//     onState("mismatch") → üst bileşen güvenli yedek çizime düşer.
//   • Roxy'nin İngilizce metin bölümleri ve atıfı gizlenir; erişilebilirlik başlıkları Türkçeleştirilir.

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import type { HdConnectionResult } from "@/lib/human-design/relations/connection";
import {
  connectionDrawingMatches,
  localizeConnectionTitles,
  ROXY_CONNECTION_SCRIPT,
  ROXY_CONNECTION_SHADOW_STYLE,
  ROXY_CONNECTION_TAG,
  toRoxyConnectionData,
} from "@/lib/human-design/relations/roxyConnectionChart";

const SCRIPT_ID = "roxy-ui-hd-connection";
const STYLE_ID = "hd-roxy-connection-style";

let loader: Promise<void> | null = null;
export function loadRoxyConnection(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (customElements.get(ROXY_CONNECTION_TAG)) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = ROXY_CONNECTION_SCRIPT;
    s.async = true;
    s.onload = () => customElements.whenDefined(ROXY_CONNECTION_TAG).then(() => resolve());
    s.onerror = () => {
      loader = null;
      reject(new Error("roxy-hd-connection load failed"));
    };
    document.head.appendChild(s);
  });
  return loader;
}

type RoxyEl = HTMLElement & { data?: unknown; updateComplete?: Promise<unknown> };

/** Shadow köke kurumsal görünüm + doğrulama + Türkçe başlıklar. Doğrulama sonucu döner. */
export function prepareRoxyConnection(el: RoxyEl, r: HdConnectionResult, nameA: string, nameB: string): boolean {
  const root = el.shadowRoot;
  if (!root) return false;
  if (!root.getElementById(STYLE_ID)) {
    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = ROXY_CONNECTION_SHADOW_STYLE;
    root.appendChild(st);
  }
  const svg = root.querySelector("svg.chart");
  if (!svg) return false;
  localizeConnectionTitles(svg, nameA, nameB);
  return connectionDrawingMatches(svg, r);
}

export function RoxyConnectionChart({
  r,
  nameA,
  nameB,
  onState,
}: {
  r: HdConnectionResult;
  nameA: string;
  nameB: string;
  onState: (s: "ready" | "mismatch" | "error") => void;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "mismatch" | "error">("loading");
  const data = useMemo(() => toRoxyConnectionData(r), [r]);

  useEffect(() => {
    let alive = true;
    loadRoxyConnection()
      .then(async () => {
        if (!alive || !ref.current) return;
        const el = ref.current as RoxyEl;
        el.data = data;
        if (el.updateComplete) await el.updateComplete.catch(() => undefined);
        if (!alive) return;
        const ok = prepareRoxyConnection(el, r, nameA, nameB);
        const s = ok ? "ready" : "mismatch";
        setState(s);
        onState(s);
      })
      .catch(() => {
        if (!alive) return;
        setState("error");
        onState("error");
      });
    return () => {
      alive = false;
    };
  }, [data, r, nameA, nameB, onState]);

  return (
    <div className="relative w-full" data-hd-roxy-connection={state}>
      {createElement(ROXY_CONNECTION_TAG, { ref, className: "block w-full", "hide-readings": "", lang: "tr" })}
      {state === "loading" ? (
        <p className="absolute inset-0 m-0 flex items-center justify-center text-xs text-slate-500">Birleşik BodyGraph yükleniyor…</p>
      ) : null}
    </div>
  );
}
