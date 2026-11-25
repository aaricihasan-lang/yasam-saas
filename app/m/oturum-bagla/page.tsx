/**
 * GİRİŞ GÜVENLİĞİ F2-J — yönetici oturumunu telefona bağlama giriş noktası.
 * Resmî Android uygulaması (2.0.0+) bu adrese ANA ÇERÇEVE gezinmeyi yakalayıp yerel kanıt ekranını açar (WebView içinde
 * bu sayfa görünmez). Tarayıcıda açılırsa yalnız bilgi verir; adres parçasındaki değerler okunmaz ve kullanılmaz.
 */
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("auth.ui.mobile.sessionBind");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function OturumBaglaBilgiPage() {
  const t = await getTranslations("auth.ui.mobile.sessionBind");
  const b = (c: React.ReactNode) => <span className="font-semibold">{c}</span>;
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-10 text-center">
      <h1 className="text-xl font-extrabold text-slate-900">{t("title")}</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        {t.rich("p1", { b })}
      </p>
    </main>
  );
}
