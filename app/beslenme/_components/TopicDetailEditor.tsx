"use client";
/**
 * Beslenme — ORTAK konu (topic) detay editörü. Rehber + Mizaç + Kan Grubu
 * sayfaları bunu yeniden kullanır (kod tekrarını önler).
 *
 * Verilen topicId için getTopic'i yükler; başlık/özet düzenleme, sıralı
 * bölümler (ekle/düzenle/sil/sırala), ilişkili besinler (ekle/düzenle/kaldır)
 * ve [Kaynaklar] sekmesini yönetir. Her mutasyondan sonra getTopic ile tazelenir
 * (durum tutarlılığı).
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { runInEffect } from "@/lib/runInEffect";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Layers,
  Link2,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { RelationType } from "@/lib/beslenme/contracts";
import type { Food, Section, Topic } from "@/lib/beslenme/beslenmeClient";
import {
  addSection,
  addTopicFood,
  deleteSection,
  deleteTopic,
  getTopic,
  linkTopicSource,
  listFoods,
  removeTopicFood,
  unlinkTopicSource,
  updateSection,
  updateTopic,
  updateTopicFood,
} from "@/lib/beslenme/beslenmeClient";
import {
  RELATION_TYPE_CHIP,
  RELATION_TYPE_LABELS,
  RELATION_TYPE_OPTIONS,
  SECTION_KEY_LABELS,
  SECTION_KEY_OPTIONS,
  friendlyError,
} from "./constants";
import { SourcesPanel, type LinkedSource } from "./SourcesPanel";
import {
  Card,
  DangerButton,
  EmptyState,
  Field,
  GhostButton,
  InlineSpinner,
  PrimaryButton,
  SelectInput,
  StatusMessage,
  TextArea,
  TextInput,
} from "./primitives";

type TopicFoodRel = {
  id: string;
  food_id: string;
  relation_type: RelationType;
  rationale: string | null;
  food: { id: string; name_tr: string } | null;
};

type LoadedTopic = {
  topic: Topic;
  sections: Section[];
  foods: TopicFoodRel[];
  sources: LinkedSource[];
};

type Tab = "content" | "sources";

export function TopicDetailEditor({
  topicId,
  onDeleted,
  onChanged,
}: {
  topicId: string;
  /** Konu arşivlendiğinde parent listeyi tazeler + seçimi temizler. */
  onDeleted: () => void;
  /** Başlık vb. değiştiğinde parent liste etiketini tazelemek için. */
  onChanged?: (topic: Topic) => void;
}) {
  const [data, setData] = useState<LoadedTopic | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [tab, setTab] = useState<Tab>("content");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr("");
    const r = await getTopic(topicId);
    setLoading(false);
    if (!r.ok || !r.data?.topic) {
      setLoadErr(friendlyError(r.code, r.status));
      setData(null);
      return;
    }
    const sections = [...(r.data.sections ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    setData({
      topic: r.data.topic,
      sections,
      foods: (r.data.foods ?? []) as TopicFoodRel[],
      sources: (r.data.sources ?? []) as LinkedSource[],
    });
  }, [topicId]);

  useEffect(() => {
    runInEffect(() => {
      setTab("content");
      void load();
    });
  }, [load]);

  if (loading) {
    return (
      <Card className="p-4">
        <InlineSpinner label="Konu yükleniyor…" />
      </Card>
    );
  }
  if (loadErr || !data) {
    return (
      <Card className="p-4">
        <StatusMessage type="error">{loadErr || "Konu yüklenemedi."}</StatusMessage>
        <div className="mt-3">
          <GhostButton onClick={() => void load()}>Tekrar Dene</GhostButton>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <TopicHeader topic={data.topic} onSaved={(t) => { setData({ ...data, topic: t }); onChanged?.(t); }} onDeleted={onDeleted} />

      {/* Sekme çubuğu */}
      <div className="inline-flex w-fit gap-1 rounded-xl bg-white/70 p-1 ring-1 ring-emerald-100">
        <TabButton active={tab === "content"} onClick={() => setTab("content")} icon={<Layers className="h-4 w-4" />}>
          İçerik
        </TabButton>
        <TabButton active={tab === "sources"} onClick={() => setTab("sources")} icon={<BookOpen className="h-4 w-4" />}>
          Kaynaklar
          {data.sources.length > 0 ? (
            <span className="ml-1 rounded-full bg-emerald-100 px-1.5 text-[10px] text-emerald-700">
              {data.sources.length}
            </span>
          ) : null}
        </TabButton>
      </div>

      {tab === "content" ? (
        <div className="flex flex-col gap-4">
          <SectionsManager topicId={topicId} sections={data.sections} onChanged={load} />
          <RelatedFoodsManager topicId={topicId} rels={data.foods} onChanged={load} />
        </div>
      ) : (
        <Card className="p-4">
          <SourcesPanel
            links={data.sources}
            onLink={async (sourceId, locator) => {
              const r = await linkTopicSource(topicId, { source_id: sourceId, locator });
              if (r.ok) await load();
              return r.ok;
            }}
            onUnlink={async (linkId) => {
              const r = await unlinkTopicSource(topicId, linkId);
              if (r.ok) await load();
              return r.ok;
            }}
          />
        </Card>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12px] font-black transition ${
        active ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

/* ── Başlık + özet ── */
function TopicHeader({
  topic,
  onSaved,
  onDeleted,
}: {
  topic: Topic;
  onSaved: (t: Topic) => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(topic.title);
  const [summary, setSummary] = useState(topic.summary ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    runInEffect(() => {
      setTitle(topic.title);
      setSummary(topic.summary ?? "");
      setMsg(null);
      setConfirmDel(false);
    });
  }, [topic.id, topic.title, topic.summary]);

  const dirty = title.trim() !== topic.title || (summary.trim() || "") !== (topic.summary ?? "");

  async function save() {
    if (!title.trim()) {
      setMsg({ type: "error", text: "Başlık boş olamaz." });
      return;
    }
    setSaving(true);
    setMsg(null);
    const r = await updateTopic(topic.id, { title: title.trim(), summary: summary.trim() || null });
    setSaving(false);
    if (r.ok && r.data?.topic) {
      onSaved(r.data.topic);
      setMsg({ type: "success", text: "Kaydedildi." });
    } else {
      setMsg({ type: "error", text: friendlyError(r.code, r.status) });
    }
  }

  async function doDelete() {
    setDeleting(true);
    const r = await deleteTopic(topic.id);
    setDeleting(false);
    if (r.ok) onDeleted();
    else setMsg({ type: "error", text: friendlyError(r.code, r.status) });
  }

  return (
    <Card className="p-4">
      {msg ? (
        <div className="mb-3">
          <StatusMessage type={msg.type}>{msg.text}</StatusMessage>
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        <Field label="Başlık" required>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Konu başlığı" />
        </Field>
        <Field label="Özet">
          <TextArea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            placeholder="Bu beslenme yaklaşımının kısa özeti…"
          />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PrimaryButton icon={<Save className="h-4 w-4" />} loading={saving} disabled={!dirty} onClick={() => void save()}>
            Kaydet
          </PrimaryButton>
          {confirmDel ? (
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold text-rose-600">Arşivlensin mi?</span>
              <DangerButton loading={deleting} onClick={() => void doDelete()}>
                Evet, Arşivle
              </DangerButton>
              <GhostButton onClick={() => setConfirmDel(false)}>Vazgeç</GhostButton>
            </div>
          ) : (
            <DangerButton icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDel(true)}>
              Arşivle
            </DangerButton>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ── Bölümler ── */
function SectionsManager({
  topicId,
  sections,
  onChanged,
}: {
  topicId: string;
  sections: Section[];
  onChanged: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function addNew() {
    setBusy(true);
    setErr("");
    const nextOrder = sections.length ? Math.max(...sections.map((s) => s.sort_order)) + 1 : 0;
    const r = await addSection(topicId, { section_key: "ozet", heading: "", content: "", sort_order: nextOrder });
    setBusy(false);
    if (r.ok) await onChanged();
    else setErr(friendlyError(r.code, r.status));
  }

  async function move(idx: number, dir: -1 | 1) {
    const other = idx + dir;
    if (other < 0 || other >= sections.length) return;
    const a = sections[idx];
    const b = sections[other];
    setBusy(true);
    await updateSection(topicId, a.id, { sort_order: b.sort_order });
    await updateSection(topicId, b.id, { sort_order: a.sort_order });
    setBusy(false);
    await onChanged();
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-1.5 text-[14px] font-black text-slate-800">
          <Layers className="h-4 w-4 text-emerald-500" aria-hidden /> Bölümler
        </h3>
        <GhostButton icon={<Plus className="h-4 w-4" />} loading={busy && adding} onClick={() => { setAdding(true); void addNew(); }}>
          Bölüm Ekle
        </GhostButton>
      </div>

      {err ? (
        <div className="mb-3">
          <StatusMessage type="error">{err}</StatusMessage>
        </div>
      ) : null}

      {sections.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-8 w-8" />}
          title="Henüz bölüm eklenmemiş."
          description="Genel özet, temel prensipler, uygun/nötr besinler gibi bölümler ekleyerek içeriği yapılandırın."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {sections.map((s, i) => (
            <SectionRow
              key={s.id}
              topicId={topicId}
              section={s}
              canUp={i > 0}
              canDown={i < sections.length - 1}
              onMove={(dir) => void move(i, dir)}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function SectionRow({
  topicId,
  section,
  canUp,
  canDown,
  onMove,
  onChanged,
}: {
  topicId: string;
  section: Section;
  canUp: boolean;
  canDown: boolean;
  onMove: (dir: -1 | 1) => void;
  onChanged: () => Promise<void>;
}) {
  const [key, setKey] = useState(section.section_key ?? "ozet");
  const [heading, setHeading] = useState(section.heading ?? "");
  const [content, setContent] = useState(section.content ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    runInEffect(() => {
      setKey(section.section_key ?? "ozet");
      setHeading(section.heading ?? "");
      setContent(section.content ?? "");
    });
  }, [section.id, section.section_key, section.heading, section.content]);

  const dirty =
    key !== (section.section_key ?? "ozet") ||
    heading.trim() !== (section.heading ?? "") ||
    content.trim() !== (section.content ?? "");

  async function save() {
    setSaving(true);
    setErr("");
    const r = await updateSection(topicId, section.id, {
      section_key: key,
      heading: heading.trim() || null,
      content: content.trim() || null,
    });
    setSaving(false);
    if (r.ok) await onChanged();
    else setErr(friendlyError(r.code, r.status));
  }

  async function del() {
    setDeleting(true);
    const r = await deleteSection(topicId, section.id);
    setDeleting(false);
    if (r.ok) await onChanged();
    else setErr(friendlyError(r.code, r.status));
  }

  return (
    <li className="rounded-xl border border-slate-100 bg-white/70 p-3">
      {err ? (
        <div className="mb-2">
          <StatusMessage type="error">{err}</StatusMessage>
        </div>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="w-full sm:w-56">
          <SelectInput value={key} onChange={(e) => setKey(e.target.value)}>
            {SECTION_KEY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectInput>
        </div>
        <TextInput
          value={heading}
          onChange={(e) => setHeading(e.target.value)}
          placeholder={`Başlık (varsayılan: ${SECTION_KEY_LABELS[key] ?? "Bölüm"})`}
        />
        <div className="flex shrink-0 items-center gap-1">
          <IconBtn label="Yukarı taşı" disabled={!canUp} onClick={() => onMove(-1)}>
            <ChevronUp className="h-4 w-4" aria-hidden />
          </IconBtn>
          <IconBtn label="Aşağı taşı" disabled={!canDown} onClick={() => onMove(1)}>
            <ChevronDown className="h-4 w-4" aria-hidden />
          </IconBtn>
        </div>
      </div>
      <div className="mt-2">
        <TextArea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          placeholder="Bölüm içeriği…"
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <PrimaryButton icon={<Save className="h-4 w-4" />} loading={saving} disabled={!dirty} onClick={() => void save()}>
          Kaydet
        </PrimaryButton>
        <DangerButton icon={<Trash2 className="h-4 w-4" />} loading={deleting} onClick={() => void del()}>
          Sil
        </DangerButton>
      </div>
    </li>
  );
}

function IconBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/* ── İlişkili besinler ── */
function RelatedFoodsManager({
  topicId,
  rels,
  onChanged,
}: {
  topicId: string;
  rels: TopicFoodRel[];
  onChanged: () => Promise<void>;
}) {
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Food[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [relType, setRelType] = useState<RelationType>("recommended");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function search() {
    setSearching(true);
    setErr("");
    const r = await listFoods({ q: q.trim() || undefined });
    setSearching(false);
    if (!r.ok || !r.data) {
      setErr(friendlyError(r.code, r.status));
      setResults([]);
      return;
    }
    const existing = new Set(rels.map((x) => x.food_id));
    setResults((r.data.foods ?? []).filter((f) => !existing.has(f.id)));
  }

  async function add(foodId: string) {
    setBusy(true);
    setErr("");
    const r = await addTopicFood(topicId, { food_id: foodId, relation_type: relType });
    setBusy(false);
    if (r.ok) {
      setPicking(false);
      setQ("");
      setResults(null);
      await onChanged();
    } else {
      setErr(friendlyError(r.code, r.status));
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-1.5 text-[14px] font-black text-slate-800">
          <Link2 className="h-4 w-4 text-emerald-500" aria-hidden /> İlişkili Besinler
        </h3>
        {!picking ? (
          <GhostButton icon={<Plus className="h-4 w-4" />} onClick={() => setPicking(true)}>
            Besin Ekle
          </GhostButton>
        ) : null}
      </div>

      {err ? (
        <div className="mb-3">
          <StatusMessage type="error">{err}</StatusMessage>
        </div>
      ) : null}

      {picking ? (
        <div className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-black text-slate-600">Besin bağla</span>
            <button
              type="button"
              onClick={() => { setPicking(false); setResults(null); setQ(""); }}
              className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-600"
              aria-label="Kapat"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="sm:w-48">
              <SelectInput value={relType} onChange={(e) => setRelType(e.target.value as RelationType)}>
                {RELATION_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </SelectInput>
            </div>
            <TextInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void search();
                }
              }}
              placeholder="Besin ara…"
            />
            <GhostButton icon={<Search className="h-4 w-4" />} loading={searching} onClick={() => void search()}>
              Ara
            </GhostButton>
          </div>

          {results !== null ? (
            results.length === 0 ? (
              <p className="mt-2 text-[12px] font-medium text-slate-400">Eklenebilecek besin bulunamadı.</p>
            ) : (
              <ul className="mt-2 flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                {results.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void add(f.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-left transition hover:border-emerald-200 hover:bg-emerald-50 disabled:opacity-60"
                    >
                      <span className="truncate text-[13px] font-bold text-slate-800">{f.name_tr}</span>
                      <Plus className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      ) : null}

      {rels.length === 0 ? (
        <EmptyState
          icon={<Link2 className="h-8 w-8" />}
          title="Henüz ilişkili besin yok."
          description="Bu beslenme yaklaşımı için önerilen, uygun veya kaçınılması gereken besinleri ekleyin."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rels.map((rel) => (
            <RelatedFoodRow key={rel.id} topicId={topicId} rel={rel} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function RelatedFoodRow({
  topicId,
  rel,
  onChanged,
}: {
  topicId: string;
  rel: TopicFoodRel;
  onChanged: () => Promise<void>;
}) {
  const [relType, setRelType] = useState<RelationType>(rel.relation_type);
  const [rationale, setRationale] = useState(rel.rationale ?? "");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [editing, setEditing] = useState(false);

  const dirty = relType !== rel.relation_type || rationale.trim() !== (rel.rationale ?? "");

  async function save() {
    setSaving(true);
    const r = await updateTopicFood(topicId, rel.id, { relation_type: relType, rationale: rationale.trim() || null });
    setSaving(false);
    if (r.ok) {
      setEditing(false);
      await onChanged();
    }
  }

  async function remove() {
    setRemoving(true);
    const r = await removeTopicFood(topicId, rel.id);
    setRemoving(false);
    if (r.ok) await onChanged();
  }

  return (
    <li className="rounded-xl border border-slate-100 bg-white/80 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-black text-slate-800">{rel.food?.name_tr ?? "Besin"}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${
                RELATION_TYPE_CHIP[rel.relation_type] ?? "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              {RELATION_TYPE_LABELS[rel.relation_type] ?? rel.relation_type}
            </span>
            {rel.rationale ? (
              <span className="truncate text-[11px] font-medium text-slate-400">{rel.rationale}</span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconBtn label={editing ? "Kapat" : "Düzenle"} onClick={() => setEditing((v) => !v)}>
            {editing ? <X className="h-4 w-4" aria-hidden /> : <Pencil className="h-4 w-4" aria-hidden />}
          </IconBtn>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={removing}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
            aria-label="Besini kaldır"
            title="Besini kaldır"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="sm:w-48">
            <Field label="İlişki">
              <SelectInput value={relType} onChange={(e) => setRelType(e.target.value as RelationType)}>
                {RELATION_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Gerekçe (opsiyonel)">
              <TextInput value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Kısa açıklama" />
            </Field>
          </div>
          <PrimaryButton icon={<Save className="h-4 w-4" />} loading={saving} disabled={!dirty} onClick={() => void save()}>
            Kaydet
          </PrimaryButton>
        </div>
      ) : null}
    </li>
  );
}
