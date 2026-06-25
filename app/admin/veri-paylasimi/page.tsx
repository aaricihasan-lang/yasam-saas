"use client";

import Link from "next/link";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Loader2,
  Package,
  RefreshCw,
  Shield,
} from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { resolveSourceAdminTenantId } from "@/lib/admin/adminSourceTenant";
import {
  type FilterMap,
  formatTransferResultLines,
  runLibraryTransfer,
  type TransferGroupKey,
  type TransferResultCounts,
} from "@/lib/admin/veriPaylasimiTransfer";
import {
  clearYasamUser,
  isAdminUser,
  readYasamUser,
  readSessionToken,
  syncYasamUserFromDb,
} from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";

type ExpertOption = {
  id: string;
  fullName: string;
  email: string;
  tenantId: string | null;
};

type SubGroupDef = {
  key: string;
  label: string;
  active: boolean;
  /** Gerçek Supabase tablo anahtarları — uydurma tablo adı yok */
  transferKeys?: TransferGroupKey[];
  pendingNote?: string;
};

type ModuleDef = {
  key: string;
  label: string;
  subGroups: SubGroupDef[];
};

const GRANULAR_KEYS = ["stones", "minerals", "combinations"] as const;
type GranularKey = (typeof GRANULAR_KEYS)[number];
type SelectionMode = "all" | "selected";
type RecordItem = { id: string; label: string };

const MODULES: ModuleDef[] = [
  {
    key: "dogaltas",
    label: "Doğaltaş",
    subGroups: [
      {
        key: "stones",
        label: "Doğaltaş Listesi",
        active: true,
        transferKeys: ["stones"],
      },
      {
        key: "combinations",
        label: "Kombinasyonlar",
        active: true,
        transferKeys: ["combinations"],
      },
      {
        key: "minerals",
        label: "Mineral Bankası",
        active: true,
        transferKeys: ["minerals"],
      },
      {
        key: "stone_info",
        label: "Taş Bilgi Kütüphanesi",
        active: false,
        pendingNote: "Henüz tenant tablosu tanımlı değil",
      },
    ],
  },
  {
    key: "bioenergy",
    label: "Biyoenerji",
    subGroups: [
      {
        key: "bio_symbols",
        label: "Sembol Dili",
        active: true,
        transferKeys: ["bioenergy_symbols"],
      },
      {
        key: "bio_imag",
        label: "İmajinasyonlar",
        active: true,
        transferKeys: ["bioenergy_imaginations"],
      },
      {
        key: "bio_chakras",
        label: "Çakralar",
        active: true,
        transferKeys: ["bioenergy_chakras"],
      },
      {
        key: "bio_bodies",
        label: "Enerji Bedenleri",
        active: true,
        transferKeys: ["bioenergy_energy_bodies"],
      },
      {
        key: "bio_sub",
        label: "Bilinçaltı Sebepleri",
        active: true,
        transferKeys: ["bioenergy_subconscious_causes"],
      },
    ],
  },
  {
    key: "reflexology",
    label: "Refleksoloji",
    subGroups: [
      {
        key: "ref_proto",
        label: "Protokoller",
        active: true,
        transferKeys: ["reflexology_protocols"],
      },
      {
        key: "ref_atlas",
        label: "Atlas",
        active: false,
        pendingNote: "Atlas verisi şu an tarayıcıda (localStorage)",
      },
      {
        key: "ref_notes",
        label: "Notlar",
        active: false,
        pendingNote: "Klinik notlar şu an tarayıcıda (localStorage)",
      },
    ],
  },
  {
    key: "numerology",
    label: "Numeroloji",
    subGroups: [
      {
        key: "num_bank",
        label: "Bilgi Bankası",
        active: true,
        transferKeys: [
          "numerology_knowledge_records",
          "numerology_stone_assignments",
        ],
      },
    ],
  },
  {
    key: "aromatherapy",
    label: "Aromaterapi",
    subGroups: [
      {
        key: "aro_vol",
        label: "Uçucu Yağlar",
        active: false,
        pendingNote: "Projede Supabase tablosu henüz bağlı değil",
      },
      {
        key: "aro_fix",
        label: "Sabit Yağlar",
        active: false,
        pendingNote: "Projede Supabase tablosu henüz bağlı değil",
      },
    ],
  },
];

function collectActiveTransferGroups(
  checked: Record<string, boolean>,
): TransferGroupKey[] {
  const keys: TransferGroupKey[] = [];
  for (const mod of MODULES) {
    for (const sub of mod.subGroups) {
      if (!sub.active || !sub.transferKeys?.length) continue;
      if (!checked[sub.key]) continue;
      keys.push(...sub.transferKeys);
    }
  }
  return keys;
}

const panelClass =
  "rounded-[28px] border-2 border-white/80 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-6";

const navBtn =
  "inline-flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-5 text-sm font-black shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:min-h-[56px] sm:w-auto sm:px-7 sm:text-base";

function FlowStepBar({
  step1Done,
  step2Done,
}: {
  step1Done: boolean;
  step2Done: boolean;
}) {
  const steps = [
    { n: 1, label: "Üye seç", done: step1Done },
    { n: 2, label: "Veri seç", done: step2Done },
    { n: 3, label: "Aktar", done: false },
  ];

  return (
    <nav
      aria-label="Aktarım adımları"
      className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-violet-200/80 bg-white/80 px-4 py-3 shadow-sm"
    >
      {steps.map((step, index) => (
        <Fragment key={step.n}>
          {index > 0 ? (
            <span className="text-slate-300" aria-hidden>
              →
            </span>
          ) : null}
          <span
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-black ${
              step.done
                ? "bg-violet-100 text-violet-900"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                step.done ? "bg-violet-600 text-white" : "bg-slate-300 text-slate-700"
              }`}
            >
              {step.done ? <Check className="h-3.5 w-3.5" /> : step.n}
            </span>
            {step.label}
          </span>
        </Fragment>
      ))}
    </nav>
  );
}

/** Admin API çağrıları için header — x-admin-id + (varsa) x-session-token (TB-2) */
function adminHeaders(adminId: string | undefined, json = false): Record<string, string> {
  const token = readSessionToken();
  const h: Record<string, string> = { "x-admin-id": adminId ?? "" };
  if (token) h["x-session-token"] = token;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export default function VeriPaylasimiPage() {
  useBfcacheRefresh();
  const router = useRouter();
  const { confirm } = useConfirm();
  const { showToast } = useToast();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);

  const [experts, setExperts] = useState<ExpertOption[]>([]);
  const [expertsLoading, setExpertsLoading] = useState(false);
  const [selectedExpertId, setSelectedExpertId] = useState<string | null>(null);

  const [subChecked, setSubChecked] = useState<Record<string, boolean>>({});
  const [transferring, setTransferring] = useState(false);
  const [sourceAdminTenantId, setSourceAdminTenantId] = useState<string | null>(null);
  const [sourceTenantError, setSourceTenantError] = useState<string | null>(null);
  const [transferResult, setTransferResult] = useState<{
    type: "success" | "error";
    message: string;
    lines?: string[];
  } | null>(null);

  const [selectionMode, setSelectionMode] = useState<Record<GranularKey, SelectionMode>>({
    stones: "all", minerals: "all", combinations: "all",
  });
  const [groupRecords, setGroupRecords] = useState<Record<GranularKey, RecordItem[]>>({
    stones: [], minerals: [], combinations: [],
  });
  const [groupRecordsLoading, setGroupRecordsLoading] = useState<Record<GranularKey, boolean>>({
    stones: false, minerals: false, combinations: false,
  });
  const [selectedIds, setSelectedIds] = useState<Record<GranularKey, Set<string>>>({
    stones: new Set(), minerals: new Set(), combinations: new Set(),
  });
  const [groupRecordErrors, setGroupRecordErrors] = useState<Record<GranularKey, string | null>>({
    stones: null, minerals: null, combinations: null,
  });

  const selectedExpert = useMemo(
    () => experts.find((e) => e.id === selectedExpertId) ?? null,
    [experts, selectedExpertId],
  );

  const activeTransferGroups = useMemo(
    () => collectActiveTransferGroups(subChecked),
    [subChecked],
  );

  const filterMap = useMemo<FilterMap>(() => {
    const map: FilterMap = {};
    for (const key of GRANULAR_KEYS) {
      if (!subChecked[key]) continue;
      if (selectionMode[key] === "selected") {
        map[key] = [...selectedIds[key]];
      }
    }
    return map;
  }, [subChecked, selectionMode, selectedIds]);

  const granularGroupsValid = GRANULAR_KEYS.every((key) => {
    if (!subChecked[key]) return true;
    if (selectionMode[key] === "all") return true;
    return selectedIds[key].size > 0;
  });

  const canTransfer =
    !!selectedExpert?.tenantId &&
    activeTransferGroups.length > 0 &&
    granularGroupsValid &&
    !transferring;

  useEffect(() => {
    let cancelled = false;

    async function verifyAccess() {
      const session = readYasamUser();
      if (!session || !isAdminUser(session)) {
        if (!cancelled) {
          setAllowed(false);
          setSessionChecked(true);
        }
        return;
      }

      const effective = (await syncYasamUserFromDb(session)) ?? session;

      if (!cancelled) {
        const isAllowed = isAdminUser(effective);
        setAllowed(isAllowed);
        if (isAllowed) {
          const resolved = await resolveSourceAdminTenantId();
          if (!cancelled) {
            setSourceAdminTenantId(resolved.tenantId);
            setSourceTenantError(resolved.error ?? null);
          }
        } else {
          setSourceAdminTenantId(null);
          setSourceTenantError(null);
        }
        setSessionChecked(true);
      }
    }

    void verifyAccess();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadExperts = useCallback(async () => {
    setExpertsLoading(true);
    const adminId = readYasamUser()?.id;
    const res = await fetch("/api/admin/users", {
      headers: adminHeaders(adminId),
    });

    setExpertsLoading(false);

    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      console.error("Uzman listesi hatası:", j.error);
      showToast({
        title: "İşlem başarısız",
        message: j.error ?? `HTTP ${res.status}`,
        type: "error",
      });
      setExperts([]);
      return;
    }

    const json = (await res.json().catch(() => ({}))) as { users?: Record<string, unknown>[] };
    const data = (json.users ?? [])
      .filter((u) => (u as { role?: string }).role === "expert")
      .sort((a, b) =>
        String((a as { full_name?: string }).full_name ?? "")
          .localeCompare(String((b as { full_name?: string }).full_name ?? ""), "tr-TR"),
      );

    const mapped: ExpertOption[] = data.map((row) => {
      const r = row as Record<string, unknown>;
      const fullName = String(r.full_name ?? r.name ?? "").trim();
      const email = String(r.email ?? "").trim();
      return {
        id: String(r.id ?? ""),
        fullName: fullName || email || "İsimsiz uzman",
        email,
        tenantId:
          r.tenant_id != null ? String(r.tenant_id).trim() || null : null,
      };
    });

    setExperts(mapped.filter((e) => e.id));
  }, [showToast]);

  useEffect(() => {
    if (!sessionChecked || !allowed) return;
    void loadExperts();
  }, [sessionChecked, allowed, loadExperts]);

  const loadGroupRecords = useCallback(
    async (key: GranularKey) => {
      if (!sourceAdminTenantId) {
        setGroupRecordErrors((p) => ({
          ...p,
          [key]: "Admin kaynak tenant bulunamadı. Veri listesi yüklenemiyor.",
        }));
        return;
      }

      setGroupRecordsLoading((p) => ({ ...p, [key]: true }));
      setGroupRecordErrors((p) => ({ ...p, [key]: null }));

      let items: RecordItem[] = [];
      let fetchError: string | null = null;

      if (key === "stones") {
        const { data, error } = await supabase
          .from("stones")
          .select("id, stone_name")
          .eq("tenant_id", sourceAdminTenantId)
          .order("stone_name", { ascending: true });
        if (error) {
          console.error("[veri-paylasimi] stones kayıt yükleme hatası:", error.message);
          fetchError = error.message;
        } else {
          items = (data ?? []).map((r) => {
            const row = r as Record<string, unknown>;
            return { id: String(row.id), label: String(row.stone_name ?? row.id) };
          });
        }
      } else if (key === "minerals") {
        const { data, error } = await supabase
          .from("minerals")
          .select("id, name")
          .eq("tenant_id", sourceAdminTenantId)
          .order("name", { ascending: true });
        if (error) {
          console.error("[veri-paylasimi] minerals kayıt yükleme hatası:", error.message);
          fetchError = error.message;
        } else {
          items = (data ?? []).map((r) => {
            const row = r as Record<string, unknown>;
            return { id: String(row.id), label: String(row.name ?? row.id) };
          });
        }
      } else {
        const adminId = readYasamUser()?.id;
        const res = await fetch(
          `/api/admin/dogaltas/combinations?tenantId=${encodeURIComponent(sourceAdminTenantId)}`,
          { headers: adminHeaders(adminId), cache: "no-store" },
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          rows?: { id: string; issue: string; variant_index: number }[];
          error?: string;
        };
        if (!res.ok || !json.ok) {
          fetchError = json.error ?? `HTTP ${res.status}`;
          console.error("[veri-paylasimi] combinations kayıt yükleme hatası:", fetchError);
        } else {
          items = (json.rows ?? []).map((row) => {
            const issue = String(row.issue ?? "");
            const vi = Number(row.variant_index ?? 0);
            return {
              id: String(row.id),
              label: vi > 0 ? `${issue} (Varyant ${vi + 1})` : issue,
            };
          });
        }
      }

      if (fetchError) {
        setGroupRecordErrors((p) => ({ ...p, [key]: fetchError }));
      }
      setGroupRecords((p) => ({ ...p, [key]: items }));
      setGroupRecordsLoading((p) => ({ ...p, [key]: false }));
    },
    [sourceAdminTenantId],
  );

  function toggleSubGroup(sub: SubGroupDef) {
    if (!sub.active) return;
    const willBeUnchecked = !!subChecked[sub.key];
    setSubChecked((prev) => ({ ...prev, [sub.key]: !prev[sub.key] }));
    if (willBeUnchecked && (GRANULAR_KEYS as readonly string[]).includes(sub.key)) {
      const gKey = sub.key as GranularKey;
      setSelectionMode((p) => ({ ...p, [gKey]: "all" }));
      setSelectedIds((p) => ({ ...p, [gKey]: new Set() }));
    }
  }

  function handleModeChange(key: GranularKey, mode: SelectionMode) {
    setSelectionMode((p) => ({ ...p, [key]: mode }));
    if (mode === "selected" && groupRecords[key].length === 0) {
      void loadGroupRecords(key);
    }
  }

  function toggleId(key: GranularKey, id: string) {
    setSelectedIds((p) => {
      const next = new Set(p[key]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...p, [key]: next };
    });
  }

  function selectAll(key: GranularKey) {
    setSelectedIds((p) => ({
      ...p,
      [key]: new Set(groupRecords[key].map((r) => r.id)),
    }));
  }

  function clearSelection(key: GranularKey) {
    setSelectedIds((p) => ({ ...p, [key]: new Set() }));
  }

  function handleLogout() {
    clearYasamUser();
    router.push("/");
  }

  async function handleTransfer() {
    console.log("[veri-paylasimi/ui] Aktar butonuna tıklandı", {
      hedefTenant: selectedExpert?.tenantId ?? null,
      gruplar: activeTransferGroups,
      filterMap,
    });

    if (!selectedExpert?.tenantId) {
      showToast({
        title: "İşlem başarısız",
        message: "Seçili üyenin tenant bilgisi bulunamadı.",
        type: "error",
      });
      return;
    }

    if (activeTransferGroups.length === 0) {
      showToast({
        title: "İşlem başarısız",
        message: "Aktarılacak en az bir veri grubu seçin.",
        type: "warning",
      });
      return;
    }

    const expertName = selectedExpert.fullName;
    const ok = await confirm({
      title: "Veriler Aktarılsın mı?",
      message: `Seçili veriler ${expertName} kullanıcısına eklenecek.\n\nMevcut veriler silinmez.\nYeni kayıtlar ayrı eklenir.`,
      confirmText: "Aktar",
      cancelText: "İptal",
      tone: "info",
    });

    if (!ok) {
      console.log("[veri-paylasimi/ui] Aktarım iptal edildi");
      return;
    }

    setTransferring(true);
    setTransferResult(null);
    console.log("[veri-paylasimi/ui] Aktarım başlıyor", {
      hedefTenant: selectedExpert.tenantId,
      hedefEmail: selectedExpert.email,
      gruplar: activeTransferGroups,
      filterMap,
    });

    const { counts, error, successMessage } = await runLibraryTransfer(
      activeTransferGroups,
      selectedExpert.tenantId,
      selectedExpert.email ?? undefined,
      filterMap,
    );
    setTransferring(false);
    console.log("[veri-paylasimi/ui] Aktarım sonucu", { counts, error, successMessage });

    if (error) {
      console.error("[veri-paylasimi/ui] Aktarım hatası:", error);
      setTransferResult({ type: "error", message: error });
      showToast({
        title: "Aktarım tamamlanamadı",
        message: error,
        type: "error",
      });
      return;
    }

    const summaryLines = formatTransferResultLines(
      counts,
      selectedExpert.email,
    );

    setTransferResult({
      type: "success",
      message:
        successMessage ??
        (summaryLines.length > 0
          ? summaryLines.join("\n")
          : `Kayıtlar ${expertName} hesabına eklendi`),
      lines: summaryLines.length > 0 ? summaryLines : undefined,
    });

    showToast({
      title: "Veriler başarıyla aktarıldı",
      message:
        successMessage ??
        (summaryLines.length > 0
          ? summaryLines.join("\n")
          : `Kayıtlar ${expertName} hesabına eklendi`),
      type: "success",
    });
  }

  if (!sessionChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_50%,#f0fdfa_100%)]">
        <Loader2 className="h-10 w-10 animate-spin text-violet-600" aria-hidden />
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="relative min-h-screen bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_50%,#fff1f2_100%)] px-6 py-12">
        <div className="mx-auto max-w-lg rounded-[28px] border border-rose-200 bg-white/90 p-10 text-center shadow-xl">
          <Shield className="mx-auto h-10 w-10 text-rose-600" />
          <h1 className="mt-4 text-2xl font-black">Erişim reddedildi</h1>
          <p className="mt-2 text-slate-600">
            Bu sayfa yalnızca admin kullanıcılar içindir.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block font-black text-violet-700 no-underline"
          >
            Ana panele dön
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-32 top-0 h-[520px] w-[520px] rounded-full bg-violet-300/25 blur-[140px]" />
      <div className="pointer-events-none absolute -right-24 top-24 h-[480px] w-[480px] rounded-full bg-indigo-200/20 blur-[130px]" />

      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
        <nav
          className="sticky top-0 z-50 mb-8 rounded-[28px] border-2 border-white/80 bg-gradient-to-r from-rose-100/90 via-violet-100/85 to-sky-100/90 p-3 shadow-[0_16px_48px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-4"
          aria-label="Üst navigasyon"
        >
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center">
            <p className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-indigo-200/60 bg-white/60 px-4 py-2 text-center text-base font-black text-indigo-950">
              <Package className="h-5 w-5 text-violet-600" aria-hidden />
              Veri Paylaşımı
            </p>
            <button
              type="button"
              onClick={handleLogout}
              className={`${navBtn} border-rose-300/80 bg-gradient-to-r from-rose-50 to-orange-50 text-rose-950 lg:justify-self-end`}
            >
              Çıkış Yap
            </button>
          </div>
        </nav>

        <header className="relative mb-8 overflow-hidden rounded-[32px] border border-white/50 bg-gradient-to-r from-indigo-900 via-violet-900 to-blue-800 px-8 py-10 text-white shadow-[0_28px_80px_rgba(79,70,229,0.22)] sm:px-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_90%_10%,rgba(196,181,253,0.2),transparent_55%)]" />
          <div className="relative flex flex-wrap items-start gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400 to-indigo-500 text-3xl shadow-lg ring-1 ring-white/25">
              <RefreshCw className="h-8 w-8 text-white" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-200/90">
                Admin · Kütüphane
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                Veri Paylaşımı / Kütüphane Aktarım Merkezi
              </h1>
              <p className="mt-3 max-w-2xl text-base font-medium text-white/85">
                Admin kütüphane verilerini seçili üyeye yeni kayıt olarak ekler.
                Üye verisi silinmez veya güncellenmez.
              </p>
              <p className="mt-3 rounded-xl border border-amber-300/40 bg-amber-500/15 px-3 py-2 font-mono text-xs text-amber-100">
                <span className="not-italic font-bold">Admin kaynak tenant:</span>{" "}
                {sourceAdminTenantId ?? "—"}
                {!sourceAdminTenantId
                  ? " · Tenant bulunamadı — seçili kayıt listeleri yüklenmeyecek"
                  : ""}
                {sourceTenantError ? ` · ${sourceTenantError}` : ""}
              </p>
            </div>
          </div>
        </header>

        <FlowStepBar
          step1Done={!!selectedExpertId}
          step2Done={activeTransferGroups.length > 0}
        />

        <section className={panelClass}>
          <h2 className="text-lg font-black text-slate-900">1. Üye Seç</h2>
          <p className="mt-1 text-sm text-slate-600">
            Aktarım hedefi: <span className="font-bold">role=expert</span> kullanıcılar
          </p>

          {expertsLoading ? (
            <div className="mt-6 flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
            </div>
          ) : experts.length === 0 ? (
            <p className="mt-6 text-sm font-semibold text-slate-500">
              Kayıtlı uzman bulunamadı.
            </p>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {experts.map((expert) => {
                const selected = selectedExpertId === expert.id;
                const missingTenant = !expert.tenantId;
                return (
                  <button
                    key={expert.id}
                    type="button"
                    onClick={() => setSelectedExpertId(expert.id)}
                    className={`rounded-2xl border-2 p-4 text-left transition-all duration-200 ${
                      selected
                        ? "border-violet-400 bg-gradient-to-br from-violet-50 to-indigo-50 shadow-md ring-2 ring-violet-200"
                        : "border-slate-200/80 bg-white hover:border-violet-200 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-base font-black text-slate-900">
                        {expert.fullName}
                      </p>
                      {selected ? (
                        <Check
                          className="h-5 w-5 shrink-0 text-violet-600"
                          aria-hidden
                        />
                      ) : null}
                    </div>
                    {expert.email ? (
                      <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                        {expert.email}
                      </p>
                    ) : null}
                    {missingTenant ? (
                      <p className="mt-2 text-xs font-bold text-amber-700">
                        tenant_id eksik — aktarım yapılamaz
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className={`${panelClass} mt-6`}>
          <h2 className="text-lg font-black text-slate-900">2. Aktarılacak Veriyi Seç</h2>
          <p className="mt-1 text-sm text-slate-600">
            Kaynak: admin kütüphane tenant — hedef: seçili üye tenant (yalnızca INSERT)
          </p>

          <div className="mt-5 space-y-4">
            {MODULES.map((mod) => (
              <div
                key={mod.key}
                className="rounded-2xl border-2 border-slate-100 bg-slate-50/50 p-4"
              >
                <p className="text-sm font-black text-slate-900">{mod.label}</p>
                <div className="mt-3 space-y-2">
                  {mod.subGroups.map((sub) => {
                    const disabled = !sub.active;
                    const isGranular =
                      !disabled &&
                      (GRANULAR_KEYS as readonly string[]).includes(sub.key);
                    const gKey = sub.key as GranularKey;
                    const isChecked = !!subChecked[sub.key];
                    const mode = isGranular ? selectionMode[gKey] : "all";
                    return (
                      <div key={sub.key}>
                        <label
                          className={`flex flex-wrap items-center gap-3 rounded-xl px-2 py-2 ${
                            disabled
                              ? "cursor-not-allowed opacity-65"
                              : "cursor-pointer hover:bg-white/80"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={disabled}
                            onChange={() => toggleSubGroup(sub)}
                            className="h-5 w-5 rounded border-violet-300 text-violet-600 focus:ring-violet-400 disabled:opacity-40"
                          />
                          <span className="text-sm font-semibold text-slate-800">
                            {sub.label}
                          </span>
                          {disabled ? (
                            <span
                              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500"
                              title={sub.pendingNote}
                            >
                              Yakında
                            </span>
                          ) : null}
                          {sub.pendingNote && disabled ? (
                            <span className="w-full pl-8 text-xs font-medium text-slate-500">
                              {sub.pendingNote}
                            </span>
                          ) : null}
                        </label>

                        {isGranular && isChecked ? (
                          <div className="ml-8 mt-1.5 rounded-xl border border-violet-100 bg-violet-50/50 p-3">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => handleModeChange(gKey, "all")}
                                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                                  mode === "all"
                                    ? "bg-violet-600 text-white shadow-sm"
                                    : "border border-slate-200 bg-white text-slate-600 hover:border-violet-300"
                                }`}
                              >
                                Tümünü aktar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleModeChange(gKey, "selected")}
                                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                                  mode === "selected"
                                    ? "bg-violet-600 text-white shadow-sm"
                                    : "border border-slate-200 bg-white text-slate-600 hover:border-violet-300"
                                }`}
                              >
                                Seçili kayıtları aktar
                              </button>
                            </div>

                            {mode === "selected" ? (
                              <div className="mt-3">
                                {groupRecordsLoading[gKey] ? (
                                  <div className="flex justify-center py-4">
                                    <Loader2
                                      className="h-5 w-5 animate-spin text-violet-600"
                                      aria-hidden
                                    />
                                  </div>
                                ) : groupRecordErrors[gKey] ? (
                                  <p className="text-xs font-semibold text-rose-600">
                                    Yükleme hatası: {groupRecordErrors[gKey]}
                                  </p>
                                ) : groupRecords[gKey].length === 0 ? (
                                  <p className="text-xs font-semibold text-slate-500">
                                    Bu grup için admin kütüphanesinde kayıt bulunamadı.
                                  </p>
                                ) : (
                                  <>
                                    <div className="mb-2 flex flex-wrap items-center gap-3">
                                      <button
                                        type="button"
                                        onClick={() => selectAll(gKey)}
                                        className="text-xs font-bold text-violet-700 hover:underline"
                                      >
                                        Tümünü seç ({groupRecords[gKey].length})
                                      </button>
                                      <span
                                        className="text-slate-300"
                                        aria-hidden
                                      >
                                        ·
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => clearSelection(gKey)}
                                        className="text-xs font-bold text-slate-500 hover:underline"
                                      >
                                        Seçimi temizle
                                      </button>
                                      {selectedIds[gKey].size > 0 ? (
                                        <span className="ml-auto text-xs font-black text-violet-900">
                                          {selectedIds[gKey].size} kayıt seçili
                                        </span>
                                      ) : null}
                                    </div>
                                    <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-100 bg-white">
                                      {groupRecords[gKey].map((record) => (
                                        <label
                                          key={record.id}
                                          className="flex cursor-pointer items-center gap-2.5 border-b border-slate-50 px-3 py-2 last:border-b-0 hover:bg-violet-50/60"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={selectedIds[gKey].has(
                                              record.id,
                                            )}
                                            onChange={() =>
                                              toggleId(gKey, record.id)
                                            }
                                            className="h-4 w-4 shrink-0 rounded border-violet-300 text-violet-600 focus:ring-violet-400"
                                          />
                                          <span className="text-sm text-slate-700">
                                            {record.label}
                                          </span>
                                        </label>
                                      ))}
                                    </div>
                                    {selectedIds[gKey].size === 0 ? (
                                      <p className="mt-2 text-xs font-bold text-amber-700">
                                        En az 1 kayıt seçin
                                      </p>
                                    ) : null}
                                  </>
                                )}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={`${panelClass} mt-6`}>
          <h2 className="text-lg font-black text-slate-900">3. Aktar</h2>
          {selectedExpert ? (
            <p className="mt-2 text-sm font-semibold text-slate-700">
              Hedef üye:{" "}
              <span className="font-black text-violet-900">{selectedExpert.fullName}</span>
              {activeTransferGroups.length > 0 ? (
                <span className="text-slate-500">
                  {" "}
                  · {activeTransferGroups.length} tablo seçildi
                </span>
              ) : null}
            </p>
          ) : (
            <p className="mt-2 text-sm font-semibold text-amber-800">
              Önce bir üye seçin, ardından aktarılacak veri kutularını işaretleyin.
            </p>
          )}

          <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3 text-sm font-semibold text-violet-950">
            Aktarım modu:{" "}
            <span className="font-black">Yeni kayıt olarak ekle</span> — silme,
            güncelleme veya replace yok. Aynı başlıklı kayıtlar yan yana kalabilir.
          </div>

          <button
            type="button"
            disabled={!canTransfer}
            onClick={() => void handleTransfer()}
            className="mt-6 inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-violet-400/80 bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 px-8 text-base font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {transferring ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                Aktarılıyor…
              </>
            ) : (
              <>
                <RefreshCw className="h-5 w-5" aria-hidden />
                Seçili Verileri Üyeye Aktar
              </>
            )}
          </button>

          {selectedExpert && !selectedExpert.tenantId ? (
            <p className="mt-3 text-center text-sm font-bold text-amber-700">
              Seçili üyede tenant_id tanımlı değil; aktarım başlatılamaz.
            </p>
          ) : null}
          {!granularGroupsValid ? (
            <p className="mt-3 text-center text-sm font-bold text-amber-700">
              Seçili aktarım modundaki gruplardan en az 1 kayıt seçmelisiniz.
            </p>
          ) : null}

          {transferResult ? (
            <div
              className={`mt-5 rounded-2xl border-2 p-4 ${
                transferResult.type === "success"
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-rose-200 bg-rose-50"
              }`}
            >
              <p
                className={`text-sm font-black ${
                  transferResult.type === "success"
                    ? "text-emerald-900"
                    : "text-rose-900"
                }`}
              >
                {transferResult.type === "success"
                  ? "✓ Aktarım tamamlandı"
                  : "✗ Aktarım başarısız"}
              </p>
              {transferResult.lines && transferResult.lines.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {transferResult.lines.map((line, i) => (
                    <li
                      key={i}
                      className="text-xs font-semibold text-emerald-800"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <p
                  className={`mt-1 text-xs font-semibold ${
                    transferResult.type === "success"
                      ? "text-emerald-800"
                      : "text-rose-800"
                  }`}
                >
                  {transferResult.message}
                </p>
              )}
            </div>
          ) : null}
        </section>

      </div>
    </main>
  );
}
