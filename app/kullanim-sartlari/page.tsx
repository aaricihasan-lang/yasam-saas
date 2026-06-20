import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Kullanım Şartları — Yaşam Sistemi",
  description: "Yaşam Sistemi platform kullanım şartları ve koşulları.",
};

export default function KullanimSartlariPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-violet-700 no-underline hover:text-violet-900"
      >
        ← Ana Sayfa
      </Link>

      <h1 className="mt-4 text-3xl font-black text-slate-950">Kullanım Şartları</h1>
      <p className="mt-3 text-sm text-slate-500">Son güncelleme: Haziran 2026</p>

      <div className="prose prose-slate mt-8 max-w-none text-sm leading-7">
        <p>
          Yaşam Sistemi platformunu kullanarak aşağıdaki koşulları kabul etmiş
          sayılırsınız.
        </p>

        <h2 className="mt-8 text-lg font-black text-slate-900">Hesap Sorumluluğu</h2>
        <p>
          Hesabınızın güvenliğinden siz sorumlusunuz. Şifrenizi kimseyle paylaşmayın.
          Yetkisiz erişim şüphesinde yöneticinize bildirin.
        </p>

        <h2 className="mt-8 text-lg font-black text-slate-900">Platform Kullanımı</h2>
        <p>
          Platform yalnızca kişisel ve profesyonel amaçlı kullanım içindir. Sistemi
          zararlı amaçlarla kullanmak yasaktır.
        </p>

        <h2 className="mt-8 text-lg font-black text-slate-900">Hizmet Değişiklikleri</h2>
        <p>
          Yaşam Sistemi, özellik ve planları önceden bildirerek değiştirme hakkını
          saklı tutar.
        </p>

        <h2 className="mt-8 text-lg font-black text-slate-900">İletişim</h2>
        <p>
          Sorularınız için{" "}
          <Link href="/iletisim" className="text-violet-700 underline">
            İletişim sayfamıza
          </Link>{" "}
          ulaşabilirsiniz.
        </p>
      </div>
    </main>
  );
}
