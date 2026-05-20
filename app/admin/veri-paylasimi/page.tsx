"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Home,
  Loader2,
  Package,
  RefreshCw,
  Shield,
} from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import {
  runLibraryTransfer,
  type TransferGroupKey,
  type TransferResultCounts,
} from "@/lib/admin/veriPaylasimiTransfer";
import {
  clearYasamUser,
  isAdminUser,
  readYasamUser,
  refreshYasamUserFromDb,
} from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";

type ExpertOption = {
  id: string;
  fullName: string;
  email: string;
  tenantId: string | null;
};

type SubGroupDef = {
  key: TransferGroupKey | string;
  label: string;
  active: boolean;
  transferKey?: TransferGroupKey;
};

type ModuleDef = {
  key: string;
  label: string;
  subGroups: SubGroupDef[];
};

/** Aktif — modül kutusu açmadan doğrudan seçilir */
const ACTIVE_DATA_GROUPS: SubGroupDef[] = [
  {
    key: "stones",
    label: "Doğaltaş Listesi",
    active: true,
    transferKey: "stones",
  },
  {
    key: "combinations",
    label: "Kombinasyonlar",
    active: true,
    transferKey: "combinations",
  },
  {
    key: "minerals",
    label: "Mineral Bankası",
    active: true,
    transferKey: "minerals",
  },
];

const MODULES: ModuleDef[] = [
  {
    key: "dogaltas",
    label: "Doğaltaş",
    subGroups: [
      ...ACTIVE_DATA_GROUPS,
      {
        key: "stone_info",
        label: "Taş Bilgi Kütüphanesi",
        active: false,
      },
    ],
  },
  {
    key: "bioenergy",
    label: "Biyoenerji",
    subGroups: [
      { key: "bio_symbols", label: "Sembol Dili", active: false },
      { key: "bio_imag", label: "İmajinasyonlar", active: false },
      { key: "bio_chakras", label: "Çakralar", active: false },
      { key: "bio_bodies", label: "Enerji Bedenleri", active: false },
      { key: "bio_sub", label: "Bilinçaltı Sebepleri", active: false },
    ],
  },
  {
    key: "reflexology",
    label: "Refleksoloji",
    subGroups: [
      { key: "ref_proto", label: "Protokoller", active: false },
      { key: "ref_atlas", label: "Atlas", active: false },
      { key: "ref_notes", label: "Notlar", active: false },
    ],
  },
  {
    key: "numerology",
    label: "Numeroloji",
    subGroups: [{ key: "num_bank", label: "Bilgi Bankası", active: false }],
  },
  {
    key: "aromatherapy",
    label: "Aromaterapi",
    subGroups: [
      { key: "aro_vol", label: "Uçucu Yağlar", active: false },
      { key: "aro_fix", label: "Sabit Yağlar", active: false },
    ],
  },
];

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

function formatTransferSummary(counts: TransferResultCounts): string {
  const parts: string[] = [];
  if (counts.stones > 0) parts.push(`${counts.stones} Doğaltaş`);
  if (counts.combinations > 0) parts.push(`${counts.combinations} Kombinasyon`);
  if (counts.minerals > 0) parts.push(`${counts.minerals} Mineral`);
  return parts.join("\n");
}

export default function VeriPaylasimiPage() {
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

  const selectedExpert = useMemo(
    () => experts.find((e) => e.id === selectedExpertId) ?? null,
    [experts, selectedExpertId],
  );

  const activeTransferGroups = useMemo(() => {
    const keys: TransferGroupKey[] = [];
    for (const sub of ACTIVE_DATA_GROUPS) {
      if (sub.transferKey && subChecked[sub.key]) keys.push(sub.transferKey);
    }
    return keys;
  }, [subChecked]);

  const canTransfer =
    !!selectedExpert?.tenantId &&
    activeTransferGroups.length > 0 &&
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

      const fresh = await refreshYasamUserFromDb(session);
      const effective = fresh ?? session;

      if (!cancelled) {
        setAllowed(isAdminUser(effective));
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
    const { data, error } = await supabase
      .from("users")
      .select("id, full_name, name, email, tenant_id, role")
      .eq("role", "expert")
      .order("full_name", { ascending: true });

    setExpertsLoading(false);

    if (error) {
      console.error("Uzman listesi hatası:", error);
      showToast({
        title: "İşlem başarısız",
        message: error.message,
        type: "error",
      });
      setExperts([]);
      return;
    }

    const mapped: ExpertOption[] = (data ?? []).map((row) => {
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

  function toggleSubGroup(sub: SubGroupDef) {
    if (!sub.active) return;
    setSubChecked((prev) => ({ ...prev, [sub.key]: !prev[sub.key] }));
  }

  function handleLogout() {
    clearYasamUser();
    router.push("/");
  }

  async function handleTransfer() {
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

    if (!ok) return;

    setTransferring(true);
    const { counts, error } = await runLibraryTransfer(
      activeTransferGroups,
      selectedExpert.tenantId,
    );
    setTransferring(false);

    if (error) {
      showToast({
        title: "Aktarım tamamlanamadı",
        message: error,
        type: "error",
      });
      return;
    }

    const summary = formatTransferSummary(counts);
    const total = counts.stones + counts.minerals + counts.combinations;

    showToast({
      title: "Veriler başarıyla aktarıldı",
      message:
        summary.length > 0
          ? `${summary}\n\n${expertName} hesabına eklendi`
          : `${total} kayıt ${expertName} hesabına eklendi`,
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
            <Link
              href="/admin"
              className={`${navBtn} border-violet-300/80 bg-gradient-to-r from-violet-50 to-indigo-50 text-violet-950 no-underline lg:justify-self-start`}
            >
              <ArrowLeft className="h-5 w-5 shrink-0" />
              Admin Paneline Dön
            </Link>
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
            Doğaltaş modülü — admin kütüphanesinden üyeye kopyalanacak tablolar
          </p>

          <div className="mt-5 space-y-3 rounded-2xl border-2 border-violet-100 bg-violet-50/40 p-4">
            <p className="text-sm font-black text-violet-950">Doğaltaş (aktif)</p>
            {ACTIVE_DATA_GROUPS.map((sub) => (
              <label
                key={sub.key}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/80 bg-white px-3 py-2.5 shadow-sm transition hover:border-violet-200"
              >
                <input
                  type="checkbox"
                  checked={!!subChecked[sub.key]}
                  onChange={() => toggleSubGroup(sub)}
                  className="h-5 w-5 rounded border-violet-300 text-violet-600 focus:ring-violet-400"
                />
                <span className="text-sm font-bold text-slate-800">{sub.label}</span>
              </label>
            ))}
          </div>

          <details className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4">
            <summary className="cursor-pointer text-sm font-black text-slate-700">
              Diğer modüller (Yakında)
            </summary>
            <div className="mt-3 space-y-3">
              {MODULES.filter((m) => m.key !== "dogaltas").map((mod) => (
                <div key={mod.key}>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                    {mod.label}
                  </p>
                  <ul className="mt-1 space-y-1 pl-2">
                    {mod.subGroups.map((sub) => (
                      <li
                        key={sub.key}
                        className="flex items-center gap-2 text-sm text-slate-600"
                      >
                        <span>{sub.label}</span>
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">
                          Yakında
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="text-xs font-semibold text-slate-500">
                Taş Bilgi Kütüphanesi — Yakında
              </p>
            </div>
          </details>
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
                  · Seçili: {activeTransferGroups.join(", ")}
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
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-5 w-5" aria-hidden />
            )}
            Seçili Verileri Üyeye Aktar
          </button>

          {selectedExpert && !selectedExpert.tenantId ? (
            <p className="mt-3 text-center text-sm font-bold text-amber-700">
              Seçili üyede tenant_id tanımlı değil; aktarım başlatılamaz.
            </p>
          ) : null}
        </section>

        <footer className="mt-8 flex justify-center">
          <Link
            href="/"
            className={`${navBtn} border-emerald-300/80 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-950 no-underline`}
          >
            <Home className="h-5 w-5 shrink-0" />
            Ana Panele Dön
          </Link>
        </footer>
      </div>
    </main>
  );
}
