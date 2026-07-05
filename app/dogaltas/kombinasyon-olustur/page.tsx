"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import { DuplicateWarningModal } from "@/app/dogaltas/components/DuplicateWarningModal";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { useToast } from "@/components/ui/ToastProvider";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import {
  getSyncedTenantId,
  MISSING_SESSION_TENANT_MESSAGE,
} from "@/lib/auth/sessionTenant";
import {
  fetchAllStonesExtended,
  getFirstStoneImageUrl,
  type StoneListItemExtended,
} from "@/lib/dogaltas/stonesListFetch";
import { dogaltasApiGet, checkDuplicate } from "@/lib/dogaltas/dogaltasApi";
import { loadDogaltasInventoryForTenant } from "@/lib/urun-stok/dogaltasInventoryDb";
import { DogaltasSectionShell } from "@/app/dogaltas/components/DogaltasSectionShell";
import {
  DOGALTAS_INPUT_CLASS,
  DOGALTAS_TEXTAREA_CLASS,
} from "@/lib/dogaltas/formStyles";
import { normalizeTr, stoneHasWarning } from "@/lib/dogaltas/stoneSearchUtils";
import {
  makeStockMatcher,
  buildMineralStoneCounts,
} from "@/lib/dogaltas/mineralCombination";
import {
  SEARCH_TYPES,
  SEARCH_TYPE_META,
  evaluateOne,
  evaluateStoneConditions,
  collectSuggestions,
  buildTypeCounts,
  buildConditionsSummary,
  describeCondition,
  type SearchType,
  type SearchCondition,
} from "@/lib/dogaltas/stoneConditionSearch";
import { MineralCombobox } from "@/app/dogaltas/components/MineralCombobox";
import { StoneDetailDrawer } from "@/app/dogaltas/components/StoneDetailDrawer";
import {
  SaveCombinationModal,
  clientFullName,
  type PickerClient,
} from "@/app/dogaltas/components/SaveCombinationModal";
import { saveClientCombination } from "@/lib/dogaltas/clientCombinationsApi";

// ─── Stil sabitleri (Doğaltaş modülü diliyle uyumlu) ─────────────────────────
const pageContent = "relative z-10 w-full space-y-4";
const uiHeaderCard =
  "rounded-[24px] border-[3px] border-emerald-400/45 bg-white/90 px-4 py-3 shadow-lg";
const uiFilterCard =
  "rounded-[20px] border-[3px] border-violet-300/45 bg-white/90 p-3 shadow-md sm:p-4";
const uiStatCard =
  "rounded-xl border-2 border-emerald-200 bg-white/85 px-3 py-2 text-center shadow-md";
const uiInput = DOGALTAS_INPUT_CLASS;

// Sonuç kartı eşleşme etiketi tonları (arama türüne göre).
const CHIP_TONE: Record<SearchType, string> = {
  mineral: "bg-violet-100 text-violet-700",
  chakra: "bg-indigo-100 text-indigo-700",
  astrology: "bg-amber-100 text-amber-700",
  organ: "bg-rose-100 text-rose-700",
  stone_name: "bg-emerald-100 text-emerald-700",
};

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* yedek */
  }
  return `c-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

const emptyCondition = (): SearchCondition => ({
  id: newId(),
  type: "mineral",
  value: "",
  minPercent: null,
});

/** Kombinasyon sepetindeki taş (yalnızca yerel state — Faz 3'te DB). */
type CartStone = {
  id: string;
  name: string;
  inStock: boolean;
};

export default function KombinasyonOlusturPage() {
  const { isDemo } = useDemoGuard();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stones, setStones] = useState<StoneListItemExtended[]>([]);
  const [inStockNames, setInStockNames] = useState<string[]>([]);
  const [mineralOptions, setMineralOptions] = useState<string[]>([]);

  const [conditions, setConditions] = useState<SearchCondition[]>([emptyCondition()]);
  const [searched, setSearched] = useState(false);

  // Taş detay drawer'ı — sayfa navigasyonu yok; tüm liste/filtre/sepet state'i korunur.
  const [detail, setDetail] = useState<{
    stone: StoneListItemExtended;
    inStock: boolean;
  } | null>(null);

  // Kaydetme hedef seçim modalı (Genel / Danışana Özel).
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [savingClient, setSavingClient] = useState(false);

  // Gelecek entegrasyon: Danışan Detayı'ndan "+ Kombinasyon Oluştur" ile bu sayfa
  // ?clientId=&clientName= ile açılırsa danışan ön-seçili gelir ve Kaydet doğrudan
  // o danışana yazar (seçim ekranı çıkmadan). Yoksa normal hedef seçim modalı açılır.
  const [preselectedClient, setPreselectedClient] = useState<PickerClient | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const clientId = sp.get("clientId")?.trim();
    if (!clientId) return;
    const ad = sp.get("clientName")?.trim() || sp.get("ad")?.trim() || "";
    setPreselectedClient({ id: clientId, ad });
  }, []);

  // Kombinasyon sepeti — yerel state.
  const [cart, setCart] = useState<CartStone[]>([]);
  const cartIds = useMemo(() => new Set(cart.map((c) => c.id)), [cart]);

  function addToCart(item: CartStone) {
    setCart((prev) => (prev.some((c) => c.id === item.id) ? prev : [...prev, item]));
  }
  function removeFromCart(id: string) {
    setCart((prev) => prev.filter((c) => c.id !== id));
  }
  function clearCart() {
    setCart([]);
  }

  // Kombinasyonu kaydet formu
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [saveNote, setSaveNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedInfo, setSavedInfo] = useState<{ name: string } | null>(null);
  const router = useRouter();
  // Modül-bazlı çift kayıt uyarısı (DT-P1-1) — issue (ad) bazlı
  const [dupModal, setDupModal] = useState<{ label: string } | null>(null);
  const [dupChecking, setDupChecking] = useState(false);

  function resetSaveForm() {
    setSaveName("");
    setSaveDescription("");
    setSaveNote("");
    setSavedInfo(null);
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      const tid = await getSyncedTenantId();
      if (!tid) {
        if (!cancelled) {
          setError(MISSING_SESSION_TENANT_MESSAGE);
          setLoading(false);
        }
        return;
      }

      const [stonesRes, inv] = await Promise.all([
        fetchAllStonesExtended(tid),
        loadDogaltasInventoryForTenant(tid),
      ]);
      if (cancelled) return;

      if (stonesRes.error) setError(stonesRes.error);
      setStones(stonesRes.rows);
      setInStockNames(
        inv.items.filter((it) => (it.adet ?? 0) > 0).map((it) => it.name),
      );

      // Mineral adı önerileri (Mineral Bankası) — başarısız olursa serbest metin yine çalışır.
      // Kütüphane mineralleri gerçek uzmana otomatik görünmez; yalnız demo showcase görür
      // (server mode=all is_demo'ya göre kütüphaneyi ekler).
      const minRes = await dogaltasApiGet<{ rows?: { name?: unknown }[] }>(
        "/api/dogaltas/minerals?mode=all");
      const minRows = minRes.data?.rows ?? [];
      if (!cancelled) {
        const seen = new Set<string>();
        const names: string[] = [];
        for (const r of minRows ?? []) {
          const n = String((r as { name?: unknown }).name ?? "").trim();
          if (!n) continue;
          const key = normalizeTr(n);
          if (seen.has(key)) continue;
          seen.add(key);
          names.push(n);
        }
        names.sort((a, b) => a.localeCompare(b, "tr-TR", { sensitivity: "base" }));
        setMineralOptions(names);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeConditions = useMemo(
    () => conditions.filter((c) => c.value.trim()),
    [conditions],
  );

  const stockMatcher = useMemo(() => makeStockMatcher(inStockNames), [inStockNames]);

  // Mineral → kaç taşta bulunduğu (bir kez hesaplanır; dropdown rozeti için).
  const mineralCounts = useMemo(
    () => buildMineralStoneCounts(stones, mineralOptions),
    [stones, mineralOptions],
  );

  // Her arama türü için öneri listesi + sayım (mineral mevcut sistemden gelir).
  const optionsByType = useMemo(() => {
    const make = (type: SearchType) => {
      const options = collectSuggestions(stones, type);
      return { options, counts: buildTypeCounts(stones, type, options) };
    };
    return {
      mineral: { options: mineralOptions, counts: mineralCounts },
      chakra: make("chakra"),
      astrology: make("astrology"),
      organ: make("organ"),
      stone_name: make("stone_name"),
    } as Record<SearchType, { options: string[]; counts: Map<string, number> }>;
  }, [stones, mineralOptions, mineralCounts]);

  const results = useMemo(() => {
    if (activeConditions.length === 0) return [];
    const list = stones
      .map((stone) => {
        const evaluation = evaluateStoneConditions(stone, conditions);
        return { stone, evaluation, inStock: stockMatcher(stone.stone_name) };
      })
      .filter((r) => r.evaluation.matches);

    list.sort((a, b) => {
      if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
      return a.stone.stone_name.localeCompare(b.stone.stone_name, "tr-TR", {
        sensitivity: "base",
      });
    });
    return list;
  }, [stones, conditions, activeConditions.length, stockMatcher]);

  const inStockMatched = results.filter((r) => r.inStock).length;
  const anyThreshold = activeConditions.some(
    (c) => c.type === "mineral" && c.minPercent != null,
  );

  // ─── Sepet analizi (client-side; DB yok) ──────────────────────────────────
  const cartAnalysis = useMemo(() => {
    const fullStones = cart
      .map((c) => stones.find((s) => s.id === c.id))
      .filter((s): s is StoneListItemExtended => Boolean(s));

    // Tüm koşulların (mineral/çakra/astroloji/organ/isim) sepet taşlarınca karşılanması.
    const conditionStatus = activeConditions.map((cond) => {
      const met = fullStones.some((s) => evaluateOne(s, cond).satisfied);
      return { id: cond.id, label: describeCondition(cond), met };
    });
    const metMinerals = conditionStatus.filter((c) => c.met);
    const missingMinerals = conditionStatus.filter((c) => !c.met);

    // Taş bazlı uyarılar (warning_text + warning_tags).
    const warnings = fullStones.map((s) => ({
      id: s.id,
      name: s.stone_name || "İsimsiz taş",
      text: (s.warning_text ?? "").trim(),
      tags: Array.isArray(s.warning_tags) ? s.warning_tags.filter(Boolean) : [],
      has: stoneHasWarning(s.warning_text, s.warning_tags),
    }));
    const hasAnyWarning = warnings.some((w) => w.has);

    return { metMinerals, missingMinerals, warnings, hasAnyWarning };
  }, [cart, stones, activeConditions]);

  // ─── Kombinasyonu kaydet (güvenli API) ────────────────────────────────────
  function buildMineralSummary(): string {
    const summary = buildConditionsSummary(activeConditions);
    if (!summary) return "";
    const lines = [
      summary,
      "",
      "Karşılanan: " +
        (cartAnalysis.metMinerals.map((m) => m.label).join(", ") || "—"),
      "Eksik: " + (cartAnalysis.missingMinerals.map((m) => m.label).join(", ") || "—"),
    ];
    return lines.join("\n");
  }

  function buildWarningStockSummary(): string {
    const inStockCount = cart.filter((c) => c.inStock).length;
    const warned = cartAnalysis.warnings.filter((w) => w.has).map((w) => w.name);
    return [
      `Stok: ${inStockCount}/${cart.length} stokta`,
      warned.length ? `Uyarılı taşlar: ${warned.join(", ")}` : "Belirgin uyarı yok",
    ].join("\n");
  }

  async function saveCombination(forceCreate = false) {
    const name = saveName.trim();
    if (!name || cart.length === 0) return;

    // Modül-bazlı çift kayıt kontrolü (yalnız genel kayıt; ilk denemede; çift-tık koruması).
    if (!forceCreate) {
      if (dupChecking || dupModal || saving) return;
      setDupChecking(true);
      const dup = await checkDuplicate("combination", name);
      setDupChecking(false);
      if (dup.ok && dup.exists && dup.match) {
        setSaveModalOpen(false);
        setDupModal({ label: dup.match.label });
        return;
      }
    }

    setSaving(true);
    const userId = readYasamUser()?.id;
    const sessionToken = readSessionToken();
    try {
      const res = await fetch("/api/dogaltas/combinations/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId ?? "",
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
        },
        body: JSON.stringify({
          name,
          description: saveDescription.trim() || null,
          note: saveNote.trim() || null,
          stones: cart.map((c) => c.name),
          notesText: buildMineralSummary() || null,
          notesText2: buildWarningStockSummary(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        demo?: boolean;
      };

      if (!res.ok || !json.ok) {
        showToast({
          title: "Kayıt başarısız",
          message: json.error ?? "Kombinasyon kaydedilemedi.",
          type: "error",
        });
        setSaving(false);
        return;
      }

      showToast({
        title: "Kaydedildi",
        message: json.demo
          ? "Demo hesabında kayıt veritabanına yazılmaz (önizleme)."
          : `"${name}" kombinasyonlara kaydedildi.`,
        type: "success",
      });
      setSavedInfo({ name });
    } catch {
      showToast({
        title: "Kayıt başarısız",
        message: "Sunucuya ulaşılamadı.",
        type: "error",
      });
    }
    setSaving(false);
  }

  // Genel kayıt akışı: modal'daki "Genel Kombinasyonlara Kaydet" → mevcut davranış.
  async function handleSaveGeneral() {
    await saveCombination();
    setSaveModalOpen(false);
  }

  // Danışana özel kayıt: ayrı tablo/route (genel kombinasyonlara YAZILMAZ).
  async function saveCombinationToClient(client: PickerClient) {
    const name = saveName.trim();
    if (!name || cart.length === 0) return;

    setSavingClient(true);
    const res = await saveClientCombination(client.id, {
      name,
      description: saveDescription.trim() || null,
      note: saveNote.trim() || null,
      stones: cart.map((c) => c.name),
      notesText: buildMineralSummary() || null,
      notesText2: buildWarningStockSummary(),
    });
    setSavingClient(false);

    if (!res.ok) {
      showToast({
        title: "Kayıt başarısız",
        message: res.error ?? "Kombinasyon danışana kaydedilemedi.",
        type: "error",
      });
      return;
    }

    setSaveModalOpen(false);
    showToast({
      title: "Kaydedildi",
      message: res.demo
        ? "Demo hesabında kayıt veritabanına yazılmaz (önizleme)."
        : `"${name}" → ${clientFullName(client)} danışanına kaydedildi.`,
      type: "success",
    });
    setSavedInfo({ name });
  }

  // "Kombinasyonu Kaydet" butonu: ön-seçili danışan varsa doğrudan ona yazar;
  // yoksa hedef seçim modalını açar.
  function handleSaveClick() {
    if (saveName.trim() === "" || cart.length === 0) return;
    if (preselectedClient) {
      void saveCombinationToClient(preselectedClient);
    } else {
      setSaveModalOpen(true);
    }
  }

  // ─── Koşul işlemleri ───────────────────────────────────────────────────────
  function addCondition() {
    setConditions((prev) => [...prev, emptyCondition()]);
  }
  function removeCondition(id: string) {
    setConditions((prev) =>
      prev.length <= 1 ? [emptyCondition()] : prev.filter((c) => c.id !== id),
    );
    setSearched(false);
  }
  function updateValue(id: string, value: string) {
    setConditions((prev) => prev.map((c) => (c.id === id ? { ...c, value } : c)));
    setSearched(false);
  }
  function updateType(id: string, type: SearchType) {
    // Tür değişince değer ve (mineral dışı) yüzde sıfırlanır.
    setConditions((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, type, value: "", minPercent: null } : c,
      ),
    );
    setSearched(false);
  }
  function updatePercent(id: string, raw: string) {
    const trimmed = raw.trim();
    const num = trimmed === "" ? null : Number.parseFloat(trimmed.replace(",", "."));
    setConditions((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, minPercent: num != null && Number.isFinite(num) ? num : null }
          : c,
      ),
    );
    setSearched(false);
  }

  const showResults = searched && activeConditions.length > 0;

  return (
    <DogaltasSectionShell
      eyebrow="DOĞALTAŞ · KOMBİNASYON OLUŞTUR"
      title="Taş Kombinasyonu"
      subtitle="Mineral, çakra, astroloji, etkili organ veya taş ismine göre koşul ekleyin; tüm koşulları (VE) sağlayan taşlar listelenir. Stokta olan taşlar belirgin gösterilir."
      icon="⚗️"
      actions={
        <div className="grid grid-cols-3 gap-2 lg:min-w-[300px]">
          <div className={uiStatCard}>
            <div className="text-lg font-black text-slate-950">{stones.length}</div>
            <div className="text-xs font-bold text-slate-500">Taş</div>
          </div>
          <div className={uiStatCard}>
            <div className="text-lg font-black text-slate-950">
              {showResults ? results.length : "—"}
            </div>
            <div className="text-xs font-bold text-slate-500">Eşleşen</div>
          </div>
          <div className={uiStatCard}>
            <div className="text-lg font-black text-emerald-600">
              {showResults ? inStockMatched : "—"}
            </div>
            <div className="text-xs font-bold text-slate-500">Stokta</div>
          </div>
        </div>
      }
    >
      <BfcacheRefreshHandler />
      <div className={pageContent}>
        {isDemo && (
          <DemoModuleBanner message="Kombinasyon Oluştur'u inceleyebilirsiniz. Sonuçlar kütüphane taşları üzerinden gösterilir." />
        )}

        {/* ── Koşul kurucu ───────────────────────────────────────────────── */}
        <section className={uiFilterCard}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-black text-slate-900">Arama Koşulları</h2>
            <span className="text-[11px] font-bold text-slate-500">
              Tümü eşleşmeli (VE) · yüzde yalnız mineralde
            </span>
          </div>

          <div className="space-y-2">
            {conditions.map((cond) => (
              <div key={cond.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                {/* Arama türü */}
                <select
                  value={cond.type}
                  onChange={(e) => updateType(cond.id, e.target.value as SearchType)}
                  className="h-10 shrink-0 rounded-xl border-2 border-emerald-200 bg-white px-2 text-sm font-bold text-slate-800 shadow-inner outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-300/30 sm:w-[150px]"
                >
                  {SEARCH_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {SEARCH_TYPE_META[t].icon} {SEARCH_TYPE_META[t].label}
                    </option>
                  ))}
                </select>

                {/* Arama değeri (türüne göre öneriler) */}
                <div className="min-w-0 flex-1">
                  <MineralCombobox
                    value={cond.value}
                    onChange={(v) => updateValue(cond.id, v)}
                    options={optionsByType[cond.type].options}
                    counts={optionsByType[cond.type].counts}
                    icon={SEARCH_TYPE_META[cond.type].icon}
                    placeholder={SEARCH_TYPE_META[cond.type].placeholder}
                    className={uiInput}
                  />
                </div>

                {/* Yüzde (yalnız mineral) + Sil */}
                <div className="flex items-center gap-2 sm:shrink-0">
                  {cond.type === "mineral" && (
                    <div className="flex items-center gap-1.5 sm:w-[140px]">
                      <span className="text-xs font-black text-slate-500">≥ %</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        value={cond.minPercent ?? ""}
                        onChange={(e) => updatePercent(cond.id, e.target.value)}
                        placeholder="ops."
                        className={uiInput}
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeCondition(cond.id)}
                    aria-label="Koşulu kaldır"
                    className="btn-danger h-10 shrink-0 !px-3"
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={addCondition}
              className="btn-soft !px-3 !py-1.5 !text-xs"
            >
              + Koşul Ekle
            </button>

            <button
              type="button"
              onClick={() => setSearched(true)}
              disabled={loading || activeConditions.length === 0}
              className="btn-primary"
            >
              {loading ? "Yükleniyor..." : "Taşları Tara"}
            </button>
          </div>

          {anyThreshold && (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
              Not: Oran (yüzde) girilmemiş taşlarda eşik uygulanmaz; bu taşlar
              mineral varlığına göre eşleşir ve listeden çıkarılmaz.
            </p>
          )}
        </section>

        {/* ── Sonuçlar + Kombinasyon Sepeti ───────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem] lg:items-start">
          <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">
            {error && (
              <div className="rounded-xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                {error}
              </div>
            )}

            {!error && (
          <section>
            {!showResults ? (
              <div className="rounded-[18px] border-[3px] border-dashed border-emerald-300/50 bg-white/70 p-6 text-center">
                <div className="text-base font-black text-slate-800">
                  Koşul ekleyip "Taşları Tara"ya basın
                </div>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Seçtiğiniz tüm koşulları (mineral, çakra, astroloji, organ, isim)
                  sağlayan taşlar burada listelenir.
                </p>
              </div>
            ) : results.length === 0 ? (
              <div className="rounded-[18px] border-[3px] border-dashed border-slate-300 bg-white/70 p-6 text-center">
                <div className="text-base font-black text-slate-800">Eşleşme yok</div>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Seçilen koşulların tümünü sağlayan taş bulunamadı. Koşulları
                  azaltmayı veya eşiği kaldırmayı deneyin.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {results.map(({ stone, evaluation, inStock }) => {
                  const cover = getFirstStoneImageUrl(stone.images);
                  // Eşleşen koşulları tür bilgisiyle birlikte etiketle (mineral dışı türler de).
                  const matchChips = evaluation.perCondition
                    .filter((p) => p.matchedNames.length > 0)
                    .flatMap((p) =>
                      p.matchedNames.slice(0, 2).map((name) => ({ type: p.type, name })),
                    )
                    .slice(0, 5);

                  return (
                    <div
                      key={stone.id}
                      className={`overflow-hidden rounded-[18px] border-[3px] p-4 shadow-sm transition-all duration-300 ${
                        inStock
                          ? "border-emerald-400/70 bg-emerald-50/60 shadow-[0_0_24px_rgba(16,185,129,0.18)]"
                          : "border-slate-200 bg-white/70 opacity-80 hover:opacity-100"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setDetail({ stone, inStock })}
                        className="group block w-full text-left transition hover:-translate-y-0.5"
                      >
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex h-12 w-12 shrink-0 overflow-hidden rounded-2xl ring-1 ${
                            inStock ? "bg-emerald-100 ring-emerald-200" : "bg-slate-100 ring-slate-200"
                          }`}
                        >
                          {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={cover}
                              alt={stone.stone_name}
                              className={`h-full w-full object-cover ${inStock ? "" : "grayscale"}`}
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-lg">
                              💎
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="truncate text-sm font-black text-slate-950">
                              {stone.stone_name || "İsimsiz taş"}
                            </h3>
                            {inStock ? (
                              <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
                                Stokta
                              </span>
                            ) : (
                              <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500">
                                Stok yok
                              </span>
                            )}
                          </div>

                          {stone.short_description && (
                            <p className="mt-0.5 line-clamp-1 text-xs font-medium text-slate-500">
                              {stone.short_description}
                            </p>
                          )}

                          <div className="mt-2 flex flex-wrap gap-1">
                            {matchChips.map((m, i) => (
                              <span
                                key={`${stone.id}-m-${i}`}
                                className={`max-w-full truncate rounded-md px-1.5 py-0.5 text-[10px] font-bold ${CHIP_TONE[m.type]}`}
                                title={`${SEARCH_TYPE_META[m.type].label}: ${m.name}`}
                              >
                                {SEARCH_TYPE_META[m.type].icon} {m.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      </button>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setDetail({ stone, inStock })}
                          className="btn-soft w-full !px-3 !py-1.5 !text-xs"
                        >
                          🔍 Detay
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            cartIds.has(stone.id)
                              ? removeFromCart(stone.id)
                              : addToCart({
                                  id: stone.id,
                                  name: stone.stone_name || "İsimsiz taş",
                                  inStock,
                                })
                          }
                          className={`w-full !px-3 !py-1.5 !text-xs ${
                            cartIds.has(stone.id) ? "btn-danger" : "btn-primary"
                          }`}
                        >
                          {cartIds.has(stone.id) ? "Çıkar" : "+ Ekle"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
            )}
          </div>

          {/* ── Kombinasyon Sepeti ──────────────────────────────────────── */}
          <aside className="lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:self-start lg:sticky lg:top-4">
            <div className="rounded-[20px] border-[3px] border-violet-300/50 bg-white/90 p-3 shadow-md sm:p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-black text-slate-900">🧺 Kombinasyon Sepeti</h2>
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-black text-violet-700">
                  {cart.length}
                </span>
              </div>

              {cart.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs font-semibold text-slate-500">
                  Sepet boş. Sonuç listesinden "Kombinasyona Ekle" ile taş ekleyin.
                </p>
              ) : (
                <>
                  <ul className="space-y-1.5">
                    {cart.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm"
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              item.inStock ? "bg-emerald-500" : "bg-slate-300"
                            }`}
                            title={item.inStock ? "Stokta" : "Stok yok"}
                          />
                          <span className="truncate text-xs font-bold text-slate-800">
                            {item.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id)}
                          aria-label={`${item.name} sepetten çıkar`}
                          className="btn-danger shrink-0 !rounded-lg !px-2 !py-0.5 !text-[11px]"
                        >
                          Çıkar
                        </button>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-500">
                      {cart.filter((c) => c.inStock).length} stokta
                    </span>
                    <button
                      type="button"
                      onClick={clearCart}
                      className="btn-soft !rounded-lg !px-2 !py-0.5 !text-[11px]"
                    >
                      Temizle
                    </button>
                  </div>

                  {/* ── Karşılanan / Eksik Koşullar ───────────────────── */}
                  {activeConditions.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                      <div>
                        <div className="mb-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
                          Karşılanan Koşullar
                        </div>
                        {cartAnalysis.metMinerals.length === 0 ? (
                          <p className="text-[11px] font-semibold text-slate-400">Henüz yok.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {cartAnalysis.metMinerals.map((m) => (
                              <span
                                key={m.id}
                                className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700"
                              >
                                ✓ {m.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="mb-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
                          Eksik Koşullar
                        </div>
                        {cartAnalysis.missingMinerals.length === 0 ? (
                          <p className="text-[11px] font-semibold text-emerald-600">
                            Tümü karşılandı.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {cartAnalysis.missingMinerals.map((m) => (
                              <span
                                key={m.id}
                                className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700"
                              >
                                ✕ {m.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Taş Bazlı Uyarılar ─────────────────────────────── */}
                  <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                    <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                      Taş Uyarıları
                    </div>
                    {cartAnalysis.warnings.map((w) => (
                      <div
                        key={w.id}
                        className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5"
                      >
                        <div className="text-[11px] font-black text-slate-800">{w.name}</div>
                        {w.has ? (
                          <div className="mt-0.5">
                            {w.text && (
                              <p className="text-[11px] font-medium leading-snug text-amber-700">
                                ⚠️ {w.text}
                              </p>
                            )}
                            {w.tags.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {w.tags.map((t, i) => (
                                  <span
                                    key={`${w.id}-t-${i}`}
                                    className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                            Belirgin uyarı yok
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* ── Sepet Durumu Özeti ─────────────────────────────── */}
                  <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                    {activeConditions.length > 0 &&
                      (cartAnalysis.missingMinerals.length === 0 ? (
                        <p className="rounded-lg bg-emerald-50 px-2 py-1.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                          ✓ Kombinasyon tüm koşulları karşılıyor.
                        </p>
                      ) : (
                        <p className="rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">
                          Eksik koşullar var, taş ekleyin veya değiştirin.
                        </p>
                      ))}
                    {cartAnalysis.hasAnyWarning && (
                      <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200">
                        ⚠️ Uyarı bulunan taşlar var, danışan durumuna göre kontrol edin.
                      </p>
                    )}
                  </div>

                </>
              )}

            </div>
          </aside>

          {/* ── Kombinasyonu Kaydet (sonuç listesinin hemen altında) ──── */}
          <section className={`${uiFilterCard} lg:col-start-1 lg:row-start-2`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-black text-slate-900">💾 Kombinasyonu Kaydet</h2>
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-black text-violet-700">
              {cart.length} taş
            </span>
          </div>

          {savedInfo ? (
            <div className="space-y-2">
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
                ✓ &quot;{savedInfo.name}&quot; kaydedildi.{" "}
                <Link href="/dogaltas/kombinasyonlar" className="underline">
                  Listede gör
                </Link>
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    clearCart();
                    resetSaveForm();
                  }}
                  className="btn-soft sm:flex-1"
                >
                  Sepeti Temizle
                </button>
                <button
                  type="button"
                  onClick={() => setSavedInfo(null)}
                  className="btn-primary sm:flex-1"
                >
                  Devam Et
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Kombinasyon adı (zorunlu)"
                  maxLength={200}
                  className={DOGALTAS_INPUT_CLASS}
                />
                <input
                  type="text"
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  placeholder="Açıklama / amaç (opsiyonel)"
                  maxLength={200}
                  className={DOGALTAS_INPUT_CLASS}
                />
              </div>
              <textarea
                value={saveNote}
                onChange={(e) => setSaveNote(e.target.value)}
                placeholder="Serbest not (opsiyonel)"
                rows={2}
                className={`${DOGALTAS_TEXTAREA_CLASS} !resize-y`}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                {cart.length === 0 ? (
                  <p className="text-[11px] font-semibold text-slate-400">
                    Kaydetmek için sepete en az bir taş ekleyin.
                  </p>
                ) : (
                  <span className="text-[11px] font-semibold text-slate-500">
                    {cart.length} taş kaydedilecek
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSaveClick}
                  disabled={cart.length === 0 || saveName.trim() === "" || saving || savingClient}
                  className="btn-primary sm:w-auto"
                >
                  {saving || savingClient
                    ? "Kaydediliyor..."
                    : preselectedClient
                      ? `💾 ${clientFullName(preselectedClient)} danışanına Kaydet`
                      : "💾 Kombinasyonu Kaydet"}
                </button>
              </div>
            </div>
          )}
          </section>
        </div>
      </div>

      {/* Taş Detay Drawer — navigasyon yok; kapanınca tüm sayfa state'i korunur */}
      <StoneDetailDrawer
        open={detail !== null}
        stone={detail?.stone ?? null}
        inStock={detail?.inStock ?? false}
        inCart={detail ? cartIds.has(detail.stone.id) : false}
        onToggleCart={() => {
          if (!detail) return;
          if (cartIds.has(detail.stone.id)) {
            removeFromCart(detail.stone.id);
          } else {
            addToCart({
              id: detail.stone.id,
              name: detail.stone.stone_name || "İsimsiz taş",
              inStock: detail.inStock,
            });
          }
        }}
        onClose={() => setDetail(null)}
      />

      {/* Kaydetme hedef seçim modalı (Genel / Danışana Özel) */}
      <SaveCombinationModal
        open={saveModalOpen}
        cartCount={cart.length}
        combinationName={saveName}
        saving={saving}
        savingClient={savingClient}
        onClose={() => setSaveModalOpen(false)}
        onSaveGeneral={handleSaveGeneral}
        onSaveToClient={(client) => void saveCombinationToClient(client)}
      />

      <DuplicateWarningModal
        open={!!dupModal}
        label={dupModal?.label ?? ""}
        busy={saving}
        onOpenExisting={() => {
          if (dupModal) router.push(`/dogaltas/kombinasyonlar/${encodeURIComponent(dupModal.label)}`);
        }}
        onCreateAnyway={() => {
          setDupModal(null);
          void saveCombination(true);
        }}
        onCancel={() => setDupModal(null)}
      />
    </DogaltasSectionShell>
  );
}
