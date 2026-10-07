"use client";

/**
 * Astroloji Bilgi Bankası — uzmanın KENDİ mesleki notları (Roxy içeriği YOK, otomatik doldurma YOK).
 * Ara / filtrele / ekle / düzenle / sil. Düzenle-sil iyimser kilitli (expectedRevision); silme iki adımlı
 * satır içi onay (tarayıcı diyaloğu yok). Kayıtlı analizler kendi snapshot'ını taşır → buradaki
 * değişiklikler geçmiş analizleri DEĞİŞTİRMEZ.
 */

import { useEffect, useState } from "react";
import { ALL_TOPIC_KINDS, TOPIC_CONTEXT_LABELS, TOPIC_CONTEXTS } from "@/lib/astrology/topics/index";
import { astroFetch } from "../_lib/api";
import TopicPicker from "./TopicPicker";

export type KbEntry = {
  id: string;
  tradition: string;
  topicKey: string;
  topicLabel: string;
  title: string;
  body: string;
  sourceNote: string | null;
  tags: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type Editing = { mode: "create"; topicKey?: string } | { mode: "edit"; entry: KbEntry };

const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

export function KbEditor({ editing, onDone, onCancel }: { editing: Editing; onDone: () => void; onCancel: () => void }) {
  const e = editing.mode === "edit" ? editing.entry : null;
  const [topicKey, setTopicKey] = useState<string>(e?.topicKey ?? (editing.mode === "create" ? editing.topicKey ?? "planet_in_house:saturn:7" : ""));
  const [title, setTitle] = useState(e?.title ?? "");
  const [body, setBody] = useState(e?.body ?? "");
  const [sourceNote, setSourceNote] = useState(e?.sourceNote ?? "");
  const [tags, setTags] = useState((e?.tags ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const payload = {
      tradition: "western",
      topicKey,
      title,
      body,
      sourceNote: sourceNote.trim() || null,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    };
    const r = e
      ? await astroFetch(`/api/admin/astroloji/kb/${e.id}`, { method: "PATCH", body: { ...payload, expectedRevision: e.revision } })
      : await astroFetch("/api/admin/astroloji/kb", { method: "POST", body: payload });
    setBusy(false);
    if (r.ok) onDone();
    else setError(r.error);
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-violet-200 bg-violet-50/40 p-3">
      <h4 className="text-sm font-semibold text-violet-900">{e ? "Bilgi kaydını düzenle" : "Yeni bilgi kaydı"}</h4>
      <TopicPicker value={topicKey} onChange={setTopicKey} />
      <input className={input} placeholder="Başlık (ör. Satürn 7. ev — çalışma notum)" value={title} maxLength={200} onChange={(x) => setTitle(x.target.value)} />
      <textarea className={`${input} min-h-[140px]`} placeholder="Kendi mesleki notunuz / yorum metodolojiniz…" value={body} maxLength={20000} onChange={(x) => setBody(x.target.value)} />
      <input className={input} placeholder="Kaynak notu (ör. hocam X, kitap Y s. 42) — opsiyonel" value={sourceNote} maxLength={1000} onChange={(x) => setSourceNote(x.target.value)} />
      <input className={input} placeholder="Etiketler (virgülle) — opsiyonel" value={tags} onChange={(x) => setTags(x.target.value)} />
      {error && <p className="text-sm text-rose-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => void save()} className="btn-primary rounded-lg px-4 py-1.5 text-sm disabled:opacity-60">
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm">
          Vazgeç
        </button>
      </div>
    </div>
  );
}

export function KbEntryCard({ entry, onEdit, onDeleted }: { entry: KbEntry; onEdit?: () => void; onDeleted?: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function del() {
    const r = await astroFetch(`/api/admin/astroloji/kb/${entry.id}?expectedRevision=${entry.revision}`, { method: "DELETE" });
    if (r.ok) onDeleted?.();
    else setError(r.error);
  }
  return (
    <li className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-violet-700">{entry.topicLabel}</div>
          <div className="font-semibold text-slate-800">{entry.title}</div>
        </div>
        {(onEdit || onDeleted) && (
          <div className="flex gap-2 text-xs">
            {onEdit && (
              <button type="button" className="text-violet-700 underline" onClick={onEdit}>
                Düzenle
              </button>
            )}
            {onDeleted &&
              (confirm ? (
                <>
                  <button type="button" className="font-semibold text-rose-700 underline" onClick={() => void del()}>
                    Evet, sil
                  </button>
                  <button type="button" className="text-slate-600 underline" onClick={() => setConfirm(false)}>
                    Vazgeç
                  </button>
                </>
              ) : (
                <button type="button" className="text-rose-700 underline" onClick={() => setConfirm(true)}>
                  Sil
                </button>
              ))}
          </div>
        )}
      </div>
      <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{entry.body}</p>
      {(entry.sourceNote || entry.tags.length > 0) && (
        <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
          {entry.sourceNote && <span>Kaynak: {entry.sourceNote}</span>}
          {entry.tags.map((t) => (
            <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5">
              #{t}
            </span>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </li>
  );
}

export default function KnowledgeBankPanel() {
  const [entries, setEntries] = useState<KbEntry[] | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [tag, setTag] = useState("");
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      const sp = new URLSearchParams();
      if (q.trim()) sp.set("q", q.trim());
      if (kind) sp.set("kind", kind);
      if (tag) sp.set("tag", tag);
      void astroFetch<{ entries: KbEntry[]; total: number; tags: string[] }>(`/api/admin/astroloji/kb?${sp.toString()}`).then((r) => {
        if (!alive) return;
        if (r.ok) {
          setEntries(r.data.entries);
          setTotal(r.data.total);
          setAllTags(r.data.tags);
          setError(null);
        } else {
          setEntries([]);
          setError(r.error);
        }
      });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, kind, tag, reload]);

  const done = () => {
    setEditing(null);
    setReload((n) => n + 1);
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Astroloji Bilgi Bankam</h2>
          <p className="text-xs text-slate-500">Kendi eğitim notlarınız ve mesleki yorumlarınız. Sağlayıcı (Roxy) içeriği buraya aktarılmaz.</p>
        </div>
        <button type="button" className="btn-primary rounded-lg px-3 py-1.5 text-sm" onClick={() => setEditing({ mode: "create" })}>
          + Yeni bilgi
        </button>
      </div>

      {editing && <KbEditor key={editing.mode === "edit" ? editing.entry.id : "new"} editing={editing} onDone={done} onCancel={() => setEditing(null)} />}

      <div className="flex flex-wrap gap-2">
        <input className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" placeholder="Ara (başlık, metin, kaynak, konu)…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Konu türü filtresi">
          <option value="">Tüm konu türleri</option>
          {TOPIC_CONTEXTS.map((c) => (
            <optgroup key={c} label={TOPIC_CONTEXT_LABELS[c]}>
              {ALL_TOPIC_KINDS.filter((k) => k.context === c).map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Etiket filtresi">
          <option value="">Tüm etiketler</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-rose-700">{error}</p>}
      {entries === null ? (
        <p className="text-sm text-slate-400">Yükleniyor…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-slate-500">{total === 0 ? "Henüz kayıt yok." : "Filtreyle eşleşen kayıt yok."}</p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {entries.length} / {total} kayıt
          </p>
          <ul className="flex flex-col gap-2">
            {entries.map((e) => (
              <KbEntryCard key={`${e.id}-${e.revision}`} entry={e} onEdit={() => setEditing({ mode: "edit", entry: e })} onDeleted={done} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
