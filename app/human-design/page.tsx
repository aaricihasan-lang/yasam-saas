import { HumanDesignShell } from "./components/HumanDesignShell";
import { HdHubModules, type HdHubModule } from "./components/HdHubModules";

// AŞAMA 3C — premium, görev odaklı iki çalışma alanı. Eski kartların işlevleri silinmedi:
//   • Danışanlar / Human Design Haritası / Kayıtlı Haritalar / Kayıtlı Raporlar → Hesaplama çalışma
//     alanı (danışan seç/yeni + hesapla + Geçmiş Analizler; raporlar analizlerin altında). Route'lar
//     (/kayitli-haritalar, /kayitli-raporlar, /rapor-olustur, /harita-kaydi) eski bağlantılar için durur.
//   • Manuel harita / Rapor Oluştur yeni üretim yüzeyi değildir (uzmandan ve adminden kaldırıldı).
const HD_MODULES: readonly HdHubModule[] = [
  {
    title: "Human Design Hesaplama",
    desc: "Danışan seçin veya yeni danışan oluşturun ve profesyonel Human Design haritasını hesaplayın.",
    href: "/human-design/danisanlar",
    icon: "🗺️",
    badge: "Hesaplama",
    accent: "from-indigo-500 to-violet-600",
    cardBorder: "border-indigo-200/70",
    cardBg: "from-indigo-50/90 via-violet-50/60 to-white",
    badgeCls: "bg-indigo-100 text-indigo-800",
  },
  {
    title: "Bilgi Bankası",
    desc: "Human Design mesleki bilgilerinizi yönetin.",
    href: "/human-design/bilgi-bankasi",
    icon: "📚",
    badge: "İçerik",
    accent: "from-sky-500 to-indigo-600",
    cardBorder: "border-sky-200/70",
    cardBg: "from-sky-50/90 via-indigo-50/60 to-white",
    badgeCls: "bg-sky-100 text-sky-800",
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
          Profesyonel Human Design hesaplama ve mesleki bilgi çalışma alanı.
        </p>
      </div>

      {/* İki ana çalışma alanı */}
      <HdHubModules modules={HD_MODULES} />
    </HumanDesignShell>
  );
}
