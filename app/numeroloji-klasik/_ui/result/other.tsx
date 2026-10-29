"use client";

// İlişki / işletme / isim seçenekleri sonuç düzenleri.

import type { BusinessNameResult, CompatibilityPair, CompatibilityResult, DualResult } from "@/lib/numeroloji-klasik/model";
import { BUSINESS_RATING_LABELS, COMPOUND_NATURE_LABELS } from "@/lib/numeroloji-klasik/labels";
import { MismatchNote, NumberBadges, Trace, VerificationBadge, compoundDisplay } from "../kit";

function Pair({ label, p }: { label: string; p: CompatibilityPair }) {
  return (
    <div className="nk-pair">
      <p className="nk-label-cap">{label}</p>
      <p style={{ marginTop: 4 }}><b>{p.person1}</b> <span className="nk-muted">↔</span> <b>{p.person2}</b></p>
      <p className="nk-num-key">Uyum · %{p.compatibility}</p>
      {p.description ? <p className="nk-num-desc" style={{ marginTop: 4 }}>{p.description}</p> : null}
    </div>
  );
}

export function RelationshipPanel({ r, names }: { r: CompatibilityResult; names: [string, string] }) {
  return (
    <>
      <div className="nk-card nk-panel">
        <div className="nk-num-top">
          <div>
            <h2 className="nk-h2">Numerolojik uyum</h2>
            <p className="nk-lead">{names[0]} ↔ {names[1]} · Pisagor (Batı)</p>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "baseline", marginTop: 12 }}>
          <span className="nk-score" data-testid="compat-score">%{r.overallScore}</span>
          {r.rating ? <span className="nk-badge nk-ice">{r.rating}</span> : null}
          <span className="nk-badge" data-testid="compat-score-badge">Klasik ekol puanı · doğrulanamaz</span>
        </div>
        {/* NK-005: puan tablosu/formülü kaynakta belgelenmemiş → yalnız sayı eşleşmeleri doğrulanır, puan doğrulanamaz. */}
        <p className="nk-hint" data-testid="compat-score-note" style={{ marginTop: 6 }}>Klasik ekol puanı · formülü kaynakta belgelenmediği için bağımsız doğrulanamaz; aşağıdaki sayılar ayrıca bağımsız olarak kontrol edilir.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 10 }}>
          <span className="nk-label-cap">Sayıların bağımsız kontrolü</span>
          <VerificationBadge v={r.verification} />
        </div>
        <MismatchNote v={r.verification} />
        <div className="nk-pair-grid">
          <Pair label="Yaşam Yolu" p={r.lifePath} />
          <Pair label="İfade" p={r.expression} />
          <Pair label="Ruh Güdüsü" p={r.soulUrge} />
        </div>
      </div>
      <div className="nk-section-grid" style={{ marginTop: 14 }}>
        <div className="nk-card nk-panel">
          <h2 className="nk-h2">Güçlü yönler</h2>
          {r.strengths.length ? <ul className="nk-bullets">{r.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul> : <p className="nk-empty">Belirtilmemiş.</p>}
        </div>
        <div className="nk-card nk-panel">
          <h2 className="nk-h2">Zorlayıcı yönler</h2>
          {r.challenges.length ? <ul className="nk-bullets">{r.challenges.map((s, i) => <li key={i}>{s}</li>)}</ul> : <p className="nk-empty">Belirtilmemiş.</p>}
        </div>
      </div>
      {r.advice ? <div className="nk-card nk-panel" style={{ marginTop: 14 }}><h2 className="nk-h2">Öneri</h2><p className="nk-num-desc" style={{ marginTop: 6 }}>{r.advice}</p></div> : null}
    </>
  );
}

const RATING_CLASS = { excellent: "nk-ok", good: "nk-ok", caution: "nk-warn", avoid: "nk-bad" } as const;
const NATURE_CLASS = { fortunate: "nk-ok", unfortunate: "nk-bad", mixed: "nk-warn" } as const;

export function BusinessPanel({ b }: { b: BusinessNameResult }) {
  const p = b.number;
  return (
    <>
      <div className="nk-section-grid">
        <article className="nk-card nk-num-card">
          <div className="nk-num-top"><div><h2 className="nk-h2">{b.name}</h2><p className="nk-num-key">Kalde (Cheiro) · işletme adı</p></div><VerificationBadge v={b.verification} /></div>
          <div className="nk-compound">
            {p.compound !== null ? (<><span className="nk-big">{p.compound}</span><span className="nk-arrow" aria-hidden="true">→</span><span className="nk-root-n">{p.root}</span></>) : <span className="nk-big">{p.root}</span>}
          </div>
          <div className="nk-badges">
            <span className={`nk-badge ${RATING_CLASS[b.rating]}`} data-testid="biz-rating">{BUSINESS_RATING_LABELS[b.rating]}</span>
            {b.planet ? <span className="nk-badge">{b.planet}</span> : null}
            {p.compoundMeaning ? <span className={`nk-badge ${NATURE_CLASS[p.compoundMeaning.nature]}`}>{COMPOUND_NATURE_LABELS[p.compoundMeaning.nature]}</span> : null}
            {b.favorableCompound ? <span className="nk-badge nk-ok">Uğurlu bileşik</span> : null}
          </div>
          {p.compoundMeaning?.name ? <p className="nk-num-desc"><b>{p.compoundMeaning.name}</b></p> : null}
          {p.compoundMeaning?.meaning ? <p className="nk-num-desc">{p.compoundMeaning.meaning}</p> : null}
          <MismatchNote v={b.verification} />
          <Trace text={p.calculation} />
        </article>
        <div className="nk-card nk-panel">
          <h2 className="nk-h2">Değerlendirme</h2>
          {b.summary ? <p className="nk-num-desc" style={{ marginTop: 6 }}>{b.summary}</p> : null}
          {b.guidance ? <p className="nk-num-desc" style={{ marginTop: 6 }}>{b.guidance}</p> : null}
          {b.industries.length ? (<><p className="nk-mh" style={{ marginTop: 10 }}>Geleneksel olarak uyumlu alanlar</p><div className="nk-chips" style={{ marginTop: 6 }}>{b.industries.map((x) => <span key={x} className="nk-badge">{x}</span>)}</div></>) : null}
        </div>
      </div>
    </>
  );
}

export function NamesPanel({ items, failed }: { items: { label: string; d: DualResult }[]; failed: string[] }) {
  return (
    <>
      <div className="nk-card nk-panel">
        <h2 className="nk-h2">Aday adlar yan yana</h2>
        <p className="nk-lead">Her aday iki sistemle ayrı hesaplanır; sayılar birleştirilmez ve sıralama yapılmaz.</p>
        <table className="nk-sys-table" data-testid="names-table">
          <caption className="nk-sr-only">Aday adların Pisagor ve Kalde sayıları</caption>
          <thead><tr><th scope="col">Aday</th><th scope="col">Pisagor</th><th scope="col">Kalde</th><th scope="col">Uyum</th></tr></thead>
          <tbody>
            {items.map(({ label, d }) => (
              <tr key={label}>
                <th scope="row" data-l="Aday" style={{ fontWeight: 700 }}>{d.name}</th>
                <td className="nk-v" data-l="Pisagor">{compoundDisplay(d.pythagorean) ?? d.pythagorean.value}</td>
                <td className="nk-v" data-l="Kalde">{d.chaldean.compound !== null ? `${d.chaldean.compound}/${d.chaldean.root}` : d.chaldean.root}{d.chaldean.planet ? ` · ${d.chaldean.planet}` : ""}</td>
                <td data-l="Uyum">{d.agreement ? <span className="nk-badge nk-ok">Aynı kök</span> : <span className="nk-badge">Farklı</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {failed.length ? <p className="nk-hint" style={{ marginTop: 8 }}>Hesaplanamayan adaylar: {failed.join(", ")}</p> : null}
      </div>
      <div className="nk-kalde-grid" style={{ marginTop: 14 }}>
        {items.map(({ label, d }) => (
          <article key={label} className="nk-card nk-num-card" data-testid="name-card">
            <div className="nk-num-top"><div><h3 className="nk-num-name">{d.name}</h3><p className="nk-num-key">Pisagor · {d.pythagorean.title}</p></div><VerificationBadge v={d.verification} /></div>
            <div className="nk-num-val"><span className="nk-num-big">{d.pythagorean.value}</span><span className="nk-num-sub">Kalde {d.chaldean.compound ?? d.chaldean.root}{d.chaldean.compound !== null ? ` → ${d.chaldean.root}` : ""}</span></div>
            <NumberBadges n={d.pythagorean} />
            {d.chaldean.caution ? <span className="nk-badge nk-bad">Kalde · Dikkat</span> : null}
            {d.note ? <p className="nk-num-desc">{d.note}</p> : null}
            <MismatchNote v={d.verification} />
            <Trace text={d.pythagorean.calculation} label="Pisagor · Nasıl Hesaplandı?" />
            <Trace text={d.chaldean.calculation} label="Kalde · Nasıl Hesaplandı?" />
          </article>
        ))}
      </div>
    </>
  );
}
