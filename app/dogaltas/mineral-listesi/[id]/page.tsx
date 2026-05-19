"use client";

import { runInEffect } from "@/lib/runInEffect";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

const MINERALS_SELECT =
  "id,tenant_id,source_id,name,aciklama,organ_etkileri,fiziksel,zihinsel,cakralar,fizyoloji,eksiklik_belirtileri,fazlalik_belirtileri,doz_asimi,iceren_taslar,kategori,created_at";

type MineralRecord = {
  id: string;
  tenant_id: string;
  source_id: string;
  name: string;
  aciklama: string | null;
  organ_etkileri: string[] | null;
  fiziksel: string[] | null;
  zihinsel: string[] | null;
  cakralar: string[] | null;
  fizyoloji: string[] | null;
  eksiklik_belirtileri: string[] | null;
  fazlalik_belirtileri: string[] | null;
  doz_asimi: string[] | null;
  iceren_taslar: string[] | null;
  kategori: string | null;
  created_at: string;
};

function ensureStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeMineral(row: MineralRecord): MineralRecord {
  return {
    ...row,
    organ_etkileri: ensureStringArray(row.organ_etkileri),
    fiziksel: ensureStringArray(row.fiziksel),
    zihinsel: ensureStringArray(row.zihinsel),
    cakralar: ensureStringArray(row.cakralar),
    fizyoloji: ensureStringArray(row.fizyoloji),
    eksiklik_belirtileri: ensureStringArray(row.eksiklik_belirtileri),
    fazlalik_belirtileri: ensureStringArray(row.fazlalik_belirtileri),
    doz_asimi: ensureStringArray(row.doz_asimi),
    iceren_taslar: ensureStringArray(row.iceren_taslar),
  };
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const pageBg =
  "relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#fef3c7_0%,#ecfccb_38%,#f8fafc_100%)]";
const pageContent = "relative z-10 w-full px-6 py-6 xl:px-10 2xl:px-14";
const uiHeaderCard =
  "rounded-[32px] border-[3px] border-emerald-400/40 bg-white/75 p-6 shadow-[0_0_45px_rgba(16,185,129,0.16)] backdrop-blur-xl";
const uiProfileCard =
  "rounded-[32px] border-[3px] border-amber-300/50 bg-gradient-to-br from-white/80 via-amber-50/70 to-emerald-50/70 p-6 shadow-[0_0_40px_rgba(245,158,11,0.16)] backdrop-blur-xl";
const uiStatBox =
  "rounded-2xl border-2 border-emerald-200 bg-white/80 p-4 text-center shadow-md";
const uiInfoCard =
  "w-full rounded-[28px] border-[3px] border-emerald-300/45 bg-white/75 p-5 shadow-[0_0_35px_rgba(16,185,129,0.12)] backdrop-blur-xl";
const uiFieldLabel = "text-sm font-black uppercase tracking-[0.18em] text-violet-700";
const uiContentBox =
  "mt-4 rounded-2xl border-2 border-slate-200 bg-slate-50/80 p-5 text-base leading-7 text-slate-700 shadow-inner";
const uiEmptyText = "text-slate-400 italic font-medium";
const uiCategoryPill =
  "inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-4 py-1.5 text-sm font-black text-cyan-900";

function toneClass(
  tone: "emerald" | "cyan" | "violet" | "amber" | "rose" | "sky" | "purple"
) {
  const map = {
    emerald: "bg-emerald-100 text-emerald-700",
    cyan: "bg-cyan-100 text-cyan-700",
    violet: "bg-violet-100 text-violet-700",
    amber: "bg-amber-100 text-amber-700",
    rose: "bg-rose-100 text-rose-700",
    sky: "bg-sky-100 text-sky-700",
    purple: "bg-purple-100 text-purple-700",
  };
  return `inline-flex items-center rounded-full px-3 py-1 text-xs font-black tracking-wide ${map[tone]}`;
}

function TextSectionCard({
  title,
  badge,
  text,
  tone = "emerald",
}: {
  title: string;
  badge: string;
  text: string | null | undefined;
  tone?: "emerald" | "cyan" | "violet" | "amber" | "rose" | "sky" | "purple";
}) {
  return (
    <article className={uiInfoCard}>
      <div className={toneClass(tone)}>{badge}</div>
      <h2 className="mt-2 text-xl font-black text-slate-950">{title}</h2>
      <div className={uiContentBox}>
        {text?.trim() ? (
          <p className="whitespace-pre-wrap">{text}</p>
        ) : (
          <p className={uiEmptyText}>Henüz bilgi girilmedi.</p>
        )}
      </div>
    </article>
  );
}

function ListSectionCard({
  title,
  badge,
  items,
  tone = "cyan",
}: {
  title: string;
  badge: string;
  items: string[];
  tone?: "emerald" | "cyan" | "violet" | "amber" | "rose" | "sky" | "purple";
}) {
  return (
    <article className={uiInfoCard}>
      <div className={toneClass(tone)}>{badge}</div>
      <h2 className="mt-2 text-xl font-black text-slate-950">{title}</h2>
      <div className={uiContentBox}>
        {items.length > 0 ? (
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li key={`${index}-${item.slice(0, 24)}`} className="flex gap-2">
                <span className="shrink-0 font-black text-emerald-600">{index + 1}.</span>
                <span className="whitespace-pre-wrap">{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={uiEmptyText}>Henüz bilgi girilmedi.</p>
        )}
      </div>
    </article>
  );
}

export default function MineralDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [mineral, setMineral] = useState<MineralRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadMineral = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("minerals")
      .select(MINERALS_SELECT)
      .eq("tenant_id", TENANT_ID)
      .eq("id", id)
      .maybeSingle();

    setLoading(false);

    if (error) {
      setErrorMessage(`Mineral alınamadı: ${error.message}`);
      setMineral(null);
      return;
    }

    if (!data) {
      setErrorMessage("Mineral kaydı bulunamadı.");
      setMineral(null);
      return;
    }

    setMineral(normalizeMineral(data as MineralRecord));
  }, [id]);

  useEffect(() => {
    runInEffect(() => {
      loadMineral();
    });
  }, [loadMineral]);

  const filledSections = useMemo(() => {
    if (!mineral) return 0;
    let count = 0;
    if (mineral.aciklama?.trim()) count += 1;
    if (ensureStringArray(mineral.fiziksel).length) count += 1;
    if (ensureStringArray(mineral.zihinsel).length) count += 1;
    if (ensureStringArray(mineral.fizyoloji).length) count += 1;
    if (ensureStringArray(mineral.eksiklik_belirtileri).length) count += 1;
    if (ensureStringArray(mineral.doz_asimi).length) count += 1;
    if (ensureStringArray(mineral.iceren_taslar).length) count += 1;
    return count;
  }, [mineral]);

  if (loading) {
    return (
      <main className={`flex min-h-screen items-center justify-center ${pageBg} text-slate-500`}>
        <div className={`${uiHeaderCard} text-sm font-black text-slate-600`}>
          Mineral yükleniyor...
        </div>
      </main>
    );
  }

  if (errorMessage && !mineral) {
    return (
      <main className={`flex min-h-screen items-center justify-center px-6 ${pageBg}`}>
        <div className={`${uiHeaderCard} w-full max-w-lg text-center`}>
          <div className="text-5xl">⚗️</div>
          <h1 className="mt-3 text-2xl font-black text-slate-950">Mineral bulunamadı</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">{errorMessage}</p>
          <Link
            href="/dogaltas/mineral-listesi"
            className="mt-6 inline-flex rounded-2xl border-2 border-slate-200 bg-white px-6 py-3 font-black text-slate-800 shadow-md hover:bg-slate-50"
          >
            Listeye Dön
          </Link>
        </div>
      </main>
    );
  }

  if (!mineral) return null;

  const stones = ensureStringArray(mineral.iceren_taslar);

  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute left-0 top-0 h-[520px] w-[520px] rounded-full bg-amber-300/20 blur-[150px]" />
      <div className="pointer-events-none absolute right-0 top-0 h-[520px] w-[520px] rounded-full bg-emerald-300/20 blur-[150px]" />

      <div className={pageContent}>
        <header className={`${uiHeaderCard} mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
          <div>
            <span className={toneClass("emerald")}>⚗️ MİNERAL DETAY</span>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950 xl:text-5xl">
              {mineral.name}
            </h1>
            {mineral.kategori?.trim() ? (
              <p className="mt-3">
                <span className={uiCategoryPill}>{mineral.kategori}</span>
              </p>
            ) : null}
            <p className="mt-2 text-sm font-semibold text-slate-500">
              Kayıt: {formatDate(mineral.created_at)} · Kaynak ID: {mineral.source_id}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dogaltas/mineral-listesi"
              className="rounded-2xl border-2 border-slate-200 bg-white px-6 py-3 font-black text-slate-800 shadow-md hover:bg-slate-50"
            >
              Listeye Dön
            </Link>
            <button
              type="button"
              onClick={loadMineral}
              className="rounded-2xl border-2 border-emerald-200 bg-white px-6 py-3 font-black text-slate-800 shadow-md hover:bg-emerald-50"
            >
              Yenile
            </button>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_1fr]">
          <aside className="space-y-6">
            <div className={uiProfileCard}>
              <div className="flex min-h-[180px] items-center justify-center rounded-[24px] border-2 border-dashed border-amber-200/80 bg-white/60">
                <div className="text-center">
                  <div className="text-6xl">⚗️</div>
                  <h2 className="mt-3 text-2xl font-black text-slate-950">{mineral.name}</h2>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className={uiStatBox}>
                  <div className="text-2xl font-black text-slate-950">{filledSections}</div>
                  <div className="mt-1 text-xs font-bold text-slate-500">Dolu bölüm</div>
                </div>
                <div className={uiStatBox}>
                  <div className="text-2xl font-black text-slate-950">{stones.length}</div>
                  <div className="mt-1 text-xs font-bold text-slate-500">İçeren taş</div>
                </div>
              </div>
            </div>
          </aside>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <TextSectionCard
              title="Açıklama"
              badge="AÇIKLAMA"
              text={mineral.aciklama}
              tone="emerald"
            />
            <ListSectionCard title="Fiziksel" badge="FİZİKSEL" items={ensureStringArray(mineral.fiziksel)} tone="sky" />
            <ListSectionCard title="Zihinsel" badge="ZİHİNSEL" items={ensureStringArray(mineral.zihinsel)} tone="purple" />
            <ListSectionCard title="Fizyoloji" badge="FİZYOLOJİ" items={ensureStringArray(mineral.fizyoloji)} tone="violet" />
            <ListSectionCard
              title="Eksiklik belirtileri"
              badge="EKSİKLİK"
              items={ensureStringArray(mineral.eksiklik_belirtileri)}
              tone="amber"
            />
            <ListSectionCard title="Doz aşımı" badge="DOZ" items={ensureStringArray(mineral.doz_asimi)} tone="rose" />
            <ListSectionCard
              title="İçeren taşlar"
              badge={`${stones.length} TAŞ`}
              items={stones}
              tone="cyan"
            />
          </section>
        </section>
      </div>
    </main>
  );
}
