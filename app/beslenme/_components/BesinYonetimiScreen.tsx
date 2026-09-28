"use client";
/**
 * Beslenme — Besin Yönetimi ekranı (master-detail). TEK canonical tam-Beslenme ekranı:
 * /beslenme/besinler (Kaynaklar + Geleneksel + Detaylı Ekle dahil). Ayrı "Besinlerim"/contributor
 * modu KALDIRILDI — CUSTOM besin yönetimi tam Beslenme modülünün parçasıdır.
 *
 * ERİŞİM bu bileşene GELMEDEN route wrapper'ında doğrulanır (useBeslenmeModuleGuard). Bu bileşen
 * guard ÇAĞIRMAZ; yalnız sunum + veri. Sunucu tarafı zaten guard'lı (defense-in-depth).
 *
 * DÜZENLENEBİLİRLİK (2026-09-27): sistem kataloğundan gelen besinler de düzenlenebilir. İlk kayıt
 * sunucuda uzmanın kişisel kopyasını oluşturur (global kayıt ve diğer uzmanlar etkilenmez); ekran
 * sessizce kopyaya geçer. Kullanıcıya "sistem/ortak" gibi teknik sahiplik etiketi GÖSTERİLMEZ.
 * "Sil" = çalışma alanından kaldır (arşiv YOK). "Sistem Değerine Dön" ≠ Sil: kişisel değerleri
 * kaldırıp sistem değerlerini geri getirir; 3 aşama + sunucu doğrulamalı 4 haneli kod.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Leaf,
  Package,
  Plus,
  RotateCcw,
  Save,
  Scale,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type {
  Food, FoodGroupRef, FrameworkRef, FoodNutrientView, FoodPortionView, FoodTraditional,
} from "@/lib/beslenme/beslenmeClient";
import {
  confirmFoodReset,
  createFood,
  deleteFood,
  fetchReference,
  getFood,
  getPersonalizedFoodCount,
  linkFoodSource,
  requestFoodResetChallenge,
  unlinkFoodSource,
  updateFood,
  type FoodResetScope,
} from "@/lib/beslenme/beslenmeClient";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { DestructiveChallengeDialog, challengeErrorMessage, type ChallengeRequest, type ChallengeConfirm } from "./DestructiveChallengeDialog";
import { useFoodPagination } from "@/lib/beslenme/foodPagination";
import { runInEffect } from "@/lib/runInEffect";
import { BeslenmeShell } from "./BeslenmeShell";
import { PREP_STATE_LABELS, PREP_STATE_OPTIONS, friendlyError } from "./constants";
import { QuickAddFoodDialog } from "./QuickAddFoodDialog";
import { SourcesPanel, type LinkedSource } from "./SourcesPanel";
import { NutrientsPanel, PortionsPanel, TraditionalPanel } from "./FoodNutrition";
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
} from "./primitives";

const NEW = "__new__";

type DetailTab = "info" | "nutrients" | "portions" | "traditional" | "sources";

export function BesinYonetimiScreen() {
  const [groups, setGroups] = useState<FoodGroupRef[]>([]);
  const [frameworks, setFrameworks] = useState<FrameworkRef[]>([]);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("info");
  const [quickAdd, setQuickAdd] = useState(false);
  const [personalizedCount, setPersonalizedCount] = useState(0);
  const [resetAllOpen, setResetAllOpen] = useState(false);
  const [screenMsg, setScreenMsg] = useState("");

  const refreshPersonalizedCount = useCallback(async () => {
    const r = await getPersonalizedFoodCount();
    if (r.ok && r.data) setPersonalizedCount(r.data.count ?? 0);
  }, []);
  useEffect(() => {
    runInEffect(() => void refreshPersonalizedCount());
  }, [refreshPersonalizedCount]);

  // Sayfalama: q/group değişiminde debounce + reset; "daha fazla yükle" ile tüm katalog gezilir
  // (ilk-100 sınırı yok). Tenant izolasyonu SERVER-SIDE korunur: listFoods → /api/beslenme/foods
  // → nutrition_food_search RPC yalnız (kendi tenant ∪ SYSTEM) döndürür (tenant izolasyonu
  // server guard'ından gelir).
  const {
    foods,
    total,
    loading: listLoading,
    error: listHasError,
    errorCode,
    errorStatus,
    loadingMore,
    moreError,
    moreErrorCode,
    moreErrorStatus,
    hasMore,
    loadedCount,
    loadMore,
    reload,
  } = useFoodPagination({ q, group });

  // Referans (besin grupları/çerçeveler) tek sefer — /reference tam Beslenme (requireBeslenmeModule).
  useEffect(() => {
    void (async () => {
      const r = await fetchReference();
      if (r.ok && r.data) {
        setGroups(r.data.foodGroups ?? []);
        setFrameworks(r.data.frameworks ?? []);
      }
    })();
  }, []);

  const detailOpen = selectedId !== null;

  const selectFood = useCallback((id: string | null) => {
    setDetailTab("info");
    setScreenMsg("");
    setSelectedId(id);
  }, []);

  const requestAllReset = useCallback<ChallengeRequest>(async () => {
    const r = await requestFoodResetChallenge("all");
    if (r.ok && r.data) return { ok: true, value: r.data };
    return { ok: false, message: resetRequestError(r.code, r.status) };
  }, []);
  const confirmAllReset = useCallback<ChallengeConfirm>(async (challengeId, code) => {
    const r = await confirmFoodReset("all", undefined, challengeId, code);
    if (r.ok) return { ok: true };
    const e = challengeErrorMessage(r.code);
    return { ok: false, message: r.code?.startsWith("CHALLENGE_") ? e.message : friendlyError(r.code, r.status), refresh: e.refresh };
  }, []);

  return (
    <BeslenmeShell
      title="Besinler"
      subtitle="Besin kütüphanesi. Her besin bir gruba, hazırlık durumuna ve isteğe bağlı kaynaklara sahip olabilir."
      backHref="/beslenme"
      backLabel="Beslenme Merkezi"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {personalizedCount > 0 ? (
            <button
              type="button"
              onClick={() => setResetAllOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-[13px] font-black text-amber-800 shadow-sm transition hover:bg-amber-100"
              title={`Sistem besinlerinde yaptığınız kişisel değişiklikler (${personalizedCount} besin)`}
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Tüm Kişisel Değerleri Sıfırla
            </button>
          ) : null}
          <GhostButton icon={<Plus className="h-4 w-4" />} onClick={() => setQuickAdd(true)}>
            Besin Ekle
          </GhostButton>
          <PrimaryButton icon={<Plus className="h-4 w-4" />} onClick={() => selectFood(NEW)}>
            Detaylı Ekle
          </PrimaryButton>
        </div>
      }
    >
      {screenMsg ? (
        <div className="mb-3">
          <StatusMessage type="success">{screenMsg}</StatusMessage>
        </div>
      ) : null}
      <MasterDetail
        detailOpen={detailOpen}
        list={
          <FoodList
            foods={foods}
            groups={groups}
            loading={listLoading}
            error={listHasError ? friendlyError(errorCode, errorStatus) : ""}
            total={total}
            loadedCount={loadedCount}
            hasMore={hasMore}
            loadingMore={loadingMore}
            moreError={moreError ? friendlyError(moreErrorCode, moreErrorStatus) : ""}
            q={q}
            group={group}
            selectedId={selectedId}
            onQ={setQ}
            onGroup={setGroup}
            onSelect={selectFood}
            onRetry={reload}
            onLoadMore={loadMore}
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
              frameworks={frameworks}
              initialTab={detailTab}
              onTabChange={setDetailTab}
              onBack={() => selectFood(null)}
              onSaved={(food) => {
                reload();
                setSelectedId(food.id);
                void refreshPersonalizedCount();
              }}
              onPersonalized={(effectiveId) => {
                // Sistem besininde ilk kayıt → kişisel kopya: ekran kopyaya geçer (aynı sekme).
                reload();
                setSelectedId(effectiveId);
                void refreshPersonalizedCount();
              }}
              onDeleted={(text) => {
                reload();
                setSelectedId(null);
                setScreenMsg(text);
                void refreshPersonalizedCount();
              }}
              onReset={(text) => {
                reload();
                setSelectedId(null);
                setScreenMsg(text);
                void refreshPersonalizedCount();
              }}
            />
          )
        }
      />
      {quickAdd ? (
        <QuickAddFoodDialog
          open={quickAdd}
          groups={groups}
          onClose={() => setQuickAdd(false)}
          onCreated={(food) => {
            setQuickAdd(false);
            reload();
            selectFood(food.id);
          }}
        />
      ) : null}
      {resetAllOpen ? (
        <DestructiveChallengeDialog
          open
          tone="reset"
          title="Tüm Kişisel Değerleri Sıfırla"
          itemNoun="besin"
          scopeIntro={
            <>
              Sistem kütüphanesindeki besinlerde yaptığınız <b>tüm kişisel değişiklikler</b> kaldırılacak ve bu
              besinler sistem başlangıç değerlerine döndürülecek. Kendi oluşturduğunuz besinler bu işlemden
              <b> etkilenmez</b>. Mevcut planlarınızdaki kayıtlar değişmez.
            </>
          }
          warning="Uzman olarak girdiğiniz mevcut değerler kalıcı olarak kaldırılacaktır."
          confirmLabel="Sistem Değerlerine Döndür"
          requestChallenge={requestAllReset}
          confirm={confirmAllReset}
          onClose={() => setResetAllOpen(false)}
          onDone={() => {
            setResetAllOpen(false);
            reload();
            setSelectedId(null);
            setScreenMsg("Kişisel değerler kaldırıldı; besinler sistem değerlerine döndürüldü.");
            void refreshPersonalizedCount();
          }}
        />
      ) : null}
    </BeslenmeShell>
  );
}

/* ── Liste ── */
function FoodList({
  foods,
  groups,
  loading,
  error,
  total,
  loadedCount,
  hasMore,
  loadingMore,
  moreError,
  q,
  group,
  selectedId,
  onQ,
  onGroup,
  onSelect,
  onRetry,
  onLoadMore,
}: {
  foods: Food[];
  groups: FoodGroupRef[];
  loading: boolean;
  error: string;
  total: number;
  loadedCount: number;
  hasMore: boolean;
  loadingMore: boolean;
  moreError: string;
  q: string;
  group: string;
  selectedId: string | null;
  onQ: (v: string) => void;
  onGroup: (v: string) => void;
  onSelect: (id: string) => void;
  onRetry: () => void;
  onLoadMore: () => void;
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
        {!loading && !error && total > 0 ? (
          <p className="mt-2 px-1 text-[11px] font-bold text-slate-400">
            {loadedCount < total ? `${loadedCount} / ${total} besin` : `${total} besin`}
          </p>
        ) : null}
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
          <div className="flex flex-col gap-2">
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
                      <span className="block min-w-0 truncate text-[13px] font-black text-slate-800">{f.name_tr}</span>
                      <span className="block truncate text-[11px] font-medium text-slate-400">
                        {groupName(f.food_group_id) ?? "Grupsuz"}
                        {f.prep_state ? ` · ${PREP_STATE_LABELS[f.prep_state] ?? f.prep_state}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <ListFooter hasMore={hasMore} loadingMore={loadingMore} moreError={moreError} onLoadMore={onLoadMore} />
          </div>
        )}
      </div>
    </Card>
  );
}

/** Liste altı: "Daha fazla yükle" / yükleniyor / hata + tekrar dene. Son sayfada gizlenir. */
function ListFooter({
  hasMore,
  loadingMore,
  moreError,
  onLoadMore,
}: {
  hasMore: boolean;
  loadingMore: boolean;
  moreError: string;
  onLoadMore: () => void;
}) {
  if (loadingMore) {
    return <InlineSpinner label="Daha fazla besin yükleniyor…" />;
  }
  if (moreError) {
    return (
      <div className="px-1 py-2">
        <StatusMessage type="error">{moreError}</StatusMessage>
        <div className="mt-2">
          <GhostButton onClick={onLoadMore}>Tekrar Dene</GhostButton>
        </div>
      </div>
    );
  }
  if (!hasMore) return null;
  return (
    <div className="px-1 pb-1">
      <GhostButton onClick={onLoadMore} className="w-full justify-center">
        Daha fazla yükle
      </GhostButton>
    </div>
  );
}

/* ── Detay / düzenleme ── */
function FoodDetail({
  foodId,
  groups,
  frameworks,
  initialTab,
  onTabChange,
  onBack,
  onSaved,
  onPersonalized,
  onDeleted,
  onReset,
}: {
  foodId: string | null;
  groups: FoodGroupRef[];
  frameworks: FrameworkRef[];
  initialTab: DetailTab;
  onTabChange: (t: DetailTab) => void;
  onBack: () => void;
  onSaved: (food: Food) => void;
  onPersonalized: (effectiveFoodId: string) => void;
  onDeleted: (message: string) => void;
  onReset: (message: string) => void;
}) {
  // Tam Beslenme ekranı: Kaynaklar + Geleneksel sekmeleri her zaman mevcut (ayrı contributor
  // modu yok). İlgili API uçları requireBeslenmeModule ile korunur.
  const allowFullTabs = true;
  const isNew = foodId === null;
  const [loading, setLoading] = useState(!isNew);
  const [loadErr, setLoadErr] = useState("");
  const [tab, setTabState] = useState<DetailTab>(isNew ? "info" : initialTab);
  const setTab = (t: DetailTab) => {
    setTabState(t);
    onTabChange(t);
  };
  // Sahiplik yalnız davranış için (Sil metni / sıfırlama); kullanıcıya etiket olarak gösterilmez.
  const [isSystem, setIsSystem] = useState(false);
  const [isPersonalized, setIsPersonalized] = useState(false);
  const [effectiveId, setEffectiveId] = useState<string | null>(foodId);
  const [resetOpen, setResetOpen] = useState(false);
  const deleteConfirm = useDeleteConfirm();
  const [nutrients, setNutrients] = useState<FoodNutrientView[]>([]);
  const [portions, setPortions] = useState<FoodPortionView[]>([]);
  const [traditional, setTraditional] = useState<FoodTraditional | null>(null);

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
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const reloadSources = useCallback(async () => {
    if (isNew || !effectiveId) return;
    const r = await getFood(effectiveId);
    if (r.ok && r.data) setSources((r.data.sources ?? []) as LinkedSource[]);
  }, [effectiveId, isNew]);

  const reloadDetail = useCallback(async () => {
    if (isNew || !effectiveId) return;
    const r = await getFood(effectiveId);
    if (r.ok && r.data) {
      setNutrients(r.data.nutrients ?? []);
      setPortions(r.data.portions ?? []);
      setTraditional(r.data.traditional ?? null);
    }
  }, [effectiveId, isNew]);

  /** Alt panel kaydı sonrası: sistem besini kişisel kopyaya geçtiyse ekranı kopyaya taşı. */
  const afterChildSave = useCallback(
    (newId?: string) => {
      if (newId && newId !== effectiveId) {
        onPersonalized(newId);
        return;
      }
      void reloadDetail();
    },
    [effectiveId, onPersonalized, reloadDetail],
  );

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
      setIsSystem(f.is_system === true);
      setIsPersonalized(f.is_personalized === true || !!f.origin_food_id);
      setEffectiveId(f.id);
      setSources((r.data.sources ?? []) as LinkedSource[]);
      setNutrients(r.data.nutrients ?? []);
      setPortions(r.data.portions ?? []);
      setTraditional(r.data.traditional ?? null);
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
    const r = isNew ? await createFood(body) : await updateFood(effectiveId as string, body);
    setSaving(false);
    if (r.ok && r.data?.food) {
      setMsg({ type: "success", text: "Kaydedildi." });
      onSaved(r.data.food);
    } else {
      setMsg({ type: "error", text: friendlyError(r.code, r.status) });
    }
  }

  async function del() {
    if (isNew || !effectiveId || deleting) return;
    const name = nameTr.trim() || "Bu besin";
    const message = isSystem
      ? "Bu besin çalışma alanınızdan kaldırılacak ve listelerinizde görünmeyecek. Planlarınızdaki mevcut kayıtlar değişmez."
      : isPersonalized
        ? "Bu besin çalışma alanınızdan kaldırılacak; bu besin için girdiğiniz kişisel değerler de silinecek. Planlarınızdaki mevcut kayıtlar değişmez."
        : "Bu besin kalıcı olarak silinecek (besin değerleri, porsiyonlar, geleneksel bilgiler ve kaynak bağlantıları dahil). Planlarınızdaki mevcut kayıtlar değişmez.";
    const ok = await deleteConfirm({ title: "Besini sil", message, names: [name], confirmText: "Sil" });
    if (!ok) return;
    setDeleting(true);
    setMsg(null);
    const r = await deleteFood(effectiveId);
    setDeleting(false);
    if (r.ok) {
      onDeleted(`"${name}" silindi.`);
      return;
    }
    if (r.code === "IN_USE" && r.data?.topics?.length) {
      setMsg({
        type: "error",
        text: `Bu besin şu rehberlerde kullanılıyor: ${r.data.topics.join(", ")}. Silmek için önce besini bu rehberlerden kaldırın.`,
      });
      return;
    }
    setMsg({ type: "error", text: friendlyError(r.code, r.status) });
  }

  const requestOneReset = useCallback<ChallengeRequest>(async () => {
    if (!effectiveId) return { ok: false, message: "Besin bulunamadı." };
    const r = await requestFoodResetChallenge("one" as FoodResetScope, effectiveId);
    if (r.ok && r.data) return { ok: true, value: r.data };
    return { ok: false, message: resetRequestError(r.code, r.status, r.data?.blocked) };
  }, [effectiveId]);
  const confirmOneReset = useCallback<ChallengeConfirm>(
    async (challengeId, code) => {
      if (!effectiveId) return { ok: false, message: "Besin bulunamadı." };
      const r = await confirmFoodReset("one", effectiveId, challengeId, code);
      if (r.ok) return { ok: true };
      const e = challengeErrorMessage(r.code);
      return { ok: false, message: r.code?.startsWith("CHALLENGE_") ? e.message : friendlyError(r.code, r.status), refresh: e.refresh };
    },
    [effectiveId],
  );

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
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="min-w-0 truncate text-lg font-black text-slate-900">
            {isNew ? "Yeni Besin" : nameTr || "Besin"}
          </h2>
          {!isNew && isPersonalized ? (
            <button
              type="button"
              onClick={() => setResetOpen(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-700 transition hover:bg-amber-100"
              title="Bu besinde girdiğiniz kişisel değerleri kaldırıp sistem değerlerine döner"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Sistem Değerine Dön
            </button>
          ) : null}
        </div>

        {/* Sekmeler */}
        <div className="mb-4 inline-flex w-fit gap-1 rounded-xl bg-white/70 p-1 ring-1 ring-emerald-100">
          <TabBtn active={tab === "info"} onClick={() => setTab("info")} icon={<Package className="h-4 w-4" />}>
            Bilgiler
          </TabBtn>
          {!isNew ? (
            <>
              <TabBtn active={tab === "nutrients"} onClick={() => setTab("nutrients")} icon={<Activity className="h-4 w-4" />}>
                Besin Değerleri
              </TabBtn>
              <TabBtn active={tab === "portions"} onClick={() => setTab("portions")} icon={<Scale className="h-4 w-4" />}>
                Porsiyonlar
              </TabBtn>
              {allowFullTabs ? (
                <TabBtn active={tab === "traditional"} onClick={() => setTab("traditional")} icon={<Leaf className="h-4 w-4" />}>
                  Geleneksel
                </TabBtn>
              ) : null}
            </>
          ) : null}
          {allowFullTabs ? (
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
          ) : null}
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
                <DangerButton icon={<Trash2 className="h-4 w-4" />} loading={deleting} onClick={() => void del()}>
                  Sil
                </DangerButton>
              ) : null}
            </div>
          </div>
        ) : tab === "nutrients" && effectiveId ? (
          <NutrientsPanel key={`n-${effectiveId}`} foodId={effectiveId} nutrients={nutrients} onChanged={afterChildSave} />
        ) : tab === "portions" && effectiveId ? (
          <PortionsPanel key={`p-${effectiveId}`} foodId={effectiveId} portions={portions} nutrients={nutrients} onChanged={afterChildSave} />
        ) : tab === "traditional" && effectiveId && allowFullTabs ? (
          <TraditionalPanel key={`t-${effectiveId}`} foodId={effectiveId} traditional={traditional} frameworks={frameworks} onChanged={afterChildSave} />
        ) : allowFullTabs ? (
          <SourcesPanel
            links={sources}
            disabledReason={isNew ? "Kaynak eklemek için önce besini kaydedin." : undefined}
            onLink={async (body) => {
              if (isNew || !effectiveId) return false;
              const r = await linkFoodSource(effectiveId, body);
              if (r.ok) {
                if (r.data?.food_id && r.data.food_id !== effectiveId) onPersonalized(r.data.food_id);
                else await reloadSources();
              }
              return r.ok;
            }}
            onUnlink={async (linkId) => {
              if (isNew || !effectiveId) return false;
              const r = await unlinkFoodSource(effectiveId, linkId);
              if (r.ok) await reloadSources();
              return r.ok;
            }}
          />
        ) : null}
      </Card>
      {resetOpen && effectiveId ? (
        <DestructiveChallengeDialog
          open
          tone="reset"
          title="Sistem Değerine Dön"
          itemNoun="besin"
          scopeIntro={
            <>
              Yalnızca <b>{nameTr.trim() || "bu besin"}</b> için yaptığınız değişiklikler (ad, besin değerleri,
              porsiyonlar, geleneksel bilgiler ve kaynak bağlantıları) kaldırılacak ve besin sistem başlangıç
              değerlerine döndürülecek. Mevcut planlarınızdaki kayıtlar değişmez.
            </>
          }
          warning="Uzman olarak girdiğiniz mevcut değerler kaldırılacaktır."
          confirmLabel="Sistem Değerine Döndür"
          requestChallenge={requestOneReset}
          confirm={confirmOneReset}
          onClose={() => setResetOpen(false)}
          onDone={() => {
            setResetOpen(false);
            onReset(`"${nameTr.trim() || "Besin"}" sistem değerlerine döndürüldü.`);
          }}
        />
      ) : null}
    </div>
  );
}

/** Reset challenge isteği hataları → kullanıcı mesajı (rehberde kullanılanlar dahil). */
function resetRequestError(code?: string, status?: number, blocked?: Array<{ name: string; topics: string[] }>): string {
  if (code === "NOTHING_TO_RESET" && blocked && blocked.length > 0) {
    const list = blocked.map((b) => `${b.name} (${b.topics.join(", ")})`).join("; ");
    return `Sistem değerine döndürülebilecek besin yok. Şu besinler rehberlerde kullanıldığı için önce rehberden kaldırılmalı: ${list}.`;
  }
  return friendlyError(code, status);
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
