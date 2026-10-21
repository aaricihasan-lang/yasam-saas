"use client";

/**
 * Astroloji Bilgi Bankası — uzmanın KENDİ mesleki notları (Roxy içeriği YOK, otomatik doldurma YOK).
 * Ara / filtrele / ekle / düzenle / sil. Düzenle-sil iyimser kilitli (expectedRevision); silme iki adımlı
 * satır içi onay (tarayıcı diyaloğu yok). Kayıtlı analizler kendi snapshot'ını taşır → buradaki
 * değişiklikler geçmiş analizleri DEĞİŞTİRMEZ.
 */

import { useEffect, useRef, useState } from "react";
import { ALL_TOPIC_KINDS, TOPIC_CONTEXT_LABELS, TOPIC_CONTEXTS, traditionOfKey } from "@/lib/astrology/topics/index";
import { KP_CONTEXTS, KP_CONTEXT_LABELS, VEDIC_CONTEXTS, VEDIC_CONTEXT_LABELS } from "@/lib/astrology/topics/vedic";
import { astroFetch } from "../_lib/api";
import TopicPicker from "./TopicPicker";
import { BookOpen, Layers, Lightbulb, Link2, Pencil, Plus, Search, Tag, Trash2 } from "lucide-react";
import { atlasPaperInput, atlasPrimaryBtn, atlasSecondaryBtn } from "./AtlasShell";
import { AtlasEmpty, ap } from "./atlas/premium/AtlasPremium";

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

const input = `w-full ${atlasPaperInput}`;

export function KbEditor({ editing, onDone, onCancel, onDirtyChange }: { editing: Editing; onDone: () => void; onCancel: () => void; /** FINAL: kaydedilmemiş taslak bildirimi (isteğe bağlı). */ onDirtyChange?: (dirty: boolean) => void }) {
  const e = editing.mode === "edit" ? editing.entry : null;
  const [topicKey, setTopicKey] = useState<string>(e?.topicKey ?? (editing.mode === "create" ? editing.topicKey ?? "planet_in_house:saturn:7" : ""));
  const [title, setTitle] = useState(e?.title ?? "");
  const [body, setBody] = useState(e?.body ?? "");
  const [sourceNote, setSourceNote] = useState(e?.sourceNote ?? "");
  const [tags, setTags] = useState((e?.tags ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftDirty = editing.mode === "create" ? !!(title.trim() || body.trim() || sourceNote.trim()) : title !== (e?.title ?? "") || body !== (e?.body ?? "") || sourceNote !== (e?.sourceNote ?? "");
  const onDirtyChangeRef = useRef(onDirtyChange);
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);
  useEffect(() => {
    onDirtyChangeRef.current?.(draftDirty);
  }, [draftDirty]);

  async function save() {
    setBusy(true);
    setError(null);
    const payload = {
      tradition: traditionOfKey(topicKey) ?? "western",
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
    <div className="flex flex-col gap-2.5 rounded-2xl border border-[#D9B56F]/60 bg-[#FBF8F2] p-4 text-slate-800 shadow-[0_0_0_4px_rgba(217,181,111,0.12)]">
      <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#a8843e]">{e ? "Bilgi kaydını düzenle" : "Yeni bilgi kaydı"}</h4>
      <TopicPicker value={topicKey} onChange={setTopicKey} />
      <input className={input} placeholder="Başlık (ör. Satürn 7. ev — çalışma notum)" value={title} maxLength={200} onChange={(x) => setTitle(x.target.value)} />
      <textarea className={`${input} min-h-[140px]`} placeholder="Kendi mesleki notunuz / yorum metodolojiniz…" value={body} maxLength={20000} onChange={(x) => setBody(x.target.value)} />
      <input className={input} placeholder="Kaynak notu (ör. hocam X, kitap Y s. 42) — opsiyonel" value={sourceNote} maxLength={1000} onChange={(x) => setSourceNote(x.target.value)} />
      <input className={input} placeholder="Etiketler (virgülle) — opsiyonel" value={tags} onChange={(x) => setTags(x.target.value)} />
      {error && <p className="text-sm text-rose-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => void save()} className={`${atlasPrimaryBtn} py-1.5`}>
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </button>
        <button type="button" onClick={onCancel} className={atlasSecondaryBtn}>
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
    <li className="flex flex-col rounded-2xl border border-[#e7dcc3] bg-[#FBF8F2] px-4 py-3.5 text-slate-800 shadow-[0_18px_40px_-30px_rgba(0,0,0,0.9)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {/* Eşleşme anahtarı: bu konu analizde çıktığında kayıt otomatik görünür */}
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#0B1430] px-2.5 py-0.5 text-[11px] text-[#F6E7C3]" title="Analizde bu konu çıktığında kayıt otomatik eşleşir">
            <Link2 className="h-3 w-3 shrink-0 text-[#D9B56F]" aria-hidden="true" />
            <span className="truncate">{entry.topicLabel}</span>
          </span>
          <div className="mt-1.5 text-[17px] font-medium leading-snug text-[#0B1430] [font-family:var(--font-atlas-display)]">{entry.title}</div>
        </div>
        {(onEdit || onDeleted) && (
          <div className="flex shrink-0 gap-1.5 text-xs">
            {onEdit && (
              <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-[#d9c9a3] bg-white/80 px-2 py-1 text-slate-700 hover:border-[#b8954e]" onClick={onEdit}>
                <Pencil className="h-3 w-3" /> Düzenle
              </button>
            )}
            {onDeleted &&
              (confirm ? (
                <>
                  <button type="button" className="rounded-lg bg-rose-600 px-2 py-1 font-semibold text-white" onClick={() => void del()}>
                    Evet, sil
                  </button>
                  <button type="button" className="rounded-lg border border-[#d9c9a3] bg-white/80 px-2 py-1 text-slate-600" onClick={() => setConfirm(false)}>
                    Vazgeç
                  </button>
                </>
              ) : (
                <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-[#d9c9a3] bg-white/80 px-2 py-1 text-rose-700 hover:border-rose-300" onClick={() => setConfirm(true)}>
                  <Trash2 className="h-3 w-3" /> Sil
                </button>
              ))}
          </div>
        )}
      </div>
      <p className="mt-2 whitespace-pre-line text-[14.5px] leading-relaxed text-slate-700">{entry.body}</p>
      {(entry.sourceNote || entry.tags.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[#efe6d2] pt-2 text-xs text-slate-500">
          {entry.sourceNote && <span className="mr-1">Kaynak: {entry.sourceNote}</span>}
          {entry.tags.map((t) => (
            <span key={t} className="rounded-full border border-[#e7dcc3] bg-white px-2 py-0.5 text-slate-600">
              #{t}
            </span>
          ))}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
    </li>
  );
}

/**
 * Bilgi Bankası çalışma alanı. 2026-10-12: kaydedilmemiş taslak varken başka kayda geçmek / yeni kayıt açmak / Vazgeç
 * taslağı UYARISIZ silmez ("Çalışmaya Devam Et" / "Kaydetmeden Çık"); taslak durumu üst bileşene bildirilir (çıkış koruması).
 */
export default function KnowledgeBankPanel({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void } = {}) {
  const [entries, setEntries] = useState<KbEntry[] | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [tag, setTag] = useState("");
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState<{ next: Editing | null } | null>(null);
  const onDirtyRef = useRef(onDirtyChange);
  useEffect(() => {
    onDirtyRef.current = onDirtyChange;
  });
  useEffect(() => {
    onDirtyRef.current?.(!!editing && draftDirty);
  }, [editing, draftDirty]);
  useEffect(() => () => onDirtyRef.current?.(false), []);
  const switchEditing = (next: Editing | null) => {
    if (editing && draftDirty) setConfirmSwitch({ next });
    else {
      setDraftDirty(false);
      setEditing(next);
    }
  };

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
    setDraftDirty(false);
    setEditing(null);
    setReload((n) => n + 1);
  };

  return (
    <section className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start" data-testid="astro-kb-workspace">
      {/* Sol panel: kayıt sayısı + yeni kayıt · arama · konu türü · etiketler · eşleşme açıklaması */}
      <aside className={`${ap.surface} flex flex-col gap-4 p-4 sm:p-5 lg:sticky lg:top-4`} aria-label="Bilgi Bankası araçları">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className={`${ap.ink} flex items-center gap-2 text-[15px] font-bold`}>
              <Layers className={`${ap.goldInk} h-5 w-5`} aria-hidden="true" /> Kayıtlarım
            </p>
            <p className={`${ap.display} ${ap.ink} mt-1 text-3xl tabular-nums`}>{total}</p>
            <p className={`${ap.muted} text-xs`}>kayıtlı notunuz</p>
          </div>
          <button type="button" className={ap.btnGold} onClick={() => switchEditing({ mode: "create" })}>
            <Plus className="h-4 w-4" /> Yeni bilgi
          </button>
        </div>

        <label className={ap.field}>
          <Search className={`${ap.muted} h-4 w-4 shrink-0`} aria-hidden="true" />
          <input className={ap.fieldInput} placeholder="Ara (başlık, metin, kaynak, konu)…" aria-label="Bilgi Bankası'nda ara" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>

        <div className={`${ap.divTop} flex flex-col gap-1.5 pt-4`}>
          <span className={`${ap.ink} flex items-center gap-1.5 text-[13px] font-bold`}>
            <BookOpen className={`${ap.goldInk} h-3.5 w-3.5`} aria-hidden="true" /> Konu türü
          </span>
          <select className={`${ap.select} w-full`} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Konu türü filtresi">
              <option value="">
                Tüm konu türleri
              </option>
              {TOPIC_CONTEXTS.map((c) => (
                <optgroup key={c} label={TOPIC_CONTEXT_LABELS[c]}>
                  {ALL_TOPIC_KINDS.filter((k) => k.context === c).map((k) => (
                    <option key={k.kind} value={k.kind}>
                      {k.label}
                    </option>
                  ))}
                </optgroup>
              ))}
              {VEDIC_CONTEXTS.map((c) => (
                <optgroup key={c} label={`Vedik · ${VEDIC_CONTEXT_LABELS[c]}`}>
                  {ALL_TOPIC_KINDS.filter((k) => k.context === c).map((k) => (
                    <option key={k.kind} value={k.kind}>
                      {k.label}
                    </option>
                  ))}
                </optgroup>
              ))}
              {KP_CONTEXTS.map((c) => (
                <optgroup key={c} label={KP_CONTEXT_LABELS[c]}>
                  {ALL_TOPIC_KINDS.filter((k) => k.context === c).map((k) => (
                    <option key={k.kind} value={k.kind}>
                      {k.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={`${ap.ink} flex items-center gap-1.5 text-[13px] font-bold`}>
            <Tag className={`${ap.goldInk} h-3.5 w-3.5`} aria-hidden="true" /> Etiketler
          </span>
          {allTags.length === 0 ? (
            <p className={`${ap.muted} text-xs`}>Henüz etiket yok.</p>
          ) : (
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto [scrollbar-width:thin]" role="group" aria-label="Etiket filtresi">
              {["", ...allTags].map((t) => (
                <button key={t || "__all"} type="button" aria-pressed={tag === t} onClick={() => setTag(t)} className={tag === t ? ap.chipLav : ap.chip}>
                  {t ? `#${t}` : "Tümü"}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={`${ap.howBox} hidden lg:block`}>
          <p className={`${ap.ink} mb-1 flex items-center gap-1.5 font-bold`}>
            <Lightbulb className={`${ap.goldInk} h-4 w-4`} aria-hidden="true" /> Nasıl eşleşir?
          </p>
          Her kayıt bir konuya bağlanır (ör. “Satürn 3. evde”). Analizde aynı konu çıktığında kaydınız sonuç ekranının Bilgi Bankası bölümünde otomatik görünür. Sağlayıcı içeriği (sistem yorumu) buraya aktarılmaz.
        </div>
      </aside>

      {/* Sağ: düzenleyici + kayıtlar (kâğıt kartlar) */}
      <div className="flex min-w-0 flex-col gap-3">
        {confirmSwitch && (
          <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between" role="alertdialog" aria-label="Kaydedilmemiş değişiklik" data-testid="astro-kb-unsaved">
            <p>Kaydedilmemiş değişiklikleriniz var. Kaydetmeden çıkmak istiyor musunuz?</p>
            <div className="flex shrink-0 gap-2">
              <button type="button" autoFocus className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 font-medium" onClick={() => setConfirmSwitch(null)}>
                Çalışmaya Devam Et
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700"
                onClick={() => {
                  const next = confirmSwitch.next;
                  setConfirmSwitch(null);
                  setDraftDirty(false);
                  setEditing(next);
                }}
              >
                Kaydetmeden Çık
              </button>
            </div>
          </div>
        )}
        {editing && <KbEditor key={editing.mode === "edit" ? editing.entry.id : "new"} editing={editing} onDone={done} onCancel={() => switchEditing(null)} onDirtyChange={setDraftDirty} />}

        {error && <p className={ap.noteDanger}>{error}</p>}
        {entries === null ? (
          <ul className="grid gap-3 xl:grid-cols-2" aria-busy="true">
            {[0, 1].map((i) => (
              <li key={i} className={`${ap.skeleton} h-36 animate-pulse motion-reduce:animate-none`} />
            ))}
          </ul>
        ) : entries.length === 0 ? (
          <div className={ap.surface}>
            <AtlasEmpty
              art={total === 0 ? "bilgi" : undefined}
              icon={total === 0 ? <BookOpen className="h-5 w-5" /> : <Search className="h-5 w-5" />}
              title={total === 0 ? "Henüz kayıt yok." : "Filtreyle eşleşen kayıt yok."}
              text={total === 0 ? "İlk notunuzu ekleyin; analizlerde ilgili konu çıktığında otomatik karşınıza gelir." : "Aramayı veya filtreleri değiştirmeyi deneyin."}
              actions={
                total === 0 ? (
                  <button type="button" className={ap.btnGold} onClick={() => switchEditing({ mode: "create" })}>
                    <Plus className="h-4 w-4" /> Yeni bilgi
                  </button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <p className={`${ap.muted} text-xs`}>
              {entries.length} / {total} kayıt
            </p>
            <ul className="grid items-start gap-3 xl:grid-cols-2">
              {entries.map((e) => (
                <KbEntryCard key={`${e.id}-${e.revision}`} entry={e} onEdit={() => switchEditing({ mode: "edit", entry: e })} onDeleted={done} />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
