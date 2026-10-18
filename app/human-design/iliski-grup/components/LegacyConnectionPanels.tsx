"use client";

// PASİF (rendererConfig.HD_CONNECTION_BODYGRAPH) — Connection birleşik BodyGraph'ın ESKİ panelleri. SİLİNMEDİ; yalnız
// aktif kullanımdan çıkarıldı (owner PASS 2026-10-18: aktif görünüm premium ConnectionBodygraph).
//   • LegacyRoxyCompositePanel      → "legacy-roxy": Roxy <roxy-hd-connection> (RoxyConnectionChart.tsx; çizilemezse şematik).
//   • LegacySchematicCompositePanel → "legacy-schematic": ilk Yaşam Sistemi şematik çizimi (compositeScene + SceneSvg).
// Kod, PR #430 görsel revizyonundaki (24842943 / a8c6a3ba) halidir; yalnız dışa aktarım adları ve özet şema prop'u eklendi.

import type { HdConnectionResult } from "@/lib/human-design/relations/connection";
import type { RelationAnalysisView } from "@/lib/human-design/relations/relationService";
import { useCallback, useMemo, useState } from "react";
import { RoxyConnectionChart } from "./RoxyConnectionChart";
import { buildCompositeModel } from "@/lib/human-design/relations/compositeModel";
import { buildCompositeScene, DYNAMIC_SHAPE, PERSON_COLOR } from "@/lib/human-design/relations/compositeScene";
import { COMPOSITE_ROUTES, COMPOSITE_VIEW } from "@/lib/human-design/relations/compositeLayout";
import { SceneSvg } from "./SceneSvg";
import { DYNAMIC_DEFINITION, DYNAMIC_LABEL, DYNAMIC_ORDER, relationChannelLabel } from "@/lib/human-design/relations/labels";

const SHAPE_GLYPH: Record<"diamond" | "triangle" | "square" | "circle", string> = { diamond: "◆", triangle: "▲", square: "■", circle: "●" };

/**
 * Birleşik BodyGraph. Öncelik: Roxy'nin resmî silüetli grafiği (kayıtlı sonuçla doğrulanır).
 * Roxy çizimi yüklenemez / doğrulanamazsa → Yaşam Sistemi şematik çizimi (kaynak veriyle doğrulanmışsa) →
 * o da yoksa kayıtlı sonuçtan özet şema. Uydurma çizim yok.
 */
export function LegacyRoxyCompositePanel({ a, r, summary }: { a: RelationAnalysisView; r: HdConnectionResult; summary: React.ReactNode }) {
  const [std, setStd] = useState<"loading" | "ready" | "mismatch" | "error">("loading");
  const [zoom, setZoom] = useState(false);
  const onStd = useCallback((s: "ready" | "mismatch" | "error") => setStd(s), []);
  const nameA = a.participants[0]?.name ?? "A";
  const nameB = a.participants[1]?.name ?? "B";
  const ids = r.channels.map((c) => c.id).sort().join(",");
  if (std === "loading" || std === "ready") {
    return (
      <div data-hd-composite={std === "ready" ? "standard" : "loading"} data-hd-composite-defined={ids}>
        <div className="mb-1 flex justify-end sm:hidden">
          <button type="button" onClick={() => setZoom((w) => !w)} className="min-h-[36px] rounded-lg border border-indigo-200 px-2.5 text-[11px] font-bold text-indigo-700" data-hd-composite-zoom aria-pressed={zoom}>
            {zoom ? "Haritayı küçült" : "Haritayı büyüt"}
          </button>
        </div>
        {/* Telefonda büyütme: grafik sabit 640px çizilir, kap yatay kaydırır (sayfa taşmaz). */}
        <div className={zoom ? "-mx-2 overflow-x-auto overscroll-x-contain" : ""} data-hd-composite-scroll>
          <div className={zoom ? "w-[640px] max-w-none" : "w-full"}>
            <RoxyConnectionChart r={r} nameA={nameA} nameB={nameB} onState={onStd} />
          </div>
        </div>
        <ul className="mt-3 grid gap-x-4 gap-y-1 text-[11px] text-slate-600 sm:grid-cols-2" data-hd-composite-legend>
          <li>İki renkli kanal: Elektromanyetik (biri bir kapıyı, diğeri öbür kapıyı taşır)</li>
          <li>Tek renkli kanal: Baskınlık, Uzlaşma ya da Arkadaşlık — türü yandaki listede</li>
          <li>İki renkli (yarım yarım) kapı: iki kişide de aktif</li>
          <li>Renkli merkez: birleşik haritada tanımlı · beyaz: açık</li>
        </ul>
        <p className="mt-1.5 text-[11px] text-slate-500">Grafikte yalnız birlikte tamamlanan kanallar işaretlenir; yarım kanallar ve tüm aktif kapılar aşağıdaki listededir. Kapı üzerine gelince kişi ve kanal bilgisi görünür.</p>
      </div>
    );
  }
  return <LegacySchematicCompositePanel a={a} r={r} summary={summary} notice={std === "mismatch" ? "Standart BodyGraph çizimi kayıtlı sonuçla doğrulanamadı; Yaşam Sistemi şematik çizimi gösteriliyor." : "Standart BodyGraph çizimi yüklenemedi; Yaşam Sistemi şematik çizimi gösteriliyor."} />;
}

/** Yedek: Yaşam Sistemi şematik birleşik çizimi (kaynak bireysel veriyle doğrulanır); o da yoksa özet şema. */
export function LegacySchematicCompositePanel({ a, r, notice, summary }: { a: RelationAnalysisView; r: HdConnectionResult; notice: string | null; summary: React.ReactNode }) {
  const build = useMemo(() => buildCompositeModel(a.participants[0]?.gates ?? null, a.participants[1]?.gates ?? null, r), [a, r]);
  const scene = useMemo(() => (build.ok ? buildCompositeScene(build.model) : null), [build]);
  const [sel, setSel] = useState<string | null>(null);
  const [wide, setWide] = useState(false);
  const nameA = a.participants[0]?.name ?? "A";
  const nameB = a.participants[1]?.name ?? "B";
  if (!build.ok || !scene) {
    return (
      <div data-hd-composite="fallback">
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
          Birleşik harita çizilemedi: kaynak bireysel analiz verisi artık mevcut değil. Kayıtlı sonuçtan özet şema gösteriliyor.
        </p>
        {summary}
      </div>
    );
  }
  const m = build.model;
  const st = sel ? m.channels[sel] : null;
  const who = (h: "A" | "B" | "both" | null) => (h === "both" ? `${nameA} ve ${nameB} (ortak)` : h === "A" ? nameA : h === "B" ? nameB : "kimse");
  const route = sel ? COMPOSITE_ROUTES.find((x) => x.id === sel) : null;
  return (
    <div data-hd-composite="ok" data-hd-composite-defined={m.definedChannelIds.join(",")}>
      {notice ? <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200" data-hd-composite-notice>{notice}</p> : null}
      <div className="mb-1 flex justify-end sm:hidden">
        <button type="button" onClick={() => setWide((w) => !w)} className="min-h-[36px] rounded-lg border border-indigo-200 px-2.5 text-[11px] font-bold text-indigo-700" data-hd-composite-zoom aria-pressed={wide}>
          {wide ? "Haritayı küçült" : "Haritayı büyüt"}
        </button>
      </div>
      <div className={wide ? "-mx-2 overflow-x-auto overscroll-x-contain" : ""} data-hd-composite-scroll>
      <SceneSvg
        wide={wide}
        prims={scene}
        view={COMPOSITE_VIEW}
        label={`Birleşik İlişki BodyGraph'ı: ${nameA} ve ${nameB}`}
        hitRoutes={COMPOSITE_ROUTES.map((x) => ({ id: x.id, points: x.points }))}
        selected={sel}
        onSelect={setSel}
        channelLabel={(id) => relationChannelLabel(id, id)}
        testId="composite"
      />
      </div>
      <div className="mt-2 min-h-[64px] rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2 text-xs" aria-live="polite" data-hd-composite-info={sel ?? ""}>
        {!st || !route ? (
          <p className="text-slate-500">Bir kanalın üzerine gelin ya da dokunun: kanal adı, kapılar ve bağlantı türü burada görünür.</p>
        ) : st.state === "defined" ? (
          <>
            <p className="font-bold text-slate-900">{relationChannelLabel(st.id, st.id)} <span className="font-semibold text-indigo-700">· {DYNAMIC_LABEL[st.dynamic]}</span></p>
            <p className="mt-0.5 text-slate-700">{route.gateA}. kapı: {who(st.holderA)} · {route.gateB}. kapı: {who(st.holderB)}</p>
            <p className="mt-0.5 text-slate-500">{DYNAMIC_DEFINITION[st.dynamic]}</p>
          </>
        ) : st.state === "half" ? (
          <>
            <p className="font-bold text-slate-900">{relationChannelLabel(st.id, st.id)} <span className="font-semibold text-amber-700">· Yarım kanal (tanımlı değil)</span></p>
            <p className="mt-0.5 text-slate-700">{route.gateA}. kapı: {who(st.holderA)} · {route.gateB}. kapı: {who(st.holderB)}</p>
            <p className="mt-0.5 text-slate-500">Birlikte kanalın yalnız bir kapısı aktif; birleşik haritada tanımlı değildir.</p>
          </>
        ) : (
          <p className="text-slate-700"><b>{relationChannelLabel(st.id, st.id)}</b> — iki haritada da aktif kapısı yok.</p>
        )}
      </div>
      <ul className="mt-2 grid gap-1 text-[11px] text-slate-600 sm:grid-cols-2" data-hd-composite-legend>
        <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: PERSON_COLOR.A }} />A · {nameA}</li>
        <li><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: PERSON_COLOR.B }} />B · {nameB}</li>
        <li>İki renkli kapı / çizgili kanal yarısı: ortak kapı</li>
        <li>Kalın kanal: tanımlı · ince kesikli: yarım kanal</li>
        {DYNAMIC_ORDER.map((d) => (<li key={d}>{SHAPE_GLYPH[DYNAMIC_SHAPE[d]]} {DYNAMIC_LABEL[d]}</li>))}
        <li>Dolgulu merkez: birleşik haritada tanımlı · A/B: kendi haritasında tanımlayan</li>
      </ul>
      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] font-semibold text-indigo-700">Özet bağlantı şeması (ikincil)</summary>
        {summary}
      </details>
    </div>
  );
}
