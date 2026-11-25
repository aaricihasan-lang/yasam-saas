"use client";

/**
 * Gökyüzü Atlası — "Yakında" bilgilendirme görünümü (2026-10-19, owner onaylı metin).
 *
 * YALNIZ STATİK BİLGİ: veri isteği, sağlayıcı çağrısı, veritabanı, kayıt, analiz başlatma veya yetki işlemi YOKTUR.
 * Bölümler yerel <details> panelleridir (klavyeyle açılır/kapanır, durum tarayıcıda; JavaScript isteği yok).
 * Metin owner onaylıdır: başlık, teknik adı ve ekol eklenmez/çıkarılmaz. Teknik adları arasında uzun tire (—).
 * Marka kuralı: kullanıcıya görünen metinde sağlayıcı adı geçmez.
 *
 * 2026-10-22 (owner kararı): kullanıma açılan teknik "Yakında"da kalmaz. Madde metni değişmez; maddeyi karşılayan
 * Atlas tekniği UI kaydında (UI_TECHNIQUES) bulunduğunda madde gizlenir. Böylece bir teknik hangi sürümde
 * açılıyorsa maddesi de aynı sürümde düşer (önceden düşüp boş bağlantı bırakmaz). Boş kalan bölüm gösterilmez.
 */
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { AVAILABLE_TECHNIQUES, COMING_SOON_ITEM_CODES, COMING_SOON_SECTION_CODES, visibleComingSoonSections } from "../../_lib/comingSoon";
import { AtlasViewTitle, atlasEyebrow, atlasGhostBtn, atlasPanel } from "../AtlasShell";

type Section = { title: string; items: string[]; notes?: string[] };

// I18N-F1-R5: aşağıdaki TR bölüm/madde metinleri KANONİK ANAHTARDIR (görünürlük eşlemesi _lib/comingSoon.ts + harness'lar);
// ekranda her dilde koddan katalogla (atlas.soon) çizilir — TR katalog değeri = bu metin (atlas-a-r5-i18n kilidi).
export const COMING_SOON_SECTIONS: readonly Section[] = [
  {
    title: "Klasik Batı Horary Ekolleri",
    items: ["William Lilly (1647)", "Guido Bonatti", "Sahl ibn Bishr", "Māshā'allāh", "Çağdaş Geleneksel Horary", "Modern Horary Yaklaşımları"],
    notes: [
      "Geleneksel asalet tabloları, reception (karşılıklı kabul), Ay'ın seyri, gezegen hareketleri, açı kesinleşmeleri ve ekollere özgü değerlendirme yöntemleri üzerinde çalışmalar sürdürülüyor.",
    ],
  },
  {
    title: "Vedik Prashna Ekolleri",
    items: ["Genel Prashna Kundali", "Tajika Prashna", "Prashna Marga", "Ashtamangala Prashna", "Shatpanchasika"],
    notes: ["Soru anına dayalı Vedik haritalar ve farklı Prashna geleneklerinin kendilerine özgü hesaplama yöntemleri araştırılıyor."],
  },
  {
    title: "Yeni Batı Astrolojisi Haritaları ve Hesaplamaları",
    items: [
      "Arap Noktaları (Hermetik Lotlar)",
      "Gezegen Dönüş Haritaları (Satürn, Jüpiter, Mars, Venüs, Merkür)",
      "Asteroit Hesaplamaları (Ceres, Pallas, Juno, Vesta)",
      "Deklinasyon Paralelleri",
    ],
  },
  {
    title: "Batı Astrolojisi Ek Hesaplama ve Takvim Ayrıntıları",
    items: [
      "Gerçek Lilith Varyantı",
      "Ayrıntılı Transit–Natal Açıları",
      "Ekliptik Geçişleri",
      "Aylık Gezegen Efemerisleri",
      "Aylık Açı Olayları",
      "Ayrıntılı Burç Geçişleri",
      "Ay Evreleri ve Ay Takvimi",
    ],
    notes: ["Bu başlıklar mevcut Natal ve Transit tekniklerinin genişletilmesi kapsamında ele alınmaktadır; aynı hesaplamalar yeni teknik adıyla tekrarlanmayacaktır."],
  },
  {
    title: "Yeni Vedik Astroloji Hesaplamaları",
    items: [
      "Jaimini Arudha Padaları",
      "Upapada Lagna",
      "Chara Karaka",
      "Atmakaraka",
      "Darakaraka",
      "Bhava Bala",
      "Bhav Chalit",
      "Upagraha",
      "Graha Asta (Heliacal Doğuş ve Batış)",
    ],
  },
  {
    title: "Vedik Panchanga ve Zaman Hesaplamaları",
    items: ["Ayrıntılı Panchanga", "Rahu Kaal", "Yamaganda", "Gulika", "Hora (Gezegen Saatleri)", "Choghadiya"],
  },
  {
    title: "Vedik Dasha ve Yoga Genişletmeleri",
    items: ["Güncel Vimshottari Dasha", "Sookshma Dasha", "Prana Dasha", "Ayrıntılı Yoga Tespiti", "Yoga ve Avastha Açıklamaları"],
  },
  {
    title: "Vedik Dosha ve Uyumluluk Hesaplamaları",
    items: ["Manglik Dosha", "Kalsarpa Dosha", "Sade Sati", "Kundli Eşleştirme", "Ashtakoot (Ashtakoota)", "Dashakoot", "Papasamyam"],
  },
  {
    title: "Vedik Transit ve Astronomik Hesaplama Ayrıntıları",
    items: ["Sidereal Gezegen Efemerisleri", "Aylık Vedik Transitler", "Aylık Gezegen Açıları", "Ay Açıları", "Deklinasyon Paralelleri", "Ekliptik Geçişleri"],
  },
  {
    title: "Diğer Astroloji Hesaplama İmkânları",
    items: [
      "Batı Astrolojisi Uyum Puanı",
      "Günlük, Haftalık, Aylık ve Yıllık Burç Yorumları",
      "Burç ve Gezegen Açıklamaları",
      "Vedik Günlük Birleşik Okuma",
      "Rashi ve Nakshatra Açıklamaları",
      "Astrolojik Zaman Çizelgesi",
      "Önemli Tarihler",
      "Dönem Özetleri",
    ],
  },
];

/** Yalnız henüz kullanıma açılmamış maddeler (eşleme: _lib/comingSoon.ts). */
export function comingSoonVisibleSections(available: ReadonlySet<string> = AVAILABLE_TECHNIQUES): Section[] {
  return visibleComingSoonSections(COMING_SOON_SECTIONS, available);
}


export default function ComingSoonPanel({ onHome }: { onHome: () => void }) {
  const t = useTranslations("atlas.soon");
  const sections = comingSoonVisibleSections();
  return (
    <div className="flex min-w-0 flex-col gap-5" data-testid="atlas-coming-soon">
      <AtlasViewTitle
        eyebrow={t("eyebrow")}
        title={t("title")}
        sub={t("sub")}
        actions={
          <button type="button" onClick={onHome} className={atlasGhostBtn}>
            {t("back")}
          </button>
        }
      />

      <section className={`${atlasPanel} px-4 py-5 sm:px-7 sm:py-6`} aria-label={t("ariaExpanding")}>
        <p className="max-w-3xl text-[15px] leading-relaxed text-slate-700">
          {t("intro1")}
        </p>
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-700">
          {t("intro2")}
        </p>
      </section>

      <div className="grid min-w-0 gap-3">
        {sections.map((s, i) => {
          const code = COMING_SOON_SECTION_CODES[s.title];
          return (
            <details key={s.title} open className={`${atlasPanel} group min-w-0 overflow-hidden`} data-soon-section={i + 1}>
              <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-4 outline-none sm:px-7 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#c9a54e] [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="text-[1.05rem] font-medium leading-snug text-[#0b1430] [font-family:var(--font-atlas-display)] sm:text-lg">
                      {i + 1}. {t(`sections.${code}`)}
                    </span>
                    <span className="inline-flex shrink-0 items-center rounded-full border border-[#d9c9a3] bg-[#f5ecd7] px-2.5 py-0.5 text-[10.5px] font-semibold tracking-[0.14em] text-[#7a5a1e]" data-soon-status>
                      {t("status")}
                    </span>
                  </span>
                </span>
                <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-[#b8954e] motion-safe:transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="border-t border-[#ece3cf] px-4 pb-5 pt-4 sm:px-7">
                <p className="break-words text-[15px] font-medium leading-relaxed text-slate-800" data-soon-items>
                  {s.items.map((it) => t(`items.${COMING_SOON_ITEM_CODES[it]}`)).join(" — ")}
                </p>
                {s.notes?.map((n, k) => (
                  <p key={n} className="mt-3 max-w-3xl break-words text-sm leading-relaxed text-slate-600">
                    {t(`notes.${code}_${k + 1}`)}
                  </p>
                ))}
              </div>
            </details>
          );
        })}
      </div>

      <section className={`${atlasPanel} px-4 py-5 sm:px-7 sm:py-6`} aria-labelledby="atlas-soon-process">
        <h3 id="atlas-soon-process" className={`${atlasEyebrow} !text-[#8a6a2a]`}>
          {t("processTitle")}
        </h3>
        {(["p1", "p2", "p3", "p4"] as const).map((k) => (
          <p key={k} className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-700">
            {t(`process.${k}`)}
          </p>
        ))}
      </section>
    </div>
  );
}
