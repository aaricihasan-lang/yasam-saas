"use client";
/**
 * Beslenme → Beslenme Rehberi = topic_type "dietary_pattern" konuları.
 * Sol: liste + arama + "Yeni". Sağ: ORTAK TopicDetailEditor (bölümler + ilişkili
 * besinler + Kaynaklar).
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, BookOpen, Plus, Save, Search, X } from "lucide-react";
import type { Topic } from "@/lib/beslenme/beslenmeClient";
import { createTopic, listTopics } from "@/lib/beslenme/beslenmeClient";
import {
  BeslenmeGate,
  BeslenmeShell,
  useBeslenmeOwnerGuard,
} from "../_components/BeslenmeShell";
import { friendlyError } from "../_components/constants";
import { TopicDetailEditor } from "../_components/TopicDetailEditor";
import {
  Card,
  EmptyState,
  Field,
  GhostButton,
  InlineSpinner,
  MasterDetail,
  PrimaryButton,
  StatusMessage,
  TextInput,
} from "../_components/primitives";

export default function RehberPage() {
  const guard = useBeslenmeOwnerGuard();

  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    const r = await listTopics({ type: "dietary_pattern", q: q.trim() || undefined });
    setLoading(false);
    if (r.ok && r.data) setTopics(r.data.topics ?? []);
    else setErr(friendlyError(r.code, r.status));
  }, [q]);

  useEffect(() => {
    if (guard !== "ok") return;
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [guard, load]);

  if (guard !== "ok") return <BeslenmeGate state={guard} />;

  const detailOpen = selectedId !== null || creating;

  return (
    <BeslenmeShell
      title="Beslenme Rehberi"
      subtitle="Beslenme yaklaşımları ve düzenleri. Her rehber; bölümler, ilişkili besinler ve kaynaklarla yapılandırılır."
      backHref="/beslenme"
      actions={
        <PrimaryButton icon={<Plus className="h-4 w-4" />} onClick={() => { setSelectedId(null); setCreating(true); }}>
          Yeni Rehber
        </PrimaryButton>
      }
    >
      <MasterDetail
        detailOpen={detailOpen}
        list={
          <Card className="flex flex-col overflow-hidden">
            <div className="border-b border-slate-100 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rehber ara…" className="pl-9" />
              </div>
            </div>
            <div className="max-h-[64vh] overflow-y-auto p-2">
              {loading ? (
                <InlineSpinner label="Rehberler yükleniyor…" />
              ) : err ? (
                <div className="p-3">
                  <StatusMessage type="error">{err}</StatusMessage>
                  <div className="mt-3">
                    <GhostButton onClick={() => void load()}>Tekrar Dene</GhostButton>
                  </div>
                </div>
              ) : topics.length === 0 ? (
                <div className="p-3">
                  <EmptyState
                    icon={<BookOpen className="h-8 w-8" />}
                    title="Rehber bulunamadı"
                    description={q ? "Aramaya uygun rehber yok." : "Henüz beslenme rehberi eklenmemiş."}
                  />
                </div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {topics.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => { setCreating(false); setSelectedId(t.id); }}
                        className={`flex w-full flex-col rounded-xl px-3 py-2.5 text-left transition ${
                          selectedId === t.id ? "bg-emerald-50 ring-1 ring-emerald-200" : "hover:bg-slate-50"
                        }`}
                      >
                        <span className="truncate text-[13px] font-black text-slate-800">{t.title}</span>
                        {t.summary ? (
                          <span className="truncate text-[11px] font-medium text-slate-400">{t.summary}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        }
        detail={
          creating ? (
            <CreateTopicCard
              onCancel={() => setCreating(false)}
              onCreated={async (topic) => {
                setCreating(false);
                await load();
                setSelectedId(topic.id);
              }}
            />
          ) : selectedId === null ? (
            <Card className="hidden p-8 lg:block">
              <EmptyState
                icon={<BookOpen className="h-8 w-8" />}
                title="Bir rehber seçin"
                description="Düzenlemek için soldan bir rehber seçin veya yeni bir rehber oluşturun."
              />
            </Card>
          ) : (
            <div>
              <MobileBack onBack={() => setSelectedId(null)} />
              <TopicDetailEditor
                topicId={selectedId}
                onChanged={() => void load()}
                onDeleted={async () => {
                  await load();
                  setSelectedId(null);
                }}
              />
            </div>
          )
        }
      />
    </BeslenmeShell>
  );
}

function CreateTopicCard({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (topic: Topic) => void;
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function create() {
    if (!title.trim()) {
      setErr("Başlık zorunludur.");
      return;
    }
    setBusy(true);
    setErr("");
    const r = await createTopic({
      topic_type: "dietary_pattern",
      title: title.trim(),
      summary: summary.trim() || null,
    });
    setBusy(false);
    if (r.ok && r.data?.topic) onCreated(r.data.topic);
    else setErr(friendlyError(r.code, r.status));
  }

  return (
    <Card className="p-4">
      <MobileBack onBack={onCancel} />
      <h2 className="mb-3 text-lg font-black text-slate-900">Yeni Beslenme Rehberi</h2>
      {err ? (
        <div className="mb-3">
          <StatusMessage type="error">{err}</StatusMessage>
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        <Field label="Başlık" required>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Örn: Akdeniz Beslenmesi" />
        </Field>
        <Field label="Özet">
          <TextInput value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Kısa özet (opsiyonel)" />
        </Field>
        <div className="flex items-center gap-2">
          <PrimaryButton icon={<Save className="h-4 w-4" />} loading={busy} onClick={() => void create()}>
            Oluştur
          </PrimaryButton>
          <GhostButton icon={<X className="h-4 w-4" />} onClick={onCancel}>
            Vazgeç
          </GhostButton>
        </div>
      </div>
    </Card>
  );
}

function MobileBack({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 lg:hidden"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      Listeye Dön
    </button>
  );
}
