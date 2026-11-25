"use client";

// Klasik Numeroloji · analiz formları (kişi / ilişki / işletme / isim seçenekleri).
// İstemci doğrulaması lib/numeroloji-klasik/input.ts kurallarının AYNISIDIR (aynı fonksiyonlar çağrılır);
// sunucu yine de kendi doğrulamasını yapar. Kredi / maliyet göstergesi YOK.
// 30.10.2026 owner kararı: "Hesapla" KAYIT OLUŞTURMAZ — POST /hesapla → sonuç bu sekmede taslak olarak açılır
// (/numeroloji-klasik/taslak?t=<rastgele anahtar>); kayıt yalnız sonuç ekranındaki açık "Kaydet" ile.
// "Bilgileri Düzenle": ?taslak=<anahtar> (kaydedilmemiş sonuç) ya da ?kayit=<analiz kimliği> ile form dolu açılır;
// "Yeniden Hesapla" yine kayıt oluşturmaz / mevcut kaydı değiştirmez.

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { runInEffect } from "@/lib/runInEffect";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
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
import { NumerolojiTarihInput } from "@/components/numeroloji/NumerolojiTarihInput";
import { API_BASE, apiRequest, errorMessage, errorMessageEn, type ApiErr } from "../_lib/api";
import { isDraftKey, loadDraft, saveDraft, type DraftResponse, type DraftSource } from "../_lib/draft";
import { istanbulToday, parseTrDate, toIso } from "../_lib/format";
import type { AnalysisResponse, Entitlements } from "../_lib/types";
import type { ClassicAnalysisRequest } from "@/lib/numeroloji-klasik/input";
import { Alert, Hero, Shell } from "./kit";
import { ClientPickerCompact, clientBirthTr, clientDisplayName, fetchClient, useLinkedClient, type LinkedClient } from "./ClientLink";
import "./nkm-form.css";

type Errors = Record<string, string>;
type Birth = { year: number; month: number; day: number };
/** next-intl çevirici (form: "numerology.classic.form", doğrulama: "numerology.classic.validation"). */
type Tr = ReturnType<typeof useTranslations>;

/** Ekran metinleri katalogdan (TR değerleri önceki sabitlerle birebir). `label` verilmezse "Doğum tarihi". */
function parseBirthField(raw: string, field: string, errors: Errors, t: Tr, label?: string): Birth | null {
  const lb = label ?? t("birthLabel");
  if (!raw.trim()) {
    errors[field] = t("errRequired", { label: lb });
    return null;
  }
  const d = parseTrDate(raw);
  if (!d) {
    errors[field] = t("errFormat", { label: lb });
    return null;
  }
  if (d.year < 1900 || d.year > 2100) {
    errors[field] = t("errYear");
    return null;
  }
  if (d.month < 1 || d.month > 12) {
    errors[field] = t("errMonth");
    return null;
  }
  if (d.day < 1 || d.day > daysInMonth(d.year, d.month)) {
    errors[field] = t("errDay");
    return null;
  }
  return d;
}

/**
 * Ad doğrulaması (lib/numeroloji-klasik/input — DEĞİŞMEZ). TR: doğrulayıcının Türkçe metni birebir.
 * EN (`tVal` verilirse): doğrulayıcı metni yerine katalog (boş / geçersiz ayrımı girdinin YAPISINDAN, metinden değil).
 */
function nameError(v: string, field: string, errors: Errors, business = false, tVal?: Tr): string | null {
  const r = business ? canonicalBusinessName(v, field) : canonicalName(v, field);
  if (!r.ok) {
    errors[field] = tVal
      ? tVal(v.trim() ? (business ? "businessNameInvalid" : "nameInvalid") : (business ? "businessNameRequired" : "nameRequired"))
      : r.error;
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

function useSubmit(source: DraftSource | null) {
  const t = useTranslations("numerology.classic.form");
  const tErr = useTranslations("numerology.classic.apiErrors");
  const isTr = useLocale() === DEFAULT_LOCALE;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [serverField, setServerField] = useState<{ field: string; error: string } | null>(null);
  async function submit(body: unknown) {
    setBusy(true);
    setApiError(null);
    setServerField(null);
    // Yalnız HESAP: kalıcı analiz kaydı oluşmaz; sonuç bu sekmede taslak olarak açılır.
    const r = await apiRequest<DraftResponse>(`${API_BASE}/hesapla`, { method: "POST", json: body });
    if (r.ok) {
      const key = saveDraft(r.data.draft, source);
      if (key) {
        router.push(`/numeroloji-klasik/taslak?t=${encodeURIComponent(key)}`);
        return;
      }
      setBusy(false);
      setApiError(t("errStorage"));
      return;
    }
    setBusy(false);
    const e = r as ApiErr;
    // TR: sunucu metni birebir; EN: dil-bağımsız kod → katalog.
    setApiError(isTr ? errorMessage(e) : errorMessageEn(e, tErr));
  }
  return { busy, apiError, serverField, setApiError, setServerField, submit };
}

// ── Bilgileri Düzenle: formu mevcut analiz bilgileriyle doldurma ───────────────────────────────
type EditSeed = { request: ClassicAnalysisRequest; source: DraftSource | null; client: LinkedClient | null; backHref: string };

/** Düzenleme tohumu hata kodu → numerology.classic.form.<anahtar> (metin çizimde çözülür; dil değişimi isteği tetiklemez). */
type EditSeedError = "editMissingDraft" | "editMissingRecord";

/** ?taslak= (kaydedilmemiş sonuç) ya da ?kayit= (kayıtlı analiz) → form tohumu. Tür uyuşmazsa yok sayılır. */
function useEditSeed(kind: ClassicKind): { seed: EditSeed | null; loading: boolean; error: EditSeedError | null } {
  const [st, setSt] = useState<{ seed: EditSeed | null; loading: boolean; error: EditSeedError | null }>({ seed: null, loading: true, error: null });
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const tk = sp.get("taslak");
    const kid = sp.get("kayit");
    let alive = true;
    const done = (seed: EditSeed | null, error: EditSeedError | null = null) => { if (alive) setSt({ seed, loading: false, error }); };
    const withClient = async (req: ClassicAnalysisRequest, source: DraftSource | null, backHref: string) => {
      let client: LinkedClient | null = null;
      if (req.clientId) {
        const c = await fetchClient(req.clientId);
        if (c.ok) client = c.client;
      }
      done({ request: req, source, client, backHref });
    };
    if (isDraftKey(tk)) {
      const d = loadDraft(tk);
      if (d && d.request.kind === kind) void withClient(d.request, d.source, `/numeroloji-klasik/taslak?t=${encodeURIComponent(tk)}`);
      else done(null, "editMissingDraft");
    } else if (kid && /^[0-9a-f-]{36}$/i.test(kid)) {
      void apiRequest<AnalysisResponse>(`${API_BASE}/analyses/${encodeURIComponent(kid)}`).then((r) => {
        if (!r.ok) return done(null, "editMissingRecord");
        const a = r.data.analysis;
        if (a.kind !== kind) return done(null, null);
        const req = { kind: a.kind, title: a.title, clientId: a.clientId, techniques: a.techniques, input: a.input } as ClassicAnalysisRequest;
        void withClient(req, { id: a.id, rowVersion: a.rowVersion, title: a.title }, `/numeroloji-klasik/analiz/${encodeURIComponent(a.id)}`);
      });
    } else {
      done(null);
    }
    return () => { alive = false; };
  }, [kind]);
  return st;
}

function isoToTr(iso: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}
function birthToTr(b: { year: number; month: number; day: number } | undefined): string {
  return b ? `${String(b.day).padStart(2, "0")}.${String(b.month).padStart(2, "0")}.${b.year}` : "";
}

function EditNotice({ seed, error }: { seed: EditSeed | null; error: EditSeedError | null }) {
  const t = useTranslations("numerology.classic.form");
  if (error) return <Alert tone="info">{t(error)}</Alert>;
  if (!seed) return null;
  const b = (c: ReactNode) => <b>{c}</b>;
  return (
    <Alert tone="info" title={t("editTitle")}>
      {seed.source ? t.rich("editSource", { title: seed.source.title, b }) : t.rich("editNew", { b })}
    </Alert>
  );
}

function EntitlementNotice({ ent }: { ent: Entitlements | null }) {
  const t = useTranslations("numerology.classic.form");
  if (!ent) return null;
  if (ent.isDemo) return <Alert tone="warn" title={t("demoTitle")}>{t("demoBody")}</Alert>;
  if (!ent.canCompute) return <Alert tone="warn" title={t("closedTitle")}>{t("closedBody")}</Alert>;
  return null;
}

function FieldError({ id, msg }: { id: string; msg?: string }) {
  if (!msg) return null;
  return <p className="nk-field-error" id={id} role="alert">{msg}</p>;
}

function TextField({
  id, label, value, onChange, error, hint, placeholder, inputMode, autoComplete = "off", optional, date, children,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string; hint?: ReactNode; placeholder?: string;
  inputMode?: "numeric" | "text"; autoComplete?: string; optional?: boolean;
  /** 30.10.2026: Numeroloji tarih standardı — GG.AA.YYYY, yazarken noktalar otomatik (ortak bileşen). */
  date?: boolean; children?: ReactNode;
}) {
  const t = useTranslations("numerology.classic.form");
  const hintId = `${id}-ipucu`;
  const errId = `${id}-hata`;
  const described = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="nk-field">
      <label htmlFor={id}>
        {label} {optional ? <span className="nk-muted" style={{ fontWeight: 500 }}>{t("optional")}</span> : null}
      </label>
      {date ? (
        <NumerolojiTarihInput
          className="nk-input"
          id={id}
          value={value}
          onChange={onChange}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
        />
      ) : (
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
      )}
      {hint ? <p className="nk-hint" id={hintId}>{hint}</p> : null}
      <FieldError id={errId} msg={error} />
      {children}
    </div>
  );
}

function LatinPreview({ name, label }: { name: string; label?: string }) {
  const t = useTranslations("numerology.classic.form");
  const f = useMemo(() => foldName(name), [name]);
  return (
    <>
      <div className="nk-preview-latin" aria-live="polite" aria-label={label ?? t("latinLabel")} data-testid="latin-preview">
        {f.words.length ? f.words.map((w, i) => <span key={`${w.display}-${i}`}>{w.letters.join("")}</span>) : <span>—</span>}
      </div>
      {f.dropped.length ? <p className="nk-hint">{t("dropped", { list: [...new Set(f.dropped)].join(" ") })}</p> : null}
    </>
  );
}

function LatinHint() {
  const t = useTranslations("numerology.classic.form");
  return <span>{t.rich("latinHint", { code: (c) => <code>{c}</code> })}</span>;
}

function FormShell({ crumb, title, sub, children }: { crumb: string; title: string; sub: string; children: ReactNode }) {
  const t = useTranslations("numerology.classic.shared");
  return (
    <Shell crumbs={[{ href: "/numeroloji-merkezi", label: t("crumbCentre") }, { href: "/numeroloji-klasik", label: t("crumbClassic") }, { label: crumb }]}>
      <Hero compact eyebrow={t("crumbClassic")} title={title} sub={sub} />
      {children}
    </Shell>
  );
}

function SubmitRow({ busy, editing, backHref }: { busy: boolean; editing?: boolean; backHref?: string }) {
  const t = useTranslations("numerology.classic.form");
  return (
    <div className="nk-form-actions">
      <button className="nk-btn nk-primary" type="submit" disabled={busy} aria-busy={busy} data-testid="form-submit">
        {busy ? t("calculating") : editing ? t("recalc") : t("calc")}
      </button>
      <Link className="nk-btn" href={backHref ?? "/numeroloji-klasik"}>{t("cancel")}</Link>
      {busy ? <span className="nk-sr-only" role="status">{t("calculatingSr")}</span> : null}
    </div>
  );
}

/** İstemci tarafı son kontrol: sunucuyla aynı doğrulayıcı. EN (`tVal` verilirse): Türkçe metin yerine kod → katalog. */
function finalCheck(body: unknown, errors: Errors, tVal?: Tr): boolean {
  const v = validateAnalysisRequest(body);
  if (!v.ok) {
    errors[v.field ?? "_"] = tVal ? (tVal.has(`codes.${v.code}`) ? tVal(`codes.${v.code}`) : tVal("generic")) : v.error;
    return false;
  }
  return true;
}

/** Form bileşenlerinin ortak çeviri araçları. EN'de doğrulayıcı (lib) metinleri yerine katalog (`val`). */
function useFormT() {
  const t = useTranslations("numerology.classic.form");
  const tVal = useTranslations("numerology.classic.validation");
  const isTr = useLocale() === DEFAULT_LOCALE;
  return { t, val: isTr ? undefined : tVal };
}

// ── Kişi ──────────────────────────────────────────────────────────────────────────────────────
/** Teknik anahtarları kanoniktir (istek gövdesi); ad / açıklama: numerology.classic.form.tech.<key>.{name,desc}. */
const PERSON_TECHS: { key: string }[] = [
  { key: "core" },
  { key: "bridge" },
  { key: "personal_day" },
  { key: "daily" },
  { key: "chaldean" },
  { key: "dual" },
];

export function PersonForm() {
  const { t, val } = useFormT();
  const ent = useEntitlements();
  const ed = useEditSeed("person");
  const s = useSubmit(ed.seed?.source ?? null);
  const uid = useId();
  const [fullName, setFullName] = useState("");
  const [birth, setBirth] = useState("");
  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [techs, setTechs] = useState<string[]>(PERSON_TECHS.map((t) => t.key));
  const [errors, setErrors] = useState<Errors>({});
  const cl = useLinkedClient(ent?.canLinkClients);
  const all = techs.length === PERSON_TECHS.length;
  const [techOpen, setTechOpen] = useState(false);
  const seeded = useRef(false);
  useEffect(() => {
    const r = ed.seed?.request;
    if (seeded.current || !r || r.kind !== "person") return;
    seeded.current = true;
    runInEffect(() => {
      setFullName(r.input.fullName);
      setBirth(birthToTr(r.input.birth));
      setTarget(isoToTr(r.input.targetDate));
      setTitle(r.title === r.input.fullName ? "" : r.title);
      const seededTechs = PERSON_TECHS.map((t) => t.key).filter((k) => r.techniques.includes(k));
      setTechs(seededTechs);
      if (seededTechs.length !== PERSON_TECHS.length) setTechOpen(true);
      if (ed.seed?.client) cl.setClient(ed.seed.client);
    });
  }, [ed.seed, cl]);

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
    const nm = nameError(fullName, "input.fullName", er, false, val);
    const b = parseBirthField(birth, "input.birth", er, t);
    let targetIso: string | undefined;
    if (target.trim()) {
      const td = parseBirthField(target, "input.targetDate", er, t, t("targetLabel"));
      if (td) {
        targetIso = toIso(td);
        if (b && isoBeforeBirth(targetIso, b)) er["input.targetDate"] = t("targetBeforeBirth");
        // NK-R3: "Gelecek Yılları Göster" izni yoksa gelecek yıla düşen hedef tarih seçilemez (sunucu da 403 verir).
        else if (ent && ent.canSeeFutureYears === false && td.year > Number(istanbulToday().slice(0, 4))) {
          er["input.targetDate"] = t("futureYears");
        }
      }
    } else if (b && isoBeforeBirth(istanbulToday(), b)) {
      er["input.birth"] = t("prebirth");
    }
    if (!techs.length) {
      er.techniques = t("techRequired");
      setTechOpen(true);
    }
    if ([...title.trim()].length > CLASSIC_TITLE_MAX) er.title = t("titleMax", { max: String(CLASSIC_TITLE_MAX) });
    const body = nm && b
      ? { kind: "person", title: clipTitle(title.trim() || nm), clientId: cl.client?.id ?? null, techniques: techs, input: { fullName: nm, birth: b, ...(targetIso ? { targetDate: targetIso } : {}) } }
      : null;
    if (body && !Object.keys(er).length) finalCheck(body, er, val);
    setErrors(er);
    if (Object.keys(er).length || !body) {
      focusFirstError(uid, er);
      return;
    }
    await s.submit(body);
  }

  return (
    <FormShell crumb={t("person.title")} title={t("person.title")} sub={t("person.sub")}>
      <EntitlementNotice ent={ent} />
      <EditNotice seed={ed.seed} error={ed.error} />
      {s.apiError ? <Alert tone="error" title={t("startFailed")}>{s.apiError}</Alert> : null}
      <form className="nk-form-grid nk-form-compact" noValidate onSubmit={onSubmit} style={{ marginTop: 14 }} data-testid="person-form">
        <section className="nk-card nk-panel nk-person-card" aria-labelledby={`${uid}-kisi`}>
          <h2 className="nk-h2" id={`${uid}-kisi`}>{t("personInfo")}</h2>
          <div className="nk-person-name-field">
            <TextField id={fid(uid, "input.fullName")} label={t("fullName")} value={fullName} onChange={setFullName} error={errors["input.fullName"]} hint={<LatinHint />}>
              <LatinPreview name={fullName} />
            </TextField>
          </div>
          <ClientPickerCompact
            enabled={!!ent?.canLinkClients}
            value={cl.client}
            onChange={cl.setClient}
            error={cl.error}
            onPrefill={(c, auto) => {
              // Seçimde ad / doğum BOŞSA otomatik aktarılır; dolu alan sessizce ezilmez ("Bilgileri aktar" ile açıkça).
              if (!auto || !fullName.trim()) setFullName(clientDisplayName(c));
              const b = clientBirthTr(c.dogum);
              if (b && (!auto || !birth.trim())) setBirth(b);
            }}
          />
          <div className="nk-row2 nk-date-row">
            <TextField id={fid(uid, "input.birth")} label={t("birthLabel")} value={birth} onChange={setBirth} error={errors["input.birth"] ?? errors["input.birth.day"] ?? errors["input.birth.month"] ?? errors["input.birth.year"]} date />
            <TextField id={fid(uid, "input.targetDate")} label={t("targetLabel")} optional value={target} onChange={setTarget} error={errors["input.targetDate"]} date hint={t("person.targetHint")} />
          </div>
          {errors.title ? <FieldError id={`${uid}-title-err`} msg={errors.title} /> : null}
        </section>

        <section className="nk-card nk-panel nk-tech-card" aria-labelledby={`${uid}-teknik`}>
          <h2 className="nk-h2" id={`${uid}-teknik`}>{t("person.techTitle")}</h2>
          {/* 30.10.2026: varsayılan KAPALI kısa seçim çubuğu (tüm teknikler seçili); aç/kapat istek göndermez. */}
          <button
            type="button"
            className="nk-tech-sum"
            aria-expanded={techOpen}
            aria-controls={`${uid}-tech-list`}
            onClick={() => setTechOpen((o) => !o)}
            data-testid="tech-toggle"
          >
            <span className="nk-tech-sum-t">{all ? t("person.techAll") : techs.length ? t("person.techSome") : t("person.techNone")}</span>
            <span className="nk-tech-sum-c" data-testid="tech-count">{t("person.techCount", { n: String(techs.length), total: String(PERSON_TECHS.length) })}</span>
            <span className="nk-tech-chev" aria-hidden="true">▾</span>
          </button>
          <div id={`${uid}-tech-list`} hidden={!techOpen} data-testid="tech-list">
          <fieldset className="nk-toggles" style={{ border: 0, padding: 0, margin: "12px 0 0" }} aria-describedby={errors.techniques && !techs.length ? `${uid}-tech-err` : undefined}>
            <legend className="nk-sr-only">{t("person.techLegend")}</legend>
            <label className="nk-toggle nk-all">
              <input type="checkbox" checked={all} onChange={(e) => setTechs(e.target.checked ? PERSON_TECHS.map((x) => x.key) : [])} data-testid="tech-all" />
              <span className="nk-sw" aria-hidden="true" />
              <span><span className="nk-t-name">{t("person.allName")}</span><br /><span className="nk-t-desc">{t("person.allDesc")}</span></span>
              <span className="nk-t-count">{t("person.groupCount", { n: String(PERSON_TECHS.length) })}</span>
            </label>
            {PERSON_TECHS.map((x) => (
              <label key={x.key} className="nk-toggle">
                <input type="checkbox" checked={techs.includes(x.key)} onChange={(e) => toggle(x.key, e.target.checked)} data-tech={x.key} />
                <span className="nk-sw" aria-hidden="true" />
                <span><span className="nk-t-name">{t(`tech.${x.key}.name`)}</span><br /><span className="nk-t-desc">{t(`tech.${x.key}.desc`)}</span></span>
                <span className="nk-t-count" />
              </label>
            ))}
          </fieldset>
          </div>
          {/* D6-1: "En az bir teknik seçin" yalnız gerçekten hiç teknik seçili değilken görünür (seçim yapılınca kalkar). */}
          <FieldError id={`${uid}-tech-err`} msg={techs.length ? undefined : errors.techniques} />
          {techs.includes("dual") && (!techs.includes("core") || !techs.includes("chaldean")) ? (
            <p className="nk-hint" style={{ marginTop: 8 }}>{t("person.dualHint")}</p>
          ) : null}
          <SubmitRow busy={s.busy} editing={!!ed.seed} backHref={ed.seed?.backHref} />
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
  const { t, val } = useFormT();
  const ent = useEntitlements();
  const ed = useEditSeed("relationship");
  const s = useSubmit(ed.seed?.source ?? null);
  const uid = useId();
  const [p, setP] = useState({ n1: "", b1: "", n2: "", b2: "" });
  const [title, setTitle] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const cl = useLinkedClient(ent?.canLinkClients);
  const seeded = useRef(false);
  useEffect(() => {
    const r = ed.seed?.request;
    if (seeded.current || !r || r.kind !== "relationship") return;
    seeded.current = true;
    runInEffect(() => {
      setP({ n1: r.input.person1.fullName, b1: birthToTr(r.input.person1.birth), n2: r.input.person2.fullName, b2: birthToTr(r.input.person2.birth) });
      setTitle(r.title === `${r.input.person1.fullName} & ${r.input.person2.fullName}` ? "" : r.title);
      if (ed.seed?.client) cl.setClient(ed.seed.client);
    });
  }, [ed.seed, cl]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const er: Errors = {};
    const n1 = nameError(p.n1, "input.person1.fullName", er, false, val);
    const b1 = parseBirthField(p.b1, "input.person1.birth", er, t);
    const n2 = nameError(p.n2, "input.person2.fullName", er, false, val);
    const b2 = parseBirthField(p.b2, "input.person2.birth", er, t);
    if ([...title.trim()].length > CLASSIC_TITLE_MAX) er.title = t("titleMax", { max: String(CLASSIC_TITLE_MAX) });
    const body = n1 && b1 && n2 && b2
      ? { kind: "relationship", title: clipTitle(title.trim() || `${n1} & ${n2}`), clientId: cl.client?.id ?? null, techniques: ["compatibility"], input: { person1: { fullName: n1, birth: b1 }, person2: { fullName: n2, birth: b2 } } }
      : null;
    if (body && !Object.keys(er).length) finalCheck(body, er, val);
    setErrors(er);
    if (Object.keys(er).length || !body) return focusFirstError(uid, er);
    await s.submit(body);
  }

  // 30.10.2026: iki kişi masaüstünde YAN YANA (her kişinin adı + doğum tarihi kendi grubunda), mobilde alt alta;
  // isteğe bağlı danışan seçimi 1. kişinin Doğum tarihi alanının ALTINDA: iki kişinin Ad soyad ve Doğum tarihi
  // alanları aynı yatay hizada kalır, 2. kişiye boşluk / sahte öğe eklenmez (30.10.2026 v2 owner kararı).
  const person = (i: 1 | 2) => (
    <fieldset className="nk-person-block nk-rel-person" data-testid={`rel-person-${i}`}>
      <legend className="nk-h3">{t("relationship.personN", { n: String(i) })}</legend>
      <div style={{ marginTop: 10 }}>
        <TextField id={fid(uid, `input.person${i}.fullName`)} label={t("fullName")} value={i === 1 ? p.n1 : p.n2} onChange={(v) => setP((c) => ({ ...c, [i === 1 ? "n1" : "n2"]: v }))} error={errors[`input.person${i}.fullName`]}>
          <LatinPreview name={i === 1 ? p.n1 : p.n2} />
        </TextField>
      </div>
      <div style={{ marginTop: 12 }}>
        <TextField id={fid(uid, `input.person${i}.birth`)} label={t("birthLabel")} value={i === 1 ? p.b1 : p.b2} onChange={(v) => setP((c) => ({ ...c, [i === 1 ? "b1" : "b2"]: v }))} error={errors[`input.person${i}.birth`] ?? errors[`input.person${i}.birth.day`]} date />
      </div>
      {i === 1 ? (
        <div style={{ marginTop: 12 }}>
          <ClientPickerCompact enabled={!!ent?.canLinkClients} value={cl.client} onChange={cl.setClient} error={cl.error}
            onPrefill={(c, auto) => setP((x) => (auto && x.n1.trim() ? x : { ...x, n1: clientDisplayName(c), b1: clientBirthTr(c.dogum) || x.b1 }))} />
        </div>
      ) : null}
    </fieldset>
  );

  return (
    <FormShell crumb={t("relationship.title")} title={t("relationship.title")} sub={t("relationship.sub")}>
      <EntitlementNotice ent={ent} />
      <EditNotice seed={ed.seed} error={ed.error} />
      {s.apiError ? <Alert tone="error" title={t("startFailed")}>{s.apiError}</Alert> : null}
      <form className="nk-form-grid nk-form-rel" noValidate onSubmit={onSubmit} style={{ marginTop: 14 }} data-testid="relationship-form">
        <section className="nk-card nk-panel" aria-labelledby={`${uid}-kisiler`}>
          <h2 className="nk-h2" id={`${uid}-kisiler`}>{t("personInfo")}</h2>
          <div className="nk-rel-pair">
            {person(1)}
            {person(2)}
          </div>
        </section>
        <section className="nk-card nk-panel nk-rel-actions">
          <div style={{ minWidth: 0 }}>
            <h2 className="nk-h2">{t("relationship.relTitle")}</h2>
            <p className="nk-lead">{t("relationship.relLead")}</p>
            {errors.title ? <FieldError id={`${uid}-title-err`} msg={errors.title} /> : null}
          </div>
          <SubmitRow busy={s.busy} editing={!!ed.seed} backHref={ed.seed?.backHref} />
        </section>
      </form>
    </FormShell>
  );
}

// ── İşletme ───────────────────────────────────────────────────────────────────────────────────
export function BusinessForm() {
  const { t, val } = useFormT();
  const ent = useEntitlements();
  const ed = useEditSeed("business");
  const s = useSubmit(ed.seed?.source ?? null);
  const uid = useId();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const cl = useLinkedClient(ent?.canLinkClients);
  const seeded = useRef(false);
  useEffect(() => {
    const r = ed.seed?.request;
    if (seeded.current || !r || r.kind !== "business") return;
    seeded.current = true;
    runInEffect(() => {
      setName(r.input.name);
      setTitle(r.title === r.input.name ? "" : r.title);
      if (ed.seed?.client) cl.setClient(ed.seed.client);
    });
  }, [ed.seed, cl]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const er: Errors = {};
    const n = nameError(name, "input.name", er, true, val);
    if ([...title.trim()].length > CLASSIC_TITLE_MAX) er.title = t("titleMax", { max: String(CLASSIC_TITLE_MAX) });
    const body = n ? { kind: "business", title: clipTitle(title.trim() || n), clientId: cl.client?.id ?? null, techniques: ["business_name"], input: { name: n } } : null;
    if (body && !Object.keys(er).length) finalCheck(body, er, val);
    setErrors(er);
    if (Object.keys(er).length || !body) return focusFirstError(uid, er);
    await s.submit(body);
  }

  return (
    <FormShell crumb={t("business.title")} title={t("business.title")} sub={t("business.sub")}>
      <EntitlementNotice ent={ent} />
      <EditNotice seed={ed.seed} error={ed.error} />
      {s.apiError ? <Alert tone="error" title={t("startFailed")}>{s.apiError}</Alert> : null}
      <form className="nk-form-grid" noValidate onSubmit={onSubmit} style={{ marginTop: 14 }} data-testid="business-form">
        <section className="nk-card nk-panel nk-person-card">
          <h2 className="nk-h2">{t("business.nameTitle")}</h2>
          <p className="nk-lead">{t("business.charsHint")}</p>
          <div style={{ marginTop: 14 }}>
            <TextField id={fid(uid, "input.name")} label={t("business.nameLabel")} value={name} onChange={setName} error={errors["input.name"]} hint={<LatinHint />}>
              <LatinPreview name={name} />
            </TextField>
          </div>
          <ClientPickerCompact enabled={!!ent?.canLinkClients} value={cl.client} onChange={cl.setClient} error={cl.error} />
          {errors.title ? <FieldError id={`${uid}-title-err`} msg={errors.title} /> : null}
          <SubmitRow busy={s.busy} editing={!!ed.seed} backHref={ed.seed?.backHref} />
        </section>
      </form>
    </FormShell>
  );
}

// ── İsim seçenekleri ──────────────────────────────────────────────────────────────────────────
export function NamesForm() {
  const { t, val } = useFormT();
  const ent = useEntitlements();
  const ed = useEditSeed("names");
  const s = useSubmit(ed.seed?.source ?? null);
  const uid = useId();
  const [cands, setCands] = useState<string[]>(["", ""]);
  const [title, setTitle] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const cl = useLinkedClient(ent?.canLinkClients);
  const seeded = useRef(false);
  useEffect(() => {
    const r = ed.seed?.request;
    if (seeded.current || !r || r.kind !== "names") return;
    seeded.current = true;
    runInEffect(() => {
      setCands(r.input.candidates.length ? [...r.input.candidates] : ["", ""]);
      setTitle(r.title === `İsim seçenekleri: ${r.input.candidates.join(", ")}` ? "" : r.title); // i18n-ignore: varsayılan kayıt başlığı (veri; kayıtlı başlıkla karşılaştırma)
      if (ed.seed?.client) cl.setClient(ed.seed.client);
    });
  }, [ed.seed, cl]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const er: Errors = {};
    const filled = cands.map((c, i) => ({ c, i })).filter((x) => x.c.trim());
    const out: string[] = [];
    const seen = new Set<string>();
    if (!filled.length) er["input.candidates.0"] = t("names.candRequired");
    for (const { c, i } of filled) {
      const n = nameError(c, `input.candidates.${i}`, er, false, val);
      if (!n) continue;
      const k = n.toLocaleLowerCase("tr-TR");
      if (seen.has(k)) er[`input.candidates.${i}`] = t("names.duplicate");
      seen.add(k);
      out.push(n);
    }
    if ([...title.trim()].length > CLASSIC_TITLE_MAX) er.title = t("titleMax", { max: String(CLASSIC_TITLE_MAX) });
    const body = out.length && !Object.keys(er).length
      // i18n-ignore: varsayılan kayıt başlığı (veri; dil bağımsız aynı kalır, düzenlemede karşılaştırılır)
      ? { kind: "names", title: clipTitle(title.trim() || `İsim seçenekleri: ${out.join(", ")}`), clientId: cl.client?.id ?? null, techniques: ["dual"], input: { candidates: out } }
      : null;
    if (body) finalCheck(body, er, val);
    setErrors(er);
    if (Object.keys(er).length || !body) return focusFirstError(uid, er);
    await s.submit(body);
  }

  return (
    <FormShell crumb={t("names.title")} title={t("names.title")} sub={t("names.sub", { max: String(CLASSIC_MAX_CANDIDATES) })}>
      <EntitlementNotice ent={ent} />
      <EditNotice seed={ed.seed} error={ed.error} />
      {s.apiError ? <Alert tone="error" title={t("startFailed")}>{s.apiError}</Alert> : null}
      <form className="nk-form-grid" noValidate onSubmit={onSubmit} style={{ marginTop: 14 }} data-testid="names-form">
        <section className="nk-card nk-panel nk-person-card">
          <h2 className="nk-h2">{t("names.candTitle")}</h2>
          <p className="nk-lead">{t("names.candLead")}</p>
          <div style={{ marginTop: 14 }}>
            {cands.map((c, i) => {
              const id = fid(uid, `input.candidates.${i}`);
              const err = errors[`input.candidates.${i}`];
              return (
                <div key={i} className="nk-field" style={{ marginTop: i ? 10 : 0 }}>
                  <label htmlFor={id}>{t("names.candN", { n: String(i + 1) })}</label>
                  <div className="nk-cand-row">
                    <input className="nk-input" id={id} value={c} autoComplete="off" aria-invalid={err ? true : undefined} aria-describedby={err ? `${id}-hata` : undefined}
                      onChange={(e) => setCands((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))} />
                    {cands.length > 1 ? (
                      <button type="button" className="nk-btn nk-sm" aria-label={t("names.removeAria", { n: String(i + 1) })} onClick={() => setCands((cur) => cur.filter((_, j) => j !== i))}>{t("names.remove")}</button>
                    ) : <span />}
                  </div>
                  <LatinPreview name={c} label={t("names.previewLabel", { n: String(i + 1) })} />
                  <FieldError id={`${id}-hata`} msg={err} />
                </div>
              );
            })}
          </div>
          {cands.length < CLASSIC_MAX_CANDIDATES ? (
            <button type="button" className="nk-btn nk-sm" style={{ marginTop: 12 }} onClick={() => setCands((cur) => [...cur, ""])}>{t("names.add")}</button>
          ) : <p className="nk-hint" style={{ marginTop: 10 }}>{t("names.maxHint", { max: String(CLASSIC_MAX_CANDIDATES) })}</p>}
          <ClientPickerCompact enabled={!!ent?.canLinkClients} value={cl.client} onChange={cl.setClient} error={cl.error} />
          {errors.title ? <FieldError id={`${uid}-title-err`} msg={errors.title} /> : null}
          <SubmitRow busy={s.busy} editing={!!ed.seed} backHref={ed.seed?.backHref} />
        </section>
      </form>
    </FormShell>
  );
}

export type { ClassicKind };
