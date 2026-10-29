"use client";

// Karşılaştırmalı İnceleme (prototip karsilastirma.html). İki ekolün kayıtları kavram kavram yan yana;
// BİRLEŞİK SAYI HİÇBİR YERDE GÖSTERİLMEZ. Orijinal analizler değişmez; uzman notu ayrı kayıttır.

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { runInEffect } from "@/lib/runInEffect";
import type { AlignRow, Alignment, Relation } from "@/lib/numeroloji-klasik/compare/align";
import { COMPARE_RULES_TR, glossaryEntry, type ConceptKey } from "@/lib/numeroloji-klasik/compare/glossary";
import { LEGACY_MISSING_REASON_TR } from "@/lib/numeroloji-klasik/compare/legacyReader";
import { API_BASE, apiBlob, apiRequest, errorMessage, saveBlob, type ApiErr } from "@/app/numeroloji-klasik/_lib/api";
import { KIND_LABELS, fmtDate, fmtIsoDay, num } from "@/app/numeroloji-klasik/_lib/format";
import type { AlignResponse, ClassicSource, CompareNote, LegacySource, SourcesResponse } from "@/app/numeroloji-klasik/_lib/types";
import { StockBadge, makeStock } from "@/app/numeroloji-klasik/_ui/result/stones";
import { Alert, ConfirmDialog, Hero, Icon, Shell, Skeleton } from "@/app/numeroloji-klasik/_ui/kit";

const K = `${API_BASE}/karsilastirma`;
/** Not metni alanı (sunucu sözleşmesi: body). */
const NOTE_FIELD = "body";
const NOTE_MAX = 8000;

const RELATION: Record<Relation, { label: string; cls: string }> = {
  same_value: { label: "Aynı değer", cls: "nk-ok" },
  same_root: { label: "Aynı kök", cls: "nk-ice" },
  different: { label: "Farklı", cls: "" },
  one_missing: { label: "Bir tarafta yok", cls: "nk-warn" },
  not_comparable: { label: "Karşılaştırılamaz", cls: "nk-violet" },
};

const CLASSIC_MISSING_TR: Record<string, string> = {
  no_result: "Klasik Numeroloji kaydı seçilmedi.",
  field_missing: "Bu bölüm Klasik kayıtta bulunmuyor.",
  not_requested: "Bu teknik Klasik kayıtta hesaplanmadı.",
};

const SLOT_TR: Record<string, string> = { bileklik: "Bileklik", kolye: "Kolye", kutle: "Kütle" };
const METHOD_TR: Record<string, string> = {
  provider_direct: "Harita önerisi",
  vibration_exact: "Titreşim",
  vibration_root: "Kök sayı",
  planet: "Gezegen",
  pairs_with: "Eşlikçi",
  element: "Element",
};

const noteText = (n: CompareNote) => (typeof n.body === "string" ? n.body : "");
const noteVersion = (n: CompareNote) => n.rowVersion;

function readQuery(): { clientId: string | null; legacyId: string | null; classicId: string | null } {
  if (typeof window === "undefined") return { clientId: null, legacyId: null, classicId: null };
  const sp = new URLSearchParams(window.location.search);
  const ok = (v: string | null) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v.toLowerCase() : null);
  return { clientId: ok(sp.get("clientId")), legacyId: ok(sp.get("legacyId")), classicId: ok(sp.get("classicId")) };
}

// ── hücreler ────────────────────────────────────────────────────────────────────────────────────
function LegacyCell({ r }: { r: AlignRow }) {
  if (!r.legacy) {
    const reason = r.legacyMissingReason;
    return (
      <p className="nk-cmp-missing" data-testid={reason === "not_in_snapshot" ? "not-in-snapshot" : undefined}>
        {reason === "not_in_snapshot" ? "Bütüncül Numeroloji kaydında saklanmıyor" : reason ? LEGACY_MISSING_REASON_TR[reason] : "—"}
      </p>
    );
  }
  const markers = Array.isArray(r.legacy.extra?.markers) ? (r.legacy.extra?.markers as { field?: string; number?: number }[]) : [];
  return (
    <>
      <span className="nk-cmp-val">{r.legacy.display}</span>
      {r.conceptKey === "karmik" ? (
        <p className="nk-cmp-note">{markers.length ? `Özel sayı 19: ${markers.map((m) => (m.field === "anaKulvar" ? "Ana Kulvar" : "Yan Kulvar")).join(", ")}` : "Kulvarlarda özel sayı 19 yok"}</p>
      ) : r.legacy.root !== null && String(r.legacy.root) !== r.legacy.display ? <p className="nk-cmp-note">Rakam kökü {r.legacy.root}</p> : null}
    </>
  );
}

function ClassicCell({ r }: { r: AlignRow }) {
  const c = r.classic;
  if (!c) return <p className="nk-cmp-missing">{r.classicMissingReason ? CLASSIC_MISSING_TR[r.classicMissingReason] ?? "—" : "—"}</p>;
  if (r.conceptKey === "karmik") {
    const debt = Array.isArray(c.extra?.debtNumbers) ? (c.extra?.debtNumbers as number[]) : [];
    const miss = Array.isArray(c.extra?.missingNumbers) ? (c.extra?.missingNumbers as number[]) : [];
    return (
      <>
        <span className="nk-cmp-val">{debt.length ? debt.join(" · ") : "—"}</span>
        <p className="nk-cmp-note">Karmik borç{debt.length ? "" : " yok"} · eksik sayılar: {miss.length ? miss.join(", ") : "yok"}</p>
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
        {c.type === "master" ? <span className="nk-badge nk-master">Usta sayı</span> : null}
        {c.karmicDebt ? <span className="nk-badge nk-karmic">Karmik borç {c.karmicDebt}</span> : null}
      </div>
      {start !== null ? <p className="nk-cmp-note">{start}{end !== null ? `–${end}` : endRaw === null ? "+" : ""} yaş</p> : null}
      {target ? <p className="nk-cmp-note">Hedef tarih {fmtIsoDay(target)}</p> : null}
    </>
  );
}

// ── açıklama çekmecesi ──────────────────────────────────────────────────────────────────────────
function Drawer({ conceptKey, onClose }: { conceptKey: ConceptKey; onClose: () => void }) {
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
          <h2 className="nk-h2" id={tid}>{g.labelTr} — neden farklı?</h2>
          <button ref={closeRef} className="nk-icon-btn" type="button" aria-label="Kapat" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="nk-drawer-body">
          <div className="nk-formula nk-fa">
            <p className="nk-label-cap" style={{ color: "#4f2596" }}>A · Bütüncül Numeroloji</p>
            <p className="nk-h3" style={{ marginTop: 4 }}>{g.legacyLabelTr}</p>
            <p className="nk-num-desc">{g.legacyMethodTr}</p>
          </div>
          <div className="nk-formula nk-fb">
            <p className="nk-label-cap" style={{ color: "#174f8c" }}>B · Klasik Numeroloji</p>
            <p className="nk-h3" style={{ marginTop: 4 }}>{g.classicLabelTr}</p>
            <p className="nk-num-desc">{g.classicMethodTr}</p>
          </div>
          <p className="nk-num-desc">{g.differenceTr}</p>
          <p className="nk-num-desc">İki sonuç da kendi yönteminde doğrudur. Bu ekran bunları yan yana gösterir, birleştirmez.</p>
        </div>
      </aside>
      <div className="nk-drawer-back nk-show" aria-hidden="true" onClick={onClose} />
    </>
  );
}

// ── ana bileşen ─────────────────────────────────────────────────────────────────────────────────
export default function CompareClient() {
  const uid = useId();
  const [query, setQuery] = useState<{ clientId: string | null; legacyId: string | null; classicId: string | null }>({ clientId: null, legacyId: null, classicId: null });
  const [q, setQ] = useState("");
  const [src, setSrc] = useState<{ loading: boolean; legacy: LegacySource[]; classic: ClassicSource[]; error: string | null }>({ loading: true, legacy: [], classic: [], error: null });
  const [legacyId, setLegacyId] = useState<string | null>(null);
  const [classicId, setClassicId] = useState<string | null>(null);
  const [aligning, setAligning] = useState(false);
  const [alignErr, setAlignErr] = useState<string | null>(null);
  const [al, setAl] = useState<{ alignment: Alignment; stones: AlignResponse["stones"] | null; sources: AlignResponse["sources"] | null; legacyId: string | null; classicId: string | null } | null>(null);
  const [drawer, setDrawer] = useState<ConceptKey | null>(null);
  const [notes, setNotes] = useState<CompareNote[]>([]);
  const [notesErr, setNotesErr] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<CompareNote | null>(null);
  const [saving, setSaving] = useState(false);
  const [noteMsg, setNoteMsg] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [toDelete, setToDelete] = useState<CompareNote | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [wordBusy, setWordBusy] = useState(false);
  const [wordErr, setWordErr] = useState<string | null>(null);
  const [wordNoteId, setWordNoteId] = useState<string>("");
  const closeDrawer = useCallback(() => setDrawer(null), []);

  // NK-R16: yeni arama öncekini iptal eder (eski yanıt yenisinin üstüne yazılmaz); sunucu sınırı 60 karakter.
  const srcAbort = useRef<AbortController | null>(null);
  const loadSources = useCallback(async (term: string, clientId: string | null) => {
    srcAbort.current?.abort();
    const ac = new AbortController();
    srcAbort.current = ac;
    setSrc((s) => ({ ...s, loading: true, error: null }));
    const sp = new URLSearchParams();
    if (clientId) sp.set("clientId", clientId);
    if (term.trim()) sp.set("q", term.trim().slice(0, 60));
    const qs = sp.toString();
    const r = await apiRequest<SourcesResponse>(`${K}/kaynaklar${qs ? `?${qs}` : ""}`, { signal: ac.signal });
    if (ac.signal.aborted || (r as ApiErr).code === "ABORTED") return;
    if (r.ok) setSrc({ loading: false, legacy: r.data.legacy ?? [], classic: r.data.classic ?? [], error: null });
    else setSrc({ loading: false, legacy: [], classic: [], error: errorMessage(r as ApiErr) });
  }, []);

  useEffect(() => {
    runInEffect(() => {
      const qq = readQuery();
      setQuery(qq);
      setLegacyId(qq.legacyId);
      setClassicId(qq.classicId);
      void loadSources("", qq.clientId);
    });
  }, [loadSources]);

  const loadNotes = useCallback(async (lId: string | null, cId: string | null) => {
    setNotesErr(null);
    const sp = new URLSearchParams();
    if (lId) sp.set("legacyId", lId);
    if (cId) sp.set("classicId", cId);
    const r = await apiRequest<{ ok: true; notes: CompareNote[] }>(`${K}/notlar?${sp.toString()}`);
    if (r.ok) setNotes(Array.isArray(r.data.notes) ? r.data.notes : []);
    else setNotesErr(errorMessage(r as ApiErr));
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
    } else setAlignErr(errorMessage(r as ApiErr));
  }

  async function saveNote() {
    if (!al) return;
    const text = draft.trim();
    if (!text) return setNoteMsg("Not boş olamaz.");
    if (text.length > NOTE_MAX) return setNoteMsg(`Not en fazla ${NOTE_MAX} karakter olabilir.`);
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
      setNoteMsg("Değerlendirme kaydedildi. Orijinal analizler değişmedi.");
      void loadNotes(al.legacyId, al.classicId);
      return;
    }
    const e = r as ApiErr;
    if (e.status === 409) {
      setConflict(true);
      return;
    }
    setNoteMsg(errorMessage(e));
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
      setNoteMsg("Not silindi.");
      return;
    }
    if ((r as ApiErr).status === 409) return setConflict(true);
    setNoteMsg(errorMessage(r as ApiErr));
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
    else setWordErr(errorMessage(r as ApiErr));
  }

  const a = al?.alignment ?? null;
  const conceptGroups = a ? a.rows : [];
  const stockOf = makeStock(al?.stones?.classic?.stock ?? {});
  const legacyAssign = al?.stones?.legacyAssignments ?? [];
  const srcL = al?.sources?.legacy ?? null;
  const srcC = al?.sources?.classic ?? null;

  return (
    <Shell theme="compare" crumbs={[{ href: "/numeroloji-merkezi", label: "Numeroloji Merkezi" }, { label: "Karşılaştırmalı İnceleme" }]}>
      <Hero
        compact
        eyebrow="A · B yan yana"
        title="Karşılaştırmalı İnceleme"
        sub="Aynı danışanın iki yöntemdeki kayıtları kavram kavram gösterilir. Sayılar birleştirilmez, ortalama alınmaz."
        aside={<p className="nk-never-merge"><Icon name="lock" />Orijinal analizler değişmez</p>}
      />

      <section className="nk-card nk-panel" aria-labelledby={`${uid}-secim`}>
        <h2 className="nk-h2" id={`${uid}-secim`}>Kayıt seçimi</h2>
        <p className="nk-lead">Bir ya da iki kayıt seçin. Yalnız bir taraf seçilirse diğer sütun boş kalır.{query.clientId ? " Danışan filtresi etkin." : ""}</p>
        <form className="nk-search-row" role="search" onSubmit={(e) => { e.preventDefault(); void loadSources(q, query.clientId); }}>
          <label className="nk-sr-only" htmlFor={`${uid}-q`}>Kayıtlarda ara</label>
          <input id={`${uid}-q`} className="nk-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad ya da başlıkla ara" autoComplete="off" maxLength={60} />
          <button className="nk-btn" type="submit">Ara</button>
        </form>
        {src.error ? <Alert tone="error">{src.error}</Alert> : null}
        {src.loading ? <div style={{ marginTop: 12 }}><Skeleton lines={3} label="Kayıtlar yükleniyor…" /></div> : (
          <div className="nk-pick-grid" style={{ marginTop: 12, gridTemplateColumns: undefined }}>
            <fieldset className="nk-field" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} data-testid="pick-legacy">
              <legend className="nk-flabel" style={{ fontWeight: 700 }}>A · Bütüncül Numeroloji kaydı</legend>
              <ul className="nk-pick-list">
                <li><label className="nk-pick nk-pa"><input type="radio" name={`${uid}-a`} checked={legacyId === null} onChange={() => setLegacyId(null)} /><span>Seçilmedi</span></label></li>
                {src.legacy.map((x) => (
                  <li key={x.id}>
                    <label className="nk-pick nk-pa">
                      <input type="radio" name={`${uid}-a`} checked={legacyId === x.id} onChange={() => setLegacyId(x.id)} />
                      <span><span className="nk-pick-title">{x.fullName}</span><br /><span className="nk-pick-meta">{x.birthDate ? `Doğum ${fmtIsoDay(x.birthDate)} · ` : ""}{fmtDate(x.createdAt)}</span></span>
                    </label>
                  </li>
                ))}
              </ul>
              {!src.legacy.length ? <p className="nk-empty">Bütüncül Numeroloji kaydı bulunamadı.</p> : null}
            </fieldset>
            <fieldset className="nk-field" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} data-testid="pick-classic">
              <legend className="nk-flabel" style={{ fontWeight: 700 }}>B · Klasik Numeroloji kaydı</legend>
              <ul className="nk-pick-list">
                <li><label className="nk-pick nk-pb"><input type="radio" name={`${uid}-b`} checked={classicId === null} onChange={() => setClassicId(null)} /><span>Seçilmedi</span></label></li>
                {src.classic.map((x) => (
                  <li key={x.id}>
                    <label className="nk-pick nk-pb">
                      <input type="radio" name={`${uid}-b`} checked={classicId === x.id} onChange={() => setClassicId(x.id)} />
                      <span><span className="nk-pick-title">{x.title || "Adsız analiz"}</span><br /><span className="nk-pick-meta">{KIND_LABELS[x.kind] ?? "Analiz"} · {fmtDate(x.createdAt)}</span></span>
                    </label>
                  </li>
                ))}
              </ul>
              {!src.classic.length ? <p className="nk-empty">Klasik Numeroloji kaydı bulunamadı. <Link className="nk-link-btn" href="/numeroloji-klasik/yeni">Yeni analiz</Link></p> : null}
            </fieldset>
            <div className="nk-field" style={{ margin: 0, alignContent: "end" }}>
              <button className="nk-btn nk-primary" type="button" onClick={() => void align()} disabled={aligning || (!legacyId && !classicId)} data-testid="align-btn">
                <Icon name="compare" />{aligning ? "Hizalanıyor…" : "Yan yana göster"}
              </button>
              <p className="nk-hint">Hizalama yalnız kayıtlı değerleri okur; yeniden hesap yapılmaz.</p>
            </div>
          </div>
        )}
        {alignErr ? <Alert tone="error">{alignErr}</Alert> : null}
      </section>

      {a ? (
        <>
          {a.missing === "legacy" ? <Alert tone="info">Bütüncül Numeroloji tarafı boş; yalnız Klasik kayıt gösteriliyor.</Alert> : null}
          {a.missing === "classic" ? <Alert tone="info">Klasik Numeroloji tarafı boş; yalnız Bütüncül Numeroloji kaydı gösteriliyor.</Alert> : null}
          {a.legacyMeta.methodologyCurrent === false ? <Alert tone="warn">Bütüncül Numeroloji kaydı daha eski bir hesap sürümüyle saklanmış; değerler kaydedildiği gibi gösterilir.</Alert> : null}

          <section className="nk-only-grid" style={{ marginTop: 16 }} aria-label="Seçilen kayıtlar" data-testid="cmp-sources">
            <div className="nk-card nk-panel nk-only-a">
              <p className="nk-label-cap">A · Bütüncül Numeroloji</p>
              {srcL ? <><p className="nk-h3" style={{ marginTop: 4 }}>{srcL.fullName}</p><p className="nk-pick-meta">{srcL.birthDate ? `Doğum ${fmtIsoDay(srcL.birthDate)} · ` : ""}Kayıt {fmtDate(srcL.createdAt)}</p></> : <p className="nk-cmp-missing">Kayıt seçilmedi</p>}
            </div>
            <div className="nk-card nk-panel nk-only-b">
              <p className="nk-label-cap">B · Klasik Numeroloji</p>
              {srcC ? <><p className="nk-h3" style={{ marginTop: 4 }}>{srcC.title || "Adsız analiz"}</p><p className="nk-pick-meta">{KIND_LABELS[srcC.kind] ?? "Analiz"} · Kayıt {fmtDate(srcC.createdAt)}</p></> : <p className="nk-cmp-missing">Kayıt seçilmedi</p>}
            </div>
          </section>

          <section className="nk-card nk-panel" style={{ marginTop: 16 }} aria-labelledby={`${uid}-kavram`}>
            <h2 className="nk-h2" id={`${uid}-kavram`}>Kavram hizalaması</h2>
            <p className="nk-lead">Aynı ad taşıyan kavramlar farklı formülle hesaplanabilir; durum sütunu bunu belirtir.</p>
            <ul className="nk-rules">{COMPARE_RULES_TR.map((r) => <li key={r}>{r}</li>)}</ul>
            <div className="nk-cmp" role="table" aria-label="Kavram hizalaması" data-testid="align-table">
              <div className="nk-cmp-row nk-cmp-head" role="row">
                <div role="columnheader">Kavram</div><div className="nk-ca" role="columnheader">A · Bütüncül</div><div className="nk-cb" role="columnheader">B · Klasik</div><div role="columnheader">Durum</div>
              </div>
              {conceptGroups.map((r) => {
                const rel = RELATION[r.relation] ?? { label: r.relation, cls: "" };
                return (
                  <div className="nk-cmp-row" role="row" key={`${r.conceptKey}-${r.position ?? 0}`} data-testid="align-row">
                    <div className="nk-cmp-c" role="rowheader"><span className="nk-cmp-concept">{r.labelTr}</span></div>
                    <div className="nk-ca" role="cell"><span className="nk-cmp-mlabel">A · Bütüncül</span><LegacyCell r={r} /></div>
                    <div className="nk-cb" role="cell"><span className="nk-cmp-mlabel">B · Klasik</span><ClassicCell r={r} /></div>
                    <div className="nk-cmp-s" role="cell">
                      <div className="nk-cmp-badges">
                        <span className={`nk-badge ${rel.cls}`} data-testid="relation-chip">{rel.label}</span>
                        {r.sameNameDifferentFormula ? <span className="nk-badge nk-warn" data-testid="same-name-chip">Aynı ad, farklı formül</span> : null}
                      </div>
                      <button className="nk-why-btn" type="button" onClick={() => setDrawer(r.conceptKey)} data-testid="why-btn">Neden farklı?</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="nk-only-grid" style={{ marginTop: 16 }} aria-label="Yalnız bir yöntemde bulunan teknikler">
            <div className="nk-card nk-panel nk-only-a" data-testid="only-a">
              <h2 className="nk-h2">Yalnız A’da</h2>
              <p className="nk-lead" style={{ color: "var(--a-ink-soft)" }}>Bütüncül Numeroloji teknikleri; Klasik yöntemde karşılığı yok.</p>
              <div className="nk-chips" style={{ marginTop: 12 }}>
                {a.onlyLegacy.map((x) => <span key={x.key} className={`nk-chip${x.present ? "" : " nk-absent"}`} title={x.present ? "Bu kayıtta var" : "Bu kayıtta yok"}>{x.labelTr}{x.present ? "" : " · kayıtta yok"}</span>)}
              </div>
            </div>
            <div className="nk-card nk-panel nk-only-b" data-testid="only-b">
              <h2 className="nk-h2">Yalnız B’de</h2>
              <p className="nk-lead">Klasik yöntem teknikleri; Bütüncül Numeroloji'de karşılığı yok.</p>
              <div className="nk-chips" style={{ marginTop: 12 }}>
                {a.onlyClassic.map((x) => <span key={x.key} className={`nk-chip${x.present ? "" : " nk-absent"}`} title={x.present ? "Bu kayıtta var" : "Bu kayıtta yok"}>{x.labelTr}{x.present ? "" : " · kayıtta yok"}</span>)}
              </div>
            </div>
          </section>

          <section className="nk-card nk-panel" style={{ marginTop: 16 }} aria-labelledby={`${uid}-tas`}>
            <h2 className="nk-h2" id={`${uid}-tas`}>Taşlar — kaynağa göre</h2>
            <p className="nk-lead">Her sütun kendi kaynağını gösterir; listeler birleştirilmez.</p>
            <div className="nk-cmp-stones" data-testid="cmp-stones">
              <div className="nk-sa">
                <p className="nk-label-cap">A · Uzman ataması</p>
                {a.stones.legacyAssigned.length ? <ul>{a.stones.legacyAssigned.map((s, i) => <li key={`${s.slot}-${s.name}-${i}`}><span>{s.name}</span><span className="nk-badge">{SLOT_TR[s.slot] ?? s.slot}</span></li>)}</ul> : !legacyAssign.length ? <p className="nk-empty">Kayıtta taş yok.</p> : null}
                {legacyAssign.length ? (
                  <ul data-testid="legacy-assignments">
                    {legacyAssign.map((x) => <li key={`${x.analysisType}-${x.value}`}><span><b>{x.labelTr} {x.value}</b>: {x.stones.join(", ") || "—"}</span></li>)}
                  </ul>
                ) : null}
              </div>
              <div className="nk-sb1">
                <p className="nk-label-cap">B · Harita önerisi</p>
                {a.stones.classicDirect.length ? <ul>{a.stones.classicDirect.map((s, i) => <li key={`${s.input}-${i}`}><span>{s.name}</span>{s.status === "ambiguous" ? <span className="nk-badge nk-warn">Eşleşme belirsiz</span> : s.status === "unmatched" ? <span className="nk-badge">Kütüphanede yok</span> : <StockBadge n={stockOf(s.stoneKey, s.name, s.input)} />}</li>)}</ul> : <p className="nk-empty">Öneri yok.</p>}
              </div>
              <div className="nk-sb2">
                <p className="nk-label-cap">B · Türetilmiş</p>
                {a.stones.classicDerived.length ? <ul>{a.stones.classicDerived.map((s) => <li key={s.stoneKey}><span>{s.name} <StockBadge n={stockOf(s.stoneKey, s.name)} /></span><span className="nk-badges">{s.methods.map((m) => <span key={m} className={`nk-badge${m === "vibration_exact" ? " nk-ice" : ""}`}>{METHOD_TR[m] ?? m}</span>)}</span></li>)}</ul> : <p className="nk-empty">Türetilmiş öneri yok.</p>}
              </div>
            </div>
            {a.stones.overlap.length ? <p className="nk-hint" style={{ marginTop: 10 }}>Her iki tarafta da geçen taşlar (köken korunur): {a.stones.overlap.map((o) => o.nameLegacy).join(", ")}</p> : null}
            <p className="nk-disclaimer"><Icon name="alert" /><span>Taş önerileri sembolik ve geleneksel yorumdur; tıbbi teşhis, tedavi veya sağlık iddiası taşımaz.</span></p>
          </section>

          <section className="nk-card nk-panel" style={{ marginTop: 16 }} aria-labelledby={`${uid}-uzman`}>
            <h2 className="nk-h2" id={`${uid}-uzman`}>Uzman değerlendirmesi</h2>
            <p className="nk-lead">Sizin yorumunuz; iki analizden ayrı bir kayıt olarak saklanır.</p>
            {notesErr ? <Alert tone="error">{notesErr}</Alert> : null}
            {notes.length ? (
              <ul className="nk-note-list" data-testid="notes">
                {notes.map((n) => (
                  <li key={n.id} className="nk-note-item">
                    <p className="nk-note-text">{noteText(n)}</p>
                    <div className="nk-btn-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <span className="nk-pick-meta">{fmtDate(n.updatedAt ?? n.createdAt ?? null)}</span>
                      <span className="nk-btn-row">
                        <button type="button" className="nk-btn nk-sm" onClick={() => { setEditing(n); setDraft(noteText(n)); setConflict(false); setNoteMsg(null); }}><Icon name="edit" />Düzenle</button>
                        <button type="button" className="nk-btn nk-sm" onClick={() => setToDelete(n)}><Icon name="trash" />Sil</button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            <label className="nk-flabel nk-h3" htmlFor={`${uid}-not`} style={{ display: "block", marginTop: 14 }}>{editing ? "Notu düzenle" : "Yeni değerlendirme"}</label>
            <textarea className="nk-editor" id={`${uid}-not`} style={{ marginTop: 8 }} value={draft} maxLength={NOTE_MAX} onChange={(e) => setDraft(e.target.value)} data-testid="note-editor" />
            {conflict ? (
              <Alert tone="warn" action={<button type="button" className="nk-btn nk-sm" onClick={() => { setConflict(false); setEditing(null); void loadNotes(al?.legacyId ?? null, al?.classicId ?? null); }}>Notları yenile</button>}>
                Not başka bir oturumda değişti. Notları yenileyip değişikliğinizi tekrar uygulayın (yazdığınız metin korunur).
              </Alert>
            ) : null}
            {noteMsg ? <Alert tone={noteMsg.startsWith("Değerlendirme kaydedildi") || noteMsg === "Not silindi." ? "ok" : "error"} live>{noteMsg}</Alert> : null}
            <p className="nk-lock-note"><Icon name="lock" /><span>Bu not ayrı kaydedilir. <b>Orijinal analizler değişmez.</b> Tek bir “birleşik sayı” üretilmez.</span></p>
            <div className="nk-btn-row nk-stretch" style={{ marginTop: 12 }}>
              <button className="nk-btn nk-primary" type="button" onClick={() => void saveNote()} disabled={saving || !draft.trim()} data-testid="note-save"><Icon name="save" />{saving ? "Kaydediliyor…" : editing ? "Değişikliği kaydet" : "Değerlendirmeyi kaydet"}</button>
              {editing ? <button className="nk-btn" type="button" onClick={() => { setEditing(null); setDraft(""); }}>Vazgeç</button> : null}
            </div>
          </section>

          <section className="nk-card nk-panel" style={{ marginTop: 16 }} aria-labelledby={`${uid}-word`}>
            <h2 className="nk-h2" id={`${uid}-word`}>Karşılaştırma raporu (Word)</h2>
            <p className="nk-lead">İki kayıt yan yana; sayılar birleştirilmez. İsterseniz bir uzman notunu rapora ekleyin.</p>
            {notes.length ? (
              <div className="nk-field" style={{ marginTop: 12 }}>
                <label htmlFor={`${uid}-wn`}>Rapora eklenecek not</label>
                <select id={`${uid}-wn`} className="nk-select" value={wordNoteId} onChange={(e) => setWordNoteId(e.target.value)}>
                  <option value="">Not eklenmesin</option>
                  {notes.map((n) => <option key={n.id} value={n.id}>{noteText(n).slice(0, 60) || "Not"}</option>)}
                </select>
              </div>
            ) : null}
            {wordErr ? <Alert tone="error">{wordErr}</Alert> : null}
            <div className="nk-btn-row nk-stretch" style={{ marginTop: 12 }}>
              <button className="nk-btn nk-primary" type="button" onClick={() => void word()} disabled={wordBusy} data-testid="cmp-word"><Icon name="doc" />{wordBusy ? "Hazırlanıyor…" : "Karşılaştırma raporu (Word)"}</button>
            </div>
          </section>
        </>
      ) : null}

      {drawer ? <Drawer conceptKey={drawer} onClose={closeDrawer} /> : null}
      <ConfirmDialog open={toDelete !== null} title="Not silinsin mi?" confirmLabel="Sil" danger busy={deleting} onConfirm={() => void deleteNote()} onCancel={() => setToDelete(null)}>
        <p>Uzman notu silinecek. Orijinal analizler etkilenmez.</p>
      </ConfirmDialog>
    </Shell>
  );
}
