"use client";

// Kişi analizi · Taşlar sekmesi. Üç kaynak ayrı: 1) haritanın önerdiği, 2) titreşim (tam + kök ayrı başlık),
// 3) gezegen ilişkisi (+ eşlikçi/element grupları açıksa). Sembolik / geleneksel; sağlık iddiası YOK.

import { useEffect, useRef, useState } from "react";
import type { ChartResult } from "@/lib/numeroloji-klasik/model";
import type { ProviderDirectItem, StoneMatchGroup, StoneSuggestion } from "@/lib/numeroloji-klasik/stones/types";
import { API_BASE, apiRequest, errorMessage, type ApiErr } from "../../_lib/api";
import type { StonesResponse } from "../../_lib/types";
import { sourceBody, type ResultSource } from "../../_lib/draft";
import { Alert, Icon, Skeleton } from "../kit";

const DISCLAIMER =
  "Taş önerileri sembolik ve geleneksel numeroloji yorumudur; tıbbi teşhis, tedavi veya sağlık iddiası taşımaz ve hiçbir tedavinin yerine geçmez.";

const MODE_REASON_TR: Record<string, string> = {
  library_disabled: "Doğaltaş Kütüphanesi bağlantısı şu an kapalı.",
  no_access: "Doğaltaş Kütüphanesi erişiminiz bulunmuyor.",
  unavailable: "Doğaltaş Kütüphanesi şu an yanıt vermiyor.",
  empty: "Doğaltaş Kütüphanesinde yayında taş yok.",
};

function fold(s: string): string {
  return s
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function makeStock(stock: Record<string, number>) {
  const byFold = new Map<string, number>();
  for (const [k, v] of Object.entries(stock ?? {})) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const f = fold(k);
    byFold.set(f, (byFold.get(f) ?? 0) + Math.max(0, v));
  }
  return (...keys: (string | null | undefined)[]): number | null => {
    for (const k of keys) {
      if (!k) continue;
      if (Object.prototype.hasOwnProperty.call(stock, k) && typeof stock[k] === "number") return Math.max(0, stock[k]);
      const f = byFold.get(fold(k));
      if (f !== undefined) return f;
    }
    return null;
  };
}

/** Stok rozeti: adet > 0 → "Stokta · N adet"; kayıtlı ama adetsiz → "Stokta"; yok → "Stokta yok". */
export function StockBadge({ n }: { n: number | null }) {
  if (n !== null && n > 0) return <span className="nk-badge nk-ok" data-testid="stock-badge">Stokta · {n} adet</span>;
  if (n === 0) return <span className="nk-badge nk-ok" data-testid="stock-badge">Stokta</span>;
  return <span className="nk-badge">Stokta yok</span>;
}

export type StockFn = ReturnType<typeof makeStock>;

function DirectItem({ it, stockOf }: { it: ProviderDirectItem; stockOf: StockFn }) {
  const name = it.nameTr ?? it.input;
  return (
    <li className="nk-stone" data-testid="stone-direct">
      <div className="nk-stone-top">
        <span className="nk-stone-name">{name}</span>
        {it.status === "matched" ? <StockBadge n={stockOf(it.stoneKey, it.nameTr, it.input)} /> : null}
        {it.status === "ambiguous" ? <span className="nk-badge nk-warn">Eşleşme belirsiz</span> : null}
        {it.status === "unmatched" ? <span className="nk-badge">Kütüphanede bulunamadı</span> : null}
        {it.status === "text_only" ? <span className="nk-badge">Yalnız ad</span> : null}
      </div>
      {it.nameTr && it.nameTr !== it.input ? <p className="nk-stone-why">Haritadaki ad: {it.input}</p> : null}
      {it.status === "ambiguous" && it.candidates?.length ? (
        <>
          <p className="nk-stone-why">Kütüphanede birden çok benzer ad var; otomatik seçim yapılmaz, uzman seçer:</p>
          <ul className="nk-stone-cands">
            {it.candidates.map((c) => <li key={c.stoneKey}>{c.nameTr}{c.nameEn ? ` (${c.nameEn})` : ""} · <StockInline n={stockOf(c.stoneKey, c.nameTr)} /></li>)}
          </ul>
        </>
      ) : null}
      {it.status === "unmatched" ? <p className="nk-stone-why">Ad metin olarak gösterilir.</p> : null}
    </li>
  );
}

function StockInline({ n }: { n: number | null }) {
  return <span>{n !== null && n > 0 ? `Stokta · ${n} adet` : n === 0 ? "Stokta" : "Stokta yok"}</span>;
}

function SuggestionItem({ s, method, stockOf, alsoDirect }: { s: StoneSuggestion; method: string; stockOf: StockFn; alsoDirect: boolean }) {
  const reasons = s.reasons.filter((r) => r.method === method);
  const others = s.reasons.filter((r) => r.method !== method);
  return (
    <li className="nk-stone" data-testid="stone-suggestion">
      <div className="nk-stone-top">
        <span className="nk-stone-name">{s.nameTr}</span>
        <StockBadge n={stockOf(s.stoneKey, s.nameTr, s.nameEn)} />
      </div>
      {(reasons.length ? reasons : s.reasons.slice(0, 1)).map((r, i) => <p key={i} className="nk-stone-why">{r.explanation}</p>)}
      {others.length || alsoDirect ? <p className="nk-stone-why">{alsoDirect ? "1. kaynakta da var" : `Başka gerekçe: ${others.length}`}</p> : null}
    </li>
  );
}

function GroupList({ g, stockOf, directKeys }: { g: StoneMatchGroup | undefined; stockOf: StockFn; directKeys: Set<string> }) {
  if (!g || !g.items.length) return <p className="nk-empty">Bu kaynakta eşleşme yok.</p>;
  return (
    <ul className="nk-stone-list">
      {g.items.map((s) => <SuggestionItem key={s.stoneKey} s={s} method={g.method} stockOf={stockOf} alsoDirect={directKeys.has(s.stoneKey)} />)}
      {g.total > g.items.length ? <li className="nk-stone-why">+{g.total - g.items.length} taş daha (liste kısaltıldı)</li> : null}
    </ul>
  );
}

export function StonesPanel({ source, active, chart }: { source: ResultSource; active: boolean; chart: ChartResult | null }) {
  const [state, setState] = useState<{ loading: boolean; data: StonesResponse | null; error: string | null; unavailable?: string }>({ loading: false, data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const started = useRef<number>(-1);

  useEffect(() => {
    if (!active || started.current === attempt) return;
    started.current = attempt;
    setState({ loading: true, data: null, error: null });
    // Kayıtlı analiz: GET; kaydedilmemiş sonuç: sunucu önbellekten doğrular (0 sağlayıcı çağrısı, kayıt YOK).
    const req = source.draft
      ? apiRequest<StonesResponse>(`${API_BASE}/taslak/taslar`, { method: "POST", json: sourceBody(source) })
      : apiRequest<StonesResponse>(`${API_BASE}/analyses/${encodeURIComponent(source.analysisId as string)}/taslar`);
    void req.then((r) => {
      if (r.ok) setState({ loading: false, data: r.data, error: null });
      else if ((r as ApiErr).status === 422 || (r as ApiErr).code === "STONES_NOT_AVAILABLE") setState({ loading: false, data: null, error: null, unavailable: (r as ApiErr).error ?? "Bu analizde taş eşleştirmesi için kişi haritası bulunmuyor." });
      else setState({ loading: false, data: null, error: errorMessage(r as ApiErr) });
    });
  }, [active, attempt, source]);

  const la = chart?.luckyAssociations ?? null;
  const head = (
    <div className="nk-card nk-panel" style={{ marginBottom: 14 }}>
      <h2 className="nk-h2">Taş önerileri</h2>
      <p className="nk-lead">Üç kaynak birbirinden ayrı gösterilir; aynı taş birden fazla kaynakta görünebilir.</p>
      {la ? (
        <div className="nk-badges" style={{ marginTop: 10 }}>
          {la.rulingPlanet ? <span className="nk-badge">Uğurlu gezegen · {la.rulingPlanet}</span> : null}
          {la.element ? <span className="nk-badge">Element · {la.element}</span> : null}
          {la.day ? <span className="nk-badge">Gün · {la.day}</span> : null}
          {la.colors.length ? <span className="nk-badge">Renkler · {la.colors.join(", ")}</span> : null}
        </div>
      ) : null}
    </div>
  );

  if (state.unavailable) return (<>{head}<Alert tone="info" title="Taş önerisi yok">{state.unavailable}</Alert></>);
  if (state.loading || (!state.data && !state.error)) return (<>{head}<Skeleton lines={5} label="Taş önerileri yükleniyor…" /></>);
  if (state.error || !state.data) {
    return (
      <>
        {head}
        <Alert tone="error" action={<button type="button" className="nk-btn nk-sm" onClick={() => setAttempt((x) => x + 1)}>Tekrar dene</button>}>{state.error}</Alert>
        <p className="nk-disclaimer"><Icon name="alert" /><span>{DISCLAIMER}</span></p>
      </>
    );
  }

  const res = state.data.result;
  const stockOf = makeStock(state.data.stock ?? {});
  const g = (m: string) => res.groups.find((x) => x.method === m);
  const directKeys = new Set(res.providerDirect.map((d) => d.stoneKey).filter((x): x is string => !!x));
  const extra = res.groups.filter((x) => (x.method === "pairs_with" || x.method === "element") && x.items.length > 0);

  return (
    <>
      {head}
      {state.data.mode === "text_only" ? (
        <Alert tone="warn" title="Yalnız taş adları gösteriliyor">
          {state.data.reasonText || (state.data.reason && MODE_REASON_TR[state.data.reason]) || "Doğaltaş Kütüphanesi şu an kullanılamıyor."} Haritanın önerdiği taşlar ad olarak listelenir; türetilmiş eşleşmeler kütüphane bağlantısı gerektirir.
        </Alert>
      ) : null}
      <div className="nk-stone-cols" style={{ marginTop: state.data.mode === "text_only" ? 14 : 0 }}>
        <section className="nk-card nk-panel" aria-labelledby="nk-src1" data-testid="stone-src-1">
          <div className="nk-src-head"><span className="nk-src-no">1</span><div><h3 className="nk-h3" id="nk-src1">Haritanın önerdiği taşlar</h3><p className="nk-num-key">Analiz sonucundaki uğurlu taş listesi</p></div></div>
          {res.providerDirect.length ? (
            <ul className="nk-stone-list">{res.providerDirect.map((it, i) => <DirectItem key={`${it.input}-${i}`} it={it} stockOf={stockOf} />)}</ul>
          ) : <p className="nk-empty">Bu haritada taş önerisi yok.</p>}
        </section>
        <section className="nk-card nk-panel" aria-labelledby="nk-src2" data-testid="stone-src-2">
          <div className="nk-src-head"><span className="nk-src-no">2</span><div><h3 className="nk-h3" id="nk-src2">Titreşim eşleşmesi</h3><p className="nk-num-key">Kütüphanedeki taşın titreşim sayısı</p></div></div>
          <p className="nk-subhead"><span className="nk-badge nk-ice">Tam eşleşme</span> Sayının kendisi</p>
          <GroupList g={g("vibration_exact")} stockOf={stockOf} directKeys={directKeys} />
          <p className="nk-subhead" data-testid="root-match-head"><span className="nk-badge">Kök sayı eşleşmesi</span> Usta / bileşik sayının kökü — tam eşleşme değildir</p>
          <GroupList g={g("vibration_root")} stockOf={stockOf} directKeys={directKeys} />
        </section>
        <section className="nk-card nk-panel" aria-labelledby="nk-src3" data-testid="stone-src-3">
          <div className="nk-src-head"><span className="nk-src-no">3</span><div><h3 className="nk-h3" id="nk-src3">Gezegen ilişkisi</h3><p className="nk-num-key">Yönetici gezegenle gelenekte eşleşen taşlar</p></div></div>
          <GroupList g={g("planet")} stockOf={stockOf} directKeys={directKeys} />
          {extra.map((x) => (
            <div key={x.method}>
              <p className="nk-subhead">{x.label}</p>
              <GroupList g={x} stockOf={stockOf} directKeys={directKeys} />
            </div>
          ))}
        </section>
      </div>
      {res.notes.length ? <ul className="nk-stone-notes">{res.notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
      <p className="nk-disclaimer" data-testid="stone-disclaimer"><Icon name="alert" /><span>{DISCLAIMER}</span></p>
    </>
  );
}
