"use client";

// Kişi analizi · Taşlar sekmesi. Üç kaynak ayrı: 1) haritanın önerdiği, 2) titreşim (tam + kök ayrı başlık),
// 3) gezegen ilişkisi (+ eşlikçi/element grupları açıksa). Sembolik / geleneksel; sağlık iddiası YOK.

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import type { ChartResult } from "@/lib/numeroloji-klasik/model";
import type { ProviderDirectItem, StoneMatchGroup, StoneSuggestion } from "@/lib/numeroloji-klasik/stones/types";
import { API_BASE, apiRequest, errorMessage, errorMessageEn, type ApiErr } from "../../_lib/api";
import type { StonesResponse } from "../../_lib/types";
import { sourceBody, type ResultSource } from "../../_lib/draft";
import { Alert, Icon, Skeleton } from "../kit";

// Ekran metinleri numerology.classic.stones katalogundan (TR değerleri önceki sabitlerle birebir).
/** Kütüphane kullanılamama nedeni kodu (sunucu `reason`, kanonik) → katalog anahtarı. */
const MODE_REASON_KEYS = new Set(["library_disabled", "no_access", "unavailable", "empty"]);
/** Türetilmiş grup yöntem kodu (kanonik) → katalog anahtarı (yalnız EN gösterimi; TR'de sunucu etiketi birebir). */
const GROUP_LABEL_KEYS = new Set(["pairs_with", "element"]);

function fold(s: string): string {
  return s
    .replace(/İ/g, "i")
    .replace(/I/g, "ı") // i18n-ignore: stok adı katlama (Türkçe büyük/küçük harf kuralı; ekran metni değil)
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
  const t = useTranslations("numerology.classic.stones");
  if (n !== null && n > 0) return <span className="nk-badge nk-ok" data-testid="stock-badge">{t("stockCount", { n: String(n) })}</span>;
  if (n === 0) return <span className="nk-badge nk-ok" data-testid="stock-badge">{t("stock")}</span>;
  return <span className="nk-badge">{t("noStock")}</span>;
}

export type StockFn = ReturnType<typeof makeStock>;

/**
 * 30.10.2026: eşleşme durumlarının uzmana açık açıklaması (eşleştirme kuralı DEĞİŞMEZ — belirsiz ad otomatik
 * kesinleştirilmez, rastgele taş seçilmez, stok uydurulmaz).
 *   ambiguous + aday adı birebir/alias → kütüphanede aynı adı taşıyan birden çok kayıt
 *   ambiguous + aday yalnız kelime benzerliği (partial/variant) → tam karşılık yok, adı benzeyen kayıtlar var
 */
export function ambiguousKind(it: Pick<ProviderDirectItem, "candidates">): "duplicate" | "similar" {
  const c = it.candidates ?? [];
  return c.length > 0 && c.every((x) => x.via === "partial" || x.via === "variant") ? "similar" : "duplicate";
}

/** Eşleşme durumu kodları (kanonik) → numerology.classic.stones.status.<kod>.{badge,why} (metinler katalogda, TR birebir). */
export const STONE_STATUS_KEYS = Object.freeze(["duplicate", "similar", "unmatched", "text_only"] as const);

function DirectItem({ it, stockOf }: { it: ProviderDirectItem; stockOf: StockFn }) {
  const t = useTranslations("numerology.classic.stones");
  // Taş adı (nameTr / input / aday adları) sağlayıcı/kütüphane verisidir → çevrilmez.
  const name = it.nameTr ?? it.input;
  const ambKind = it.status === "ambiguous" ? ambiguousKind(it) : null;
  const amb = ambKind ? { badge: t(`status.${ambKind}.badge`), why: t(`status.${ambKind}.why`) } : null;
  return (
    <li className="nk-stone" data-testid="stone-direct">
      <div className="nk-stone-top">
        <span className="nk-stone-name">{name}</span>
        {it.status === "matched" ? <StockBadge n={stockOf(it.stoneKey, it.nameTr, it.input)} /> : null}
        {amb ? <span className="nk-badge nk-warn" data-testid="stone-ambiguous">{amb.badge}</span> : null}
        {it.status === "unmatched" ? <span className="nk-badge">{t("status.unmatched.badge")}</span> : null}
        {it.status === "text_only" ? <span className="nk-badge">{t("status.text_only.badge")}</span> : null}
      </div>
      {it.nameTr && it.nameTr !== it.input ? <p className="nk-stone-why">{t("mapName", { name: it.input })}</p> : null}
      {amb && it.candidates?.length ? (
        <>
          <p className="nk-stone-why">{amb.why}</p>
          <ul className="nk-stone-cands">
            {it.candidates.map((c) => <li key={c.stoneKey}>{c.nameTr}{c.nameEn ? ` (${c.nameEn})` : ""} · <StockInline n={stockOf(c.stoneKey, c.nameTr)} /></li>)}
          </ul>
        </>
      ) : null}
      {it.status === "unmatched" ? <p className="nk-stone-why">{t("status.unmatched.why")}</p> : null}
      {it.status === "text_only" ? <p className="nk-stone-why">{t("status.text_only.why")}</p> : null}
    </li>
  );
}

function StockInline({ n }: { n: number | null }) {
  const t = useTranslations("numerology.classic.stones");
  return <span>{n !== null && n > 0 ? t("stockCount", { n: String(n) }) : n === 0 ? t("stock") : t("noStock")}</span>;
}

function SuggestionItem({ s, method, stockOf, alsoDirect }: { s: StoneSuggestion; method: string; stockOf: StockFn; alsoDirect: boolean }) {
  const t = useTranslations("numerology.classic.stones");
  // r.explanation: eşleştirici gerekçe metni (Türkçe snapshot) → çevrilmez.
  const reasons = s.reasons.filter((r) => r.method === method);
  const others = s.reasons.filter((r) => r.method !== method);
  return (
    <li className="nk-stone" data-testid="stone-suggestion">
      <div className="nk-stone-top">
        <span className="nk-stone-name">{s.nameTr}</span>
        <StockBadge n={stockOf(s.stoneKey, s.nameTr, s.nameEn)} />
      </div>
      {(reasons.length ? reasons : s.reasons.slice(0, 1)).map((r, i) => <p key={i} className="nk-stone-why">{r.explanation}</p>)}
      {others.length || alsoDirect ? <p className="nk-stone-why">{alsoDirect ? t("alsoSource1") : t("otherReasons", { n: String(others.length) })}</p> : null}
    </li>
  );
}

/** Grup başına ilk gösterilen taş sayısı; fazlası "Tüm taşları göster (+N)" ile açılır (30.10.2026 owner kararı). */
export const STONE_GROUP_INITIAL = 6;

function GroupList({ g, stockOf, directKeys }: { g: StoneMatchGroup | undefined; stockOf: StockFn; directKeys: Set<string> }) {
  const t = useTranslations("numerology.classic.stones");
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (!g || !g.items.length) return <p className="nk-empty">{t("noMatch")}</p>;
  // Sunucu Taşlar sekmesi için grupları KESMEDEN döner (total = items.length); gizlenen taş yoktur, yalnız katlanır.
  const hidden = Math.max(0, g.items.length - STONE_GROUP_INITIAL);
  const shown = open ? g.items : g.items.slice(0, STONE_GROUP_INITIAL);
  return (
    <>
      <ul className="nk-stone-list" id={listId} data-testid={`stone-group-${g.method}`}>
        {shown.map((s) => <SuggestionItem key={s.stoneKey} s={s} method={g.method} stockOf={stockOf} alsoDirect={directKeys.has(s.stoneKey)} />)}
      </ul>
      {hidden > 0 ? (
        <button type="button" className="nk-btn nk-sm" style={{ marginTop: 8 }} aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)} data-testid="stone-toggle">
          {open ? t("collapse") : t("showAll", { n: String(hidden) })}
        </button>
      ) : null}
    </>
  );
}

export function StonesPanel({ source, active, chart }: { source: ResultSource; active: boolean; chart: ChartResult | null }) {
  const t = useTranslations("numerology.classic.stones");
  const tErr = useTranslations("numerology.classic.apiErrors");
  const isTr = useLocale() === DEFAULT_LOCALE;
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
      else if ((r as ApiErr).status === 422 || (r as ApiErr).code === "STONES_NOT_AVAILABLE") setState({ loading: false, data: null, error: null, unavailable: (isTr ? (r as ApiErr).error : null) ?? t("unavailableFallback") });
      else setState({ loading: false, data: null, error: isTr ? errorMessage(r as ApiErr) : errorMessageEn(r as ApiErr, tErr) });
    });
    // t / tErr / isTr değişse de started === attempt koruması yeni istek göndermez.
  }, [active, attempt, source, isTr, t, tErr]);

  const la = chart?.luckyAssociations ?? null;
  const head = (
    <div className="nk-card nk-panel" style={{ marginBottom: 14 }}>
      <h2 className="nk-h2">{t("title")}</h2>
      <p className="nk-lead">{t("lead")}</p>
      {la ? (
        <div className="nk-badges" style={{ marginTop: 10 }}>
          {/* Gezegen / element / gün / renk değerleri sağlayıcı sonucudur (snapshot) → çevrilmez; yalnız etiket katalogdan. */}
          {la.rulingPlanet ? <span className="nk-badge">{t("luckyPlanet", { v: la.rulingPlanet })}</span> : null}
          {la.element ? <span className="nk-badge">{t("element", { v: la.element })}</span> : null}
          {la.day ? <span className="nk-badge">{t("day", { v: la.day })}</span> : null}
          {la.colors.length ? <span className="nk-badge">{t("colors", { v: la.colors.join(", ") })}</span> : null}
        </div>
      ) : null}
    </div>
  );

  if (state.unavailable) return (<>{head}<Alert tone="info" title={t("noSuggestionTitle")}>{state.unavailable}</Alert></>);
  if (state.loading || (!state.data && !state.error)) return (<>{head}<Skeleton lines={5} label={t("loading")} /></>);
  if (state.error || !state.data) {
    return (
      <>
        {head}
        <Alert tone="error" action={<button type="button" className="nk-btn nk-sm" onClick={() => setAttempt((x) => x + 1)}>{t("retry")}</button>}>{state.error}</Alert>
        <p className="nk-disclaimer"><Icon name="alert" /><span>{t("disclaimer")}</span></p>
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
        <Alert tone="warn" title={t("textOnlyTitle")}>
          {/* TR: sunucunun reasonText'i önceliklidir (birebir); EN: yalnız reason kodu → katalog. */}
          {(isTr ? state.data.reasonText : null) || (state.data.reason && MODE_REASON_KEYS.has(state.data.reason) ? t(`modeReason.${state.data.reason}`) : "") || t("modeReasonFallback")} {t("textOnlyTail")}
        </Alert>
      ) : null}
      <div className="nk-stone-cols" style={{ marginTop: state.data.mode === "text_only" ? 14 : 0 }}>
        <section className="nk-card nk-panel" aria-labelledby="nk-src1" data-testid="stone-src-1">
          <div className="nk-src-head"><span className="nk-src-no">1</span><div><h3 className="nk-h3" id="nk-src1">{t("src1Title")}</h3><p className="nk-num-key">{t("src1Sub")}</p></div></div>
          {res.providerDirect.length ? (
            <ul className="nk-stone-list">{res.providerDirect.map((it, i) => <DirectItem key={`${it.input}-${i}`} it={it} stockOf={stockOf} />)}</ul>
          ) : <p className="nk-empty">{t("src1Empty")}</p>}
        </section>
        <section className="nk-card nk-panel" aria-labelledby="nk-src2" data-testid="stone-src-2">
          <div className="nk-src-head"><span className="nk-src-no">2</span><div><h3 className="nk-h3" id="nk-src2">{t("src2Title")}</h3><p className="nk-num-key">{t("src2Sub")}</p></div></div>
          <p className="nk-subhead"><span className="nk-badge nk-ice">{t("exact")}</span> {t("exactSub")}</p>
          <GroupList g={g("vibration_exact")} stockOf={stockOf} directKeys={directKeys} />
          <p className="nk-subhead" data-testid="root-match-head"><span className="nk-badge">{t("root")}</span> {t("rootSub")}</p>
          <GroupList g={g("vibration_root")} stockOf={stockOf} directKeys={directKeys} />
        </section>
        <section className="nk-card nk-panel" aria-labelledby="nk-src3" data-testid="stone-src-3">
          <div className="nk-src-head"><span className="nk-src-no">3</span><div><h3 className="nk-h3" id="nk-src3">{t("src3Title")}</h3><p className="nk-num-key">{t("src3Sub")}</p></div></div>
          <GroupList g={g("planet")} stockOf={stockOf} directKeys={directKeys} />
          {extra.map((x) => (
            <div key={x.method}>
              <p className="nk-subhead">{!isTr && GROUP_LABEL_KEYS.has(x.method) ? t(`group.${x.method}`) : x.label}</p>
              <GroupList g={x} stockOf={stockOf} directKeys={directKeys} />
            </div>
          ))}
        </section>
      </div>
      {/* res.notes: sunucu/eşleştirici notları (Türkçe snapshot) → çevrilmez. */}
      {res.notes.length ? <ul className="nk-stone-notes">{res.notes.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
      <p className="nk-disclaimer" data-testid="stone-disclaimer"><Icon name="alert" /><span>{t("disclaimer")}</span></p>
    </>
  );
}
