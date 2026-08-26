"use client";
/**
 * Beslenme → Besinler. Besin CRUD (master-detail). Sol: arama + grup filtresi +
 * liste. Sağ: detay/düzenleme formu + [Kaynaklar] sekmesi. Kaynaklar OPSİYONELDİR.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BookOpen,
  Package,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { Food, FoodGroupRef } from "@/lib/beslenme/beslenmeClient";
import {
  createFood,
  deleteFood,
  fetchReference,
  getFood,
  linkFoodSource,
  listFoods,
  unlinkFoodSource,
  updateFood,
} from "@/lib/beslenme/beslenmeClient";
import {
  BeslenmeGate,
  BeslenmeShell,
  useBeslenmeOwnerGuard,
} from "../_components/BeslenmeShell";
import { PREP_STATE_LABELS, PREP_STATE_OPTIONS, friendlyError } from "../_components/constants";
import { SourcesPanel, type LinkedSource } from "../_components/SourcesPanel";
import {
  Card,
  DangerButton,
  EmptyState,
  Field,
  GhostButton,
  InlineSpinner,
  MasterDetail,
  PrimaryButton,
  SelectInput,
  StatusMessage,
  TextArea,
  TextInput,
} from "../_components/primitives";

const NEW = "__new__";

export default function BesinlerPage() {
  const guard = useBeslenmeOwnerGuard();

  const [groups, setGroups] = useState<FoodGroupRef[]>([]);
  const [foods, setFoods] = useState<Food[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listErr, setListErr] = useState("");
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setListLoading(true);
    setListErr("");
    const r = await listFoods({ q: q.trim() || undefined, group: group || undefined });
    setListLoading(false);
    if (r.ok && r.data) setFoods(r.data.foods ?? []);
    else setListErr(friendlyError(r.code, r.status));
  }, [q, group]);

  // Referans (besin grupları) tek sefer
  useEffect(() => {
    if (guard !== "ok") return;
    void (async () => {
      const r = await fetchReference();
      if (r.ok && r.data) setGroups(r.data.foodGroups ?? []);
    })();
  }, [guard]);

  // Liste — arama/grup değişiminde debounce
  useEffect(() => {
    if (guard !== "ok") return;
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [guard, load]);

  if (guard !== "ok") return <BeslenmeGate state={guard} />;

  const detailOpen = selectedId !== null;

  return (
    <BeslenmeShell
      title="Besinler"
      subtitle="Besin kütüphanesi. Her besin bir gruba, hazırlık durumuna ve isteğe bağlı kaynaklara sahip olabilir."
      backHref="/beslenme"
      actions={
        <PrimaryButton icon={<Plus className="h-4 w-4" />} onClick={() => setSelectedId(NEW)}>
          Yeni Besin
        </PrimaryButton>
      }
    >
      <MasterDetail
        detailOpen={detailOpen}
        list={
          <FoodList
            foods={foods}
            groups={groups}
            loading={listLoading}
            error={listErr}
            q={q}
            group={group}
            selectedId={selectedId}
            onQ={setQ}
            onGroup={setGroup}
            onSelect={setSelectedId}
            onRetry={() => void load()}
          />
        }
        detail={
          selectedId === null ? (
            <Card className="hidden p-8 lg:block">
              <EmptyState
                icon={<Package className="h-8 w-8" />}
                title="Bir besin seçin"
                description="Düzenlemek için soldaki listeden bir besin seçin veya yeni bir besin ekleyin."
              />
            </Card>
          ) : (
            <FoodDetail
              key={selectedId}
              foodId={selectedId === NEW ? null : selectedId}
              groups={groups}
              onBack={() => setSelectedId(null)}
              onSaved={async (food) => {
                await load();
                setSelectedId(food.id);
              }}
              onDeleted={async () => {
                await load();
                setSelectedId(null);
              }}
            />
          )
        }
      />
    </BeslenmeShell>
  );
}

/* ── Liste ── */
function FoodList({
  foods,
  groups,
  loading,
  error,
  q,
  group,
  selectedId,
  onQ,
  onGroup,
  onSelect,
  onRetry,
}: {
  foods: Food[];
  groups: FoodGroupRef[];
  loading: boolean;
  error: string;
  q: string;
  group: string;
  selectedId: string | null;
  onQ: (v: string) => void;
  onGroup: (v: string) => void;
  onSelect: (id: string) => void;
  onRetry: () => void;
}) {
  const groupName = useMemo(() => {
    const m = new Map(groups.map((g) => [g.id, g.name_tr]));
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [groups]);

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="border-b border-slate-100 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <TextInput
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder="Besin ara…"
            className="pl-9"
          />
        </div>
        <div className="mt-2">
          <SelectInput value={group} onChange={(e) => onGroup(e.target.value)}>
            <option value="">Tüm gruplar</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name_tr}
              </option>
            ))}
          </SelectInput>
        </div>
      </div>

      <div className="max-h-[64vh] overflow-y-auto p-2">
        {loading ? (
          <InlineSpinner label="Besinler yükleniyor…" />
        ) : error ? (
          <div className="p-3">
            <StatusMessage type="error">{error}</StatusMessage>
            <div className="mt-3">
              <GhostButton onClick={onRetry}>Tekrar Dene</GhostButton>
            </div>
          </div>
        ) : foods.length === 0 ? (
          <div className="p-3">
            <EmptyState
              icon={<Package className="h-8 w-8" />}
              title="Besin bulunamadı"
              description={q || group ? "Arama/filtre kriterlerine uygun besin yok." : "Henüz besin eklenmemiş. Yeni bir besin ekleyin."}
            />
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {foods.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onSelect(f.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition ${
                    selectedId === f.id
                      ? "bg-emerald-50 ring-1 ring-emerald-200"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-black text-slate-800">{f.name_tr}</span>
                    <span className="block truncate text-[11px] font-medium text-slate-400">
                      {groupName(f.food_group_id) ?? "Grupsuz"}
                      {f.prep_state ? ` · ${PREP_STATE_LABELS[f.prep_state] ?? f.prep_state}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/* ── Detay / düzenleme ── */
function FoodDetail({
  foodId,
  groups,
  onBack,
  onSaved,
  onDeleted,
}: {
  foodId: string | null;
  groups: FoodGroupRef[];
  onBack: () => void;
  onSaved: (food: Food) => void;
  onDeleted: () => void;
}) {
  const isNew = foodId === null;
  const [loading, setLoading] = useState(!isNew);
  const [loadErr, setLoadErr] = useState("");
  const [tab, setTab] = useState<"info" | "sources">("info");

  const [nameTr, setNameTr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);
  const [aliasDraft, setAliasDraft] = useState("");
  const [groupId, setGroupId] = useState("");
  const [prep, setPrep] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [sources, setSources] = useState<LinkedSource[]>([]);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const reloadSources = useCallback(async () => {
    if (isNew || !foodId) return;
    const r = await getFood(foodId);
    if (r.ok && r.data) setSources((r.data.sources ?? []) as LinkedSource[]);
  }, [foodId, isNew]);

  useEffect(() => {
    if (isNew) return;
    let alive = true;
    void (async () => {
      setLoading(true);
      setLoadErr("");
      const r = await getFood(foodId as string);
      if (!alive) return;
      setLoading(false);
      if (!r.ok || !r.data?.food) {
        setLoadErr(friendlyError(r.code, r.status));
        return;
      }
      const f = r.data.food;
      setNameTr(f.name_tr ?? "");
      setNameEn(f.name_en ?? "");
      setAliases(f.aliases ?? []);
      setGroupId(f.food_group_id ?? "");
      setPrep(f.prep_state ?? "");
      setDescription(f.description ?? "");
      setNotes(f.notes ?? "");
      setSources((r.data.sources ?? []) as LinkedSource[]);
    })();
    return () => {
      alive = false;
    };
  }, [foodId, isNew]);

  function commitAlias() {
    const parts = aliasDraft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    setAliases((prev) => {
      const set = new Set(prev.map((x) => x.toLocaleLowerCase("tr")));
      const merged = [...prev];
      for (const p of parts) {
        if (!set.has(p.toLocaleLowerCase("tr"))) merged.push(p);
      }
      return merged;
    });
    setAliasDraft("");
  }

  async function save() {
    if (!nameTr.trim()) {
      setMsg({ type: "error", text: "Besin adı (Türkçe) zorunludur." });
      return;
    }
    setSaving(true);
    setMsg(null);
    const body = {
      name_tr: nameTr.trim(),
      name_en: nameEn.trim() || null,
      aliases,
      food_group_id: groupId || null,
      prep_state: prep || null,
      description: description.trim() || null,
      notes: notes.trim() || null,
    };
    const r = isNew ? await createFood(body) : await updateFood(foodId as string, body);
    setSaving(false);
    if (r.ok && r.data?.food) {
      setMsg({ type: "success", text: "Kaydedildi." });
      onSaved(r.data.food);
    } else {
      setMsg({ type: "error", text: friendlyError(r.code, r.status) });
    }
  }

  async function del() {
    if (isNew || !foodId) return;
    setDeleting(true);
    const r = await deleteFood(foodId);
    setDeleting(false);
    if (r.ok) onDeleted();
    else setMsg({ type: "error", text: friendlyError(r.code, r.status) });
  }

  if (loading) {
    return (
      <Card className="p-4">
        <InlineSpinner label="Besin yükleniyor…" />
      </Card>
    );
  }
  if (loadErr) {
    return (
      <Card className="p-4">
        <MobileBack onBack={onBack} />
        <StatusMessage type="error">{loadErr}</StatusMessage>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <MobileBack onBack={onBack} />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="min-w-0 truncate text-lg font-black text-slate-900">
            {isNew ? "Yeni Besin" : nameTr || "Besin"}
          </h2>
        </div>

        {/* Sekmeler */}
        <div className="mb-4 inline-flex w-fit gap-1 rounded-xl bg-white/70 p-1 ring-1 ring-emerald-100">
          <TabBtn active={tab === "info"} onClick={() => setTab("info")} icon={<Package className="h-4 w-4" />}>
            Bilgiler
          </TabBtn>
          <TabBtn
            active={tab === "sources"}
            onClick={() => setTab("sources")}
            icon={<BookOpen className="h-4 w-4" />}
          >
            Kaynaklar
            {sources.length > 0 ? (
              <span className="ml-1 rounded-full bg-emerald-100 px-1.5 text-[10px] text-emerald-700">{sources.length}</span>
            ) : null}
          </TabBtn>
        </div>

        {msg ? (
          <div className="mb-3">
            <StatusMessage type={msg.type}>{msg.text}</StatusMessage>
          </div>
        ) : null}

        {tab === "info" ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Besin Adı (Türkçe)" required>
                <TextInput value={nameTr} onChange={(e) => setNameTr(e.target.value)} placeholder="Örn: Zeytinyağı" />
              </Field>
              <Field label="İngilizce Adı">
                <TextInput value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Örn: Olive oil" />
              </Field>
              <Field label="Besin Grubu">
                <SelectInput value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                  <option value="">Grupsuz</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name_tr}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Hazırlık Durumu">
                <SelectInput value={prep} onChange={(e) => setPrep(e.target.value)}>
                  <option value="">Belirtilmemiş</option>
                  {PREP_STATE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>

            <Field label="Eş Anlamlılar / Diğer İsimler" hint="Yazıp Enter'a veya virgüle basarak ekleyin.">
              <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
                {aliases.length > 0 ? (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {aliases.map((a, i) => (
                      <span
                        key={`${a}-${i}`}
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[12px] font-bold text-emerald-700"
                      >
                        {a}
                        <button
                          type="button"
                          onClick={() => setAliases((prev) => prev.filter((_, idx) => idx !== i))}
                          className="rounded-full p-0.5 text-emerald-500 hover:bg-emerald-100 hover:text-emerald-700"
                          aria-label={`${a} etiketini kaldır`}
                        >
                          <X className="h-3 w-3" aria-hidden />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
                <input
                  value={aliasDraft}
                  onChange={(e) => setAliasDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      commitAlias();
                    } else if (e.key === "Backspace" && !aliasDraft && aliases.length) {
                      setAliases((prev) => prev.slice(0, -1));
                    }
                  }}
                  onBlur={commitAlias}
                  placeholder="Ekle…"
                  className="w-full bg-transparent px-1 py-1 text-[13px] font-medium text-slate-800 outline-none placeholder:text-slate-400"
                />
              </div>
            </Field>

            <Field label="Açıklama">
              <TextArea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Besin hakkında kısa açıklama…"
              />
            </Field>
            <Field label="Notlar">
              <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Özel notlar…" />
            </Field>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <PrimaryButton icon={<Save className="h-4 w-4" />} loading={saving} onClick={() => void save()}>
                {isNew ? "Oluştur" : "Kaydet"}
              </PrimaryButton>
              {!isNew ? (
                confirmDel ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold text-rose-600">Arşivlensin mi?</span>
                    <DangerButton loading={deleting} onClick={() => void del()}>
                      Evet, Arşivle
                    </DangerButton>
                    <GhostButton onClick={() => setConfirmDel(false)}>Vazgeç</GhostButton>
                  </div>
                ) : (
                  <DangerButton icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDel(true)}>
                    Arşivle
                  </DangerButton>
                )
              ) : null}
            </div>
          </div>
        ) : (
          <SourcesPanel
            links={sources}
            disabledReason={isNew ? "Kaynak eklemek için önce besini kaydedin." : undefined}
            onLink={async (sourceId, locator) => {
              if (isNew || !foodId) return false;
              const r = await linkFoodSource(foodId, { source_id: sourceId, locator });
              if (r.ok) await reloadSources();
              return r.ok;
            }}
            onUnlink={async (linkId) => {
              if (isNew || !foodId) return false;
              const r = await unlinkFoodSource(foodId, linkId);
              if (r.ok) await reloadSources();
              return r.ok;
            }}
          />
        )}
      </Card>
    </div>
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

function TabBtn({
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
