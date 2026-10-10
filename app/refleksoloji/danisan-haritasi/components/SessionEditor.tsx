"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import {
  MARK_INTENSITIES,
  MARK_INTENSITY_LABEL,
  MARK_NOTE_MAX,
  MARK_SIZES,
  MARK_SIZE_LABEL,
  MARKS_PER_SESSION_MAX,
  MARK_SURFACES,
  SESSION_NOTE_MAX,
  SESSION_TITLE_MAX,
  SURFACE_DEFS,
  countBySurface,
  describeMark,
  marksForSurface,
  surfaceLabel,
  surfaceView,
  type MarkIntensity,
  type MarkSession,
  type MarkSide,
  type MarkSize,
  type MarkSurface,
} from "@/lib/refleksoloji/markSurfaces";
import { runBulkDeleteConfirm } from "@/lib/ui/bulkDeleteGuard";
import {
  MarksApiError,
  addMark,
  deleteMark,
  deleteSurfaceMarks,
  getSession,
  newSourceUid,
  patchMark,
  updateSession,
} from "../lib/marksApi";
import { MarkCanvas, type CanvasMark } from "./MarkCanvas";

const chip =
  "min-h-[44px] rounded-lg border px-3 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";
const chipOn = "border-violet-700 bg-violet-700 text-white shadow-sm";
const chipOff = "border-violet-200 bg-white text-violet-950 hover:border-violet-400";

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T | null;
  options: ReadonlyArray<{ value: T | null; label: string }>;
  onChange: (v: T | null) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 hidden text-xs font-bold text-slate-700 sm:inline">{label}</span>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`${chip} ${on ? chipOn : chipOff} disabled:opacity-50`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const SIZE_OPTIONS = MARK_SIZES.map((s) => ({ value: s, label: MARK_SIZE_LABEL[s] }));
const INTENSITY_OPTIONS: ReadonlyArray<{ value: MarkIntensity | null; label: string }> = [
  { value: null, label: "Yok" },
  ...MARK_INTENSITIES.map((i) => ({ value: i, label: MARK_INTENSITY_LABEL[i] })),
];

function MarkNoteEditor({
  initial,
  disabled,
  readOnly,
  onSave,
  onDelete,
}: {
  initial: string;
  disabled: boolean;
  readOnly: boolean;
  onSave: (note: string | null) => void;
  onDelete: () => void;
}) {
  const [note, setNote] = useState(initial);
  return (
    <>
      <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
        Nokta notu
        <textarea
          value={note}
          maxLength={MARK_NOTE_MAX}
          rows={2}
          disabled={disabled}
          onChange={(e) => setNote(e.target.value)}
          className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-base sm:text-sm"
          placeholder="Örn. hassasiyet, gözlem"
        />
      </label>
      {!readOnly ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled || note.trim() === initial}
            onClick={() => onSave(note.trim() || null)}
            className="min-h-[44px] rounded-lg bg-violet-700 px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            Notu kaydet
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onDelete}
            className="min-h-[44px] rounded-lg border border-rose-300 bg-white px-4 text-sm font-bold text-rose-700 hover:border-rose-500 disabled:opacity-50"
          >
            Noktayı sil
          </button>
        </div>
      ) : null}
    </>
  );
}

export function SessionEditor({
  clientId,
  sessionId,
  readOnly,
  onSessionGone,
}: {
  clientId: string;
  sessionId: string;
  readOnly: boolean;
  onSessionGone: () => void;
}) {
  const { confirm } = useConfirm();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [session, setSession] = useState<MarkSession | null>(null);
  const [marks, setMarks] = useState<CanvasMark[]>([]);
  const marksRef = useRef<CanvasMark[]>([]);
  useEffect(() => {
    marksRef.current = marks;
  }, [marks]);
  const goneRef = useRef(onSessionGone);
  useEffect(() => {
    goneRef.current = onSessionGone;
  }, [onSessionGone]);

  const [surface, setSurface] = useState<MarkSurface>("foot_sole");
  const [side, setSide] = useState<MarkSide>("right");
  const [mode, setMode] = useState<"add" | "select">("add");
  const [newSize, setNewSize] = useState<MarkSize>("medium");
  const [newIntensity, setNewIntensity] = useState<MarkIntensity | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [infoOpen, setInfoOpen] = useState(false);
  const [draftDate, setDraftDate] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [infoBusy, setInfoBusy] = useState(false);

  const effSide: MarkSide = SURFACE_DEFS[surface].sided ? side : "none";
  const view = useMemo(() => surfaceView(surface, effSide), [surface, effSide]);
  const surfaceMarks = useMemo(() => marksForSurface(marks, surface, effSide), [marks, surface, effSide]);
  const counts = useMemo(() => countBySurface(marks), [marks]);
  const selected = useMemo(() => surfaceMarks.find((m) => m.id === selectedId) ?? null, [surfaceMarks, selectedId]);
  const selectedIndex = selected ? surfaceMarks.findIndex((m) => m.id === selected.id) + 1 : 0;

  // Yükleme sonucu yalnız promise geri çağrısında state'e yazılır (effect gövdesinde setState yok).
  const load = useCallback(
    () =>
      getSession(sessionId).then(
        (r) => {
          setLoading(false);
          if (r.session.client_id !== clientId) {
            // URL'de danışan/seans uyuşmazlığı → başka danışanın seansı bu ekranda AÇILMAZ.
            showToast({ type: "error", title: "Seans bulunamadı", message: "Seans bu danışana ait değil." });
            goneRef.current();
            return;
          }
          setLoadError(null);
          setSession(r.session);
          setMarks(r.marks);
          setDraftDate(r.session.session_date);
          setDraftTitle(r.session.title ?? "");
          setDraftNote(r.session.note ?? "");
        },
        (e: unknown) => {
          setLoading(false);
          if (e instanceof MarksApiError && e.status === 404) {
            showToast({ type: "error", title: "Seans bulunamadı", message: "Seans silinmiş veya erişiminiz yok." });
            goneRef.current();
            return;
          }
          setLoadError(e instanceof Error ? e.message : "Seans yüklenemedi.");
        },
      ),
    [clientId, sessionId, showToast],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const retry = () => {
    setLoading(true);
    setLoadError(null);
    void load();
  };

  // Yüzey/taraf değişince seçim temizlenir (başka yüzeyin noktası seçili kalmaz).
  const changeSurface = (s: MarkSurface) => {
    setSurface(s);
    setSelectedId(null);
  };
  const changeSide = (s: MarkSide) => {
    setSide(s);
    setSelectedId(null);
  };

  const fail = useCallback(
    (title: string, e: unknown) => {
      showToast({ type: "error", title, message: e instanceof Error ? e.message : "Tekrar deneyin." });
    },
    [showToast],
  );

  // ─── Nokta işlemleri (iyimser + hata halinde geri al) ─────────────────────────
  const handleAdd = useCallback(
    async (x: number, y: number) => {
      if (readOnly) return;
      if (marksRef.current.length >= MARKS_PER_SESSION_MAX) {
        showToast({ type: "warning", title: "Sınır", message: `Bir seansta en fazla ${MARKS_PER_SESSION_MAX} nokta olabilir.` });
        return;
      }
      const uid = newSourceUid();
      const tempId = `tmp-${uid}`;
      const now = new Date().toISOString();
      const temp: CanvasMark = {
        id: tempId,
        session_id: sessionId,
        surface,
        side: effSide,
        x,
        y,
        size: newSize,
        intensity: newIntensity,
        note: null,
        created_at: now,
        updated_at: now,
        pending: true,
      };
      setMarks((prev) => [...prev, temp]);
      setSelectedId(tempId);
      try {
        const saved = await addMark(
          sessionId,
          { surface, side: effSide, x, y, size: newSize, intensity: newIntensity, note: null },
          uid,
        );
        setMarks((prev) => prev.map((m) => (m.id === tempId ? saved : m)));
        setSelectedId((cur) => (cur === tempId ? saved.id : cur));
      } catch (e) {
        setMarks((prev) => prev.filter((m) => m.id !== tempId));
        setSelectedId((cur) => (cur === tempId ? null : cur));
        fail("Nokta eklenemedi", e);
      }
    },
    [readOnly, sessionId, surface, effSide, newSize, newIntensity, showToast, fail],
  );

  const applyPatch = useCallback(
    async (id: string, patch: Partial<Pick<CanvasMark, "x" | "y" | "size" | "intensity" | "note">>, failTitle: string) => {
      if (readOnly || id.startsWith("tmp-")) return false;
      const before = marksRef.current.find((m) => m.id === id);
      if (!before) return false;
      setMarks((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
      try {
        const saved = await patchMark(id, patch);
        setMarks((prev) => prev.map((m) => (m.id === id ? saved : m)));
        return true;
      } catch (e) {
        setMarks((prev) => prev.map((m) => (m.id === id ? before : m)));
        fail(failTitle, e);
        if (e instanceof MarksApiError && e.status === 404) void load();
        return false;
      }
    },
    [readOnly, fail, load],
  );

  const handleMove = useCallback(
    (id: string, x: number, y: number) => void applyPatch(id, { x, y }, "Nokta taşınamadı"),
    [applyPatch],
  );

  const handleDeleteOne = useCallback(
    async (id: string) => {
      if (readOnly || id.startsWith("tmp-")) return;
      const idx = marksForSurface(marksRef.current, surface, effSide).findIndex((m) => m.id === id) + 1;
      const ok = await confirm({
        title: "Noktayı sil",
        message: `${idx > 0 ? `${idx}. nokta` : "Nokta"} silinsin mi?`,
        confirmText: "Sil",
        cancelText: "Vazgeç",
        tone: "danger",
      });
      if (!ok) return;
      const before = marksRef.current;
      setMarks((prev) => prev.filter((m) => m.id !== id));
      setSelectedId((cur) => (cur === id ? null : cur));
      try {
        await deleteMark(id);
      } catch (e) {
        if (e instanceof MarksApiError && e.status === 404) return; // zaten silinmiş
        setMarks(before);
        fail("Nokta silinemedi", e);
      }
    },
    [readOnly, surface, effSide, confirm, fail],
  );

  const handleDeleteSurface = useCallback(async () => {
    if (readOnly || bulkBusy) return;
    const list = marksForSurface(marksRef.current, surface, effSide).filter((m) => !m.pending);
    if (list.length === 0) return;
    // "Tümünü Sil" → sayıdan bağımsız 3 aşamalı onay (sistem kuralı).
    const ok = await runBulkDeleteConfirm(confirm, {
      count: list.length,
      deleteAll: true,
      noun: "nokta",
      detail: `${surfaceLabel(surface, effSide)} yüzeyindeki ${list.length} nokta silinecek. Diğer yüzeylerdeki noktalar korunur.`,
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      await deleteSurfaceMarks(sessionId, { surface, side: effSide }, list.length);
      const ids = new Set(list.map((m) => m.id));
      setMarks((prev) => prev.filter((m) => !ids.has(m.id)));
      setSelectedId(null);
      showToast({ type: "success", title: "Silindi", message: `${list.length} nokta silindi.` });
    } catch (e) {
      fail("Noktalar silinemedi", e);
      if (e instanceof MarksApiError && e.code === "MARK_COUNT_CHANGED") void load();
    } finally {
      setBulkBusy(false);
    }
  }, [readOnly, bulkBusy, surface, effSide, confirm, sessionId, showToast, fail, load]);

  async function saveInfo(e: React.FormEvent) {
    e.preventDefault();
    if (!session || readOnly || infoBusy) return;
    setInfoBusy(true);
    try {
      const s = await updateSession(session.id, {
        session_date: draftDate,
        title: draftTitle.trim() || null,
        note: draftNote.trim() || null,
      });
      setSession((prev) => (prev ? { ...prev, ...s } : prev));
      showToast({ type: "success", title: "Kaydedildi", message: "Seans bilgisi güncellendi." });
      setInfoOpen(false);
    } catch (err) {
      fail("Kaydedilemedi", err);
    } finally {
      setInfoBusy(false);
    }
  }

  if (loading && !session) {
    return <p className="rounded-xl bg-white/80 p-4 text-sm text-slate-600">Seans yükleniyor…</p>;
  }
  if (loadError || !session) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
        {loadError ?? "Seans yüklenemedi."}{" "}
        <button type="button" onClick={retry} className="font-bold underline">
          Tekrar dene
        </button>
      </div>
    );
  }

  const infoDirty =
    draftDate !== session.session_date || draftTitle.trim() !== (session.title ?? "") || draftNote.trim() !== (session.note ?? "");
  const surfaceTotal = (s: MarkSurface) =>
    SURFACE_DEFS[s].sided ? (counts.get(`${s}:right`) ?? 0) + (counts.get(`${s}:left`) ?? 0) : counts.get(`${s}:none`) ?? 0;
  const canvasLabel = `${surfaceLabel(surface, effSide)} haritası — ${surfaceMarks.length} nokta. ${
    readOnly ? "" : mode === "add" ? "Nokta eklemek için haritaya dokunun." : "Seçmek için noktaya dokunun, taşımak için sürükleyin."
  }`;

  return (
    <div className="flex w-full flex-col gap-3">
      {/* Seans başlığı + bilgi düzenleme */}
      <section className="rounded-2xl border border-white/80 bg-white/85 px-3 py-2 shadow-sm ring-1 ring-violet-100 sm:py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="hidden text-xs font-bold uppercase tracking-wider text-violet-700 sm:block">Seans</p>
            <p className="truncate text-sm font-black text-slate-900 sm:text-base">
              {formatDate(session.session_date)}
              {session.title ? <span className="font-semibold text-slate-700"> — {session.title}</span> : null}
              <span className="ml-2 text-sm font-semibold text-slate-600">· {marks.length} nokta</span>
            </p>
          </div>
          <button
            type="button"
            aria-expanded={infoOpen}
            aria-controls="dh-session-info"
            onClick={() => setInfoOpen((v) => !v)}
            className={`${chip} ${chipOff} shrink-0`}
          >
            {infoOpen ? "Kapat" : (
              <>
                <span className="sm:hidden">Not</span>
                <span className="hidden sm:inline">Seans bilgisi / not</span>
              </>
            )}
          </button>
        </div>
        {infoOpen ? (
          <form id="dh-session-info" onSubmit={saveInfo} className="mt-3 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
            <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
              Tarih
              <input
                type="date"
                required
                value={draftDate}
                disabled={readOnly}
                onChange={(e) => setDraftDate(e.target.value)}
                className="min-h-[44px] rounded-lg border border-violet-200 bg-white px-3 text-base sm:text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
              Başlık
              <input
                type="text"
                value={draftTitle}
                maxLength={SESSION_TITLE_MAX}
                disabled={readOnly}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="min-h-[44px] rounded-lg border border-violet-200 bg-white px-3 text-base sm:text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700 sm:col-span-2">
              Seans notu (mesleki)
              <textarea
                value={draftNote}
                maxLength={SESSION_NOTE_MAX}
                disabled={readOnly}
                rows={4}
                onChange={(e) => setDraftNote(e.target.value)}
                className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-base sm:text-sm"
              />
              <span className="text-xs font-medium text-slate-500">
                {draftNote.length}/{SESSION_NOTE_MAX}
              </span>
            </label>
            {!readOnly ? (
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <button
                  type="submit"
                  disabled={!infoDirty || infoBusy || !draftDate}
                  className="min-h-[44px] rounded-lg bg-violet-700 px-4 text-sm font-bold text-white disabled:opacity-50"
                >
                  {infoBusy ? "Kaydediliyor…" : "Kaydet"}
                </button>
                {infoDirty ? <span className="self-center text-xs font-semibold text-amber-700">Kaydedilmemiş değişiklik var</span> : null}
              </div>
            ) : null}
          </form>
        ) : null}
      </section>

      {/* Yüzey seçimi */}
      <nav aria-label="Harita yüzeyi" className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        <div role="tablist" className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
          {MARK_SURFACES.map((s) => {
            const on = s === surface;
            const n = surfaceTotal(s);
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => changeSurface(s)}
                className={`${chip} whitespace-nowrap ${on ? chipOn : chipOff}`}
              >
                {SURFACE_DEFS[s].label}
                <span className={`ml-1.5 rounded-full px-1.5 text-xs ${on ? "bg-white/20" : "bg-violet-100 text-violet-900"}`}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="grid w-full gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        {/* Harita */}
        <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-white/90 bg-white shadow-sm ring-1 ring-violet-100">
          <div className="flex flex-wrap items-center gap-2 border-b border-violet-100 px-2 py-2 sm:px-3">
            {SURFACE_DEFS[surface].sided ? (
              <Segmented<"right" | "left">
                label="Taraf"
                value={side === "left" ? "left" : "right"}
                options={[
                  { value: "right", label: `Sağ (${counts.get(`${surface}:right`) ?? 0})` },
                  { value: "left", label: `Sol (${counts.get(`${surface}:left`) ?? 0})` },
                ]}
                onChange={(v) => changeSide(v ?? "right")}
              />
            ) : (
              <span className="text-xs font-bold text-slate-700">Ön görünüm — danışanın sağı ekranda solda</span>
            )}
            {!readOnly ? (
              <div className="ml-auto">
                <Segmented<"add" | "select">
                  label="Mod"
                  value={mode}
                  options={[
                    { value: "add", label: "Nokta ekle" },
                    { value: "select", label: "Seç / taşı" },
                  ]}
                  onChange={(v) => setMode(v ?? "add")}
                />
              </div>
            ) : null}
          </div>

          <div className="relative h-[min(62vh,540px)] w-full bg-white sm:h-[min(66vh,620px)] lg:h-[calc(100dvh-300px)] lg:min-h-[520px]">
            <MarkCanvas
              view={view}
              marks={surfaceMarks}
              selectedId={selectedId}
              mode={mode}
              readOnly={readOnly}
              label={canvasLabel}
              onAdd={(x, y) => void handleAdd(x, y)}
              onSelect={setSelectedId}
              onMove={handleMove}
              onDeleteRequest={(id) => void handleDeleteOne(id)}
            />
          </div>
          <p className="border-t border-violet-100 px-3 py-1.5 text-xs font-medium text-slate-600">
            {readOnly
              ? "Salt okunur görünüm."
              : mode === "add"
                ? "Haritaya kısa dokunuş nokta ekler. Kaydırma ve iki parmakla yakınlaştırma nokta eklemez."
                : "Noktaya dokunun: seçilir. Sürükleyin: taşınır. Klavye: Tab ile seçin, ok tuşlarıyla taşıyın."}
          </p>
        </section>

        {/* Araçlar + seçili nokta + liste */}
        <aside className="flex min-w-0 flex-col gap-3">
          {!readOnly ? (
            <section className="rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm ring-1 ring-violet-100" aria-labelledby="dh-new-mark">
              <h3 id="dh-new-mark" className="mb-2 text-sm font-black text-slate-800">
                Yeni nokta ayarı
              </h3>
              <div className="flex flex-col gap-2">
                <Segmented<MarkSize> label="Boyut" value={newSize} options={SIZE_OPTIONS} onChange={(v) => setNewSize(v ?? "medium")} />
                <Segmented<MarkIntensity> label="Yoğunluk" value={newIntensity} options={INTENSITY_OPTIONS} onChange={setNewIntensity} />
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm ring-1 ring-violet-100" aria-labelledby="dh-sel-mark" aria-live="polite">
            <h3 id="dh-sel-mark" className="mb-2 text-sm font-black text-slate-800">
              {selected ? `Seçili: ${selectedIndex}. nokta` : "Seçili nokta yok"}
            </h3>
            {selected ? (
              <div className="flex flex-col gap-2">
                <Segmented<MarkSize>
                  label="Boyut"
                  value={selected.size}
                  options={SIZE_OPTIONS}
                  disabled={readOnly || !!selected.pending}
                  onChange={(v) => v && v !== selected.size && void applyPatch(selected.id, { size: v }, "Boyut değiştirilemedi")}
                />
                <Segmented<MarkIntensity>
                  label="Yoğunluk"
                  value={selected.intensity}
                  options={INTENSITY_OPTIONS}
                  disabled={readOnly || !!selected.pending}
                  onChange={(v) => v !== selected.intensity && void applyPatch(selected.id, { intensity: v }, "Yoğunluk değiştirilemedi")}
                />
                <MarkNoteEditor
                  key={selected.id}
                  initial={selected.note ?? ""}
                  disabled={readOnly || !!selected.pending}
                  readOnly={readOnly}
                  onSave={(note) => void applyPatch(selected.id, { note }, "Not kaydedilemedi")}
                  onDelete={() => void handleDeleteOne(selected.id)}
                />
              </div>
            ) : (
              <p className="text-sm text-slate-600">Haritada bir noktaya ya da aşağıdaki listeden bir satıra dokunun.</p>
            )}
          </section>

          <section className="rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm ring-1 ring-violet-100" aria-labelledby="dh-list">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 id="dh-list" className="text-sm font-black text-slate-800">
                {surfaceLabel(surface, effSide)} · {surfaceMarks.length} nokta
              </h3>
              {!readOnly && surfaceMarks.length > 0 ? (
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => void handleDeleteSurface()}
                  className="min-h-[44px] rounded-lg border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700 hover:border-rose-400 disabled:opacity-50"
                >
                  {bulkBusy ? "Siliniyor…" : "Tümünü sil"}
                </button>
              ) : null}
            </div>
            {surfaceMarks.length === 0 ? (
              <p className="text-sm text-slate-600">Bu yüzeyde nokta yok.</p>
            ) : (
              <ol className="max-h-72 divide-y divide-violet-50 overflow-y-auto rounded-lg border border-violet-100">
                {surfaceMarks.map((m, i) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(m.id)}
                      aria-pressed={m.id === selectedId}
                      className={`flex min-h-[44px] w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                        m.id === selectedId ? "bg-violet-100 font-bold" : "hover:bg-violet-50"
                      }`}
                    >
                      <span className="truncate">{describeMark(m, i + 1)}</span>
                      {m.pending ? <span className="ml-auto shrink-0 text-xs text-slate-500">kaydediliyor…</span> : null}
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
