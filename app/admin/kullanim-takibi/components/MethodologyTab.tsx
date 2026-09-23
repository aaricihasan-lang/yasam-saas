"use client";

import { SectionCard } from "./ui";

const ITEMS: { q: string; a: string }[] = [
  { q: "Aktif hesap ile görülme sinyali farkı", a: "\"Aktif hesap\" bir statüdür (hesap açık). \"Görülme sinyali\", uzmanın uygulamada son görüldüğü (heartbeat) an temelli yaklaşık bir aktiflik göstergesidir. Aktif bir hesap uzun süredir hiç görünmemiş olabilir; ikisi ayrıdır." },
  { q: "Başarılı giriş ile heartbeat farkı", a: "Başarılı giriş, uzmanın kimlik doğrulayıp oturum açtığı andır (giriş sayısı bunu sayar). Heartbeat, açık oturumun periyodik \"hâlâ buradayım\" sinyalidir; giriş sayısına eklenmez." },
  { q: "Son görülme ve aktif günün yaklaşık niteliği", a: "Son görülme ve aktif gün, heartbeat sinyaline dayanır ve throttle edilir; bu yüzden yaklaşık (~) gösterilir. \"Son anlamlı işlem\" ile aynı şey değildir." },
  { q: "Kullanıcı hesabı ile çalışma alanı farkı", a: "Giriş/etkinlik kullanıcı hesabına (user) aittir. Kayıtlar ve depolama, çalışma alanına (tenant/workspace) aittir. Bir çalışma alanında birden çok kullanıcı olabilir; ortak veriyi tek kişiye ait gibi göstermeyiz." },
  { q: "Modül izni, mevcut kayıt ve ölçülmüş işlem farkı", a: "İzin, uzmanın modüle erişebilmesidir. Mevcut kayıt, o modülde halihazırda bulunan kayıt sayısıdır (işlem sayısı değildir). Ölçülmüş işlem, başarıyla tamamlanmış ve olay olarak kaydedilmiş bir işlemdir." },
  { q: "Kısmi olay enstrümantasyonu", a: "Şu an yalnız dört modülde (Numeroloji, Doğaltaş, Refleksoloji, Danışan analizi) belirli oluşturma işlemleri olay üretir. Bu modüllerin dahi tüm kullanım yolları ölçülmez. Ölçülmeyen modüller \"Ölçülemiyor\" gösterilir; \"0 kullanım\" DEĞİL." },
  { q: "Ölçüm başlangıcı ve geçmiş veri sınırı", a: "Kullanım olayı metriklerinin ölçüm başlangıcı, ilk kayıtlı olaydan türetilir; bu enstrümantasyonun kesin başlangıç kanıtı değildir. Başlangıçtan önceki dönemler \"Ölçülemiyor\", kısmen kapsanan aralıklar \"~yaklaşık\" gösterilir." },
  { q: "Depolamada atfedilemeyen objeler", a: "Bazı fiziksel dosyaların sahibi (çalışma alanı) güvenilir biçimde belirlenemez. Bunlar \"atfedilemeyen\" olarak ayrı sayılır ve hiçbir uzmana yüklenmez." },
  { q: "Günlük snapshot henüz başlamadıysa", a: "Günlük depolama büyümesi, ancak günlük ölçüm etkinleştikten sonra birikir. Veri yokken geçmiş büyüme uydurulmaz; boş durum gösterilir." },
  { q: "TL maliyeti neden gösterilmiyor", a: "Gerçek sağlayıcı (Supabase/Vercel) fatura entegrasyonu olmadığından uzman başına TL maliyeti veya tahmini maliyet gerçek gider gibi gösterilmez. Depolama byte'ı yalnız teknik tüketim göstergesidir." },
];

export function MethodologyTab() {
  return (
    <SectionCard title="Ölçüm açıklamaları" subtitle="Metriklerin ne anlama geldiği, ne zamandan beri ölçüldüğü ve sınırları.">
      <div className="space-y-2">
        {ITEMS.map((it) => (
          <details key={it.q} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 open:bg-white">
            <summary className="cursor-pointer list-none font-semibold text-slate-800 marker:content-none focus-visible:ring-2 focus-visible:ring-fuchsia-400">
              <span className="mr-1 text-fuchsia-500" aria-hidden>▸</span>{it.q}
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{it.a}</p>
          </details>
        ))}
      </div>
    </SectionCard>
  );
}
