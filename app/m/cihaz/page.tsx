/**
 * GİRİŞ GÜVENLİĞİ F2-C — telefon eşleştirme giriş noktası.
 * Resmî Android uygulaması bu adrese TAM SAYFA gezinmeyi yakalayıp native eşleştirme ekranını açar
 * (WebView içinde bu sayfa görünmez). Tarayıcıda açılırsa yalnız bilgi verir.
 */
export const metadata = { title: "Telefon eşleştirme · Yaşam Sistemi", robots: { index: false, follow: false } };

export default function CihazEslestirmeBilgiPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-10 text-center">
      <h1 className="text-xl font-extrabold text-slate-900">Telefonu güvenilir cihaz yap</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        Eşleştirme yalnızca telefonunuzdaki <span className="font-semibold">Yaşam Sistemi</span> Android uygulamasından yapılır.
        Uygulamayı açın ve bu bağlantıya uygulama içinden dokunun.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        Eşleştirmeden sonra yöneticiniz sizi kayıtlı numaranızdan arayacak; ekranınızdaki kodu <span className="font-semibold">siz</span> okuyacaksınız.
      </p>
    </main>
  );
}
