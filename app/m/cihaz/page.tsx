/**
 * GİRİŞ GÜVENLİĞİ F2-C — telefon eşleştirme giriş noktası.
 * Resmî Android uygulaması bu adrese TAM SAYFA gezinmeyi yakalayıp native eşleştirme ekranını açar
 * (WebView içinde bu sayfa görünmez). Tarayıcıda açılırsa yalnız bilgi verir.
 */
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("auth.ui.mobile.pairing");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function CihazEslestirmeBilgiPage() {
  const t = await getTranslations("auth.ui.mobile.pairing");
  const b = (c: React.ReactNode) => <span className="font-semibold">{c}</span>;
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-10 text-center">
      <h1 className="text-xl font-extrabold text-slate-900">{t("title")}</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        {t.rich("p1", { b })}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        {t.rich("p2", { b })}
      </p>
    </main>
  );
}
