"use client";

// Karşılaştırmalı İnceleme (prototip karsilastirma.html). İki ekolün kayıtları kavram kavram yan yana;
// BİRLEŞİK SAYI HİÇBİR YERDE GÖSTERİLMEZ. Orijinal analizler değişmez; uzman notu ayrı kayıttır.

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { runInEffect } from "@/lib/runInEffect";
import type { AlignRow, Alignment, Relation } from "@/lib/numeroloji-klasik/compare/align";
import { COMPARE_RULES_TR, glossaryEntry, type ConceptKey } from "@/lib/numeroloji-klasik/compare/glossary";
import { LEGACY_MISSING_REASON_TR } from "@/lib/numeroloji-klasik/compare/legacyReader";
import { useLocale, useTranslations } from "next-intl";
import { API_BASE, apiBlob, apiRequest, errorMessage, saveBlob, type ApiErr } from "@/app/numeroloji-klasik/_lib/api";
import { KIND_LABELS, fmtDate, fmtIsoDay, num } from "@/app/numeroloji-klasik/_lib/format";
import type { AlignResponse, ClassicSource, CompareNote, LegacySource, SourcesResponse } from "@/app/numeroloji-klasik/_lib/types";
import { StockBadge, makeStock } from "@/app/numeroloji-klasik/_ui/result/stones";
import { Alert, ConfirmDialog, Hero, Icon, Shell, Skeleton } from "@/app/numeroloji-klasik/_ui/kit";

const K = `${API_BASE}/karsilastirma`;
/** Not metni alanı (sunucu sözleşmesi: body). */
const NOTE_FIELD = "body";
const NOTE_MAX = 8000;

// I18N: ilişki / eksiklik / yuva / yöntem kodları kanoniktir (align.ts, API); yalnız GÖSTERİMİ katalogdan
// (numerology.compare.relation|classicMissing|slot|method.*). Bilinmeyen kod ham haliyle gösterilir (eski davranış).
type T = ReturnType<typeof useTranslations>;
const RELATION_CLS: Record<Relation, string> = {
  same_value: "nk-ok",
  same_root: "nk-ice",
  different: "",
  one_missing: "nk-warn",
  not_comparable: "nk-violet",
};
const CLASSIC_MISSING_KEYS = new Set(["no_result", "field_missing", "not_requested"]);
const SLOT_KEYS = new Set(["bileklik", "kolye", "kutle"]);
const METHOD_KEYS = new Set(["provider_direct", "vibration_exact", "vibration_root", "planet", "pairs_with", "element"]);
const KIND_KEYS = new Set(["person", "relationship", "business", "names"]);
/** EN gösterimi için legacyReader neden kodları (TR metni lib'deki LEGACY_MISSING_REASON_TR'den birebir gelir). */
const LEGACY_MISSING_KEYS = new Set(["no_snapshot", "invalid_snapshot", "unsupported_version", "field_missing", "empty", "unparseable"]);

/** Kaynak dil (tr) mi? TR'de lib/sunucu metinleri birebir gösterilir (r3-ek kural 3/4). */
function useIsTr(): boolean {
  return useLocale() === "tr";
}

const EN_DATE = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Istanbul" });
/** Zaman damgası: TR'de fmtDate (GG.AA.YYYY) birebir; EN'de en-GB (GG/AA/YYYY). */
function showDate(iso: string | null | undefined, isTr: boolean): string {
  if (isTr) return fmtDate(iso);
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : EN_DATE.format(d);
}
/** Takvim günü (YYYY-AA-GG): TR'de fmtIsoDay birebir; EN'de GG/AA/YYYY (saat dilimi yok). */
function showIsoDay(iso: string | null | undefined, isTr: boolean): string {
  if (isTr) return fmtIsoDay(iso);
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}
function kindLabel(kind: string, isTr: boolean, t: T): string {
  if (isTr) return KIND_LABELS[kind] ?? t("analysisFallback");
  return KIND_KEYS.has(kind) ? t(`kinds.${kind}`) : t("analysisFallback");
}

/** Hata kodu → katalog anahtarı (yalnız EN gösterimi; kontrol akışı koda bağlı değildir). */
const ERROR_CODE_KEYS: Record<string, string> = {
  NETWORK: "network",
  RATE_LIMITED: "rateLimited",
  MODULE: "module",
  MODULE_FORBIDDEN: "module",
  MODULE_ACCESS: "module",
  MEMBERSHIP: "membership",
  MEMBERSHIP_INACTIVE: "membership",
  MEMBERSHIP_EXPIRED: "membership",
  CLIENTS_PERMISSION: "clientsPermission",
  CLIENTS_PERMISSION_REQUIRED: "clientsPermission",
  INVALID_CLIENT_ID: "codes.INVALID_CLIENT_ID",
  INVALID_ID: "codes.INVALID_ID",
  SOURCE_REQUIRED: "codes.SOURCE_REQUIRED",
  BODY_TOO_LONG: "codes.BODY_TOO_LONG",
  CLIENT_MISMATCH: "codes.CLIENT_MISMATCH",
  CLIENT_NOT_FOUND: "codes.CLIENT_NOT_FOUND",
  DEMO_READONLY: "codes.DEMO_READONLY",
  DB_ERROR: "codes.DB_ERROR",
  KIND_MISMATCH: "codes.KIND_MISMATCH",
  STONES_NOT_AVAILABLE: "codes.STONES_NOT_AVAILABLE",
};
/**
 * API hatasının ekran metni. TR: errorMessage (sunucunun Türkçe metni birebir). EN: dil-bağımsız `code`'dan
 * çeviri; kod tanınmazsa HTTP durumuna göre, o da yoksa genel hata metni (sunucunun Türkçe metni EN'de gösterilmez).
 */
function errText(e: ApiErr, isTr: boolean, t: T): string {
  if (isTr) return errorMessage(e);
  if (e.status === 0) return t("errors.network");
  if (e.status === 429) return t("errors.rateLimited");
  const key = e.code ? ERROR_CODE_KEYS[e.code] : undefined;
  if (key) return t(`errors.${key}`);
  if (e.status === 401) return t("errors.status401");
  if (e.status === 403) return t("errors.status403");
  if (e.status === 404) return t("errors.status404");
  if (e.status === 409) return t("errors.status409");
  if (e.status === 413) return t("errors.status413");
  if (e.status >= 500) return t("errors.status5xx");
  return t("errors.generic");
}

const noteText = (n: CompareNote) => (typeof n.body === "string" ? n.body : "");
const noteVersion = (n: CompareNote) => n.rowVersion;

/** Analiz sonucundaki sekme kimlikleri (ResultClient) — "Analize Geri Dön" yalnız bunlara döner. */
const RESULT_TABS = new Set(["ozet", "cekirdek", "karmik", "zamanlama", "kopruler", "harfler", "kalde", "iki", "taslar", "rapor"]);

type CompareQuery = { clientId: string | null; legacyId: string | null; classicId: string | null; tab: string | null };
function readQuery(): CompareQuery {
  if (typeof window === "undefined") return { clientId: null, legacyId: null, classicId: null, tab: null };
  const sp = new URLSearchParams(window.location.search);
  const ok = (v: string | null) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v.toLowerCase() : null);
  const tab = sp.get("sekme");
  return { clientId: ok(sp.get("clientId")), legacyId: ok(sp.get("legacyId")), classicId: ok(sp.get("classicId")), tab: tab && RESULT_TABS.has(tab) ? tab : null };
}

/**
 * 30.10.2026: Klasik analizden gelindiyse aynı analizin aynı sekmesine dönüş (yeniden hesap / yeni kayıt YOK;
 * kayıtlı analiz yalnız okunur). Doğrudan bağlantıyla girildiyse güvenli alternatif: Numeroloji Merkezi.
 */
function BackToAnalysis({ q }: { q: CompareQuery }) {
  const t = useTranslations("numerology.compare");
  if (q.classicId) {
    const href = `/numeroloji-klasik/analiz/${encodeURIComponent(q.classicId)}${q.tab ? `#${q.tab}` : ""}`;
    return (
      <div style={{ marginTop: 12 }}>
        <Link className="nk-btn nk-sm" href={href} data-testid="back-to-analysis"><span aria-hidden="true">←</span> {t("back.toAnalysis")}</Link>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 12 }}>
      <Link className="nk-btn nk-sm" href="/numeroloji-merkezi" data-testid="back-to-center"><span aria-hidden="true">←</span> {t("back.toCentre")}</Link>
    </div>
  );
}

/** Türkçe katlama (büyük/küçük harf + aksan) — yalnız ad eşleşme uyarısı için. */
function foldPerson(s: string | null | undefined): string {
  return (s ?? "").toLocaleUpperCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/g, " ").trim();
}

/**
 * 30.10.2026: iki kaydın aynı kişiye ait olduğu doğrulanamıyorsa güvenli uyarı (karşılaştırma engellenmez,
 * kayıtlar değişmez). Tarih okunamıyorsa tarih UYDURULMAZ — yalnız belirtilir.
 */
function PersonMatchNotice({ legacy, classic }: { legacy: { fullName: string; birthDate: string | null } | null; classic: { personName?: string | null; birthDate?: string | null; kind: string } | null }) {
  const t = useTranslations("numerology.compare");
  const isTr = useIsTr();
  if (!legacy || !classic || classic.kind !== "person") return null;
  const lb = legacy.birthDate;
  const cb = classic.birthDate ?? null;
  const nameDiffers = !!classic.personName && foldPerson(classic.personName) !== foldPerson(legacy.fullName);
  if (lb && cb && lb !== cb) {
    return <Alert tone="warn" title={t("person.birthDiffTitle")}>{t("person.birthDiffBody", { legacyDate: showIsoDay(lb, isTr), classicDate: showIsoDay(cb, isTr) })}</Alert>;
  }
  if (!lb) {
    return <Alert tone="info" title={t("person.noBirthTitle")}>{t("person.noBirthBody")}</Alert>;
  }
  if (nameDiffers) {
    return <Alert tone="warn" title={t("person.nameDiffTitle")}>{t("person.nameDiffBody")}</Alert>;
  }
  return null;
}

// ── hücreler ────────────────────────────────────────────────────────────────────────────────────
/** Kulvar satırında hangi değerin karşılaştırıldığı (H1): Bütüncül anahtarı; anahtarı yoksa karşılaştırma yapılmaz. */
function kulvarCompareNote(v: NonNullable<AlignRow["legacy"]>, t: T): string {
  const key = v.extra?.key;
  if (v.extra?.compareBasis !== "anahtar" || typeof key !== "number") return t("legacy.kulvarNoKey");
  // Sayılar ICU sayı biçimine girmesin diye string olarak geçer (TR çıktı birebir).
  return v.root !== null && v.root !== key ? t("legacy.kulvarKeyRoot", { key: String(key), root: String(v.root) }) : t("legacy.kulvarKey", { key: String(key) });
}

function LegacyCell({ r }: { r: AlignRow }) {
  const tCmp = useTranslations("numerology.compare");
  const isTr = useIsTr();
  if (!r.legacy) {
    const reason = r.legacyMissingReason;
    // TR: lib'deki LEGACY_MISSING_REASON_TR birebir (kanonik, harness kilitli); EN: neden kodu → katalog.
    const reasonText = (k: Exclude<typeof reason, null | undefined | "future_hidden">): string =>
      isTr ? LEGACY_MISSING_REASON_TR[k] : LEGACY_MISSING_KEYS.has(k) ? tCmp(`legacyMissing.${k}`) : LEGACY_MISSING_REASON_TR[k];
    return (
      <p className="nk-cmp-missing" data-testid={reason === "not_in_snapshot" ? "not-in-snapshot" : undefined}>
        {reason === "not_in_snapshot" ? tCmp("legacy.notInSnapshot") : reason === "future_hidden" ? tCmp("futureHidden") : reason ? reasonText(reason) : "—"}
      </p>
    );
  }
  const markers = Array.isArray(r.legacy.extra?.markers) ? (r.legacy.extra?.markers as { field?: string; number?: number }[]) : [];
  return (
    <>
      <span className="nk-cmp-val">{r.legacy.display}</span>
      {r.conceptKey === "karmik" ? (
        // "Ana Kulvar" / "Yan Kulvar": Bütüncül Numeroloji teknik adları (glossary etiketleriyle aynı) — çevrilmez.
        <p className="nk-cmp-note">{markers.length ? tCmp("legacy.special19", { fields: markers.map((m) => (m.field === "anaKulvar" ? "Ana Kulvar" : "Yan Kulvar")).join(", ") }) : tCmp("legacy.noSpecial19")}</p>
      ) : r.conceptKey === "ana_kulvar" || r.conceptKey === "yan_kulvar" ? (
        <p className="nk-cmp-note">{kulvarCompareNote(r.legacy, tCmp)}</p>
      ) : r.legacy.root !== null && String(r.legacy.root) !== r.legacy.display ? <p className="nk-cmp-note">{tCmp("legacy.digitRoot", { root: String(r.legacy.root) })}</p> : null}
    </>
  );
}

function ClassicCell({ r }: { r: AlignRow }) {
  const t = useTranslations("numerology.compare");
  const isTr = useIsTr();
  const c = r.classic;
  if (!c) return <p className="nk-cmp-missing">{r.classicMissingReason && CLASSIC_MISSING_KEYS.has(r.classicMissingReason) ? t(`classicMissing.${r.classicMissingReason}`) : "—"}</p>;
  if (r.conceptKey === "karmik") {
    const debt = Array.isArray(c.extra?.debtNumbers) ? (c.extra?.debtNumbers as number[]) : [];
    const miss = Array.isArray(c.extra?.missingNumbers) ? (c.extra?.missingNumbers as number[]) : [];
    return (
      <>
        <span className="nk-cmp-val">{debt.length ? debt.join(" · ") : "—"}</span>
        <p className="nk-cmp-note">{debt.length ? t("classic.karmicDebt") : t("classic.noKarmicDebt")} · {t("classic.missingNumbers", { list: miss.length ? miss.join(", ") : t("classic.none") })}</p>
      </>
    );
  }
  const shown = c.karmicDebt && c.value !== null ? `${c.karmicDebt}/${c.value}` : c.value ?? "—";
  const start = num(c.extra?.startAge);
  const endRaw = c.extra?.endAge;
  const end = num(endRaw);
  const target = typeof c.extra?.targetDate === "string" ? c.extra.targetDate : null;
  return (
    <>
      <span className="nk-cmp-val">{shown}</span>
      <div className="nk-cmp-badges">
        {c.type === "master" ? <span className="nk-badge nk-master">{t("classic.master")}</span> : null}
        {c.karmicDebt ? <span className="nk-badge nk-karmic">{t("classic.karmicDebtN", { n: String(c.karmicDebt) })}</span> : null}
      </div>
      {start !== null ? <p className="nk-cmp-note">{t("classic.age", { range: `${start}${end !== null ? `–${end}` : endRaw === null ? "+" : ""}` })}</p> : null}
      {target ? <p className="nk-cmp-note">{t("classic.targetDate", { date: showIsoDay(target, isTr) })}</p> : null}
    </>
  );
}

// ── açıklama çekmecesi ──────────────────────────────────────────────────────────────────────────
function Drawer({ conceptKey, onClose }: { conceptKey: ConceptKey; onClose: () => void }) {
  const t = useTranslations("numerology.compare");
  // Glossary içerik metinleri (labelTr, *MethodTr, differenceTr) kanonik lib içeriğidir — çevrilmez.
  const g = glossaryEntry(conceptKey);
  const closeRef = useRef<HTMLButtonElement>(null);
  const tid = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <>
      <aside className="nk-drawer nk-open" role="dialog" aria-modal="true" aria-labelledby={tid} data-testid="drawer">
        <div className="nk-drawer-head">
          <h2 className="nk-h2" id={tid}>{t("drawer.title", { label: g.labelTr })}</h2>
          <button ref={closeRef} className="nk-icon-btn" type="button" aria-label={t("drawer.close")} onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="nk-drawer-body">
          <div className="nk-formula nk-fa">
            <p className="nk-label-cap" style={{ color: "#4f2596" }}>{t("schoolA")}</p>
            <p className="nk-h3" style={{ marginTop: 4 }}>{g.legacyLabelTr}</p>
            <p className="nk-num-desc">{g.legacyMethodTr}</p>
          </div>
          <div className="nk-formula nk-fb">
            <p className="nk-label-cap" style={{ color: "#174f8c" }}>{t("schoolB")}</p>
            <p className="nk-h3" style={{ marginTop: 4 }}>{g.classicLabelTr}</p>
            <p className="nk-num-desc">{g.classicMethodTr}</p>
          </div>
          <p className="nk-num-desc">{g.differenceTr}</p>
          <p className="nk-num-desc">{t("drawer.bothCorrect")}</p>
        </div>
      </aside>
      <div className="nk-drawer-back nk-show" aria-hidden="true" onClick={onClose} />
    </>
  );
}

// ── ana bileşen ─────────────────────────────────────────────────────────────────────────────────
export default function CompareClient() {
  const t = useTranslations("numerology.compare");
  const isTr = useIsTr();
  const uid = useId();
  const [query, setQuery] = useState<CompareQuery>({ clientId: null, legacyId: null, classicId: null, tab: null });
  const [queryReady, setQueryReady] = useState(false);
  // 30.10.2026: A (Bütüncül) ve B (Klasik) için AYRI arama — bir tarafın araması yalnız kendi listesini süzer.
  const [qa, setQa] = useState("");
  const [qb, setQb] = useState("");
  const [srcA, setSrcA] = useState<{ loading: boolean; rows: LegacySource[]; error: ApiErr | null }>({ loading: true, rows: [], error: null });
  const [srcB, setSrcB] = useState<{ loading: boolean; rows: ClassicSource[]; error: ApiErr | null }>({ loading: true, rows: [], error: null });
  // Seçili kayıt aramayla listeden süzülse bile seçim korunur (adı burada tutulur).
  const [pickedA, setPickedA] = useState<LegacySource | null>(null);
  const [pickedB, setPickedB] = useState<ClassicSource | null>(null);
  const [legacyId, setLegacyId] = useState<string | null>(null);
  const [classicId, setClassicId] = useState<string | null>(null);
  const [aligning, setAligning] = useState(false);
  const [alignErr, setAlignErr] = useState<ApiErr | null>(null);
  const [al, setAl] = useState<{ alignment: Alignment; stones: AlignResponse["stones"] | null; sources: AlignResponse["sources"] | null; legacyId: string | null; classicId: string | null } | null>(null);
  const [drawer, setDrawer] = useState<ConceptKey | null>(null);
  const [notes, setNotes] = useState<CompareNote[]>([]);
  const [notesErr, setNotesErr] = useState<ApiErr | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<CompareNote | null>(null);
  const [saving, setSaving] = useState(false);
  // Ton dil-bağımsız tutulur; görünür metin kontrol akışına bağlanmaz (eski: noteMsg.startsWith("Değerlendirme kaydedildi")).
  const [noteMsg, setNoteMsg] = useState<{ tone: "ok" | "error"; msg: string } | null>(null);
  const [conflict, setConflict] = useState(false);
  const [toDelete, setToDelete] = useState<CompareNote | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [wordBusy, setWordBusy] = useState(false);
  const [wordErr, setWordErr] = useState<ApiErr | null>(null);
  const [wordNoteId, setWordNoteId] = useState<string>("");
  const closeDrawer = useCallback(() => setDrawer(null), []);

  // NK-R16: yeni arama öncekini iptal eder (eski yanıt yenisinin üstüne yazılmaz); sunucu sınırı 60 karakter.
  // Taraf başına ayrı istek + ayrı iptal: A araması B listesini / seçimini DEĞİŞTİRMEZ (ve tersi).
  const srcAbort = useRef<{ a: AbortController | null; b: AbortController | null }>({ a: null, b: null });
  const loadSide = useCallback(async (side: "a" | "b", term: string, clientId: string | null) => {
    srcAbort.current[side]?.abort();
    const ac = new AbortController();
    srcAbort.current[side] = ac;
    if (side === "a") setSrcA((s) => ({ ...s, loading: true, error: null }));
    else setSrcB((s) => ({ ...s, loading: true, error: null }));
    const sp = new URLSearchParams({ taraf: side });
    if (clientId) sp.set("clientId", clientId);
    const t = term.replace(/[^\p{L}\p{M}\p{N}' -]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
    if (t) sp.set(side === "a" ? "qa" : "qb", t);
    const r = await apiRequest<SourcesResponse>(`${K}/kaynaklar?${sp.toString()}`, { signal: ac.signal });
    if (ac.signal.aborted || (r as ApiErr).code === "ABORTED") return;
    if (side === "a") setSrcA(r.ok ? { loading: false, rows: r.data.legacy ?? [], error: null } : { loading: false, rows: [], error: r as ApiErr });
    else setSrcB(r.ok ? { loading: false, rows: r.data.classic ?? [], error: null } : { loading: false, rows: [], error: r as ApiErr });
  }, []);
  const debounce = useRef<{ a: ReturnType<typeof setTimeout> | null; b: ReturnType<typeof setTimeout> | null }>({ a: null, b: null });
  const searchSide = useCallback((side: "a" | "b", term: string, clientId: string | null, now = false) => {
    const d = debounce.current[side];
    if (d) clearTimeout(d);
    if (now) {
      void loadSide(side, term, clientId);
      return;
    }
    debounce.current[side] = setTimeout(() => void loadSide(side, term, clientId), 300);
  }, [loadSide]);

  useEffect(() => {
    runInEffect(() => {
      const qq = readQuery();
      setQuery(qq);
      setQueryReady(true);
      setLegacyId(qq.legacyId);
      setClassicId(qq.classicId);
      void loadSide("a", "", qq.clientId);
      void loadSide("b", "", qq.clientId);
    });
  }, [loadSide]);

  const loadNotes = useCallback(async (lId: string | null, cId: string | null) => {
    setNotesErr(null);
    const sp = new URLSearchParams();
    if (lId) sp.set("legacyId", lId);
    if (cId) sp.set("classicId", cId);
    const r = await apiRequest<{ ok: true; notes: CompareNote[] }>(`${K}/notlar?${sp.toString()}`);
    if (r.ok) setNotes(Array.isArray(r.data.notes) ? r.data.notes : []);
    else setNotesErr(r as ApiErr);
  }, []);

  async function align() {
    if (!legacyId && !classicId) return;
    setAligning(true);
    setAlignErr(null);
    const body: Record<string, string> = {};
    if (legacyId) body.legacyId = legacyId;
    if (classicId) body.classicId = classicId;
    const r = await apiRequest<AlignResponse>(`${K}/hizala`, { method: "POST", json: body });
    setAligning(false);
    if (r.ok) {
      setAl({ alignment: r.data.alignment, stones: r.data.stones ?? null, sources: r.data.sources ?? null, legacyId, classicId });
      setEditing(null);
      setDraft("");
      setNoteMsg(null);
      setConflict(false);
      void loadNotes(legacyId, classicId);
    } else setAlignErr(r as ApiErr);
  }

  async function saveNote() {
    if (!al) return;
    const text = draft.trim();
    if (!text) return setNoteMsg({ tone: "error", msg: t("notes.empty") });
    // NOTE_MAX string geçer: ICU sayı biçimi TR'de "8.000" üretirdi (eski çıktı "8000").
    if (text.length > NOTE_MAX) return setNoteMsg({ tone: "error", msg: t("notes.tooLong", { max: String(NOTE_MAX) }) });
    setSaving(true);
    setNoteMsg(null);
    setConflict(false);
    const r = editing
      ? await apiRequest<{ ok: true; note: CompareNote }>(`${K}/notlar/${encodeURIComponent(editing.id)}`, { method: "PATCH", json: { [NOTE_FIELD]: text, rowVersion: noteVersion(editing) } })
      : await apiRequest<{ ok: true; note: CompareNote }>(`${K}/notlar`, { method: "POST", json: { legacyId: al.legacyId, classicId: al.classicId, [NOTE_FIELD]: text } });
    setSaving(false);
    if (r.ok) {
      setDraft("");
      setEditing(null);
      setNoteMsg({ tone: "ok", msg: t("notes.saved") });
      void loadNotes(al.legacyId, al.classicId);
      return;
    }
    const e = r as ApiErr;
    if (e.status === 409) {
      setConflict(true);
      return;
    }
    setNoteMsg({ tone: "error", msg: errText(e, isTr, t) });
  }

  async function deleteNote() {
    if (!toDelete || !al) return;
    setDeleting(true);
    const n = toDelete;
    const r = await apiRequest<{ ok: true }>(`${K}/notlar/${encodeURIComponent(n.id)}?rowVersion=${noteVersion(n)}`, { method: "DELETE" });
    setDeleting(false);
    setToDelete(null);
    if (r.ok || (r as ApiErr).status === 404) {
      setNotes((cur) => cur.filter((x) => x.id !== n.id));
      if (editing?.id === n.id) {
        setEditing(null);
        setDraft("");
      }
      setNoteMsg({ tone: "ok", msg: t("notes.deleted") });
      return;
    }
    if ((r as ApiErr).status === 409) return setConflict(true);
    setNoteMsg({ tone: "error", msg: errText(r as ApiErr, isTr, t) });
  }

  async function word() {
    if (!al) return;
    setWordBusy(true);
    setWordErr(null);
    // Rapor sözleşmesi: klasik kayıt analysisId ile gider (server/reportService.ts validateReportRequest).
    const body: Record<string, unknown> = { kind: "comparison" };
    if (al.legacyId) body.legacyId = al.legacyId;
    if (al.classicId) body.analysisId = al.classicId;
    if (wordNoteId) body.noteId = wordNoteId;
    const r = await apiBlob(`${API_BASE}/rapor`, body, "numeroloji-karsilastirma.docx");
    setWordBusy(false);
    if (r.ok) saveBlob(r.blob, r.filename);
    else setWordErr(r as ApiErr);
  }

  const a = al?.alignment ?? null;
  const conceptGroups = a ? a.rows : [];
  const stockOf = makeStock(al?.stones?.classic?.stock ?? {});
  const legacyAssign = al?.stones?.legacyAssignments ?? [];
  const srcL = al?.sources?.legacy ?? null;
  const srcC = al?.sources?.classic ?? null;

  return (
    <Shell theme="compare" crumbs={[{ href: "/numeroloji-merkezi", label: t("crumbCentre") }, { label: t("title") }]}>
      {queryReady ? <BackToAnalysis q={query} /> : null}
      <Hero
        compact
        eyebrow={t("hero.eyebrow")}
        title={t("title")}
        sub={t("hero.sub")}
        aside={<p className="nk-never-merge"><Icon name="lock" />{t("hero.aside")}</p>}
      />

      <section className="nk-card nk-panel" aria-labelledby={`${uid}-secim`}>
        <h2 className="nk-h2" id={`${uid}-secim`}>{t("pick.title")}</h2>
        <p className="nk-lead">{t("pick.lead")}{query.clientId ? t("pick.clientFilter") : ""}</p>
          <div className="nk-pick-grid" style={{ marginTop: 12, gridTemplateColumns: undefined }}>
            <fieldset className="nk-field" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} data-testid="pick-legacy">
              <legend className="nk-flabel" style={{ fontWeight: 700 }}>{t("pick.legendA")}</legend>
              <div className="nk-search-row" role="search" style={{ marginTop: 6 }}>
                <label className="nk-sr-only" htmlFor={`${uid}-qa`}>{t("pick.searchALabel")}</label>
                <input id={`${uid}-qa`} className="nk-input" type="search" value={qa} placeholder={t("pick.searchAPlaceholder")} autoComplete="off" maxLength={60} data-testid="search-a"
                  onChange={(e) => { setQa(e.target.value); searchSide("a", e.target.value, query.clientId); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); searchSide("a", qa, query.clientId, true); } }} />
              </div>
              {srcA.error ? <Alert tone="error">{errText(srcA.error, isTr, t)}</Alert> : null}
              {legacyId && pickedA && !srcA.rows.some((x) => x.id === legacyId) ? <p className="nk-hint" data-testid="picked-a">{t.rich("pick.picked", { name: pickedA.fullName, b: (c) => <b>{c}</b> })}</p> : null}
              {srcA.loading ? <Skeleton lines={3} label={t("pick.loadingA")} /> : (
                <ul className="nk-pick-list">
                  <li><label className="nk-pick nk-pa"><input type="radio" name={`${uid}-a`} checked={legacyId === null} onChange={() => { setLegacyId(null); setPickedA(null); }} /><span>{t("pick.notSelected")}</span></label></li>
                  {srcA.rows.map((x) => (
                    <li key={x.id}>
                      <label className="nk-pick nk-pa">
                        <input type="radio" name={`${uid}-a`} checked={legacyId === x.id} onChange={() => { setLegacyId(x.id); setPickedA(x); }} />
                        <span><span className="nk-pick-title">{x.fullName}</span><br /><span className="nk-pick-meta">{x.birthDate ? `${t("birth", { date: showIsoDay(x.birthDate, isTr) })} · ` : ""}{showDate(x.createdAt, isTr)}</span></span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {!srcA.loading && !srcA.rows.length ? <p className="nk-empty">{qa.trim() ? t("pick.emptyASearch") : t("pick.emptyA")}</p> : null}
            </fieldset>
            <fieldset className="nk-field" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} data-testid="pick-classic">
              <legend className="nk-flabel" style={{ fontWeight: 700 }}>{t("pick.legendB")}</legend>
              <div className="nk-search-row" role="search" style={{ marginTop: 6 }}>
                <label className="nk-sr-only" htmlFor={`${uid}-qb`}>{t("pick.searchBLabel")}</label>
                <input id={`${uid}-qb`} className="nk-input" type="search" value={qb} placeholder={t("pick.searchBPlaceholder")} autoComplete="off" maxLength={60} data-testid="search-b"
                  onChange={(e) => { setQb(e.target.value); searchSide("b", e.target.value, query.clientId); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); searchSide("b", qb, query.clientId, true); } }} />
              </div>
              {srcB.error ? <Alert tone="error">{errText(srcB.error, isTr, t)}</Alert> : null}
              {classicId && pickedB && !srcB.rows.some((x) => x.id === classicId) ? <p className="nk-hint" data-testid="picked-b">{t.rich("pick.picked", { name: pickedB.title || t("untitled"), b: (c) => <b>{c}</b> })}</p> : null}
              {srcB.loading ? <Skeleton lines={3} label={t("pick.loadingB")} /> : (
                <ul className="nk-pick-list">
                  <li><label className="nk-pick nk-pb"><input type="radio" name={`${uid}-b`} checked={classicId === null} onChange={() => { setClassicId(null); setPickedB(null); }} /><span>{t("pick.notSelected")}</span></label></li>
                  {srcB.rows.map((x) => (
                    <li key={x.id}>
                      <label className="nk-pick nk-pb">
                        <input type="radio" name={`${uid}-b`} checked={classicId === x.id} onChange={() => { setClassicId(x.id); setPickedB(x); }} />
                        <span><span className="nk-pick-title">{x.title || t("untitled")}</span><br /><span className="nk-pick-meta">{kindLabel(x.kind, isTr, t)} · {showDate(x.createdAt, isTr)}</span></span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {!srcB.loading && !srcB.rows.length ? <p className="nk-empty">{qb.trim() ? t("pick.emptyBSearch") : <>{t("pick.emptyB")} <Link className="nk-link-btn" href="/numeroloji-klasik/yeni">{t("pick.newAnalysis")}</Link></>}</p> : null}
            </fieldset>
            <div className="nk-field nk-pick-act" style={{ margin: 0, alignContent: "end" }}>
              <button className="nk-btn nk-primary" type="button" onClick={() => void align()} disabled={aligning || (!legacyId && !classicId)} data-testid="align-btn">
                <Icon name="compare" />{aligning ? t("pick.aligning") : t("pick.alignBtn")}
              </button>
              <p className="nk-hint">{t("pick.alignHint")}</p>
            </div>
          </div>
        {alignErr ? <Alert tone="error">{errText(alignErr, isTr, t)}</Alert> : null}
      </section>

      {a ? (
        <>
          {a.missing === "legacy" ? <Alert tone="info">{t("missing.legacy")}</Alert> : null}
          {a.missing === "classic" ? <Alert tone="info">{t("missing.classic")}</Alert> : null}
          {a.legacyMeta.methodologyCurrent === false ? <Alert tone="warn">{t("missing.oldMethod")}</Alert> : null}

          <section className="nk-only-grid" style={{ marginTop: 16 }} aria-label={t("sourcesAria")} data-testid="cmp-sources">
            <div className="nk-card nk-panel nk-only-a">
              <p className="nk-label-cap">{t("schoolA")}</p>
              {srcL ? <><p className="nk-h3" style={{ marginTop: 4 }}>{srcL.fullName}</p><p className="nk-pick-meta">{srcL.birthDate ? t("birth", { date: showIsoDay(srcL.birthDate, isTr) }) : t("birthUnreadable")} · {t("recordDate", { date: showDate(srcL.createdAt, isTr) })}</p></> : <p className="nk-cmp-missing">{t("noRecord")}</p>}
            </div>
            <div className="nk-card nk-panel nk-only-b">
              <p className="nk-label-cap">{t("schoolB")}</p>
              {srcC ? <><p className="nk-h3" style={{ marginTop: 4 }}>{srcC.title || t("untitled")}</p><p className="nk-pick-meta">{kindLabel(srcC.kind, isTr, t)}{srcC.birthDate ? ` · ${t("birth", { date: showIsoDay(srcC.birthDate, isTr) })}` : ""} · {t("recordDate", { date: showDate(srcC.createdAt, isTr) })}</p></> : <p className="nk-cmp-missing">{t("noRecord")}</p>}
            </div>
          </section>
          <PersonMatchNotice legacy={srcL} classic={srcC} />

          <section className="nk-card nk-panel" style={{ marginTop: 16 }} aria-labelledby={`${uid}-kavram`}>
            <h2 className="nk-h2" id={`${uid}-kavram`}>{t("concepts.title")}</h2>
            <p className="nk-lead">{t("concepts.lead")}</p>
            {/* COMPARE_RULES_TR ve r.labelTr / x.labelTr: kanonik glossary içeriği (lib) — çevrilmez. */}
            <ul className="nk-rules">{COMPARE_RULES_TR.map((r) => <li key={r}>{r}</li>)}</ul>
            <div className="nk-cmp" role="table" aria-label={t("concepts.title")} data-testid="align-table">
              <div className="nk-cmp-row nk-cmp-head" role="row">
                <div role="columnheader">{t("concepts.colConcept")}</div><div className="nk-ca" role="columnheader">{t("colA")}</div><div className="nk-cb" role="columnheader">{t("colB")}</div><div role="columnheader">{t("concepts.colStatus")}</div>
              </div>
              {conceptGroups.map((r) => {
                const known = Object.prototype.hasOwnProperty.call(RELATION_CLS, r.relation);
                const rel = known ? { label: t(`relation.${r.relation}`), cls: RELATION_CLS[r.relation] } : { label: r.relation, cls: "" };
                return (
                  <div className="nk-cmp-row" role="row" key={`${r.conceptKey}-${r.position ?? 0}`} data-testid="align-row">
                    <div className="nk-cmp-c" role="rowheader"><span className="nk-cmp-concept">{r.labelTr}</span></div>
                    <div className="nk-ca" role="cell"><span className="nk-cmp-mlabel">{t("colA")}</span><LegacyCell r={r} /></div>
                    <div className="nk-cb" role="cell"><span className="nk-cmp-mlabel">{t("colB")}</span><ClassicCell r={r} /></div>
                    <div className="nk-cmp-s" role="cell">
                      <div className="nk-cmp-badges">
                        <span className={`nk-badge ${rel.cls}`} data-testid="relation-chip">{rel.label}</span>
                        {r.sameNameDifferentFormula ? <span className="nk-badge nk-warn" data-testid="same-name-chip">{t("concepts.sameNameDiff")}</span> : null}
                      </div>
                      <button className="nk-why-btn" type="button" onClick={() => setDrawer(r.conceptKey)} data-testid="why-btn">{t("concepts.why")}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="nk-only-grid" style={{ marginTop: 16 }} aria-label={t("only.aria")}>
            <div className="nk-card nk-panel nk-only-a" data-testid="only-a">
              <h2 className="nk-h2">{t("only.titleA")}</h2>
              <p className="nk-lead" style={{ color: "var(--a-ink-soft)" }}>{t("only.leadA")}</p>
              <div className="nk-chips" style={{ marginTop: 12 }}>
                {a.onlyLegacy.map((x) => <span key={x.key} className={`nk-chip${x.present ? "" : " nk-absent"}`} title={x.present ? t("only.present") : t("only.absent")}>{x.labelTr}{x.present ? "" : t("only.absentSuffix")}</span>)}
              </div>
            </div>
            <div className="nk-card nk-panel nk-only-b" data-testid="only-b">
              <h2 className="nk-h2">{t("only.titleB")}</h2>
              <p className="nk-lead">{t("only.leadB")}</p>
              <div className="nk-chips" style={{ marginTop: 12 }}>
                {a.onlyClassic.map((x) => <span key={x.key} className={`nk-chip${x.present ? "" : " nk-absent"}`} title={x.present ? t("only.present") : t("only.absent")}>{x.labelTr}{x.present ? "" : t("only.absentSuffix")}</span>)}
              </div>
            </div>
          </section>

          <section className="nk-card nk-panel" style={{ marginTop: 16 }} aria-labelledby={`${uid}-tas`}>
            <h2 className="nk-h2" id={`${uid}-tas`}>{t("stones.title")}</h2>
            <p className="nk-lead">{t("stones.lead")}</p>
            <div className="nk-cmp-stones" data-testid="cmp-stones">
              <div className="nk-sa">
                <p className="nk-label-cap">{t("stones.aExpert")}</p>
                {a.stones.legacyAssigned.length ? <ul>{a.stones.legacyAssigned.map((s, i) => <li key={`${s.slot}-${s.name}-${i}`}><span>{s.name}</span><span className="nk-badge">{SLOT_KEYS.has(s.slot) ? t(`slot.${s.slot}`) : s.slot}</span></li>)}</ul> : !legacyAssign.length ? <p className="nk-empty">{t("stones.noStones")}</p> : null}
                {legacyAssign.length ? (
                  <ul data-testid="legacy-assignments">
                    {legacyAssign.map((x) => <li key={`${x.analysisType}-${x.value}`}><span><b>{x.labelTr} {x.value}</b>: {x.stones.join(", ") || "—"}</span></li>)}
                  </ul>
                ) : null}
              </div>
              <div className="nk-sb1">
                <p className="nk-label-cap">{t("stones.bDirect")}</p>
                {a.stones.classicDirect.length ? <ul>{a.stones.classicDirect.map((s, i) => <li key={`${s.input}-${i}`}><span>{s.name}</span>{s.status === "ambiguous" ? <span className="nk-badge nk-warn">{t("stones.ambiguous")}</span> : s.status === "unmatched" ? <span className="nk-badge">{t("stones.unmatched")}</span> : <StockBadge n={stockOf(s.stoneKey, s.name, s.input)} />}</li>)}</ul> : <p className="nk-empty">{t("stones.noSuggestion")}</p>}
              </div>
              <div className="nk-sb2">
                <p className="nk-label-cap">{t("stones.bDerived")}</p>
                {a.stones.classicDerived.length ? <ul>{a.stones.classicDerived.map((s) => <li key={s.stoneKey}><span>{s.name} <StockBadge n={stockOf(s.stoneKey, s.name)} /></span><span className="nk-badges">{s.methods.map((m) => <span key={m} className={`nk-badge${m === "vibration_exact" ? " nk-ice" : ""}`}>{METHOD_KEYS.has(m) ? t(`method.${m}`) : m}</span>)}</span></li>)}</ul> : <p className="nk-empty">{t("stones.noDerived")}</p>}
              </div>
            </div>
            {a.stones.overlap.length ? <p className="nk-hint" style={{ marginTop: 10 }}>{t("stones.overlap", { list: a.stones.overlap.map((o) => o.nameLegacy).join(", ") })}</p> : null}
            <p className="nk-disclaimer"><Icon name="alert" /><span>{t("stones.disclaimer")}</span></p>
          </section>

          <section className="nk-card nk-panel" style={{ marginTop: 16 }} aria-labelledby={`${uid}-uzman`}>
            <h2 className="nk-h2" id={`${uid}-uzman`}>{t("notes.title")}</h2>
            <p className="nk-lead">{t("notes.lead")}</p>
            {notesErr ? <Alert tone="error">{errText(notesErr, isTr, t)}</Alert> : null}
            {notes.length ? (
              <ul className="nk-note-list" data-testid="notes">
                {notes.map((n) => (
                  <li key={n.id} className="nk-note-item">
                    <p className="nk-note-text">{noteText(n)}</p>
                    <div className="nk-btn-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <span className="nk-pick-meta">{showDate(n.updatedAt ?? n.createdAt ?? null, isTr)}</span>
                      <span className="nk-btn-row">
                        <button type="button" className="nk-btn nk-sm" onClick={() => { setEditing(n); setDraft(noteText(n)); setConflict(false); setNoteMsg(null); }}><Icon name="edit" />{t("notes.edit")}</button>
                        <button type="button" className="nk-btn nk-sm" onClick={() => setToDelete(n)}><Icon name="trash" />{t("notes.delete")}</button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            <label className="nk-flabel nk-h3" htmlFor={`${uid}-not`} style={{ display: "block", marginTop: 14 }}>{editing ? t("notes.editLabel") : t("notes.newLabel")}</label>
            <textarea className="nk-editor" id={`${uid}-not`} style={{ marginTop: 8 }} value={draft} maxLength={NOTE_MAX} onChange={(e) => setDraft(e.target.value)} data-testid="note-editor" />
            {conflict ? (
              <Alert tone="warn" action={<button type="button" className="nk-btn nk-sm" onClick={() => { setConflict(false); setEditing(null); void loadNotes(al?.legacyId ?? null, al?.classicId ?? null); }}>{t("notes.refresh")}</button>}>
                {t("notes.conflict")}
              </Alert>
            ) : null}
            {noteMsg ? <Alert tone={noteMsg.tone} live>{noteMsg.msg}</Alert> : null}
            <p className="nk-lock-note"><Icon name="lock" /><span>{t.rich("notes.lock", { b: (c) => <b>{c}</b> })}</span></p>
            <div className="nk-btn-row nk-stretch" style={{ marginTop: 12 }}>
              <button className="nk-btn nk-primary" type="button" onClick={() => void saveNote()} disabled={saving || !draft.trim()} data-testid="note-save"><Icon name="save" />{saving ? t("notes.saving") : editing ? t("notes.saveChange") : t("notes.saveNew")}</button>
              {editing ? <button className="nk-btn" type="button" onClick={() => { setEditing(null); setDraft(""); }}>{t("notes.cancel")}</button> : null}
            </div>
          </section>

          <section className="nk-card nk-panel" style={{ marginTop: 16 }} aria-labelledby={`${uid}-word`}>
            <h2 className="nk-h2" id={`${uid}-word`}>{t("word.title")}</h2>
            <p className="nk-lead">{t("word.lead")}</p>
            {notes.length ? (
              <div className="nk-field" style={{ marginTop: 12 }}>
                <label htmlFor={`${uid}-wn`}>{t("word.noteLabel")}</label>
                <select id={`${uid}-wn`} className="nk-select" value={wordNoteId} onChange={(e) => setWordNoteId(e.target.value)}>
                  <option value="">{t("word.noNote")}</option>
                  {notes.map((n) => <option key={n.id} value={n.id}>{noteText(n).slice(0, 60) || t("word.noteFallback")}</option>)}
                </select>
              </div>
            ) : null}
            {wordErr ? <Alert tone="error">{errText(wordErr, isTr, t)}</Alert> : null}
            <div className="nk-btn-row nk-stretch" style={{ marginTop: 12 }}>
              <button className="nk-btn nk-primary" type="button" onClick={() => void word()} disabled={wordBusy} data-testid="cmp-word"><Icon name="doc" />{wordBusy ? t("word.preparing") : t("word.title")}</button>
            </div>
          </section>
        </>
      ) : null}

      {drawer ? <Drawer conceptKey={drawer} onClose={closeDrawer} /> : null}
      <ConfirmDialog open={toDelete !== null} title={t("confirm.title")} confirmLabel={t("notes.delete")} cancelLabel={t("notes.cancel")} danger busy={deleting} onConfirm={() => void deleteNote()} onCancel={() => setToDelete(null)}>
        <p>{t("confirm.body")}</p>
      </ConfirmDialog>
    </Shell>
  );
}
