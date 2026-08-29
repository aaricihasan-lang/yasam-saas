"use client";

import { useEffect, useMemo, useState } from "react";
import { kupaBtnDanger, kupaBtnGhost, kupaBtnPrimary, kupaInput } from "../../components/KupaShell";
import {
  createTechniqueSafety,
  deleteTechniqueSafety,
  listSafety,
  listTechniqueSafety,
  updateTechniqueSafety,
  type CuppingSafetyNote,
  type CuppingTechniqueSafety,
} from "../../lib/api";
import { CONTRA_CLASS_LABEL, SAFETY_SEVERITY_LABEL } from "../lib/labels";
import { SafetyPickerDialog } from "./SafetyPickerDialog";

/**
 * "Güvenlik ve Dikkat" — İKİ katman:
 *   A. safety_note  → tekniğe özel kısa serbest dikkat notu (technique master alanı).
 *   B. cupping_technique_safety → structured master güvenlik kayıtlarıyla ilişki.
 * Bölüm hatası ana okuyucuyu BOZMAZ. Ham severity kodu değil, sakin TR etiket gösterilir.
 */
export function TechniqueSafetySection({
  techniqueId,
  safetyNote,
}: {
  techniqueId: string;
  safetyNote: string | null | undefined;
}) {
  const [rels, setRels] = useState<CuppingTechniqueSafety[] | null>(null);
  const [masters, setMasters] = useState<Record<string, CuppingSafetyNote>>({});
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [noteDraft, setNoteDraft] = useState<{ id: string; text: string } | null>(null);

  const [nonce, setNonce] = useState(0);
  const refresh = () => setNonce((n) => n + 1);

  // Yükleme inline async IIFE içinde (effect gövdesinde senkron/isim'li setState YOK).
  // Mutasyon sonrası refresh() nonce'u artırır → effect yeniden koşar. techniqueId sabit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [relRows, masterRows] = await Promise.all([listTechniqueSafety(techniqueId), listSafety()]);
        if (cancelled) return;
        const map: Record<string, CuppingSafetyNote> = {};
        for (const m of masterRows) map[m.id] = m;
        setMasters(map);
        setRels(relRows);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Yüklenemedi.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [techniqueId, nonce]);

  const attachedIds = useMemo(() => new Set((rels ?? []).map((r) => r.safety_id)), [rels]);

  const attach = async (safetyId: string) => {
    setBusy(true);
    setError(null);
    try {
      await createTechniqueSafety({ technique_id: techniqueId, safety_id: safetyId });
      setPickerOpen(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eklenemedi.");
    } finally {
      setBusy(false);
    }
  };

  const detach = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await deleteTechniqueSafety(id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaldırılamadı.");
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async () => {
    if (!noteDraft) return;
    setBusy(true);
    setError(null);
    try {
      await updateTechniqueSafety(noteDraft.id, { note: noteDraft.text.trim() || null });
      setNoteDraft(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Not kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const hasFreeNote = !!(safetyNote && safetyNote.trim());

  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Güvenlik ve Dikkat</h3>
        <button type="button" className={kupaBtnPrimary} onClick={() => setPickerOpen(true)} disabled={busy}>
          + Güvenlik Kaydı Ekle
        </button>
      </div>

      {error ? (
        <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">{error}</p>
      ) : null}

      {/* A. tekniğe özel serbest not */}
      {hasFreeNote ? (
        <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50/50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Tekniğe Özel Not</p>
          <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-slate-700">{safetyNote}</p>
        </div>
      ) : null}

      {/* B. structured technique ↔ safety */}
      <div className="mt-2">
        {rels === null ? (
          <p className="text-[13px] text-slate-400">Yükleniyor…</p>
        ) : rels.length === 0 && !hasFreeNote ? (
          <p className="text-[13px] leading-relaxed text-slate-500">Henüz güvenlik kaydı eklenmemiş.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {rels.map((r) => {
              const m = masters[r.safety_id];
              const editing = noteDraft?.id === r.id;
              return (
                <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-slate-800">{m?.title ?? "Güvenlik kaydı"}</p>
                      <p className="mt-0.5 flex flex-wrap gap-1.5">
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                          {SAFETY_SEVERITY_LABEL[m?.severity ?? "info"] ?? "Bilgi"}
                        </span>
                        {m?.contraindication_class && m.contraindication_class !== "none" ? (
                          <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-700">
                            {CONTRA_CLASS_LABEL[m.contraindication_class] ?? m.contraindication_class}
                          </span>
                        ) : null}
                      </p>
                      {r.note && !editing ? (
                        <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">{r.note}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {!editing ? (
                        <button
                          type="button"
                          className={kupaBtnGhost}
                          onClick={() => setNoteDraft({ id: r.id, text: r.note ?? "" })}
                          disabled={busy}
                        >
                          Not
                        </button>
                      ) : null}
                      <button type="button" className={kupaBtnDanger} onClick={() => detach(r.id)} disabled={busy}>
                        Kaldır
                      </button>
                    </div>
                  </div>
                  {editing ? (
                    <div className="mt-2">
                      <label className="sr-only" htmlFor={`ts-note-${r.id}`}>İlişki notu</label>
                      <textarea
                        id={`ts-note-${r.id}`}
                        className={kupaInput}
                        rows={2}
                        value={noteDraft.text}
                        onChange={(e) => setNoteDraft({ id: r.id, text: e.target.value })}
                        placeholder="Bu güvenlik kaydının bu tekniğe özel notu (opsiyonel)"
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button type="button" className={kupaBtnGhost} onClick={() => setNoteDraft(null)} disabled={busy}>
                          Vazgeç
                        </button>
                        <button type="button" className={kupaBtnPrimary} onClick={saveNote} disabled={busy}>
                          Notu Kaydet
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pickerOpen ? (
        <SafetyPickerDialog attachedIds={attachedIds} onPick={attach} onClose={() => setPickerOpen(false)} />
      ) : null}
    </section>
  );
}
