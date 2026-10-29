"use client";

// Klasik Numeroloji · Sayı Bilgi Kütüphanesi (sabit katalog; 0 sağlayıcı çağrısı).
//   Pisagor anlamları: 1–9, 11, 22, 33 · Kalde bileşik sayılar: 10–52 (nitelik rozetleriyle).

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { CompoundNature, MeaningBlock } from "@/lib/numeroloji-klasik/model";
import { COMPOUND_NATURE_LABELS, INTERPRETATION_HEADING, NUMBER_KIND_LABELS } from "@/lib/numeroloji-klasik/labels";
import { API_BASE, apiRequest, errorMessage, type ApiErr } from "../_lib/api";
import { num, rec, str, strList } from "../_lib/format";
import type { CatalogEntry, CatalogResponse } from "../_lib/types";
import { Alert, Hero, Shell, Skeleton } from "../_ui/kit";

type Kind = "pythagorean_meaning" | "chaldean_compound";
const TABS: { kind: Kind; label: string }[] = [
  { kind: "pythagorean_meaning", label: "Pisagor sayı anlamları" },
  { kind: "chaldean_compound", label: "Kalde bileşik sayılar" },
];
const NATURE_CLASS: Record<CompoundNature, string> = { fortunate: "nk-ok", unfortunate: "nk-bad", mixed: "nk-warn" };

function asMeaning(v: unknown): MeaningBlock | null {
  const r = rec(v);
  if (!r) return null;
  return {
    title: str(r.title) ?? "",
    keywords: strList(r.keywords),
    description: str(r.description) ?? "",
    strengths: strList(r.strengths),
    challenges: strList(r.challenges),
    career: str(r.career),
    relationships: str(r.relationships),
    spirituality: str(r.spirituality),
  };
}

function PyCard({ e }: { e: CatalogEntry }) {
  const p = rec(e.payload);
  const m = asMeaning(p?.meaning);
  const n = num(p?.number) ?? e.number;
  const master = p?.type === "master" || [11, 22, 33].includes(n);
  return (
    <article className="nk-card nk-lib-card" data-testid="lib-card">
      <div className="nk-lib-head">
        <span className="nk-lib-no">{n}</span>
        <div>
          <h3 className="nk-h3">{m?.title || `Sayı ${n}`}</h3>
          <div className="nk-badges">{master ? <span className="nk-badge nk-master">{NUMBER_KIND_LABELS.master}</span> : <span className="nk-badge">{NUMBER_KIND_LABELS.single}</span>}</div>
        </div>
      </div>
      {m?.keywords.length ? <p className="nk-num-key">{m.keywords.join(" · ")}</p> : null}
      {m?.description ? <p className="nk-num-desc">{m.description}</p> : null}
      {m && (m.strengths.length || m.challenges.length) ? (
        <details className="nk-trace nk-meaning">
          <summary>{INTERPRETATION_HEADING}</summary>
          <div className="nk-meaning-body">
            {m.strengths.length ? (<><p className="nk-mh">Güçlü yönler</p><ul>{m.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></>) : null}
            {m.challenges.length ? (<><p className="nk-mh">Zorlayıcı yönler</p><ul>{m.challenges.map((s, i) => <li key={i}>{s}</li>)}</ul></>) : null}
            {m.career ? (<><p className="nk-mh">Kariyer</p><p>{m.career}</p></>) : null}
            {m.relationships ? (<><p className="nk-mh">İlişkiler</p><p>{m.relationships}</p></>) : null}
            {m.spirituality ? (<><p className="nk-mh">Ruhsallık</p><p>{m.spirituality}</p></>) : null}
          </div>
        </details>
      ) : null}
    </article>
  );
}

function ChCard({ e }: { e: CatalogEntry }) {
  const p = rec(e.payload);
  const n = num(p?.number) ?? e.number;
  const nature = (["fortunate", "unfortunate", "mixed"] as const).find((x) => x === p?.nature) ?? null;
  const root = num(p?.root);
  const sameAs = num(p?.sameAs);
  return (
    <article className="nk-card nk-lib-card" data-testid="lib-card">
      <div className="nk-lib-head">
        <span className="nk-lib-no">{n}</span>
        <div>
          <h3 className="nk-h3">{str(p?.name) ?? `Bileşik ${n}`}</h3>
          <div className="nk-badges">
            {nature ? <span className={`nk-badge ${NATURE_CLASS[nature]}`}>{COMPOUND_NATURE_LABELS[nature]}</span> : null}
            {root !== null ? <span className="nk-badge">Kök {root}</span> : null}
            {sameAs !== null ? <span className="nk-badge">{sameAs} ile aynı anlam</span> : null}
          </div>
        </div>
      </div>
      {str(p?.meaning) ? <p className="nk-num-desc">{str(p?.meaning)}</p> : null}
    </article>
  );
}

export default function LibraryClient() {
  const [tab, setTab] = useState<Kind>("pythagorean_meaning");
  const [data, setData] = useState<Partial<Record<Kind, CatalogEntry[]>>>({});
  const [error, setError] = useState<Partial<Record<Kind, string>>>({});
  const [loading, setLoading] = useState<Kind | null>(null);
  const [retry, setRetry] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const loaded = useRef(new Set<Kind>());

  useEffect(() => {
    if (loaded.current.has(tab)) return;
    loaded.current.add(tab);
    const k = tab;
    setLoading(k);
    void apiRequest<CatalogResponse>(`${API_BASE}/catalog?kind=${k}&lang=tr`).then((r) => {
      if (r.ok) setData((d) => ({ ...d, [k]: [...r.data.entries].sort((a, b) => a.number - b.number) }));
      else {
        loaded.current.delete(k);
        setError((e) => ({ ...e, [k]: errorMessage(r as ApiErr) }));
      }
      setLoading((cur) => (cur === k ? null : cur));
    });
  }, [tab, retry]);

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    let n: number | null = null;
    if (e.key === "ArrowRight") n = (i + 1) % TABS.length;
    if (e.key === "ArrowLeft") n = (i - 1 + TABS.length) % TABS.length;
    if (e.key === "Home") n = 0;
    if (e.key === "End") n = TABS.length - 1;
    if (n !== null) {
      e.preventDefault();
      setTab(TABS[n].kind);
      tabRefs.current[n]?.focus();
    }
  }

  const entries = data[tab];
  const err = error[tab];
  return (
    <Shell crumbs={[{ href: "/numeroloji-merkezi", label: "Numeroloji Merkezi" }, { href: "/numeroloji-klasik", label: "Klasik Numeroloji" }, { label: "Sayı Bilgi Kütüphanesi" }]}>
      <Hero compact eyebrow="Klasik Numeroloji" title="Sayı Bilgi Kütüphanesi" sub="Klasik yöntemin sabit sayı anlamları. Kişisel veri içermez; yorumlar geleneksel yöntem yorumudur." />
      <div className="nk-lib-tabs" role="tablist" aria-label="Kütüphane bölümleri">
        {TABS.map((t, i) => (
          <button key={t.kind} ref={(el) => { tabRefs.current[i] = el; }} type="button" role="tab" id={`nk-lib-tab-${t.kind}`} aria-controls="nk-lib-panel"
            aria-selected={tab === t.kind} tabIndex={tab === t.kind ? 0 : -1} className="nk-tab" onClick={() => setTab(t.kind)} onKeyDown={(e) => onKey(e, i)}>
            {t.label}
          </button>
        ))}
      </div>
      <section id="nk-lib-panel" role="tabpanel" aria-labelledby={`nk-lib-tab-${tab}`}>
        {err ? (
          <Alert tone="error" action={<button type="button" className="nk-btn nk-sm" onClick={() => { setError((e) => ({ ...e, [tab]: undefined })); setRetry((x) => x + 1); }}>Tekrar dene</button>}>{err}</Alert>
        ) : loading === tab || !entries ? (
          <Skeleton lines={6} label="Kütüphane yükleniyor…" />
        ) : entries.length === 0 ? (
          <Alert tone="info" title="Kütüphane içeriği henüz yüklenmedi">Sayı anlamları yöneticiniz tarafından içe aktarıldığında burada görünecek.</Alert>
        ) : (
          <div className="nk-lib-grid">
            {entries.map((e) => (tab === "pythagorean_meaning" ? <PyCard key={`${e.kind}-${e.number}`} e={e} /> : <ChCard key={`${e.kind}-${e.number}`} e={e} />))}
          </div>
        )}
      </section>
    </Shell>
  );
}
