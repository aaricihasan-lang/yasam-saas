import { HumanDesignShell } from "./components/HumanDesignShell";
import { HdHubModules, type HdHubModule } from "./components/HdHubModules";

const HD_MODULES: readonly HdHubModule[] = [
  {
    title: "Danışanlar",
    desc: "Yeni danışan ekle, ad, doğum bilgisi ve harita görselini kaydet.",
    href: "/human-design/danisanlar",
    icon: "👤",
    badge: "Yönetim",
    accent: "from-indigo-500 to-violet-600",
    cardBorder: "border-indigo-200/70",
    cardBg: "from-indigo-50/90 via-violet-50/60 to-white",
    badgeCls: "bg-indigo-100 text-indigo-800",
  },
  {
    title: "Harita Kaydı",
    desc: "Danışan seç, dış sitede hesaplanan HD değerlerini manuel olarak işaretle.",
    href: "/human-design/harita-kaydi",
    icon: "🗺️",
    badge: "Veri Girişi",
    accent: "from-violet-500 to-purple-600",
    cardBorder: "border-violet-200/70",
    cardBg: "from-violet-50/90 via-purple-50/60 to-white",
    badgeCls: "bg-violet-100 text-violet-800",
  },
  {
    title: "Kayıtlı Haritalar",
    desc: "Kayıtlı danışanların Human Design haritalarını listele ve detaylarına eriş.",
    href: "/human-design/kayitli-haritalar",
    icon: "📋",
    badge: "Liste",
    accent: "from-purple-500 to-indigo-600",
    cardBorder: "border-purple-200/70",
    cardBg: "from-purple-50/90 via-indigo-50/60 to-white",
    badgeCls: "bg-purple-100 text-purple-800",
  },
  {
    title: "Rapor Oluştur",
    desc: "Danışanın harita değerleriyle Bilgi Bankası'nı eşleştir, yorum önizlemesi al.",
    href: "/human-design/rapor-olustur",
    // Eski rapor hattı: uzmandan gizlenir (route/API korunur). Uzmanın ana yolu
    // Kayıtlı Haritalar → Profesyonel Word.
    adminOnly: true,
    icon: "✦",
    badge: "Rapor",
    accent: "from-fuchsia-500 to-violet-600",
    cardBorder: "border-fuchsia-200/70",
    cardBg: "from-fuchsia-50/90 via-violet-50/60 to-white",
    badgeCls: "bg-fuchsia-100 text-fuchsia-800",
  },
  {
    title: "Bilgi Bankası",
    desc: "Kapı, kanal, merkez, tip ve otorite yorumlarını yönet.",
    href: "/human-design/bilgi-bankasi",
    icon: "📚",
    badge: "İçerik",
    accent: "from-sky-500 to-indigo-600",
    cardBorder: "border-sky-200/70",
    cardBg: "from-sky-50/90 via-indigo-50/60 to-white",
    badgeCls: "bg-sky-100 text-sky-800",
  },
  {
    title: "Kayıtlı Raporlar",
    desc: "Oluşturulan raporları listele ve profesyonel Word raporlarını yeniden indir.",
    androidDesc: "Oluşturulan raporları listele ve rapor özetlerini görüntüle.",
    href: "/human-design/kayitli-raporlar",
    icon: "📄",
    badge: "Liste",
    accent: "from-fuchsia-500 to-pink-600",
    cardBorder: "border-fuchsia-200/70",
    cardBg: "from-fuchsia-50/90 via-pink-50/60 to-white",
    badgeCls: "bg-fuchsia-100 text-fuchsia-800",
  },
];

export default function HumanDesignHubPage() {
  return (
    <HumanDesignShell>
      {/* Başlık */}
      <div className="mb-5 rounded-2xl border border-indigo-200/80 bg-white/90 px-5 py-5 shadow-[0_6px_24px_-8px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 backdrop-blur-xl">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
          Human Design
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          Danışan yönetimi, harita kaydı, kayıtlı haritalar ve rapor hazırlama
          merkezi.
        </p>
      </div>

      {/* Ana CTA + modül kartları (client: admin-only kart görünürlüğü) */}
      <HdHubModules modules={HD_MODULES} />
    </HumanDesignShell>
  );
}
