"use client";
/**
 * Beslenme Merkezi — owner-only hub. Genel sayaçlar (fetchCounts) + modül kartları.
 * Erişim doğrulanmadan içerik render EDİLMEZ (useBeslenmeModuleGuard).
 *
 * 2026-10-18 premium görsel entegrasyon (owner onaylı prototip 9850e43): yalnız GÖRÜNÜM değişti (hubStyles).
 * Sayaçlar, hızlı işlemler, kart adresleri, Danışan Planları kapısı (hasClients) ve ClientPicker akışı aynen.
 * Alt sayfaların ortak BeslenmeShell'i değişmedi; hub kendi premium başlık panelini çizer.
 */
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  LayoutTemplate,
  Compass,
  Database,
  Droplet,
  HeartPulse,
  Leaf,
  Package,
  Plus,
  Sprout,
  Users,
} from "lucide-react";
import { fetchCounts, fetchBeslenmeCapabilities } from "@/lib/beslenme/beslenmeClient";
import ClientPicker from "@/components/danisan/ClientPicker";
import { BeslenmeGate, useBeslenmeModuleGuard } from "./_components/BeslenmeShell";
import { friendlyError } from "./_components/constants";
import hubStyles from "@/app/_premium/beslenme/beslenmeHub.module.css";

type Counts = { foods: number; guides: number; mizac: number; bloodType: number; sources: number };

type CardTone = "mint" | "sky" | "cream" | "rose";

/** Kart görselleri (public/premium/beslenme) — doğal ölçü; CLS'siz yerleşim için. */
const ART = {
  planlar: { w: 170, h: 140 },
  sablonlar: { w: 155, h: 155 },
  danisan: { w: 152, h: 170 },
  besinler: { w: 195, h: 140 },
  rehber: { w: 175, h: 117 },
  mizac: { w: 200, h: 124 },
  kan: { w: 190, h: 120 },
} as const;

type ArtKey = keyof typeof ART;

const MODULES = [
  {
    href: "/beslenme/besinler",
    label: "Besinler",
    description: "Besin kütüphanesi: isim, grup, hazırlık durumu, açıklama ve kaynaklar.",
    icon: Package,
    countKey: "foods" as const,
    unit: "besin",
    art: "besinler" as const,
    tone: "mint" as const,
  },
  {
    href: "/beslenme/rehber",
    label: "Beslenme Rehberi",
    description: "Beslenme yaklaşımları: bölümler, ilişkili besinler ve kaynaklı içerik.",
    icon: BookOpen,
    countKey: "guides" as const,
    unit: "rehber",
    art: "rehber" as const,
    tone: "sky" as const,
  },
  {
    href: "/beslenme/mizac",
    label: "Mizaca Göre",
    description: "Dört mizaç (Dem, Safra, Sovdavi, Balgam) için beslenme profilleri.",
    icon: Compass,
    countKey: "mizac" as const,
    unit: "profil",
    art: "mizac" as const,
    tone: "cream" as const,
  },
  {
    href: "/beslenme/kan-grubu",
    label: "Kan Grubuna Göre",
    description: "0, A, B ve AB kan grupları için beslenme profilleri.",
    icon: HeartPulse,
    countKey: "bloodType" as const,
    unit: "profil",
    art: "kan" as const,
    tone: "rose" as const,
  },
];

/** Kart içeriği (görsel + ikon + başlık + açıklama + dekoratif ok). Kabuk Link ya da button olabilir. */
function HubCardInner({
  art,
  icon,
  title,
  description,
  badge,
}: {
  art: ArtKey;
  icon: ReactNode;
  title: string;
  description: string;
  badge?: string | null;
}) {
  const a = ART[art];
  return (
    <>
      <span className={hubStyles.cardArt} style={{ aspectRatio: `${a.w} / ${a.h}` }} aria-hidden>
        <span className={hubStyles.artLayer}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/premium/beslenme/${art}.webp`} width={a.w} height={a.h} alt="" decoding="async" draggable={false} />
        </span>
        <span className={hubStyles.sheen} />
      </span>
      {badge ? <span className={hubStyles.countBadge}>{badge}</span> : null}
      <span className={hubStyles.cardBody}>
        <span className={hubStyles.cardIcon} aria-hidden>
          {icon}
        </span>
        <span className={hubStyles.cardTitle}>{title}</span>
        <span className={hubStyles.cardDesc}>{description}</span>
        <span className={hubStyles.cardArrow} aria-hidden>
          <ArrowRight className="h-[15px] w-[15px]" strokeWidth={2.2} />
        </span>
      </span>
    </>
  );
}

export default function BeslenmeHubPage() {
  const guard = useBeslenmeModuleGuard();
  const router = useRouter();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [clientPickerOpen, setClientPickerOpen] = useState(false); // FAZ 7: Danışan Planları girişi
  // Danışan Planları kartı yalnız Danışan Yolculuğu (clients) yeteneği olanlara (server-authoritative).
  // beslenme-only uzmanda kart GİZLİ (dead-control önle); admin + beslenme+clients uzman → görünür.
  const [hasClients, setHasClients] = useState(false);

  useEffect(() => {
    if (guard !== "ok") return;
    let alive = true;
    void (async () => {
      setLoading(true);
      setErr("");
      const [r, caps] = await Promise.all([fetchCounts(), fetchBeslenmeCapabilities()]);
      if (!alive) return;
      setLoading(false);
      setHasClients(caps.clients);
      if (r.ok && r.data?.counts) setCounts(r.data.counts);
      else setErr(friendlyError(r.code, r.status));
    })();
    return () => {
      alive = false;
    };
  }, [guard]);

  if (guard !== "ok") return <BeslenmeGate state={guard} />;

  const stats = [
    { label: "Besin", value: counts?.foods, tone: "green", Icon: Package },
    { label: "Rehber", value: counts?.guides, tone: "blue", Icon: BookOpen },
    { label: "Mizaç", value: counts?.mizac, tone: "amber", Icon: Leaf },
    { label: "Kan Grubu", value: counts?.bloodType, tone: "red", Icon: Droplet },
    { label: "Kaynak", value: counts?.sources, tone: "violet", Icon: Database },
  ];

  // Üst sıra: Planlar + Şablonlar (+ Danışan Planları) + Besinler → 4 kart (Danışan gizliyse 3; ızgara dengeli kalır).
  const topCls = `${hubStyles.card} ${hasClients ? "" : hubStyles.cardThird}`;
  const [foodsModule, ...wideModules] = MODULES;

  function moduleBadge(m: (typeof MODULES)[number]): string | null {
    const value = counts?.[m.countKey];
    return !loading && typeof value === "number" ? `${value} ${m.unit}` : null;
  }

  return (
    <main className={hubStyles.page}>
      <div className={hubStyles.inner}>
        <header className={hubStyles.hero}>
          <div className={hubStyles.heroText}>
            <p className={hubStyles.heroBadge}>
              <span className={hubStyles.dot} aria-hidden />
              Beslenme &amp; Metabolik Yaşam
            </p>
            <h1 className={hubStyles.heroTitle}>Beslenme</h1>
            <p className={hubStyles.heroSub}>
              Besin kütüphanesi, beslenme rehberleri ve mizaç/kan grubu profilleri. Kaynak temelli profesyonel referans
              ve çalışma merkezi.
            </p>
          </div>
          <div className={hubStyles.heroStats}>
            <ul className={hubStyles.stats} aria-label="Beslenme sayaçları">
              {stats.map((s) => (
                <li key={s.label} className={hubStyles.stat} data-tone={s.tone}>
                  <span className={hubStyles.statIcon} aria-hidden>
                    <s.Icon className="h-5 w-5" strokeWidth={1.9} />
                  </span>
                  <span className={hubStyles.statText}>
                    <strong className={hubStyles.statValue}>{loading ? "—" : (s.value ?? 0)}</strong>
                    <span className={hubStyles.statLabel}>{s.label}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </header>

        {err ? <div className={hubStyles.error}>{err}</div> : null}

        {/* Hızlı aksiyonlar */}
        <div className={hubStyles.actions} role="group" aria-label="Hızlı işlemler">
          <Link href="/beslenme/besinler" className={`${hubStyles.action} ${hubStyles.actionPrimary}`}>
            <Plus className="h-4 w-4" strokeWidth={2.4} aria-hidden /> Besin
          </Link>
          <Link href="/beslenme/rehber" className={hubStyles.action}>
            <Plus className="h-4 w-4" strokeWidth={2.4} aria-hidden /> Beslenme Kaydı
          </Link>
        </div>

        <section className={hubStyles.cards} aria-label="Beslenme çalışma alanları">
          {/* Beslenme Planları — sayaçsız (kart planlara doğrudan yönlendirir) */}
          <Link href="/beslenme/planlar" className={topCls} data-card="planlar" data-tone="mint">
            <HubCardInner
              art="planlar"
              icon={<CalendarDays className="h-[22px] w-[22px]" strokeWidth={1.8} />}
              title="Beslenme Planları"
              description="Günlük, haftalık ve aylık beslenme planları oluşturun; kalori ve besin değerlerini otomatik hesaplayın."
            />
          </Link>

          {/* Şablonlar — öğün/gün şablon kütüphanesi (FAZ 6) */}
          <Link href="/beslenme/sablonlar" className={topCls} data-card="sablonlar" data-tone="sky">
            <HubCardInner
              art="sablonlar"
              icon={<LayoutTemplate className="h-[22px] w-[22px]" strokeWidth={1.8} />}
              title="Şablonlar"
              description="Sık kullandığınız öğünleri ve günleri şablon olarak saklayın; planlara hızlıca uygulayın."
            />
          </Link>

          {/* Danışan Planları — danışan seç → o danışanın Beslenme sekmesi (FAZ 7).
              Yalnız clients yeteneği olanlara (server-authoritative); beslenme-only uzmanda GİZLİ. */}
          {hasClients ? (
            <button
              type="button"
              onClick={() => setClientPickerOpen(true)}
              className={topCls}
              data-card="danisan"
              data-tone="cream"
            >
              <HubCardInner
                art="danisan"
                icon={<Users className="h-[22px] w-[22px]" strokeWidth={1.8} />}
                title="Danışan Planları"
                description="Bir danışan seçin; beslenme profili, ölçümleri ve planlarına ulaşın."
              />
            </button>
          ) : null}

          <Link href={foodsModule.href} className={topCls} data-card={foodsModule.art} data-tone={foodsModule.tone}>
            <HubCardInner
              art={foodsModule.art}
              icon={<foodsModule.icon className="h-[22px] w-[22px]" strokeWidth={1.8} />}
              title={foodsModule.label}
              description={foodsModule.description}
              badge={moduleBadge(foodsModule)}
            />
          </Link>

          {wideModules.map((m) => {
            const Icon = m.icon;
            const tone: CardTone = m.tone;
            return (
              <Link
                key={m.href}
                href={m.href}
                className={`${hubStyles.card} ${hubStyles.cardWide}`}
                data-card={m.art}
                data-tone={tone}
              >
                <HubCardInner
                  art={m.art}
                  icon={<Icon className="h-[22px] w-[22px]" strokeWidth={1.8} />}
                  title={m.label}
                  description={m.description}
                  badge={moduleBadge(m)}
                />
              </Link>
            );
          })}
        </section>

        <footer className={hubStyles.footNote}>
          <Sprout className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden />
          <span>
            Beslenme Merkezi — besin kütüphanesi, kaynak temelli beslenme rehberleri ve geleneksel profil sistemleri.
          </span>
        </footer>
      </div>

      {clientPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setClientPickerOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-emerald-900">Danışan Seç</h3>
              <button className="text-sm text-slate-400 hover:text-slate-600" onClick={() => setClientPickerOpen(false)}>Kapat</button>
            </div>
            <ClientPicker
              autoFocus
              onSelect={(c) => { setClientPickerOpen(false); router.push(`/dashboard/clients/${c.id}?tab=beslenme`); }}
            />
          </div>
        </div>
      )}
    </main>
  );
}
