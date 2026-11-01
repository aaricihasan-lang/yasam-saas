"use client";

/**
 * Ücretsiz analiz — gerçek ziyaretçi deneyimi (KM-3). Görünüm Owner önizlemesiyle AYNI ortak bileşendir
 * (app/_campaign/VisitorCampaignView). Hesap YALNIZ sunucuda yapılır (/api/kampanya/analiz); istemci sayacı yoktur.
 * Girdi bu cihazda formda kalır; sunucu kaydetmez. İstek kimliği (requestId) ağ tekrarında aynen gönderilir (çift harcama yok).
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ResultBlock, VisitorCampaignState, VisitorField, VisitorResult, VisitorTechnique } from "@/lib/campaign/visitor/types";
import { VisitorCampaignSection, VisitorCampaignView, type VisitorView } from "@/app/_campaign/VisitorCampaignView";

const PKG_FEATURES = [
  { id: "moon", name: "Ay Fazları", by: "month" },
  { id: "retro", name: "Retro Takvimi", by: "month" },
  { id: "hours", name: "Gezegen Saatleri", by: "datePlace" },
  { id: "power", name: "Güçlü Günler", by: "month" },
  { id: "transits", name: "Transitler", by: "date" },
  { id: "hacamat", name: "Hacamat Takvimi", by: "month" },
] as const;
const PKG_TOKEN_KEY = "km_paket_v1";

function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}xx`;
}

function toView(s: VisitorCampaignState): VisitorView {
  if (s.state === "kapali") return { state: "kapali", slogan: "", altSlogan: "", description: "", affirmation: "", ctaText: "", imageSrc: null, startsLabel: null, modules: [] };
  return {
    state: s.state,
    slogan: s.slogan,
    altSlogan: s.altSlogan,
    description: s.description,
    affirmation: s.affirmation,
    ctaText: s.ctaText,
    imageSrc: s.imageSrc,
    startsLabel: s.startsAt ? new Date(s.startsAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : null,
    modules: s.modules.map((m) => ({
      module: m.module,
      title: m.title,
      visitorShort: m.visitorShort,
      img: m.img,
      techniques: m.techniques.map((t) => ({
        key: t.key, name: t.visitorName, small: t.key === "kozmik:paket" ? "Altı özellik tek pakette — kayıt gerekmez" : t.formLabel,
        remaining: t.remaining, total: t.total, ipDaily: t.ipDaily, features: t.key === "kozmik:paket" ? PKG_FEATURES.map((f) => f.name) : undefined,
      })),
    })),
  };
}

export default function VisitorApp({ initial }: { initial: VisitorCampaignState }) {
  const [state, setState] = useState<VisitorCampaignState>(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const view = useMemo(() => toView(state), [state]);
  const tech: VisitorTechnique | null = useMemo(() => {
    if (state.state === "kapali" || !selected) return null;
    for (const m of state.modules) for (const t of m.techniques) if (t.key === selected) return t;
    return null;
  }, [state, selected]);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/kampanya/durum", { cache: "no-store", credentials: "same-origin" });
      const b = (await r.json().catch(() => null)) as { ok?: boolean; state?: VisitorCampaignState } | null;
      if (r.ok && b?.ok && b.state) setState(b.state);
    } catch {
      /* durum yenilenemezse mevcut görünüm kalır */
    }
  }, []);

  function pick(key: string) {
    setSelected(key);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      formRef.current?.querySelector<HTMLElement>("input, select, textarea, [role=tab]")?.focus({ preventScroll: true });
    });
  }
  function cta() {
    const first = state.state === "aktif" ? state.modules[0]?.techniques.find((t) => t.remaining > 0) : null;
    if (first) pick(first.key);
    else document.getElementById("vzMods")?.scrollIntoView({ behavior: "smooth" });
  }

  const closedNote = (
    <div className="vzClosed" role="status">
      <h2 className="vzCampTitle" style={{ fontSize: 24 }}>Şu anda açık ücretsiz analiz kampanyası yok</h2>
      <p className="vzSub">Yeni kampanyalar duyurulduğunda bu sayfada yer alır. Yaşam Sistemi&apos;ni 3 gün ücretsiz deneyebilirsiniz.</p>
      <div className="vzCtaRow"><a className="vzBtn" href="/register">3 Gün Ücretsiz Deneyin →</a><Link className="vzBtn glass" href="/">Ana sayfa</Link></div>
    </div>
  );

  return (
    <main className="vzPage">
      <VisitorCampaignView
        v={view}
        headerRight={<><Link className="vzLogin" href="/">Giriş</Link><a className="vzBtn sm vzGold" href="/register">3 Gün Ücretsiz Deneyin</a></>}
        section={
          state.state === "aktif" ? (
            <VisitorCampaignSection v={view} onPick={pick} selected={selected} onCta={cta}>
              <div ref={formRef}>
                {tech && (tech.key === "kozmik:paket" ? <PackagePanel key={tech.key} tech={tech} onDone={refresh} /> : <TechniquePanel key={tech.key} tech={tech} moduleTitle={state.modules.find((m) => m.module === tech.module)?.title ?? ""} onDone={refresh} />)}
              </div>
            </VisitorCampaignSection>
          ) : undefined
        }
      />
      {state.state === "kapali" && <div className="vzWrap" style={{ marginTop: -8 }}>{closedNote}</div>}
    </main>
  );
}

type Submit = { busy: boolean; error: string | null; errors: Record<string, string>; result: VisitorResult | null };

async function postAnalysis(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: { result?: VisitorResult; error?: string; errors?: Record<string, string> | null; packageToken?: string | null; code?: string } | null }> {
  try {
    const res = await fetch("/api/kampanya/analiz", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store", body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    return { ok: res.ok && data?.ok === true, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin." } };
  }
}

function TechniquePanel({ tech, moduleTitle, onDone }: { tech: VisitorTechnique; moduleTitle: string; onDone: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [st, setSt] = useState<Submit>({ busy: false, error: null, errors: {}, result: null });
  const reqId = useRef<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const hp = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (st.busy) return;
    const errors: Record<string, string> = {};
    for (const f of tech.fields) if (f.required && !f.localOnly && !String(vals[f.k] ?? "").trim()) errors[f.k] = "Bu alan zorunlu.";
    if (Object.keys(errors).length) return setSt((s) => ({ ...s, errors, error: "Lütfen işaretli alanları doldurun." }));
    reqId.current = reqId.current ?? newRequestId();
    setSt({ busy: true, error: null, errors: {}, result: null });
    const input: Record<string, string> = {};
    for (const f of tech.fields) if (!f.localOnly && String(vals[f.k] ?? "").trim()) input[f.k] = String(vals[f.k]).trim();
    const r = await postAnalysis({ technique: tech.key, requestId: reqId.current, input, website: hp.current?.value ?? "" });
    if (r.ok && r.data?.result) {
      reqId.current = null;
      setSt({ busy: false, error: null, errors: {}, result: r.data.result });
      onDone();
      requestAnimationFrame(() => { resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); resultRef.current?.focus({ preventScroll: true }); });
      return;
    }
    // Ağ hatası / 409 (sürüyor) → aynı istek kimliğiyle tekrar denenebilir; kesin ret → yeni kimlik.
    if (r.status !== 0 && r.status !== 409) reqId.current = null;
    setSt({ busy: false, error: r.data?.error ?? "Analiz yapılamadı.", errors: r.data?.errors ?? {}, result: null });
    if (r.status === 429 || r.status === 403) onDone();
  }

  if (st.result) return <ResultView result={st.result} moduleTitle={moduleTitle} innerRef={resultRef} onBack={() => setSt({ busy: false, error: null, errors: {}, result: null })} />;
  const errCount = Object.keys(st.errors).length;
  return (
    <form className="vzForm" id="vzForm" noValidate onSubmit={submit} aria-labelledby="vzFormT" data-form={tech.key}>
      <p className="vzEyebrow">{moduleTitle}</p>
      <h4 id="vzFormT">{tech.visitorName}</h4>
      <p className="vzSub vzFormLead">{tech.formLabel}. <span className="small">* zorunlu alan</span></p>
      {(st.error || errCount > 0) && <div className="vzErrSum" role="alert">{st.error}{errCount > 1 ? ` (${errCount} alan)` : ""}</div>}
      <div className="vzFormGrid">
        {tech.fields.map((f) => <FieldInput key={f.k} f={f} value={vals[f.k] ?? ""} error={st.errors[f.k]} onChange={(v) => setVals((x) => ({ ...x, [f.k]: v }))} />)}
      </div>
      <label className="vzHp" aria-hidden="true">Web sitesi<input ref={hp} name="website" tabIndex={-1} autoComplete="off" /></label>
      <div className="vzFormFoot">
        <span className="vzBusy" aria-live="polite">{st.busy ? "Analiz hazırlanıyor…" : `Bugün kalan ücretsiz kontenjan: ${tech.remaining}`}</span>
        <button type="submit" className="vzBtn sm" disabled={st.busy}>{st.busy ? "Hazırlanıyor…" : "Ücretsiz analizi başlat"}</button>
      </div>
    </form>
  );
}

function PackagePanel({ tech, onDone }: { tech: VisitorTechnique; onDone: () => void }) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
  const [feature, setFeature] = useState<(typeof PKG_FEATURES)[number]["id"]>("moon");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [date, setDate] = useState(today);
  const [place, setPlace] = useState("");
  const [st, setSt] = useState<Submit>({ busy: false, error: null, errors: {}, result: null });
  const [token, setToken] = useState<string | null>(null);
  const reqId = useRef<string | null>(null);
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    try {
      const t = sessionStorage.getItem(PKG_TOKEN_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (t) setToken(t);
    } catch {
      /* özel pencere: belirteç tutulmaz, ilk istekte yeni paket oturumu açılır */
    }
  }, []);

  const f = PKG_FEATURES.find((x) => x.id === feature)!;
  async function load(nextFeature = feature, overrides: { month?: string; date?: string; place?: string } = {}) {
    if (st.busy) return;
    const ff = PKG_FEATURES.find((x) => x.id === nextFeature)!;
    const input: Record<string, string> = { feature: nextFeature };
    if (ff.by === "month") input.month = overrides.month ?? month;
    else input.date = overrides.date ?? date;
    const pl = overrides.place ?? place;
    if (ff.by === "datePlace" && pl) input.place = pl;
    reqId.current = reqId.current ?? newRequestId();
    setSt((s) => ({ ...s, busy: true, error: null, errors: {} }));
    let r = await postAnalysis({ technique: tech.key, requestId: reqId.current, input, packageToken: token });
    if (!r.ok && token && r.status === 403) {
      // Belirteç süresi doldu / geçersiz → yeni paket oturumu (yeni rezervasyon).
      try { sessionStorage.removeItem(PKG_TOKEN_KEY); } catch { /* yoksay */ }
      reqId.current = newRequestId();
      r = await postAnalysis({ technique: tech.key, requestId: reqId.current, input, packageToken: null });
    }
    if (r.status !== 0 && r.status !== 409) reqId.current = null;
    if (r.ok && r.data?.result) {
      if (r.data.packageToken && r.data.packageToken !== token) {
        setToken(r.data.packageToken);
        try { sessionStorage.setItem(PKG_TOKEN_KEY, r.data.packageToken); } catch { /* yoksay */ }
        onDone();
      }
      setSt({ busy: false, error: null, errors: {}, result: r.data.result });
    } else {
      setSt({ busy: false, error: r.data?.error ?? "Takvim yüklenemedi.", errors: r.data?.errors ?? {}, result: null });
    }
  }

  function onTabKey(e: React.KeyboardEvent, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const n = PKG_FEATURES[(i + (e.key === "ArrowRight" ? 1 : PKG_FEATURES.length - 1)) % PKG_FEATURES.length];
    setFeature(n.id);
    tabs.current[n.id]?.focus();
  }

  return (
    <div className="vzResult vzPkgView" id="vzForm" aria-labelledby="vzPkgT" data-form="kozmik:paket">
      <p className="vzEyebrow">Kozmik Takvim · ücretsiz paket</p>
      <h4 id="vzPkgT">Kozmik Takvim</h4>
      <div className="pTabs" role="tablist" aria-label="Kozmik Takvim özellikleri">
        {PKG_FEATURES.map((x, i) => (
          <button key={x.id} ref={(el) => { tabs.current[x.id] = el; }} role="tab" type="button" className="pTab" id={`pt-${x.id}`} aria-selected={x.id === feature} aria-controls="pp-panel" tabIndex={x.id === feature ? 0 : -1}
            onClick={() => { setFeature(x.id); setSt((s) => ({ ...s, result: null, error: null })); }} onKeyDown={(e) => onTabKey(e, i)}>{x.name}</button>
        ))}
      </div>
      <div className="pPanel" role="tabpanel" id="pp-panel" aria-labelledby={`pt-${feature}`}>
        <div className="vzFormGrid">
          {f.by === "month" ? (
            <div className="vzF"><label htmlFor="pf-month">Ay</label><input id="pf-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
          ) : (
            <div className="vzF"><label htmlFor="pf-date">Tarih</label><input id="pf-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          )}
          {f.by === "datePlace" && <LocationInput id="pf-place" label="Şehir (boşsa İstanbul)" value={place} onChange={setPlace} error={st.errors.place} />}
        </div>
        {st.error && <div className="vzErrSum" role="alert">{st.error}</div>}
        <div className="vzFormFoot">
          <span className="vzBusy" aria-live="polite">{st.busy ? "Hesaplanıyor…" : token ? "Paket oturumunuz açık (2 saat)." : `Bugün kalan ücretsiz kontenjan: ${tech.remaining}`}</span>
          <button type="button" className="vzBtn sm" disabled={st.busy} onClick={() => void load()}>{token ? "Göster" : "Paketi aç ve göster"}</button>
        </div>
        {f.id === "hacamat" && <p className="small muted pNeutral">Takvim bilgisi amaçlıdır; tıbbi tavsiye veya sağlık iddiası içermez.</p>}
        {st.result && <ResultBlocks result={st.result} />}
      </div>
    </div>
  );
}

function FieldInput({ f, value, error, onChange }: { f: VisitorField; value: string; error?: string; onChange: (v: string) => void }) {
  const id = `vf-${f.k}`;
  if (f.type === "location") return <LocationInput id={id} label={`${f.label}${f.required ? " *" : ""}`} value={value} onChange={onChange} error={error} hint={f.hint} />;
  const a = { id, name: f.k, "aria-required": f.required || undefined, "aria-invalid": error ? true : undefined, "aria-describedby": error ? `${id}-e` : f.hint ? `${id}-h` : undefined } as const;
  let input: React.ReactNode;
  if (f.type === "select") input = <select {...a} value={value} onChange={(e) => onChange(e.target.value)}><option value="">Seçin</option>{(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
  else if (f.type === "textarea") input = <textarea {...a} value={value} maxLength={f.maxLength} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />;
  else input = <input {...a} type={f.type === "number" ? "number" : f.type} inputMode={f.type === "number" ? "numeric" : undefined} min={f.min} max={f.max} maxLength={f.maxLength} placeholder={f.placeholder} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" />;
  return (
    <div className={`vzF ${f.type === "textarea" ? "wide" : ""}`}>
      <label htmlFor={id}>{f.label}{f.required ? <span aria-hidden="true"> *</span> : null}</label>
      {input}
      {f.hint && !error && <span className="small muted" id={`${id}-h`}>{f.hint}</span>}
      {error && <span className="vzErr" id={`${id}-e`}>{error}</span>}
    </div>
  );
}

/** Erişilebilir konum seçici (datalist KULLANILMAZ — Android tarayıcı uyumu). Değer: konum kimliği. */
function LocationInput({ id, label, value, onChange, error, hint }: { id: string; label: string; value: string; onChange: (id: string) => void; error?: string; hint?: string }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<{ id: string; label: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) return;
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/kampanya/konum?q=${encodeURIComponent(q.trim())}`, { cache: "no-store" });
        const b = (await r.json().catch(() => null)) as { ok?: boolean; results?: { id: string; label: string }[] } | null;
        setItems(b?.results ?? []);
        setActive(0);
        setOpen(true);
      } catch {
        setItems([]);
      }
    }, 220);
  }, [q]);
  function choose(it: { id: string; label: string }) {
    onChange(it.id);
    setQ(it.label);
    setOpen(false);
  }
  return (
    <div className="vzF vzLoc">
      <label htmlFor={id}>{label}</label>
      <input
        id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" autoComplete="off" placeholder="İl, ilçe ya da şehir yazın"
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-e` : undefined}
        aria-activedescendant={open && items[active] ? `${id}-o${active}` : undefined}
        value={q} onChange={(e) => { setQ(e.target.value); if (value) onChange(""); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          else if (e.key === "Enter") { e.preventDefault(); choose(items[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && items.length > 0 && (
        <ul className="vzLocList" role="listbox" id={`${id}-list`}>
          {items.map((it, i) => <li key={it.id} id={`${id}-o${i}`} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); choose(it); }}>{it.label}</li>)}
        </ul>
      )}
      {hint && !error && <span className="small muted">{hint}</span>}
      {value && !error && <span className="small muted">Seçildi ✓</span>}
      {error && <span className="vzErr" id={`${id}-e`}>{error}</span>}
    </div>
  );
}

function Block({ b }: { b: ResultBlock }) {
  const cls = `vzResBlock ${"kind" in b && b.kind === "yorum" ? "yorum" : ""}`;
  if (b.type === "kv") return <div className={cls}><h5>{b.title}</h5><dl className="vzKv">{b.rows.map(([k, v], i) => <div key={i} style={{ display: "contents" }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div>;
  if (b.type === "text") return <div className={cls} data-kind={b.kind}><h5>{b.title}</h5><p className="vzPre">{b.text}</p></div>;
  if (b.type === "list") return <div className={cls} data-kind={b.kind ?? "veri"}><h5>{b.title}</h5><ul className="vzNotes">{b.items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>;
  return (
    <div className={cls}>
      <h5>{b.title}</h5>
      {b.rows.length ? (
        <div className="vzTableWrap"><table className="vzTable"><thead><tr>{b.head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} data-l={b.head[j]}>{c}</td>)}</tr>)}</tbody></table></div>
      ) : <p className="small muted">Kayıt yok.</p>}
    </div>
  );
}

function ResultBlocks({ result }: { result: VisitorResult }) {
  return (
    <>
      <div className="vzResGrid" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>{result.blocks.map((b, i) => <Block key={i} b={b} />)}</div>
      {result.notes.length > 0 && <ul className="vzNotes">{result.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
    </>
  );
}

function ResultView({ result, moduleTitle, onBack, innerRef }: { result: VisitorResult; moduleTitle: string; onBack: () => void; innerRef: React.RefObject<HTMLDivElement | null> }) {
  function download() {
    if (!result.report) return;
    const bin = atob(result.report.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = result.report.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  return (
    <div className="vzResult" id="vzResult" tabIndex={-1} ref={innerRef} aria-labelledby="vzResT" data-comments={result.commentsShown ? "on" : "off"}>
      <p className="vzEyebrow">{moduleTitle} · ücretsiz analiz sonucu</p>
      <h4 id="vzResT">{result.title}</h4>
      {result.subtitle && <p className="vzSub">{result.subtitle}</p>}
      <ResultBlocks result={result} />
      <div className="vzFormFoot vzReport">
        <button type="button" className="vzBtn sm glass" onClick={onBack}>← Yeni analiz</button>
        {result.report && <button type="button" className="vzBtn sm" onClick={download}>Word raporunu indir</button>}
      </div>
    </div>
  );
}
