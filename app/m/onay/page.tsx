/**
 * GİRİŞ GÜVENLİĞİ F2-C — QR bağlantısı uygulama dışında açıldığında gösterilen bilgi sayfası.
 * Bu sayfa HİÇBİR onay yapamaz (onay yalnız resmî Android uygulamasının güvenli anahtarıyla).
 * QR parametreleri URL fragment'ındadır; sunucuya gitmez ve burada okunmaz.
 */
export const metadata = { title: "Giriş onayı · Yaşam Sistemi", robots: { index: false, follow: false } };

export default function QrOnayBilgiPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-10 text-center">
      <h1 className="text-xl font-extrabold text-slate-900">Giriş onayı</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        Bu QR kodu yalnızca telefonunuzdaki <span className="font-semibold">Yaşam Sistemi</span> Android uygulamasıyla onaylanabilir.
        Uygulama yüklü ve telefonunuz eşleştirilmişse QR kodu telefonun kamerasıyla yeniden okutun.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        Bu sayfa giriş onayı veremez. Giriş isteğini siz başlatmadıysanız hiçbir işlem yapmayın.
      </p>
    </main>
  );
}
