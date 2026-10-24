"use client";

/**
 * Human Design Eğitim Çalışma Alanı (FAZ 8) — eğitmenin KENDİ çizim / not katmanı.
 * Araçlar: A Kalem · B Ok · C Daire/vurgu · D Baloncuk (tıklayınca not) · E Metin · F Seç/taşı · G Sil · H Geri al/yinele ·
 * I Temiz görünüm · J Kaydet / Kaydet ve Kapat (yeşil). Kaydedilmemiş değişiklik uyarısı; CAS (sessiz üzerine yazma YOK);
 * tüm katmanı temizleme açık onayla; SUNUM MODU (araçlar gizli, harita geniş, baloncuklar açılır, not katmanı gizlenebilir).
 * Silme / temizleme yalnız katmanı etkiler; BodyGraph, danışan ve merkezî kayıt DEĞİŞMEZ.
 * FAZ 13 (owner incelemesi): eğitim notları varsayılan SALT OKUNUR (Düzenle → Kaydet / Vazgeç; Sil açık onayla; Büyüt →
 * harita üzerinde büyük okuma / düzenleme penceresi). Notu kaydetmek kaydedilmemiş çizimleri KAYDETMEZ (yalnız not değişir).
 * Baloncuk: numara dairesi büyütülür / küçültülür; not açılır kutuda (Genişlet → büyük pencere) ya da harita üzerinde kutu
 * içinde gösterilir (kutu yeniden boyutlandırılır, içinde doğrudan yazılır).
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Circle, Eraser, Eye, EyeOff, Maximize2, MessageCircle, MousePointer2, MoveUpRight, Pencil, PencilLine, Presentation, Redo2, Trash2, Type, Undo2 } from "lucide-react";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import css from "@/app/_premium/hd-education/calismaAlani.module.css";
import type { CbgState } from "@/lib/human-design/relations/connectionBodygraphScene";
import {
  ANN_BOX, ANN_BUBBLE_R, ANN_COLORS, ANN_COLOR_LABEL, ANN_MAX_ELS, ANN_MAX_NOTE, ANN_MAX_NOTES, ANN_MAX_TEXT, ANN_TEXT_SIZES, ANN_WIDTHS, anchorLabel, parseAnnDoc,
  type AnnColor, type AnnEl, type AnnSourceKind, type AnnTextSize, type AnnWidth,
} from "@/lib/human-design/education/annotations/annotationContract";
import { AnnotationStage, bubbleBox, bubbleR, newAnnId, placeAnchored, type AnnTool } from "./AnnotationStage";
import { annClear, annGet, annSave } from "./annApi";
import { appendNote, takeNoteHandoff } from "@/app/human-design/egitim-haritalari/noteHandoff";

const TOOLS: Array<{ id: AnnTool; label: string; icon: ReactNode; key: string }> = [
  { id: "pen", label: "Kalem", icon: <Pencil aria-hidden />, key: "A" },
  { id: "arrow", label: "Ok", icon: <MoveUpRight aria-hidden />, key: "B" },
  { id: "circle", label: "Daire", icon: <Circle aria-hidden />, key: "C" },
  { id: "bubble", label: "Baloncuk", icon: <MessageCircle aria-hidden />, key: "D" },
  { id: "text", label: "Metin", icon: <Type aria-hidden />, key: "E" },
  { id: "select", label: "Seç / taşı", icon: <MousePointer2 aria-hidden />, key: "F" },
  { id: "erase", label: "Sil", icon: <Eraser aria-hidden />, key: "G" },
];
const BAD_CHARS = /[<>]/g;
type Modal = null | { kind: "conflict"; current: number | null } | { kind: "clear" } | { kind: "leave"; href: string } | { kind: "notesDelete" };
const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v * 10) / 10));

export function AnnotationWorkspace({ kind, sourceId, state, title, subtitle, backHref, eyebrow }: {
  kind: AnnSourceKind; sourceId: string; state: CbgState; title: string; subtitle: ReactNode; backHref: string; eyebrow: string;
}) {
  const router = useRouter();
  const front = state.front ?? null;
  const [phase, setPhase] = useState<"loading" | "ok" | "error">("loading");
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [saved, setSaved] = useState(JSON.stringify({ e: [], n: "" }));
  const [els, setEls] = useState<AnnEl[]>([]);
  const [notes, setNotes] = useState("");
  const [past, setPast] = useState<AnnEl[][]>([]);
  const [future, setFuture] = useState<AnnEl[][]>([]);
  const [tool, setTool] = useState<AnnTool>("pen");
  const [color, setColor] = useState<AnnColor>("red");
  const [width, setWidth] = useState<AnnWidth>(4);
  const [textSize, setTextSize] = useState<AnnTextSize>(18);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [present, setPresent] = useState(false);
  const [openBubble, setOpenBubble] = useState<string | null>(null);
  const [pendingText, setPendingText] = useState<{ x: number; y: number } | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Eğitim notları: null = salt okunur; metin = düzenleme taslağı (kaydedilene kadar kalıcı not DEĞİŞMEZ).
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [notesBig, setNotesBig] = useState(false);
  const [bigBubble, setBigBubble] = useState<string | null>(null);
  const editSnap = useRef<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const railRef = useRef<HTMLElement | null>(null);
  const [railMore, setRailMore] = useState(false);
  // Dar ekranda araç şeridi yatay kayar: sağda gizli araç varsa ipucu göster (sona gelince gizle).
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const upd = () => setRailMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 6);
    upd();
    el.addEventListener("scroll", upd, { passive: true });
    window.addEventListener("resize", upd);
    return () => { el.removeEventListener("scroll", upd); window.removeEventListener("resize", upd); };
  }, [phase, present]);
  const snapshot = (e: AnnEl[], n: string) => JSON.stringify({ e, n });
  const notesDirty = noteDraft !== null && noteDraft !== notes;
  const dirty = snapshot(els, notes) !== saved || notesDirty;
  const savedEls = (): AnnEl[] => { try { return (JSON.parse(saved) as { e: AnnEl[] }).e; } catch { return []; } };

  const load = useCallback(() => annGet(kind, sourceId).then((r) => {
    if (!r.ok) { setLoadErr(r.error); setPhase("error"); return; }
    const doc = r.body.layer?.doc?.els ?? [];
    const n = r.body.layer?.doc?.notes ?? "";
    // FAZ 10 + FAZ 13: Hayat Hikâyesi'nden "Notlarıma ekle" → olay, korumalı notun DÜZENLEME TASLAĞINA eklenir (düzenleme açılır);
    // kayıtlı not değişmez, kalıcı olması için eğitmen Kaydet'e basar (sessiz kayıt YOK).
    const handoff = kind === "central" ? takeNoteHandoff(sourceId) : null;
    setEls(doc); setNotes(n); setSaved(snapshot(doc, n)); setRevision(r.body.layer?.revision ?? 0);
    setPast([]); setFuture([]); setSelectedId(null); setNoteDraft(handoff ? appendNote(n, handoff, ANN_MAX_NOTES) : null); setPhase("ok");
    if (handoff) setMsg({ ok: true, text: "Yaşam olayı eğitim notlarınıza eklendi (düzenleme açık). Kalıcı olması için Kaydet'e basın." });
  }), [kind, sourceId]);
  useEffect(() => { void load(); }, [load]);

  // Kaydedilmemiş değişiklik: sekme kapatma / yenileme uyarısı.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const commit = useCallback((next: AnnEl[]) => {
    setPast((p) => [...p.slice(-99), els]);
    setFuture([]);
    setEls(next);
    setMsg(null);
  }, [els]);
  const undo = useCallback(() => {
    if (!past.length) return;
    setFuture((f) => [els, ...f].slice(0, 100));
    setEls(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
    setSelectedId(null);
  }, [past, els]);
  const redo = useCallback(() => {
    if (!future.length) return;
    setPast((p) => [...p, els].slice(-100));
    setEls(future[0]);
    setFuture((f) => f.slice(1));
    setSelectedId(null);
  }, [future, els]);
  const remove = useCallback((id: string) => {
    commit(els.filter((x) => x.id !== id));
    if (selectedId === id) setSelectedId(null);
    if (openBubble === id) setOpenBubble(null);
  }, [commit, els, selectedId, openBubble]);

  const full = els.length >= ANN_MAX_ELS;
  const add = (el: AnnEl) => {
    if (full) { setMsg({ ok: false, text: `En çok ${ANN_MAX_ELS} öğe eklenebilir.` }); return; }
    commit([...els, el]);
  };

  const save = async (close: boolean, forceRevision?: number): Promise<boolean> => {
    if (busy) return false;
    // Not düzenleme taslağı açıksa genel "Kaydet" onu da kaydeder (kullanıcının açık kaydetme eylemi).
    const p = parseAnnDoc({ v: 1, els, notes: noteDraft ?? notes });
    if (!p.ok) { setMsg({ ok: false, text: "Çizimde geçersiz bir öğe var (boş metin veya izin verilmeyen karakter). Lütfen düzeltin." }); return false; }
    setBusy(true); setMsg(null);
    const r = await annSave(kind, sourceId, p.doc, forceRevision ?? revision);
    setBusy(false);
    if (r.ok) {
      setRevision(r.body.layer.revision); setSaved(snapshot(p.doc.els, p.doc.notes)); setNotes(p.doc.notes); setNoteDraft(null); setModal(null);
      setMsg({ ok: true, text: "Çalışma alanı kaydedildi." });
      if (close) router.push(backHref);
      return true;
    }
    if (r.status === 409) { setModal({ kind: "conflict", current: r.currentRevision }); return false; }
    setMsg({ ok: false, text: r.error });
    return false;
  };

  /** Yalnız eğitim notunu kaydet: son KAYITLI çizimlerle birlikte (kaydedilmemiş çizim değişiklikleri olduğu gibi kalır). */
  const saveNotes = async (text: string, okText: string): Promise<boolean> => {
    if (busy) return false;
    const base = savedEls();
    const p = parseAnnDoc({ v: 1, els: base, notes: text });
    if (!p.ok) { setMsg({ ok: false, text: "Notta izin verilmeyen karakter var." }); return false; }
    setBusy(true); setMsg(null);
    const r = await annSave(kind, sourceId, p.doc, revision);
    setBusy(false);
    if (r.ok) {
      setRevision(r.body.layer.revision); setSaved(snapshot(base, p.doc.notes)); setNotes(p.doc.notes); setNoteDraft(null); setModal(null);
      setMsg({ ok: true, text: okText });
      return true;
    }
    if (r.status === 409) { setModal({ kind: "conflict", current: r.currentRevision }); return false; }
    setMsg({ ok: false, text: r.error });
    return false;
  };

  const leave = (href: string) => { if (dirty) setModal({ kind: "leave", href }); else router.push(href); };

  // Klavye: Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z), Delete, Esc.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "Escape" && (bigBubble || notesBig)) { setBigBubble(null); setNotesBig(false); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && selectedId && !present) { e.preventDefault(); remove(selectedId); }
      else if (e.key === "Escape") { if (openBubble) setOpenBubble(null); else if (present) setPresent(false); else setSelectedId(null); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [undo, redo, remove, selectedId, present, openBubble, bigBubble, notesBig]);

  const selected = selectedId ? els.find((x) => x.id === selectedId) ?? null : null;
  const bubbles = els.filter((x): x is Extract<AnnEl, { t: "bubble" }> => x.t === "bubble");
  const updateSel = (patch: (el: AnnEl) => AnnEl, history: boolean) => {
    if (!selected) return;
    const next = els.map((x) => (x.id === selected.id ? patch(x) : x));
    if (history) commit(next); else setEls(next);
  };
  const beginEdit = () => { editSnap.current = JSON.stringify(els); };
  const endEdit = () => {
    if (editSnap.current !== null && editSnap.current !== JSON.stringify(els)) { setPast((p) => [...p.slice(-99), JSON.parse(editSnap.current as string) as AnnEl[]]); setFuture([]); }
    editSnap.current = null;
  };

  const status = busy ? <span className={`${css.wsStatus} ${css.stBusy}`} data-ann-status="busy">Kaydediliyor…</span>
    : dirty ? <span className={`${css.wsStatus} ${css.stDirty}`} data-ann-status="dirty">Kaydedilmemiş değişiklik</span>
    : <span className={`${css.wsStatus} ${css.stSaved}`} data-ann-status="saved">{revision ? "Kaydedildi" : "Henüz çizim yok"}</span>;

  if (phase === "loading") return <p className={base.empty} aria-live="polite" data-ann-loading>Çalışma alanı yükleniyor…</p>;
  if (phase === "error") return <p className={base.err} role="alert" data-ann-error>{loadErr}</p>;

  const stage = (interactive: boolean) => (
    <AnnotationStage state={state} front={front} els={els} tool={interactive ? (hidden ? "none" : tool) : "none"} color={color} width={width}
      selectedId={interactive ? selectedId : null} hidden={hidden} interactive={interactive && !hidden}
      openBubbleId={openBubble}
      onCreate={(el) => { add(el); }}
      onChange={(el) => commit(els.map((x) => (x.id === el.id ? el : x)))}
      onSelect={(id) => { setSelectedId(id); const b = id ? els.find((x) => x.id === id) : null; setOpenBubble(b?.t === "bubble" ? id : null); }}
      onErase={remove}
      onPlace={(k, abs) => {
        if (k === "bubble") {
          if (full) { setMsg({ ok: false, text: `En çok ${ANN_MAX_ELS} öğe eklenebilir.` }); return; }
          const el = placeAnchored({ id: newAnnId("bubble"), t: "bubble", c: color, x: 0, y: 0, a: null, n: "" }, abs, front);
          commit([...els, el]); setSelectedId(el.id); setOpenBubble(null); setTool("select");
          setTimeout(() => noteRef.current?.focus(), 30);
        } else { setPendingText(abs); setTextDraft(""); }
      }}
      onBubble={(id) => setOpenBubble(id)}
      onExpandBubble={(id) => setBigBubble(id)}
      onNoteText={interactive ? (id, n) => setEls((cur) => cur.map((x) => (x.id === id && x.t === "bubble" ? { ...x, n } : x))) : undefined}
      onNoteEdit={(ph) => (ph === "begin" ? beginEdit() : endEdit())} />
  );

  const bigB = bigBubble ? bubbles.find((b) => b.id === bigBubble) ?? null : null;
  const bigWindows = (
    <>
      {bigB ? (
        <div className={css.ovl} role="dialog" aria-modal="true" aria-labelledby="ann-bigb" data-ann-modal="bubble" onClick={(e) => { if (e.target === e.currentTarget) setBigBubble(null); }}>
          <div className={css.mdlWide}>
            <h2 id="ann-bigb">Not {bubbles.findIndex((b) => b.id === bigB.id) + 1}{bigB.a ? ` · ${anchorLabel(bigB.a)}` : ""}</h2>
            <div className={css.bigBody} data-ann-bigbubble-body>{bigB.n.trim() ? bigB.n : <em>(boş not)</em>}</div>
            <div className={css.row}><button type="button" className={`${base.btn} ${base.ghost} ${css.big}`} onClick={() => setBigBubble(null)} data-ann-bigbubble-close>Kapat</button></div>
          </div>
        </div>
      ) : null}
      {notesBig ? (
        <div className={css.ovl} role="dialog" aria-modal="true" aria-labelledby="ann-bign" data-ann-modal="notes" onClick={(e) => { if (e.target === e.currentTarget) setNotesBig(false); }}>
          <div className={css.mdlWide}>
            <h2 id="ann-bign">Eğitim notları</h2>
            <p className={css.hint}>{noteDraft !== null ? "Düzenleme açık — değişiklik Kaydet'e basana kadar kalıcı olmaz." : "Salt okunur. Değiştirmek için Düzenle'ye basın."}</p>
            {noteDraft !== null ? (
              <textarea className={`${css.ta} ${css.bigTa}`} maxLength={ANN_MAX_NOTES} value={noteDraft} autoFocus aria-label="Eğitim notları (büyük)"
                onChange={(e) => setNoteDraft(e.target.value.replace(BAD_CHARS, ""))} data-ann-notes-big-input />
            ) : (
              <div className={css.bigBody} data-ann-notes-big-body>{notes.trim() ? notes : <span className={css.noteEmpty}>Henüz eğitim notu yok.</span>}</div>
            )}
            {noteDraft !== null ? <small className={css.count}>{noteDraft.length}/{ANN_MAX_NOTES} · &lt; ve &gt; kullanılamaz</small> : null}
            <div className={css.row}>
              {noteDraft === null ? (
                !present ? <button type="button" className={`${base.btn} ${base.ghost} ${css.big}`} onClick={() => setNoteDraft(notes)} data-ann-notes-big-edit><PencilLine size={16} aria-hidden /> Düzenle</button> : null
              ) : (
                <>
                  <button type="button" className={`${base.btn} ${base.save} ${css.big}`} disabled={busy || !notesDirty} onClick={() => void saveNotes(noteDraft, "Eğitim notları kaydedildi.")} data-ann-notes-big-save>Kaydet</button>
                  <button type="button" className={`${base.btn} ${base.ghost} ${css.big}`} onClick={() => setNoteDraft(null)} data-ann-notes-big-cancel>Vazgeç</button>
                </>
              )}
              <button type="button" className={`${base.btn} ${base.ghost} ${css.big}`} onClick={() => setNotesBig(false)} data-ann-notes-big-close>Kapat</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );

  if (present) {
    return (
      <div className={css.present} data-ann-present role="dialog" aria-modal="true" aria-label="Sunum modu">
        <div className={css.presentBar}>
          <span className={css.presentTitle}>{title}</span>
          <span className={css.wsActions}>
            <button type="button" className={`${base.btn} ${base.ghost} ${css.big}`} onClick={() => { setHidden((h) => !h); setOpenBubble(null); }} data-ann-present-notes aria-pressed={hidden}>
              {hidden ? <><Eye size={18} aria-hidden /> Notları göster</> : <><EyeOff size={18} aria-hidden /> Notları gizle</>}
            </button>
            <button type="button" className={`${base.btn} ${base.ghost} ${css.big}`} onClick={() => { setPresent(false); setOpenBubble(null); }} data-ann-present-exit>Sunumdan çık</button>
          </span>
        </div>
        <div className={css.presentStage}>{stage(false)}</div>
        {bigWindows}
      </div>
    );
  }

  return (
    <div data-ann-workspace={kind}>
      <header className={css.wsHead}>
        <div className={css.wsTitleBox}>
          <button type="button" className={css.wsBack} onClick={() => leave(backHref)} data-ann-back>← Harita ayrıntısı</button>
          <span className={css.wsEyebrow}>{eyebrow}</span>
          <h1 className={css.wsTitle}>{title}</h1>
          <p className={css.wsSub}>{subtitle}</p>
        </div>
        <div className={css.wsActions}>
          {status}
          <button type="button" className={`${base.btn} ${base.ghost} ${css.big}`} onClick={() => { setPresent(true); setSelectedId(null); setOpenBubble(null); }} data-ann-present-open>
            <Presentation size={18} aria-hidden /> Sunum modu
          </button>
          <button type="button" className={`${base.btn} ${base.ghost} ${css.big}`} onClick={() => void save(false)} disabled={busy || !dirty} data-ann-save>Kaydet</button>
          <button type="button" className={`${base.btn} ${base.save} ${css.big}`} onClick={() => void save(true)} disabled={busy} data-ann-save-close>Kaydet ve Kapat</button>
        </div>
      </header>
      {msg ? <p className={msg.ok ? css.ok : css.err} role={msg.ok ? "status" : "alert"} data-ann-msg={msg.ok ? "ok" : "err"}>{msg.text}</p> : null}

      <div className={css.ws}>
        <div className={`${css.railWrap} ${railMore ? css.railMoreOn : ""}`} data-ann-railwrap>
        <nav ref={railRef} className={css.rail} aria-label="Çizim araçları" data-ann-toolbar>
          {TOOLS.map((t) => (
            <button key={t.id} type="button" className={`${css.tool} ${tool === t.id && !hidden ? css.toolOn : ""}`} aria-pressed={tool === t.id && !hidden}
              disabled={hidden} title={`${t.label} (${t.key})`} onClick={() => { setTool(t.id); if (t.id !== "select") setSelectedId(null); setPendingText(null); }} data-ann-tool-btn={t.id}>
              {t.icon}<span>{t.label}</span>
            </button>
          ))}
          <span className={css.sep} aria-hidden />
          <button type="button" className={css.tool} onClick={undo} disabled={!past.length || hidden} title="Geri al (Ctrl+Z)" data-ann-undo><Undo2 aria-hidden /><span>Geri al</span></button>
          <button type="button" className={css.tool} onClick={redo} disabled={!future.length || hidden} title="Yinele (Ctrl+Y)" data-ann-redo><Redo2 aria-hidden /><span>Yinele</span></button>
          <span className={css.sep} aria-hidden />
          <button type="button" className={`${css.tool} ${hidden ? css.toolOn : ""}`} aria-pressed={hidden} onClick={() => { setHidden((h) => !h); setSelectedId(null); setOpenBubble(null); }}
            title="Temiz görünüm: çizimleri geçici olarak gizle" data-ann-clean>
            {hidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />}<span>{hidden ? "Çizimleri göster" : "Temiz görünüm"}</span>
          </button>
        </nav>
        <button type="button" className={css.railMore} aria-label="Diğer araçlar (sağa kaydır)" title="Diğer araçlar" tabIndex={railMore ? 0 : -1}
          onClick={() => railRef.current?.scrollBy({ left: 180, behavior: "smooth" })} data-ann-rail-more={railMore ? "1" : "0"}>›</button>
        </div>

        <section className={css.stageCard} aria-label="BodyGraph ve çizim katmanı">{stage(true)}</section>

        <aside className={css.side}>
          <section className={css.card} aria-labelledby="ann-fmt">
            <h2 id="ann-fmt" data-ann-selected-label={selected ? selected.id : ""}>
              {selected ? `Seçili: ${{ pen: "Kalem çizimi", arrow: "Ok", circle: "Daire", bubble: `Baloncuk ${bubbles.findIndex((b) => b.id === selected.id) + 1}`, text: "Metin" }[selected.t]}` : "Biçim"}
            </h2>
            <p className={css.hint} style={{ margin: "0 0 8px" }}>
              {selected ? "Renk ve kalınlık değişikliği yalnız bu öğeye uygulanır (haritada kesik çizgili çerçeveyle işaretli). Seçimi kaldırınca sonraki çizimlere uygulanır." : "Renk ve kalınlık sonraki çizimlere uygulanır; mevcut öğeler değişmez."}
            </p>
            <div className={css.swatches} role="radiogroup" aria-label="Renk">
              {(Object.keys(ANN_COLORS) as AnnColor[]).map((c) => {
                const on = selected ? selected.c === c : color === c;
                return (
                  <button key={c} type="button" role="radio" aria-checked={on} aria-label={ANN_COLOR_LABEL[c]} className={`${css.sw} ${on ? css.swOn : ""}`} style={{ background: ANN_COLORS[c] }}
                    onClick={() => { setColor(c); if (selected) updateSel((el) => ({ ...el, c }), true); }} data-ann-color={c} />
                );
              })}
            </div>
            {!selected || selected.t === "pen" || selected.t === "arrow" || selected.t === "circle" ? (
              <div className={css.seg} role="radiogroup" aria-label="Çizgi kalınlığı">
                {ANN_WIDTHS.map((w) => {
                  const on = selected && "w" in selected ? selected.w === w : width === w;
                  return (
                    <button key={w} type="button" role="radio" aria-checked={on} className={`${css.segBtn} ${on ? css.segOn : ""}`}
                      onClick={() => { setWidth(w); if (selected && "w" in selected) updateSel((el) => ({ ...el, w } as AnnEl), true); }} data-ann-width={w}>
                      {w === 2 ? "İnce" : w === 4 ? "Orta" : "Kalın"}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {(!selected && tool === "text") || selected?.t === "text" ? (
              <div className={css.seg} role="radiogroup" aria-label="Metin boyutu">
                {ANN_TEXT_SIZES.map((z) => {
                  const on = selected?.t === "text" ? selected.z === z : textSize === z;
                  return (
                    <button key={z} type="button" role="radio" aria-checked={on} className={`${css.segBtn} ${on ? css.segOn : ""}`}
                      onClick={() => { setTextSize(z); if (selected?.t === "text") updateSel((el) => ({ ...el, z } as AnnEl), true); }}>
                      {z === 14 ? "Küçük" : z === 18 ? "Orta" : "Büyük"}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {selected?.t === "bubble" ? (
              <div style={{ marginTop: 12 }} data-ann-bubble-controls>
                <span className={css.hint}>Gösterim</span>
                <div className={css.seg} role="radiogroup" aria-label="Baloncuk gösterimi" style={{ marginTop: 4 }}>
                  <button type="button" role="radio" aria-checked={selected.m !== "in"} className={`${css.segBtn} ${selected.m !== "in" ? css.segOn : ""}`}
                    onClick={() => updateSel((el) => { const { m: _m, ...rest } = el as Extract<AnnEl, { t: "bubble" }>; void _m; return rest as AnnEl; }, true)} data-ann-bubble-mode="pop">Numara + açılır not</button>
                  <button type="button" role="radio" aria-checked={selected.m === "in"} className={`${css.segBtn} ${selected.m === "in" ? css.segOn : ""}`}
                    onClick={() => { updateSel((el) => ({ ...el, m: "in" } as AnnEl), true); setOpenBubble(null); }} data-ann-bubble-mode="in">Metin baloncuk içinde</button>
                </div>
                <div className={css.row} style={{ marginTop: 8 }}>
                  <button type="button" className={`${base.btn} ${base.ghost} ${css.big}`} data-ann-bubble-smaller
                    onClick={() => updateSel((el) => {
                      const b = el as Extract<AnnEl, { t: "bubble" }>;
                      if (b.m === "in") { const bx = bubbleBox(b); return { ...b, bw: clampN(bx.w * 0.85, ANN_BOX.minW, ANN_BOX.maxW), bh: clampN(bx.h * 0.85, ANN_BOX.minH, ANN_BOX.maxH) }; }
                      return { ...b, r: clampN(bubbleR(b) - 3, ANN_BUBBLE_R.min, ANN_BUBBLE_R.max) };
                    }, true)}>Küçült</button>
                  <button type="button" className={`${base.btn} ${base.ghost} ${css.big}`} data-ann-bubble-bigger
                    onClick={() => updateSel((el) => {
                      const b = el as Extract<AnnEl, { t: "bubble" }>;
                      if (b.m === "in") { const bx = bubbleBox(b); return { ...b, bw: clampN(bx.w * 1.18, ANN_BOX.minW, ANN_BOX.maxW), bh: clampN(bx.h * 1.18, ANN_BOX.minH, ANN_BOX.maxH) }; }
                      return { ...b, r: clampN(bubbleR(b) + 3, ANN_BUBBLE_R.min, ANN_BUBBLE_R.max) };
                    }, true)}>Büyüt</button>
                  {selected.n.trim() ? <button type="button" className={`${base.btn} ${base.ghost} ${css.big}`} onClick={() => setBigBubble(selected.id)} data-ann-bubble-expand><Maximize2 size={16} aria-hidden /> Genişlet</button> : null}
                </div>
                <p className={css.hint} style={{ marginTop: 6 }}>
                  {selected.m === "in" ? "Kutunun sağ alt köşesindeki tutamaçla boyutu değiştirin; metni kutunun içine de yazabilirsiniz." : "Dairenin sağındaki tutamaçla da büyütüp küçültebilirsiniz."}
                </p>
              </div>
            ) : null}
            {selected?.t === "bubble" ? (
              <label style={{ display: "block", marginTop: 12 }}>
                <span className={css.hint}>Not {bubbles.findIndex((b) => b.id === selected.id) + 1}{selected.a ? ` · ${anchorLabel(selected.a)}` : ""}</span>
                <textarea ref={noteRef} className={css.ta} maxLength={ANN_MAX_NOTE} value={selected.n} placeholder="Baloncuğa tıklandığında görünecek not…"
                  onFocus={beginEdit} onBlur={endEdit} data-ann-note-input
                  onChange={(e) => { const n = e.target.value.replace(BAD_CHARS, ""); updateSel((el) => ({ ...el, n } as AnnEl), false); }} />
                <small className={css.count}>{selected.n.length}/{ANN_MAX_NOTE} · &lt; ve &gt; kullanılamaz</small>
              </label>
            ) : null}
            {selected?.t === "text" ? (
              <label style={{ display: "block", marginTop: 12 }}>
                <span className={css.hint}>Metin{selected.a ? ` · ${anchorLabel(selected.a)}` : ""}</span>
                <input className={css.inp} maxLength={ANN_MAX_TEXT} value={selected.s} onFocus={beginEdit} onBlur={endEdit} data-ann-text-edit
                  onChange={(e) => { const s = e.target.value.replace(BAD_CHARS, "").replace(/\n/g, " "); updateSel((el) => ({ ...el, s } as AnnEl), false); }} />
              </label>
            ) : null}
            {pendingText && !selected ? (
              <form style={{ marginTop: 12 }} onSubmit={(e) => {
                e.preventDefault();
                const s = textDraft.replace(BAD_CHARS, "").trim();
                if (!s) return;
                if (full) { setMsg({ ok: false, text: `En çok ${ANN_MAX_ELS} öğe eklenebilir.` }); return; }
                const el = placeAnchored({ id: newAnnId("text"), t: "text", c: color, x: 0, y: 0, a: null, s, z: textSize }, pendingText, front);
                commit([...els, el]); setPendingText(null); setTextDraft("");
              }}>
                <span className={css.hint}>Haritada tıkladığınız noktaya metin notu</span>
                <input className={css.inp} autoFocus maxLength={ANN_MAX_TEXT} value={textDraft} onChange={(e) => setTextDraft(e.target.value.replace(BAD_CHARS, ""))} placeholder="Kısa metin…" data-ann-text-input />
                <div className={css.row}>
                  <button type="submit" className={`${base.btn} ${base.save} ${css.big}`} disabled={!textDraft.trim()} data-ann-text-add>Metni ekle</button>
                  <button type="button" className={`${base.btn} ${base.ghost} ${css.big}`} onClick={() => setPendingText(null)}>Vazgeç</button>
                </div>
              </form>
            ) : null}
            {selected && (selected.t === "circle" || selected.t === "arrow") ? (
              <p className={css.hint} style={{ marginTop: 10 }} data-ann-target-label>
                Hedef: {selected.t === "circle" ? anchorLabel(selected.a) ?? "serbest alan" : `${anchorLabel(selected.a1) ?? "serbest"} → ${anchorLabel(selected.a2) ?? "serbest"}`}
              </p>
            ) : null}
            {selected ? (
              <div className={css.row}>
                <button type="button" className={`${base.btn} ${base.danger} ${css.big}`} onClick={() => remove(selected.id)} data-ann-delete-selected><Trash2 size={16} aria-hidden /> Öğeyi sil</button>
                <button type="button" className={`${base.btn} ${base.ghost} ${css.big}`} onClick={() => { setSelectedId(null); setOpenBubble(null); }} data-ann-deselect>Seçimi Kaldır</button>
              </div>
            ) : (
              <p className={css.hint} style={{ marginTop: 10 }}>
                {tool === "pen" ? "Fare, parmak veya kalemle serbest çizin." : tool === "arrow" ? "Başlangıçtan bitişe sürükleyin." : tool === "circle" ? "Merkezden dışa sürükleyerek vurgu dairesi çizin."
                  : tool === "bubble" ? "Haritaya dokunun: numaralı not baloncuğu eklenir; notu yan panelde yazın." : tool === "text" ? "Haritaya dokunun, ardından metni yazın."
                  : tool === "select" ? "Bir öğeye dokunup sürükleyerek taşıyın." : "Silmek için öğeye dokunun."}
              </p>
            )}
          </section>

          <section className={css.card} aria-labelledby="ann-notes">
            <h2 id="ann-notes">Notlar ({bubbles.length})</h2>
            {bubbles.length ? (
              <ul className={css.notes} data-ann-notes>
                {bubbles.map((b, i) => (
                  <li key={b.id}>
                    <button type="button" className={`${css.noteRow} ${selectedId === b.id ? css.noteOn : ""}`} onClick={() => { setTool("select"); setSelectedId(b.id); setOpenBubble(b.id); }} data-ann-note-row={b.id}>
                      <span className={css.num} style={{ background: ANN_COLORS[b.c] }}>{i + 1}</span>
                      <span className={css.noteTxt}><small>{anchorLabel(b.a) ?? "Serbest konum"}</small>{b.n.trim() || "(boş not)"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className={css.hint}>Henüz baloncuk notu yok. “Baloncuk” aracıyla haritaya dokunun.</p>}
          </section>

          <section className={css.card} aria-labelledby="ann-gnotes" data-ann-notes-card={noteDraft !== null ? "edit" : "view"}>
            <h2 id="ann-gnotes">Eğitim notları</h2>
            {noteDraft !== null ? (
              <>
                <textarea className={css.ta} maxLength={ANN_MAX_NOTES} value={noteDraft} placeholder="Bu harita için ders notlarınız (yalnız size görünür)…"
                  onChange={(e) => { setNoteDraft(e.target.value.replace(BAD_CHARS, "")); setMsg(null); }} data-ann-general-notes aria-label="Eğitim notları" />
                <small className={css.count}>{noteDraft.length}/{ANN_MAX_NOTES} · &lt; ve &gt; kullanılamaz</small>
              </>
            ) : (
              <div className={css.noteView} data-ann-notes-view aria-label="Eğitim notları (salt okunur)">
                {notes.trim() ? notes : <span className={css.noteEmpty}>Henüz eğitim notu yok. Yazmak için Düzenle&apos;ye basın.</span>}
              </div>
            )}
            <div className={css.noteBtns}>
              {noteDraft === null ? (
                <button type="button" className={`${base.btn} ${base.ghost}`} onClick={() => setNoteDraft(notes)} data-ann-notes-edit><PencilLine size={15} aria-hidden /> Düzenle</button>
              ) : (
                <>
                  <button type="button" className={`${base.btn} ${base.save}`} disabled={busy || !notesDirty} onClick={() => void saveNotes(noteDraft, "Eğitim notları kaydedildi.")} data-ann-notes-save>Kaydet</button>
                  <button type="button" className={`${base.btn} ${base.ghost}`} onClick={() => setNoteDraft(null)} data-ann-notes-cancel>Vazgeç</button>
                </>
              )}
              <button type="button" className={`${base.btn} ${base.ghost}`} onClick={() => setNotesBig(true)} data-ann-notes-expand><Maximize2 size={15} aria-hidden /> Büyüt</button>
              {noteDraft === null && notes ? (
                <button type="button" className={`${base.btn} ${base.danger}`} onClick={() => setModal({ kind: "notesDelete" })} data-ann-notes-delete><Trash2 size={15} aria-hidden /> Sil</button>
              ) : null}
            </div>
          </section>

          <section className={css.card} aria-labelledby="ann-layer">
            <h2 id="ann-layer">Katman</h2>
            <p className={css.hint}>{els.length} öğe{notes.trim() ? " + eğitim notu" : ""} · yalnız size görünür. Çizimler haritanın kendi koordinatlarında saklanır; her cihazda aynı yerde görünür.</p>
            <div className={css.row}>
              <button type="button" className={`${base.btn} ${base.danger} ${css.big}`} disabled={!revision && !els.length && !notes} onClick={() => setModal({ kind: "clear" })} data-ann-clear>
                <Trash2 size={16} aria-hidden /> Tüm katmanı temizle
              </button>
            </div>
          </section>
        </aside>
      </div>

      {modal ? (
        <div className={css.ovl} role="dialog" aria-modal="true" aria-labelledby="ann-mdl" data-ann-modal={modal.kind}>
          <div className={css.mdl}>
            {modal.kind === "conflict" ? (
              <>
                <h2 id="ann-mdl">Çalışma alanı başka yerde değişti</h2>
                <p>Bu katman siz düzenlerken başka bir pencerede veya cihazda kaydedildi. Hiçbir şey sessizce üzerine yazılmadı.</p>
                <p>Sunucudaki sürümü yükleyebilir ya da kendi değişikliklerinizi bilerek onun yerine kaydedebilirsiniz.</p>
                <div className={css.row}>
                  <button type="button" className={`${base.btn} ${base.ghost} ${css.big}`} onClick={() => { setModal(null); setPhase("loading"); void load(); }} data-ann-conflict-load>Sunucudakini yükle</button>
                  <button type="button" className={`${base.btn} ${base.save} ${css.big}`} disabled={busy || modal.current === null}
                    onClick={() => { if (modal.current !== null) void save(false, modal.current); }} data-ann-conflict-overwrite>Benimkini kaydet</button>
                  <button type="button" className={`${base.btn} ${base.ghost} ${css.big}`} onClick={() => setModal(null)}>Vazgeç</button>
                </div>
              </>
            ) : modal.kind === "clear" ? (
              <>
                <h2 id="ann-mdl">Tüm katman silinsin mi?</h2>
                <p>Bu haritadaki <b>tüm çizimleriniz ve notlarınız</b> kalıcı olarak silinir. BodyGraph, danışan ve kayıt etkilenmez.</p>
                <div className={css.row}>
                  <button type="button" className={`${base.btn} ${base.danger} ${css.big}`} disabled={busy} data-ann-clear-confirm onClick={async () => {
                    if (!revision) { commit([]); setNotes(""); setNoteDraft(null); setModal(null); return; }
                    setBusy(true);
                    const r = await annClear(kind, sourceId, revision);
                    setBusy(false);
                    if (r.ok) { setEls([]); setNotes(""); setNoteDraft(null); setSaved(snapshot([], "")); setRevision(0); setPast([]); setFuture([]); setSelectedId(null); setModal(null); setMsg({ ok: true, text: "Katman temizlendi." }); }
                    else if (r.status === 409) setModal({ kind: "conflict", current: r.currentRevision });
                    else { setModal(null); setMsg({ ok: false, text: r.error }); }
                  }}>Evet, tümünü sil</button>
                  <button type="button" className={`${base.btn} ${base.ghost} ${css.big}`} onClick={() => setModal(null)}>Vazgeç</button>
                </div>
              </>
            ) : modal.kind === "notesDelete" ? (
              <>
                <h2 id="ann-mdl">Eğitim notları silinsin mi?</h2>
                <p>Bu haritadaki <b>eğitim notlarınızın tamamı</b> kalıcı olarak silinir. Çizimler ve baloncuk notları etkilenmez.</p>
                <div className={css.row}>
                  <button type="button" className={`${base.btn} ${base.danger} ${css.big}`} disabled={busy} data-ann-notes-delete-confirm
                    onClick={() => void saveNotes("", "Eğitim notları silindi.")}>Evet, notları sil</button>
                  <button type="button" className={`${base.btn} ${base.ghost} ${css.big}`} onClick={() => setModal(null)}>Vazgeç</button>
                </div>
              </>
            ) : (
              <>
                <h2 id="ann-mdl">Kaydedilmemiş değişiklikler var</h2>
                <p>Çıkarsanız son kayıttan sonraki çizim ve notlar kaybolur.</p>
                <div className={css.row}>
                  <button type="button" className={`${base.btn} ${base.save} ${css.big}`} disabled={busy} onClick={async () => { const href = modal.href; if (await save(false)) router.push(href); }} data-ann-leave-save>Kaydet ve çık</button>
                  <button type="button" className={`${base.btn} ${base.danger} ${css.big}`} onClick={() => { setSaved(snapshot(els, notes)); setNoteDraft(null); router.push(modal.href); }} data-ann-leave-discard>Kaydetmeden çık</button>
                  <button type="button" className={`${base.btn} ${base.ghost} ${css.big}`} onClick={() => setModal(null)}>Vazgeç</button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
      {bigWindows}
    </div>
  );
}
