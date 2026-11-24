/**
 * GİRİŞ GÜVENLİĞİ F2-J — yönetici oturumunu telefona bağlama giriş noktası.
 * Resmî Android uygulaması (2.0.0+) bu adrese ANA ÇERÇEVE gezinmeyi yakalayıp yerel kanıt ekranını açar (WebView içinde
 * bu sayfa görünmez). Tarayıcıda açılırsa yalnız bilgi verir; adres parçasındaki değerler okunmaz ve kullanılmaz.
 */
export const metadata = { title: "Oturum doğrulama · Yaşam Sistemi", robots: { index: false, follow: false } };

export default function OturumBaglaBilgiPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-10 text-center">
      <h1 className="text-xl font-extrabold text-slate-900">Oturumu telefona bağla</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        Bu işlem yalnızca telefonunuzdaki <span className="font-semibold">Yaşam Sistemi</span> Android uygulamasında, eşleştirilmiş
        güvenilir telefonla yapılır. Tarayıcıda yapılacak bir işlem yoktur.
      </p>
    </main>
  );
}
