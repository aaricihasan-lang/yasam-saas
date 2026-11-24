/**
 * GİRİŞ GÜVENLİĞİ F2-C — QR bağlantısı uygulama dışında açıldığında gösterilen bilgi sayfası.
 * Bu sayfa HİÇBİR onay yapamaz (onay yalnız resmî Android uygulamasının güvenli anahtarıyla).
 * QR parametreleri URL fragment'ındadır; sunucuya gitmez ve burada okunmaz.
 */
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("auth.ui.mobile.approve");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function QrOnayBilgiPage() {
  const t = await getTranslations("auth.ui.mobile.approve");
  const b = (c: React.ReactNode) => <span className="font-semibold">{c}</span>;
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-10 text-center">
      <h1 className="text-xl font-extrabold text-slate-900">{t("title")}</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        {t.rich("p1", { b })}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        {t("p2")}
      </p>
    </main>
  );
}
