"use client";

import { useState } from "react";
import { fmtDate } from "../../_components/ownerApi";
import s from "../../_components/owner.module.css";
import type { ActFn, OwnerNote } from "./types";

type Draft = { id: string | null; kind: "note" | "warning"; title: string; body: string; visible: boolean; rowVersion: number | null; err: string | null };

/** Ek bilgiler ve kullanım uyarıları (çeviriden / kaynak metinden ayrı katman). */
export function NotesTab({ notes, busy, act }: { notes: OwnerNote[]; busy: boolean; act: ActFn }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const live = [...notes.filter((n) => !n.deleted_at && n.kind === "warning"), ...notes.filter((n) => !n.deleted_at && n.kind !== "warning")];
  const deleted = notes.filter((n) => n.deleted_at);

  const openNew = (kind: "note" | "warning") => setDraft({ id: null, kind, title: "", body: "", visible: true, rowVersion: null, err: null });
  const openEdit = (n: OwnerNote) => setDraft({ id: n.id, kind: n.kind, title: n.title ?? "", body: n.body, visible: n.visible_to_experts, rowVersion: n.row_version, err: null });

  const save = async () => {
    if (!draft) return;
    if (!draft.body.trim()) {
      setDraft({ ...draft, err: "Açıklama zorunlu." });
      return;
    }
    const data: Record<string, unknown> = { kind: draft.kind, title: draft.title.trim() || null, body: draft.body.trim(), visible_to_experts: draft.visible };
    if (draft.id && draft.rowVersion !== null) data.expected_version = draft.rowVersion;
    const ok = await act({ action: "note_save", note_id: draft.id, data }, { success: draft.id ? "Ek bilgi güncellendi." : "Ek bilgi eklendi." });
    if (ok) setDraft(null);
  };

  return (
    <>
      <div className={s.tabToolbar}>
        <div>
          <h2>Ek bilgiler ve uyarılar</h2>
          <p className={s.note} style={{ margin: "2px 0 0" }}>
            Uzmana görünür kayıtlar taş ayrıntısında &quot;Ek Bilgiler ve Uzman Notları&quot; bölümünde, çeviriden ayrı gösterilir. Uyarılar önce listelenir.
          </p>
        </div>
        <div className={s.rowActions}>
          <button type="button" className={`btn-outline ${s.btn}`} onClick={() => openNew("warning")}>
            Kullanım uyarısı ekle
          </button>
          <button type="button" className={`btn-success ${s.btn}`} onClick={() => openNew("note")}>
            + Yeni ek bilgi
          </button>
        </div>
      </div>
      {live.length ? (
        <div className={s.nlist}>
          {live.map((n) => (
            <article key={n.id} className={`${s.ncard} ${n.kind === "warning" ? s.ncardWarn : ""}`}>
              <div className={s.ncardTop}>
                <span className={s.noteCat}>{n.kind === "warning" ? "Kullanım uyarısı" : "Ek bilgi"}</span>
                <span className={`${s.pill} ${n.visible_to_experts ? s.pillTeal : ""}`}>{n.visible_to_experts ? "Uzmana görünür" : "Uzmana gizli"}</span>
                {n.health_sensitive ? <span className={`${s.pill} ${s.pillGold}`}>Sağlıkla ilgili — hukuki inceleme bekler</span> : null}
                <small>{fmtDate(n.updated_at ?? n.created_at)}</small>
              </div>
              {n.title ? <h3>{n.title}</h3> : null}
              <p>{n.body}</p>
              <div className={`${s.rowActions} ${s.rowActionsLeft}`}>
                <button type="button" className={`btn-outline ${s.btn} ${s.btnSm}`} onClick={() => openEdit(n)}>
                  Düzenle
                </button>
                <button
                  type="button"
                  className={`btn-outline ${s.btn} ${s.btnSm}`}
                  disabled={busy}
                  onClick={() => void act({ action: "note_save", note_id: n.id, data: { kind: n.kind, title: n.title, body: n.body, visible_to_experts: !n.visible_to_experts, expected_version: n.row_version } }, { success: n.visible_to_experts ? "Uzmandan gizlendi." : "Uzmana görünür yapıldı." })}
                >
                  {n.visible_to_experts ? "Uzmandan gizle" : "Uzmana göster"}
                </button>
                <button type="button" className={`btn-danger ${s.btn} ${s.btnSm}`} disabled={busy} onClick={() => void act({ action: "note_delete", note_id: n.id }, { success: "Ek bilgi silindi.", undo: { action: "note_restore", note_id: n.id } })}>
                  Sil
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={s.emptyState}>
          <b>Henüz ek bilgi yok.</b>
        </div>
      )}
      {deleted.length ? (
        <details className={s.deleted}>
          <summary>Silinenler ({deleted.length}) — geri alınabilir</summary>
          {deleted.map((n) => (
            <div key={n.id} className={s.delRow}>
              <span>
                <b>{n.title || n.body.slice(0, 60)}</b> <small className={s.muted}>{n.kind === "warning" ? "Kullanım uyarısı" : "Ek bilgi"}</small>
              </span>
              <button type="button" className={`btn-outline ${s.btn} ${s.btnSm}`} disabled={busy} onClick={() => void act({ action: "note_restore", note_id: n.id }, { success: "Geri getirildi.", undo: { action: "note_delete", note_id: n.id } })}>
                Geri getir
              </button>
            </div>
          ))}
        </details>
      ) : null}

      {draft ? (
        <div className={s.modalBg}>
          <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="note-title">
            <h2 id="note-title">{draft.id ? "Ek bilgiyi düzenle" : draft.kind === "warning" ? "Kullanım uyarısı ekle" : "Yeni ek bilgi"}</h2>
            <p className={s.note} style={{ marginTop: 0 }}>
              Bu içerik kaynak metinlerden ve doğrulanmış çeviriden ayrı tutulur. Sağlık iddiası içeren metinler hukuki inceleme tamamlanana kadar uzmana gösterilmez.
            </p>
            <label className={s.fl}>
              <span>Tür</span>
              <select className={s.select} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as "note" | "warning" })}>
                <option value="note">Ek bilgi</option>
                <option value="warning">Kullanım uyarısı</option>
              </select>
            </label>
            <label className={s.fl}>
              <span>
                Başlık <small>(isteğe bağlı)</small>
              </span>
              <input className={s.input} value={draft.title} maxLength={200} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label className={s.fl}>
              <span>
                Açıklama <small>(zorunlu)</small>
              </span>
              <textarea className={s.textarea} rows={6} value={draft.body} maxLength={8000} onChange={(e) => setDraft({ ...draft, body: e.target.value, err: null })} />
            </label>
            <label className={s.check}>
              <input type="checkbox" checked={draft.visible} onChange={(e) => setDraft({ ...draft, visible: e.target.checked })} /> Uzmana görünür
            </label>
            {draft.err ? <p className={s.errText}>{draft.err}</p> : null}
            <div className={s.acts}>
              <button type="button" className={`btn-outline ${s.btn}`} onClick={() => setDraft(null)}>
                Vazgeç
              </button>
              <button type="button" className={`btn-success ${s.btn}`} disabled={busy} onClick={() => void save()}>
                Kaydet
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
