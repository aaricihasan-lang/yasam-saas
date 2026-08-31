"use client";
/**
 * Beslenme — ORTAK "çerçeveye göre profil" sayfası. Mizaç (framework=mizac) ve
 * Kan Grubu (framework=blood_type) sayfaları bunu yeniden kullanır.
 *
 * Canonical profiller (MIZAC_PROFILES / BLOOD_TYPE_PROFILES) kart olarak listelenir.
 * Bir profilin topic'i henüz yoksa "oluştur" istemi gösterilir; oluşturulunca aynı
 * ORTAK TopicDetailEditor (bölümler + ilişkili besinler + Kaynaklar) açılır.
 * Mevcut profil topic'leri listTopics ile alınır ve başlığa göre eşleştirilir.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { runInEffect } from "@/lib/runInEffect";
import type { ReactNode } from "react";
import { ArrowLeft, Plus, Sparkles } from "lucide-react";
import type { Topic } from "@/lib/beslenme/beslenmeClient";
import { createTopic, fetchReference, listTopics } from "@/lib/beslenme/beslenmeClient";
import { BeslenmeShell } from "./BeslenmeShell";
import { friendlyError } from "./constants";
import { TopicDetailEditor } from "./TopicDetailEditor";
import {
  Card,
  EmptyState,
  InlineSpinner,
  MasterDetail,
  PrimaryButton,
  StatusMessage,
} from "./primitives";

export type CanonicalProfile = {
  /** topic.title ile eşleşen anahtar (oluştururken title olarak kullanılır). */
  matchTitle: string;
  /** UI'da gösterilen etiket. */
  label: string;
  /** Kısa nitelik açıklaması (ör. "Sıcak-Kuru" / "Kan Grubu"). */
  sub: string;
};

export function ProfileTopicPage({
  frameworkCode,
  profiles,
  title,
  subtitle,
  icon,
}: {
  frameworkCode: string;
  profiles: CanonicalProfile[];
  title: string;
  subtitle: string;
  icon?: ReactNode;
}) {
  const [frameworkId, setFrameworkId] = useState<string | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [creatingKey, setCreatingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    const ref = await fetchReference();
    if (!ref.ok || !ref.data) {
      setLoading(false);
      setErr(friendlyError(ref.code, ref.status));
      return;
    }
    const fw = (ref.data.frameworks ?? []).find((f) => f.code === frameworkCode);
    if (!fw) {
      setLoading(false);
      setErr("Bu bölüm için gerekli çerçeve tanımı bulunamadı. Lütfen yöneticinizle iletişime geçin.");
      return;
    }
    setFrameworkId(fw.id);
    const list = await listTopics({ type: "traditional_profile", framework_id: fw.id });
    setLoading(false);
    if (list.ok && list.data) setTopics(list.data.topics ?? []);
    else setErr(friendlyError(list.code, list.status));
  }, [frameworkCode]);

  useEffect(() => {
    runInEffect(() => {
      void load();
    });
  }, [load]);

  // Canonical profil → mevcut topic eşlemesi (başlığa göre).
  const topicByTitle = useMemo(() => {
    const m = new Map<string, Topic>();
    for (const t of topics) m.set(t.title.trim(), t);
    return m;
  }, [topics]);

  const selected = selectedKey ? profiles.find((p) => p.matchTitle === selectedKey) ?? null : null;
  const selectedTopic = selected ? topicByTitle.get(selected.matchTitle.trim()) ?? null : null;
  const detailOpen = selectedKey !== null;

  async function createFor(profile: CanonicalProfile) {
    if (!frameworkId) return;
    setCreatingKey(profile.matchTitle);
    const r = await createTopic({
      topic_type: "traditional_profile",
      framework_id: frameworkId,
      title: profile.matchTitle,
    });
    setCreatingKey(null);
    if (r.ok && r.data?.topic) {
      await load();
      setSelectedKey(profile.matchTitle);
    } else {
      setErr(friendlyError(r.code, r.status));
    }
  }

  return (
    <BeslenmeShell title={title} subtitle={subtitle} backHref="/beslenme" icon={icon}>
      {err && !loading ? (
        <div className="mb-4">
          <StatusMessage type="error">{err}</StatusMessage>
        </div>
      ) : null}

      <MasterDetail
        detailOpen={detailOpen}
        list={
          <Card className="flex flex-col overflow-hidden">
            <div className="max-h-[70vh] overflow-y-auto p-2">
              {loading ? (
                <InlineSpinner label="Profiller yükleniyor…" />
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {profiles.map((p) => {
                    const exists = topicByTitle.has(p.matchTitle.trim());
                    const active = selectedKey === p.matchTitle;
                    return (
                      <li key={p.matchTitle}>
                        <button
                          type="button"
                          onClick={() => setSelectedKey(p.matchTitle)}
                          className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-left transition ${
                            active
                              ? "border-emerald-200 bg-emerald-50"
                              : "border-slate-100 bg-white/70 hover:border-emerald-100 hover:bg-emerald-50/40"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[14px] font-black text-slate-800">{p.label}</span>
                            <span className="block truncate text-[11px] font-medium text-slate-400">{p.sub}</span>
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                              exists
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-100 text-slate-400"
                            }`}
                          >
                            {exists ? "Hazır" : "Boş"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>
        }
        detail={
          selected === null ? (
            <Card className="hidden p-8 lg:block">
              <EmptyState
                icon={icon ?? <Sparkles className="h-8 w-8" />}
                title="Bir profil seçin"
                description="İçeriğini görüntülemek veya düzenlemek için soldan bir profil seçin."
              />
            </Card>
          ) : (
            <div>
              <MobileBack onBack={() => setSelectedKey(null)} />
              {selectedTopic ? (
                <TopicDetailEditor
                  topicId={selectedTopic.id}
                  onChanged={() => void load()}
                  onDeleted={async () => {
                    await load();
                    setSelectedKey(null);
                  }}
                />
              ) : (
                <Card className="p-6">
                  <EmptyState
                    icon={icon ?? <Sparkles className="h-8 w-8" />}
                    title={`${selected.label} — henüz içerik yok`}
                    description="Bu profil için beslenme içeriği (bölümler, ilişkili besinler, kaynaklar) henüz oluşturulmadı. Oluşturarak düzenlemeye başlayabilirsiniz."
                    action={
                      <PrimaryButton
                        icon={<Plus className="h-4 w-4" />}
                        loading={creatingKey === selected.matchTitle}
                        onClick={() => void createFor(selected)}
                      >
                        Profili Oluştur
                      </PrimaryButton>
                    }
                  />
                </Card>
              )}
            </div>
          )
        }
      />
    </BeslenmeShell>
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
      Profillere Dön
    </button>
  );
}
