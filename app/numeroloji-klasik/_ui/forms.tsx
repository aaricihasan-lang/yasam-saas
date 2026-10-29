"use client";

// Klasik Numeroloji · analiz formları (kişi / ilişki / işletme / isim seçenekleri).
// İstemci doğrulaması lib/numeroloji-klasik/input.ts kurallarının AYNISIDIR (aynı fonksiyonlar çağrılır);
// sunucu yine de kendi doğrulamasını yapar. Kredi / maliyet göstergesi YOK.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  CLASSIC_MAX_CANDIDATES,
  CLASSIC_TITLE_MAX,
  canonicalBusinessName,
  canonicalName,
  daysInMonth,
  isoBeforeBirth,
  validateAnalysisRequest,
  type ClassicKind,
} from "@/lib/numeroloji-klasik/input";
import { foldName } from "@/lib/numeroloji-klasik/oracle/text";
import { API_BASE, apiRequest, errorMessage, type ApiErr } from "../_lib/api";
import { istanbulToday, parseTrDate, toIso } from "../_lib/format";
import type { AnalysisResponse, Entitlements } from "../_lib/types";
import { Alert, Hero, Shell } from "./kit";
import { ClientLinkField, clientBirthTr, clientDisplayName, useLinkedClient } from "./ClientLink";

type Errors = Record<string, string>;
type Birth = { year: number; month: number; day: number };

function parseBirthField(raw: string, field: string, errors: Errors, label = "Doğum tarihi"): Birth | null {
  if (!raw.trim()) {
    errors[field] = `${label} gerekli.`;
    return null;
  }
  const d = parseTrDate(raw);
  if (!d) {
    errors[field] = `${label} GG.AA.YYYY biçiminde olmalı.`;
    return null;
  }
  if (d.year < 1900 || d.year > 2100) {
    errors[field] = "Yıl 1900–2100 arasında olmalı.";
    return null;
  }
  if (d.month < 1 || d.month > 12) {
    errors[field] = "Ay 1–12 arasında olmalı.";
    return null;
  }
  if (d.day < 1 || d.day > daysInMonth(d.year, d.month)) {
    errors[field] = "Bu ayda böyle bir gün yok.";
    return null;
  }
  return d;
}

function nameError(v: string, field: string, errors: Errors, business = false): string | null {
  const r = business ? canonicalBusinessName(v, field) : canonicalName(v, field);
  if (!r.ok) {
    errors[field] = r.error;
    return null;
  }
  return r.value;
}

function clipTitle(s: string): string {
  const chars = [...s.replace(/[<>\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim()];
  return chars.length > CLASSIC_TITLE_MAX ? `${chars.slice(0, CLASSIC_TITLE_MAX - 1).join("")}…` : chars.join("");
}

// ── ortak gönderim + hak bilgisi ───────────────────────────────────────────────────────────────
function useEntitlements() {
  const [ent, setEnt] = useState<Entitlements | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    void apiRequest<Entitlements>(`${API_BASE}/entitlements`, { signal: ac.signal }).then((r) => {
      if (r.ok) setEnt(r.data);
    });
    return () => ac.abort();
  }, []);
  return ent;
}

function useSubmit() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [serverField, setServerField] = useState<{ field: string; error: string } | null>(null);
  async function submit(body: unknown) {
    setBusy(true);
    setApiError(null);
    setServerField(null);
    const r = await apiRequest<AnalysisResponse>(`${API_BASE}/analyses`, { method: "POST", json: body });
    if (r.ok) {
      router.push(`/numeroloji-klasik/analiz/${encodeURIComponent(r.data.analysis.id)}`);
      return;
    }
    setBusy(false);
    const e = r as ApiErr;
    setApiError(errorMessage(e));
  }
  return { busy, apiError, serverField, setApiError, setServerField, submit };
}

function EntitlementNotice({ ent }: { ent: Entitlements | null }) {
  if (!ent) return null;
  if (ent.isDemo) return <Alert tone="warn" title="Demo hesap">Demo hesapta yeni analiz hesaplanamaz; kayıtlı örnekleri inceleyebilirsiniz.</Alert>;
  if (!ent.canCompute) return <Alert tone="warn" title="Yeni hesaplama şu an kapalı">Kayıtlı analizlerinizi açmaya ve Word çıktısı almaya devam edebilirsiniz.</Alert>;
  return null;
}

function FieldError({ id, msg }: { id: string; msg?: string }) {
  if (!msg) return null;
  return <p className="nk-field-error" id={id} role="alert">{msg}</p>;
}

function TextField({
  id, label, value, onChange, error, hint, placeholder, inputMode, autoComplete = "off", optional, children,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string; hint?: ReactNode; placeholder?: string;
  inputMode?: "numeric" | "text"; autoComplete?: string; optional?: boolean; children?: ReactNode;
}) {
  const hintId = `${id}-ipucu`;
  const errId = `${id}-hata`;
  const described = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="nk-field">
      <label htmlFor={id}>
        {label} {optional ? <span className="nk-muted" style={{ fontWeight: 500 }}>(isteğe bağlı)</span> : null}
      </label>
      <input
        className="nk-input"
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
      />
      {hint ? <p className="nk-hint" id={hintId}>{hint}</p> : null}
      <FieldError id={errId} msg={error} />
      {children}
    </div>
  );
}

function LatinPreview({ name, label = "Hesapta kullanılacak yazım" }: { name: string; label?: string }) {
  const f = useMemo(() => foldName(name), [name]);
  return (
    <>
      <div className="nk-preview-latin" aria-live="polite" aria-label={label} data-testid="latin-preview">
        {f.words.length ? f.words.map((w, i) => <span key={`${w.display}-${i}`}>{w.letters.join("")}</span>) : <span>—</span>}
      </div>
      {f.dropped.length ? <p className="nk-hint">Hesaba katılmayan harfler: {[...new Set(f.dropped)].join(" ")}</p> : null}
    </>
  );
}

const LATIN_HINT = (
  <span>
    Hesapta Latin yazım kullanılır: <code>Işıl → ISIL</code>, <code>Çağrı → CAGRI</code>.
  </span>
);

function FormShell({ crumb, title, sub, children }: { crumb: string; title: string; sub: string; children: ReactNode }) {
  return (
    <Shell crumbs={[{ href: "/numeroloji-merkezi", label: "Numeroloji Merkezi" }, { href: "/numeroloji-klasik", label: "Klasik Numeroloji" }, { label: crumb }]}>
      <Hero compact eyebrow="Klasik Numeroloji" title={title} sub={sub} />
      {children}
    </Shell>
  );
}

function SubmitRow({ busy, label = "Hesapla" }: { busy: boolean; label?: string }) {
  return (
    <div className="nk-form-actions">
      <button className="nk-btn nk-primary" type="submit" disabled={busy} aria-busy={busy}>
        {busy ? "Hesaplanıyor…" : label}
      </button>
      <Link className="nk-btn" href="/numeroloji-klasik">Vazgeç</Link>
      {busy ? <span className="nk-sr-only" role="status">Hesaplanıyor, lütfen bekleyin.</span> : null}
    </div>
  );
}

/** İstemci tarafı son kontrol: sunucuyla aynı doğrulayıcı. */
function finalCheck(body: unknown, errors: Errors): boolean {
  const v = validateAnalysisRequest(body);
  if (!v.ok) {
    errors[v.field ?? "_"] = v.error;
    return false;
  }
  return true;
}

// ── Kişi ──────────────────────────────────────────────────────────────────────────────────────
const PERSON_TECHS: { key: string; name: string; desc: string }[] = [
  { key: "core", name: "Pisagor Çekirdek Harita", desc: "Yaşam Yolu, İfade, Ruh Güdüsü, Kişilik, Doğum Günü, Olgunluk; karmik dersler ve borçlar; zirveler, zorluklar, kişisel yıl/ay; isim harfleri; uğurlu ilişkiler ve taşlar" },
  { key: "bridge", name: "Köprü Sayıları", desc: "Çekirdek sayılar arasındaki dört köprü" },
  { key: "personal_day", name: "Kişisel Gün", desc: "Hedef tarihe göre kişisel gün" },
  { key: "daily", name: "Günün Sayısı (sembolik)", desc: "Hedef güne ait sembolik sayı ve mesaj; doğum verisinden hesaplanmaz, Kişisel Gün’den ayrıdır" },
  { key: "chaldean", name: "Kalde (Cheiro)", desc: "Kader, ruh, kişilik — bileşik 10–52 ve gezegen" },
  { key: "dual", name: "İki Sistem Karşılaştırması", desc: "Pisagor ↔ Kalde yan yana, uyum işareti" },
];

export function PersonForm() {
  const ent = useEntitlements();
  const s = useSubmit();
  const uid = useId();
  const [fullName, setFullName] = useState("");
  const [birth, setBirth] = useState("");
  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [techs, setTechs] = useState<string[]>(PERSON_TECHS.map((t) => t.key));
  const [errors, setErrors] = useState<Errors>({});
  const cl = useLinkedClient(ent?.canLinkClients);
  const all = techs.length === PERSON_TECHS.length;

  function toggle(k: string, on: boolean) {
    setTechs((cur) => {
      const set = new Set(cur);
      if (on) set.add(k);
      else set.delete(k);
      return PERSON_TECHS.map((t) => t.key).filter((x) => set.has(x));
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const er: Errors = {};
    const nm = nameError(fullName, "input.fullName", er);
    const b = parseBirthField(birth, "input.birth", er);
    let targetIso: string | undefined;
    if (target.trim()) {
      const t = parseBirthField(target, "input.targetDate", er, "Hedef tarih");
      if (t) {
        targetIso = toIso(t);
        if (b && isoBeforeBirth(targetIso, b)) er["input.targetDate"] = "Hedef tarih doğum tarihinden önce olamaz.";
      }
    } else if (b && isoBeforeBirth(istanbulToday(), b)) {
      er["input.birth"] = "Doğum tarihi bugünden sonra olamaz (hedef tarih girin).";
    }
    if (!techs.length) er.techniques = "En az bir teknik seçin.";
    if ([...title.trim()].length > CLASSIC_TITLE_MAX) er.title = `Başlık en fazla ${CLASSIC_TITLE_MAX} karakter olabilir.`;
    const body = nm && b
      ? { kind: "person", title: clipTitle(title.trim() || nm), clientId: cl.client?.id ?? null, techniques: techs, input: { fullName: nm, birth: b, ...(targetIso ? { targetDate: targetIso } : {}) } }
      : null;
    if (body && !Object.keys(er).length) finalCheck(body, er);
    setErrors(er);
    if (Object.keys(er).length || !body) {
      focusFirstError(uid, er);
      return;
    }
    await s.submit(body);
  }

  return (
    <FormShell crumb="Yeni Analiz" title="Yeni Analiz" sub="Danışan bilgilerini girin, hesaplanacak teknikleri seçin.">
      <EntitlementNotice ent={ent} />
      {s.apiError ? <Alert tone="error" title="Analiz başlatılamadı">{s.apiError}</Alert> : null}
      <form className="nk-form-grid" noValidate onSubmit={onSubmit} style={{ marginTop: 14 }} data-testid="person-form">
        <ClientLinkField
          enabled={!!ent?.canLinkClients}
          value={cl.client}
          onChange={cl.setClient}
          error={cl.error}
          onPrefill={(c) => {
            setFullName(clientDisplayName(c));
            const b = clientBirthTr(c.dogum);
            if (b) setBirth(b);
          }}
        />
        <section className="nk-card nk-panel" aria-labelledby={`${uid}-kisi`}>
          <h2 className="nk-h2" id={`${uid}-kisi`}>Kişi bilgileri</h2>
          <p className="nk-lead">Doğum belgesindeki tam ad kullanılır.</p>
          <div style={{ marginTop: 16 }}>
            <TextField id={fid(uid, "input.fullName")} label="Ad soyad" value={fullName} onChange={setFullName} error={errors["input.fullName"]} hint={LATIN_HINT}>
              <LatinPreview name={fullName} />
            </TextField>
          </div>
          <div className="nk-row2" style={{ marginTop: 14 }}>
            <TextField id={fid(uid, "input.birth")} label="Doğum tarihi" value={birth} onChange={setBirth} error={errors["input.birth"] ?? errors["input.birth.day"] ?? errors["input.birth.month"] ?? errors["input.birth.year"]} placeholder="GG.AA.YYYY" inputMode="numeric" />
            <TextField id={fid(uid, "input.targetDate")} label="Hedef tarih" optional value={target} onChange={setTarget} error={errors["input.targetDate"]} placeholder="GG.AA.YYYY" inputMode="numeric" hint="Kişisel yıl / ay / gün bu tarihe göre hesaplanır; boşsa bugün kullanılır." />
          </div>
          <div style={{ marginTop: 14 }}>
            <TextField id={fid(uid, "title")} label="Kayıt başlığı" optional value={title} onChange={setTitle} error={errors.title} hint="Boş bırakılırsa ad soyad kullanılır." />
          </div>
        </section>

        <section className="nk-card nk-panel" aria-labelledby={`${uid}-teknik`}>
          <h2 className="nk-h2" id={`${uid}-teknik`}>Teknik seçimi</h2>
          <p className="nk-lead">Varsayılan: tüm teknikler. İstediğiniz grupları kapatabilirsiniz.</p>
          <fieldset className="nk-toggles" style={{ border: 0, padding: 0, margin: "12px 0 0" }} aria-describedby={errors.techniques ? `${uid}-tech-err` : undefined}>
            <legend className="nk-sr-only">Hesaplanacak teknik grupları</legend>
            <label className="nk-toggle nk-all">
              <input type="checkbox" checked={all} onChange={(e) => setTechs(e.target.checked ? PERSON_TECHS.map((t) => t.key) : [])} data-testid="tech-all" />
              <span className="nk-sw" aria-hidden="true" />
              <span><span className="nk-t-name">Tümü</span><br /><span className="nk-t-desc">Bütün grupları hesapla</span></span>
              <span className="nk-t-count">{PERSON_TECHS.length} grup</span>
            </label>
            {PERSON_TECHS.map((t) => (
              <label key={t.key} className="nk-toggle">
                <input type="checkbox" checked={techs.includes(t.key)} onChange={(e) => toggle(t.key, e.target.checked)} data-tech={t.key} />
                <span className="nk-sw" aria-hidden="true" />
                <span><span className="nk-t-name">{t.name}</span><br /><span className="nk-t-desc">{t.desc}</span></span>
                <span className="nk-t-count" />
              </label>
            ))}
          </fieldset>
          <FieldError id={`${uid}-tech-err`} msg={errors.techniques} />
          {techs.includes("dual") && (!techs.includes("core") || !techs.includes("chaldean")) ? (
            <p className="nk-hint" style={{ marginTop: 8 }}>İki Sistem karşılaştırması için Pisagor çekirdek ve Kalde sonuçları da hesaplanır.</p>
          ) : null}
          <SubmitRow busy={s.busy} />
        </section>
      </form>
    </FormShell>
  );
}

function fid(uid: string, field: string): string {
  return `${uid}-${field.replace(/[^a-zA-Z0-9]/g, "-")}`;
}
function focusFirstError(uid: string, er: Errors) {
  const first = Object.keys(er)[0];
  if (!first) return;
  window.setTimeout(() => {
    const el = document.getElementById(fid(uid, first.replace(/\.(day|month|year)$/, "")));
    el?.focus();
  }, 0);
}

// ── İlişki ────────────────────────────────────────────────────────────────────────────────────
export function RelationshipForm() {
  const ent = useEntitlements();
  const s = useSubmit();
  const uid = useId();
  const [p, setP] = useState({ n1: "", b1: "", n2: "", b2: "" });
  const [title, setTitle] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const cl = useLinkedClient(ent?.canLinkClients);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const er: Errors = {};
    const n1 = nameError(p.n1, "input.person1.fullName", er);
    const b1 = parseBirthField(p.b1, "input.person1.birth", er);
    const n2 = nameError(p.n2, "input.person2.fullName", er);
    const b2 = parseBirthField(p.b2, "input.person2.birth", er);
    if ([...title.trim()].length > CLASSIC_TITLE_MAX) er.title = `Başlık en fazla ${CLASSIC_TITLE_MAX} karakter olabilir.`;
    const body = n1 && b1 && n2 && b2
      ? { kind: "relationship", title: clipTitle(title.trim() || `${n1} & ${n2}`), clientId: cl.client?.id ?? null, techniques: ["compatibility"], input: { person1: { fullName: n1, birth: b1 }, person2: { fullName: n2, birth: b2 } } }
      : null;
    if (body && !Object.keys(er).length) finalCheck(body, er);
    setErrors(er);
    if (Object.keys(er).length || !body) return focusFirstError(uid, er);
    await s.submit(body);
  }

  const person = (i: 1 | 2) => (
    <div className="nk-person-block">
      <h3 className="nk-h3">{i}. kişi</h3>
      <div style={{ marginTop: 10 }}>
        <TextField id={fid(uid, `input.person${i}.fullName`)} label="Ad soyad" value={i === 1 ? p.n1 : p.n2} onChange={(v) => setP((c) => ({ ...c, [i === 1 ? "n1" : "n2"]: v }))} error={errors[`input.person${i}.fullName`]}>
          <LatinPreview name={i === 1 ? p.n1 : p.n2} />
        </TextField>
      </div>
      <div style={{ marginTop: 12 }}>
        <TextField id={fid(uid, `input.person${i}.birth`)} label="Doğum tarihi" value={i === 1 ? p.b1 : p.b2} onChange={(v) => setP((c) => ({ ...c, [i === 1 ? "b1" : "b2"]: v }))} error={errors[`input.person${i}.birth`] ?? errors[`input.person${i}.birth.day`]} placeholder="GG.AA.YYYY" inputMode="numeric" />
      </div>
    </div>
  );

  return (
    <FormShell crumb="İlişki Analizi" title="İlişki Analizi" sub="İki kişinin Yaşam Yolu, İfade ve Ruh Güdüsü uyumu (Pisagor).">
      <EntitlementNotice ent={ent} />
      {s.apiError ? <Alert tone="error" title="Analiz başlatılamadı">{s.apiError}</Alert> : null}
      <form className="nk-form-grid" noValidate onSubmit={onSubmit} style={{ marginTop: 14 }} data-testid="relationship-form">
        <ClientLinkField enabled={!!ent?.canLinkClients} value={cl.client} onChange={cl.setClient} error={cl.error}
          onPrefill={(c) => setP((x) => ({ ...x, n1: clientDisplayName(c), b1: clientBirthTr(c.dogum) || x.b1 }))} />
        <section className="nk-card nk-panel" aria-label="Kişiler">
          {person(1)}
          {person(2)}
        </section>
        <section className="nk-card nk-panel">
          <h2 className="nk-h2">Kayıt</h2>
          <p className="nk-lead">Uyum puanı, çekirdek sayı eşleşmeleri, güçlü yönler ve zorluklar hesaplanır.</p>
          <div style={{ marginTop: 14 }}>
            <TextField id={fid(uid, "title")} label="Kayıt başlığı" optional value={title} onChange={setTitle} error={errors.title} hint="Boş bırakılırsa iki ad kullanılır." />
          </div>
          <SubmitRow busy={s.busy} />
        </section>
      </form>
    </FormShell>
  );
}

// ── İşletme ───────────────────────────────────────────────────────────────────────────────────
export function BusinessForm() {
  const ent = useEntitlements();
  const s = useSubmit();
  const uid = useId();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const cl = useLinkedClient(ent?.canLinkClients);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const er: Errors = {};
    const n = nameError(name, "input.name", er, true);
    if ([...title.trim()].length > CLASSIC_TITLE_MAX) er.title = `Başlık en fazla ${CLASSIC_TITLE_MAX} karakter olabilir.`;
    const body = n ? { kind: "business", title: clipTitle(title.trim() || n), clientId: cl.client?.id ?? null, techniques: ["business_name"], input: { name: n } } : null;
    if (body && !Object.keys(er).length) finalCheck(body, er);
    setErrors(er);
    if (Object.keys(er).length || !body) return focusFirstError(uid, er);
    await s.submit(body);
  }

  return (
    <FormShell crumb="İşletme Numerolojisi" title="İşletme Numerolojisi" sub="Firma ya da marka adının Kalde (Cheiro) sayısı ve geleneksel değerlendirmesi.">
      <EntitlementNotice ent={ent} />
      {s.apiError ? <Alert tone="error" title="Analiz başlatılamadı">{s.apiError}</Alert> : null}
      <form className="nk-form-grid" noValidate onSubmit={onSubmit} style={{ marginTop: 14 }} data-testid="business-form">
        <ClientLinkField enabled={!!ent?.canLinkClients} value={cl.client} onChange={cl.setClient} error={cl.error} />
        <section className="nk-card nk-panel">
          <h2 className="nk-h2">İşletme adı</h2>
          <p className="nk-lead">{"Harf, rakam, boşluk ve ' . , & - kullanılabilir."}</p>
          <div style={{ marginTop: 14 }}>
            <TextField id={fid(uid, "input.name")} label="İşletme / marka adı" value={name} onChange={setName} error={errors["input.name"]} hint={LATIN_HINT}>
              <LatinPreview name={name} />
            </TextField>
          </div>
        </section>
        <section className="nk-card nk-panel">
          <h2 className="nk-h2">Kayıt</h2>
          <div style={{ marginTop: 14 }}>
            <TextField id={fid(uid, "title")} label="Kayıt başlığı" optional value={title} onChange={setTitle} error={errors.title} />
          </div>
          <SubmitRow busy={s.busy} />
        </section>
      </form>
    </FormShell>
  );
}

// ── İsim seçenekleri ──────────────────────────────────────────────────────────────────────────
export function NamesForm() {
  const ent = useEntitlements();
  const s = useSubmit();
  const uid = useId();
  const [cands, setCands] = useState<string[]>(["", ""]);
  const [title, setTitle] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const cl = useLinkedClient(ent?.canLinkClients);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const er: Errors = {};
    const filled = cands.map((c, i) => ({ c, i })).filter((x) => x.c.trim());
    const out: string[] = [];
    const seen = new Set<string>();
    if (!filled.length) er["input.candidates.0"] = "En az bir aday ad girin.";
    for (const { c, i } of filled) {
      const n = nameError(c, `input.candidates.${i}`, er);
      if (!n) continue;
      const k = n.toLocaleLowerCase("tr-TR");
      if (seen.has(k)) er[`input.candidates.${i}`] = "Aynı aday ad iki kez girilmiş.";
      seen.add(k);
      out.push(n);
    }
    if ([...title.trim()].length > CLASSIC_TITLE_MAX) er.title = `Başlık en fazla ${CLASSIC_TITLE_MAX} karakter olabilir.`;
    const body = out.length && !Object.keys(er).length
      ? { kind: "names", title: clipTitle(title.trim() || `İsim seçenekleri: ${out.join(", ")}`), clientId: cl.client?.id ?? null, techniques: ["dual"], input: { candidates: out } }
      : null;
    if (body) finalCheck(body, er);
    setErrors(er);
    if (Object.keys(er).length || !body) return focusFirstError(uid, er);
    await s.submit(body);
  }

  return (
    <FormShell crumb="İsim Seçenekleri" title="İsim Seçenekleri" sub={`En çok ${CLASSIC_MAX_CANDIDATES} aday ad; her biri Pisagor ve Kalde ile ayrı hesaplanır.`}>
      <EntitlementNotice ent={ent} />
      {s.apiError ? <Alert tone="error" title="Analiz başlatılamadı">{s.apiError}</Alert> : null}
      <form className="nk-form-grid" noValidate onSubmit={onSubmit} style={{ marginTop: 14 }} data-testid="names-form">
        <ClientLinkField enabled={!!ent?.canLinkClients} value={cl.client} onChange={cl.setClient} error={cl.error} />
        <section className="nk-card nk-panel">
          <h2 className="nk-h2">Aday adlar</h2>
          <p className="nk-lead">Boş satırlar hesaba katılmaz.</p>
          <div style={{ marginTop: 14 }}>
            {cands.map((c, i) => {
              const id = fid(uid, `input.candidates.${i}`);
              const err = errors[`input.candidates.${i}`];
              return (
                <div key={i} className="nk-field" style={{ marginTop: i ? 10 : 0 }}>
                  <label htmlFor={id}>{i + 1}. aday</label>
                  <div className="nk-cand-row">
                    <input className="nk-input" id={id} value={c} autoComplete="off" aria-invalid={err ? true : undefined} aria-describedby={err ? `${id}-hata` : undefined}
                      onChange={(e) => setCands((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))} />
                    {cands.length > 1 ? (
                      <button type="button" className="nk-btn nk-sm" aria-label={`${i + 1}. adayı kaldır`} onClick={() => setCands((cur) => cur.filter((_, j) => j !== i))}>Kaldır</button>
                    ) : <span />}
                  </div>
                  <LatinPreview name={c} label={`${i + 1}. aday için hesap yazımı`} />
                  <FieldError id={`${id}-hata`} msg={err} />
                </div>
              );
            })}
          </div>
          {cands.length < CLASSIC_MAX_CANDIDATES ? (
            <button type="button" className="nk-btn nk-sm" style={{ marginTop: 12 }} onClick={() => setCands((cur) => [...cur, ""])}>Aday ekle</button>
          ) : <p className="nk-hint" style={{ marginTop: 10 }}>En çok {CLASSIC_MAX_CANDIDATES} aday girilebilir.</p>}
        </section>
        <section className="nk-card nk-panel">
          <h2 className="nk-h2">Kayıt</h2>
          <div style={{ marginTop: 14 }}>
            <TextField id={fid(uid, "title")} label="Kayıt başlığı" optional value={title} onChange={setTitle} error={errors.title} />
          </div>
          <SubmitRow busy={s.busy} />
        </section>
      </form>
    </FormShell>
  );
}

export type { ClassicKind };
