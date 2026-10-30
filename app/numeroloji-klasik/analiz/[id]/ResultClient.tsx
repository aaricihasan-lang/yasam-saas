"use client";

// Klasik Numeroloji · analiz sonucu. Kayıtlı analiz: TEK GET; kaydedilmemiş sonuç (taslak): sekmedeki kopya
// (ResultView mode="draft"). Sekme geçişi yeniden istek YAPMAZ. Yalnız verisi bulunan sekmeler gösterilir.
// Taşlar sekmesi ilk açılışta bir kez kendi ucunu çağırır. 30.10.2026: "Kayıtlar" düğmesi yerine
// "Bilgileri Düzenle"; taslakta açık "Kaydet" / "Kaydı Güncelle" (kayıt hiçbir zaman sessizce değişmez).

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { runInEffect } from "@/lib/runInEffect";
import type { BridgeResult, BusinessNameResult, ChaldeanResult, ChartResult, CompatibilityResult, DailyResult, DualResult, PersonalDayResult } from "@/lib/numeroloji-klasik/model";
import type { PersonReportGroup } from "@/lib/numeroloji-klasik/report/types";
import { METHOD_LABELS } from "@/lib/numeroloji-klasik/labels";
import { foldName } from "@/lib/numeroloji-klasik/oracle/text";
import { API_BASE, apiRequest, errorMessage, type ApiErr } from "../../_lib/api";
import { ClientLinkAction, LinkedClientLine } from "../../_ui/ClientLink";
import { editHref, type ResultSource, type StoredDraft } from "../../_lib/draft";
import { DraftSaveBar } from "../../_ui/DraftSaveBar";
import type { Entitlements } from "../../_lib/types";
import { KIND_LABELS, fmtBirth, fmtDateTime, fmtIsoDay, num, rec, str, techniqueLabel } from "../../_lib/format";
import type { AnalysisResponse, AnalysisView } from "../../_lib/types";
import { Alert, Icon, Shell, Skeleton, SkeletonGrid } from "../../_ui/kit";
import { BridgesPanel, CorePanel, DualPanel, KaldePanel, KarmicPanel, LettersPanel, SummaryPanel, TimingPanel, type PersonData } from "../../_ui/result/person";
import { StonesPanel } from "../../_ui/result/stones";
import { ReportPanel } from "../../_ui/result/report";
import { BusinessPanel, NamesPanel, RelationshipPanel } from "../../_ui/result/other";

type Tab = { id: string; label: string; render: (active: boolean) => ReactNode };

const CRUMBS_BASE = [
  { href: "/numeroloji-merkezi", label: "Numeroloji Merkezi" },
  { href: "/numeroloji-klasik", label: "Klasik Numeroloji" },
];

function birthOf(v: unknown): PersonData["birth"] {
  const r = rec(v);
  const y = num(r?.year);
  const m = num(r?.month);
  const d = num(r?.day);
  return y !== null && m !== null && d !== null ? { year: y, month: m, day: d } : null;
}

function as<T>(v: unknown, probe: string): T | null {
  const r = rec(v);
  return r && probe in r ? (v as T) : null;
}

export default function ResultClient({ id }: { id: string }) {
  const [state, setState] = useState<{ loading: boolean; a: AnalysisView | null; error: ApiErr | null }>({ loading: true, a: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    runInEffect(() => setState({ loading: true, a: null, error: null }));
    void apiRequest<AnalysisResponse>(`${API_BASE}/analyses/${encodeURIComponent(id)}`, { signal: ac.signal }).then((r) => {
      if (r.ok) setState({ loading: false, a: r.data.analysis, error: null });
      else if ((r as ApiErr).code !== "ABORTED") setState({ loading: false, a: null, error: r as ApiErr });
    });
    return () => ac.abort();
  }, [id, attempt]);

  if (state.loading) {
    return (
      <Shell crumbs={[...CRUMBS_BASE, { label: "Analiz Sonucu" }]}>
        <div style={{ marginTop: 14 }}><Skeleton lines={2} label="Analiz yükleniyor…" /></div>
        <div style={{ marginTop: 14 }}><SkeletonGrid count={3} /></div>
      </Shell>
    );
  }
  if (!state.a) {
    const e = state.error;
    const notFound = e?.status === 404;
    return (
      <Shell crumbs={[...CRUMBS_BASE, { label: "Analiz Sonucu" }]}>
        <Alert
          tone="error"
          title={notFound ? "Analiz bulunamadı" : "Analiz açılamadı"}
          action={notFound ? <Link className="nk-btn nk-sm" href="/numeroloji-klasik/kayitlar">Kayıtlara dön</Link> : <button type="button" className="nk-btn nk-sm" onClick={() => setAttempt((x) => x + 1)}>Tekrar dene</button>}
        >
          {notFound ? "Bu analiz silinmiş olabilir ya da size ait değildir." : e ? errorMessage(e) : "Beklenmeyen bir durum oluştu."}
        </Alert>
      </Shell>
    );
  }
  return <ResultView a={state.a} mode={{ type: "saved" }} onUpdated={(a) => setState({ loading: false, a, error: null })} />;
}

export type ResultMode = { type: "saved" } | { type: "draft"; draft: StoredDraft };

export function ResultView({ a, mode, onUpdated }: { a: AnalysisView; mode: ResultMode; onUpdated?: (a: AnalysisView) => void }) {
  const isDraft = mode.type === "draft";
  const source: ResultSource = useMemo(() => (mode.type === "draft" ? { draft: mode.draft } : { analysisId: a.id }), [mode, a.id]);
  const [ent, setEnt] = useState<Entitlements | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    void apiRequest<Entitlements>(`${API_BASE}/entitlements`, { signal: ac.signal }).then((r) => { if (r.ok) setEnt(r.data); });
    return () => ac.abort();
  }, []);
  const res = a.result ?? {};
  const input = rec(a.input);
  const failed = a.meta.failed ?? [];

  const person: PersonData | null = useMemo(() => {
    if (a.kind !== "person") return null;
    const res = a.result ?? {};
    const input = rec(a.input);
    return {
      chart: as<ChartResult>(res.chart, "core"),
      bridge: as<BridgeResult>(res.bridge, "lifePathExpression"),
      personalDay: as<PersonalDayResult>(res.personal_day, "personalDay"),
      daily: as<DailyResult>(res.daily, "number"),
      chaldean: as<ChaldeanResult>(res.chaldean, "destiny"),
      dual: as<DualResult>(res.dual, "pythagorean"),
      referenceDate: a.meta.referenceDate ?? str(input?.targetDate),
      birth: birthOf(input?.birth),
    };
  }, [a]);

  const tabs: Tab[] = [];
  const reportAvail: PersonReportGroup[] = [];
  let heading = a.title || KIND_LABELS[a.kind] || "Analiz";
  const meta: ReactNode[] = [];
  const badges: ReactNode[] = [];
  let reportSub = "";

  if (person) {
    const c = person.chart;
    const nm = str(input?.fullName) ?? c?.profile.name ?? "";
    heading = nm || heading;
    const folded = foldName(nm).words.map((w) => w.letters.join("")).join(" ");
    meta.push(<span key="b">Doğum <b>{fmtBirth(input?.birth)}</b></span>);
    if (person.referenceDate) meta.push(<span key="t">Hedef tarih <b>{fmtIsoDay(person.referenceDate)}</b></span>);
    if (folded) meta.push(<span key="f">Hesap yazımı <b>{folded}</b></span>);
    if (c) badges.push(<span key="py" className="nk-badge nk-ice">{METHOD_LABELS.pythagorean}</span>);
    if (person.chaldean) badges.push(<span key="ch" className="nk-badge nk-ice">{METHOD_LABELS.chaldean}</span>);
    badges.push(<span key="m" className="nk-badge">Usta sayı korunur · 11 · 22 · 33</span>);
    reportSub = `${nm} · ${fmtBirth(input?.birth)}`;

    if (c || person.chaldean) tabs.push({ id: "ozet", label: "Özet", render: () => <SummaryPanel d={person} /> });
    if (c) {
      tabs.push({ id: "cekirdek", label: "Pisagor Çekirdek", render: () => <CorePanel c={c} /> });
      tabs.push({ id: "karmik", label: "Karmik", render: () => <KarmicPanel c={c} /> });
    }
    if (c || person.personalDay || person.daily) tabs.push({ id: "zamanlama", label: "Zamanlama", render: () => <TimingPanel d={person} /> });
    if (person.bridge) tabs.push({ id: "kopruler", label: "Köprüler", render: () => <BridgesPanel b={person.bridge as BridgeResult} /> });
    if (c && (c.nameLetters.cornerstone || c.nameLetters.capstone || c.nameLetters.firstVowel)) tabs.push({ id: "harfler", label: "İsim Harfleri", render: () => <LettersPanel c={c} /> });
    if (person.chaldean) tabs.push({ id: "kalde", label: "Kalde", render: () => <KaldePanel k={person.chaldean as ChaldeanResult} /> });
    if (person.dual) tabs.push({ id: "iki", label: "İki Sistem", render: () => <DualPanel dual={person.dual as DualResult} chart={c} chaldean={person.chaldean} /> });
    if (c) tabs.push({ id: "taslar", label: "Taşlar", render: (active) => <StonesPanel source={source} active={active} chart={c} /> });

    if (c) reportAvail.push("core", "karmic", "timing");
    else if (person.personalDay || person.daily) reportAvail.push("timing");
    if (person.bridge) reportAvail.push("bridge");
    if (c) reportAvail.push("name_letters", "hidden_subconscious");
    if (c?.birthDayProfile) reportAvail.push("birthday_profile");
    if (c) reportAvail.push("maturity");
    if (person.chaldean) reportAvail.push("chaldean");
    if (person.dual) reportAvail.push("dual");
    if (c?.luckyAssociations) reportAvail.push("lucky");
    if (c) reportAvail.push("stones");
  } else if (a.kind === "relationship") {
    const comp = as<CompatibilityResult>(res.compatibility, "overallScore");
    const p1 = rec(input?.person1);
    const p2 = rec(input?.person2);
    const n1 = str(p1?.fullName) ?? "1. kişi";
    const n2 = str(p2?.fullName) ?? "2. kişi";
    heading = a.title || `${n1} & ${n2}`;
    meta.push(<span key="1">{n1} <b>{fmtBirth(p1?.birth)}</b></span>, <span key="2">{n2} <b>{fmtBirth(p2?.birth)}</b></span>);
    badges.push(<span key="py" className="nk-badge nk-ice">{METHOD_LABELS.pythagorean}</span>);
    reportSub = `${n1} ↔ ${n2}`;
    if (comp) tabs.push({ id: "uyum", label: "Uyum", render: () => <RelationshipPanel r={comp} names={[n1, n2]} /> });
  } else if (a.kind === "business") {
    const biz = as<BusinessNameResult>(res.business_name, "rating");
    const nm = str(input?.name) ?? biz?.name ?? "";
    heading = a.title || nm;
    meta.push(<span key="n">İşletme adı <b>{nm}</b></span>);
    badges.push(<span key="ch" className="nk-badge nk-ice">{METHOD_LABELS.chaldean}</span>);
    reportSub = nm;
    if (biz) tabs.push({ id: "isletme", label: "İşletme Adı", render: () => <BusinessPanel b={biz} /> });
  } else if (a.kind === "names") {
    const cands = Array.isArray(input?.candidates) ? (input?.candidates as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const items = Object.keys(res)
      .filter((k) => /^dual#\d+$/.test(k))
      .sort((x, y) => Number(x.slice(5)) - Number(y.slice(5)))
      .map((k) => ({ label: k, d: as<DualResult>(res[k], "pythagorean") }))
      .filter((x): x is { label: string; d: DualResult } => !!x.d);
    const failedNames = failed.map((f) => /^dual#(\d+)$/.exec(f)).filter((m): m is RegExpExecArray => !!m).map((m) => cands[Number(m[1]) - 1] ?? `${m[1]}. aday`);
    meta.push(<span key="c">{cands.length} aday</span>);
    badges.push(<span key="py" className="nk-badge nk-ice">{METHOD_LABELS.pythagorean}</span>, <span key="ch" className="nk-badge nk-ice">{METHOD_LABELS.chaldean}</span>);
    reportSub = cands.join(" · ");
    if (items.length) tabs.push({ id: "adaylar", label: "Adaylar", render: () => <NamesPanel items={items} failed={failedNames} /> });
  }
  if (isDraft) meta.push(<span key="k">Hesaplandı <b>{fmtDateTime(a.createdAt)}</b></span>);
  else meta.push(<span key="k">Kayıt <b>{fmtDateTime(a.createdAt)}</b></span>);
  if (a.clientId) meta.push(<LinkedClientLine key="cl" clientId={a.clientId} />);
  tabs.push({ id: "rapor", label: "Rapor", render: () => <ReportPanel source={source} kind={a.kind} title={heading} subtitle={reportSub} available={reportAvail} /> });

  const ids = tabs.map((t) => t.id).join("|");
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? "rapor");
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (h && ids.split("|").includes(h)) runInEffect(() => setActiveTab(h));
  }, [ids]);
  const editLink = mode.type === "draft" ? editHref(a.kind, { draftKey: mode.draft.key }) : editHref(a.kind, { analysisId: a.id });

  return (
    <Shell crumbs={isDraft ? [...CRUMBS_BASE, { label: "Analiz Sonucu" }] : [...CRUMBS_BASE, { href: "/numeroloji-klasik/kayitlar", label: "Kayıtlı Analizler" }, { label: "Analiz Sonucu" }]}>
      <header className="nk-card nk-result-head" style={{ marginTop: 14 }}>
        <span className="nk-avatar"><Icon name="user" /></span>
        <div style={{ minWidth: 0 }}>
          <h1 className="nk-person-name" data-testid="result-title">{heading}</h1>
          <p className="nk-person-meta">{meta}</p>
          <div className="nk-badges" style={{ marginTop: 8 }}>
            <span className="nk-badge">{KIND_LABELS[a.kind] ?? "Analiz"}</span>
            {isDraft ? <span className="nk-badge nk-warn" data-testid="draft-badge">Kaydedilmedi</span> : null}
            {badges}
          </div>
          {!isDraft && onUpdated ? <ClientLinkAction analysis={a} canLink={!!ent?.canLinkClients} onSaved={onUpdated} /> : null}
        </div>
        <div className="nk-btn-row">
          <Link className="nk-btn" href={editLink} data-testid="edit-inputs"><Icon name="edit" />Bilgileri Düzenle</Link>
          {!isDraft && a.kind === "person" ? (
            <Link className="nk-btn" href={`/numeroloji-karsilastirma?classicId=${encodeURIComponent(a.id)}&sekme=${encodeURIComponent(activeTab)}`} data-testid="compare-link"><Icon name="compare" />Karşılaştır</Link>
          ) : null}
        </div>
      </header>
      {mode.type === "draft" ? <DraftSaveBar draft={mode.draft} activeTab={activeTab} canWrite={ent ? ent.canWrite && !ent.isDemo : true} /> : null}

      {(a.result as { futureYearsView?: { restricted?: boolean } } | null)?.futureYearsView?.restricted ? (
        <Alert tone="info" title="Gelecek dönemler gizli">
          “Gelecek Yılları Göster” izniniz olmadığı için içinde bulunulan yıldan sonra başlayan dönemler ve gelecek yıla ait zamanlama sonuçları gösterilmiyor.
        </Alert>
      ) : null}
      {a.status === "partial" ? (
        <Alert tone="warn" title="Kısmi sonuç">
          Bazı teknikler hesaplanamadı; diğer bölümler eksiksizdir.
          {failed.length ? <ul data-testid="partial-list">{[...new Set(failed.map(techniqueLabel))].map((x) => <li key={x}>{x}</li>)}</ul> : null}
        </Alert>
      ) : null}

      <Tabs tabs={tabs} active={activeTab} onSelect={setActiveTab} />
    </Shell>
  );
}

function Tabs({ tabs, active, onSelect }: { tabs: Tab[]; active: string; onSelect: (id: string) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function select(id: string, focus: boolean) {
    onSelect(id);
    try {
      window.history.replaceState(window.history.state, "", `#${id}`);
    } catch {
      /* yok say */
    }
    const el = refs.current[id];
    if (focus) el?.focus();
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    let n: number | null = null;
    if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
    if (e.key === "ArrowLeft") n = (i - 1 + tabs.length) % tabs.length;
    if (e.key === "Home") n = 0;
    if (e.key === "End") n = tabs.length - 1;
    if (n !== null) {
      e.preventDefault();
      select(tabs[n].id, true);
    }
  }

  return (
    <>
      <div className="nk-tabbar-wrap">
        <div className="nk-tabbar" role="tablist" aria-label="Analiz bölümleri">
          {tabs.map((t, i) => (
            <button key={t.id} ref={(el) => { refs.current[t.id] = el; }} className="nk-tab" role="tab" type="button" id={`nk-tab-${t.id}`} aria-controls={`nk-p-${t.id}`}
              aria-selected={active === t.id} tabIndex={active === t.id ? 0 : -1} onClick={() => select(t.id, false)} onKeyDown={(e) => onKey(e, i)} data-testid={`tab-${t.id}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tabs.map((t) => (
        <section key={t.id} className="nk-tabpanel" id={`nk-p-${t.id}`} role="tabpanel" aria-labelledby={`nk-tab-${t.id}`} hidden={active !== t.id} tabIndex={0}>
          {t.render(active === t.id)}
        </section>
      ))}
    </>
  );
}
