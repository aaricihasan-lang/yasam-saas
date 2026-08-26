"use client";
/**
 * Beslenme Merkezi — owner-only hub. Genel sayaçlar (fetchCounts) + modül kartları.
 * Erişim doğrulanmadan içerik render EDİLMEZ (useBeslenmeOwnerGuard).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Compass,
  HeartPulse,
  Package,
  Plus,
  Sparkles,
} from "lucide-react";
import { fetchCounts } from "@/lib/beslenme/beslenmeClient";
import {
  BeslenmeGate,
  BeslenmeShell,
  useBeslenmeOwnerGuard,
} from "./_components/BeslenmeShell";
import { friendlyError } from "./_components/constants";

type Counts = { foods: number; guides: number; mizac: number; bloodType: number; sources: number };

const MODULES = [
  {
    href: "/beslenme/besinler",
    label: "Besinler",
    description: "Besin kütüphanesi: isim, grup, hazırlık durumu, açıklama ve kaynaklar.",
    icon: Package,
    countKey: "foods" as const,
    unit: "besin",
    gradient: "from-emerald-600 to-teal-600",
    ring: "border-emerald-100 bg-gradient-to-br from-emerald-50/70 to-white",
    iconBox: "border-emerald-100 bg-emerald-50 text-emerald-600",
  },
  {
    href: "/beslenme/rehber",
    label: "Beslenme Rehberi",
    description: "Beslenme yaklaşımları: bölümler, ilişkili besinler ve kaynaklı içerik.",
    icon: BookOpen,
    countKey: "guides" as const,
    unit: "rehber",
    gradient: "from-teal-600 to-cyan-600",
    ring: "border-teal-100 bg-gradient-to-br from-teal-50/70 to-white",
    iconBox: "border-teal-100 bg-teal-50 text-teal-600",
  },
  {
    href: "/beslenme/mizac",
    label: "Mizaca Göre",
    description: "Dört mizaç (Dem, Safra, Sovdavi, Balgam) için beslenme profilleri.",
    icon: Compass,
    countKey: "mizac" as const,
    unit: "profil",
    gradient: "from-amber-600 to-orange-600",
    ring: "border-amber-100 bg-gradient-to-br from-amber-50/70 to-white",
    iconBox: "border-amber-100 bg-amber-50 text-amber-600",
  },
  {
    href: "/beslenme/kan-grubu",
    label: "Kan Grubuna Göre",
    description: "0, A, B ve AB kan grupları için beslenme profilleri.",
    icon: HeartPulse,
    countKey: "bloodType" as const,
    unit: "profil",
    gradient: "from-rose-600 to-pink-600",
    ring: "border-rose-100 bg-gradient-to-br from-rose-50/70 to-white",
    iconBox: "border-rose-100 bg-rose-50 text-rose-600",
  },
];

export default function BeslenmeHubPage() {
  const guard = useBeslenmeOwnerGuard();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (guard !== "ok") return;
    let alive = true;
    void (async () => {
      setLoading(true);
      setErr("");
      const r = await fetchCounts();
      if (!alive) return;
      setLoading(false);
      if (r.ok && r.data?.counts) setCounts(r.data.counts);
      else setErr(friendlyError(r.code, r.status));
    })();
    return () => {
      alive = false;
    };
  }, [guard]);

  if (guard !== "ok") return <BeslenmeGate state={guard} />;

  const stats = [
    { label: "Besin", value: counts?.foods, cls: "text-emerald-700" },
    { label: "Rehber", value: counts?.guides, cls: "text-teal-700" },
    { label: "Mizaç", value: counts?.mizac, cls: "text-amber-700" },
    { label: "Kan Grubu", value: counts?.bloodType, cls: "text-rose-700" },
    { label: "Kaynak", value: counts?.sources, cls: "text-slate-700" },
  ];

  return (
    <BeslenmeShell
      eyebrow="Beslenme & Metabolik Yaşam"
      title="Beslenme"
      subtitle="Besin kütüphanesi, beslenme rehberleri ve mizaç/kan grubu profilleri. Kaynak temelli profesyonel referans ve çalışma merkezi."
      icon={<Sparkles className="h-32 w-32" strokeWidth={1} />}
      actions={
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-emerald-100/80 bg-white/90 px-3 py-2 text-center shadow-sm"
            >
              <div className={`text-lg font-black sm:text-xl ${s.cls}`}>
                {loading ? "—" : (s.value ?? 0)}
              </div>
              <div className="mt-0.5 text-[10px] font-bold text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>
      }
    >
      {err ? (
        <div className="mb-4 rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] font-bold text-rose-700 ring-1 ring-rose-100">
          {err}
        </div>
      ) : null}

      {/* Hızlı aksiyonlar */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/beslenme/besinler"
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white/90 px-3.5 py-2 text-[13px] font-black text-emerald-800 shadow-sm transition hover:bg-emerald-50"
        >
          <Plus className="h-4 w-4" aria-hidden /> Besin
        </Link>
        <Link
          href="/beslenme/rehber"
          className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-white/90 px-3.5 py-2 text-[13px] font-black text-teal-800 shadow-sm transition hover:bg-teal-50"
        >
          <Plus className="h-4 w-4" aria-hidden /> Beslenme Kaydı
        </Link>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {MODULES.map((m) => {
          const Icon = m.icon;
          const value = counts?.[m.countKey];
          return (
            <Link
              key={m.href}
              href={m.href}
              className={`group relative flex min-h-[176px] flex-col overflow-hidden rounded-[22px] border p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50 ${m.ring}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl border shadow-sm ${m.iconBox}`}
                  aria-hidden
                >
                  <Icon className="h-6 w-6" />
                </span>
                {!loading && typeof value === "number" ? (
                  <span className="rounded-full border border-slate-200 bg-white/85 px-2.5 py-0.5 text-[10px] font-black text-slate-600 shadow-sm">
                    {value} {m.unit}
                  </span>
                ) : null}
              </div>

              <div className="mt-3 min-w-0 flex-1">
                <h2 className="text-lg font-black leading-tight tracking-tight text-slate-950">{m.label}</h2>
                <p className="mt-1.5 text-xs font-medium leading-snug text-slate-600">{m.description}</p>
              </div>

              <span
                className={`mt-4 block w-full rounded-xl bg-gradient-to-r py-2 text-center text-[13px] font-black text-white shadow-md transition group-hover:brightness-105 ${m.gradient}`}
              >
                {m.label} →
              </span>
            </Link>
          );
        })}
      </section>

      <footer className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-100/60 bg-white/60 px-4 py-3">
        <Sparkles className="h-5 w-5 text-emerald-500" aria-hidden />
        <p className="text-xs font-medium text-slate-500">
          Beslenme Merkezi — besin kütüphanesi, kaynak temelli beslenme rehberleri ve geleneksel profil sistemleri.
        </p>
      </footer>
    </BeslenmeShell>
  );
}
