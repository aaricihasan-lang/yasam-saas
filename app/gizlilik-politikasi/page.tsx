import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Gizlilik Politikası — Yaşam Sistemi",
  description: "Yaşam Sistemi gizlilik politikası ve veri koruma ilkeleri.",
};

export default function GizlilikPolitikasiPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-violet-700 no-underline hover:text-violet-900"
      >
        ← Ana Sayfa
      </Link>

      <h1 className="mt-4 text-3xl font-black text-slate-950">Gizlilik Politikası</h1>
      <p className="mt-3 text-sm text-slate-500">Son güncelleme: Haziran 2026</p>

      <div className="prose prose-slate mt-8 max-w-none text-sm leading-7">
        <p>
          Yaşam Sistemi olarak kişisel verilerinizi ve çalışma içeriklerinizi güvenle
          saklıyor, üçüncü taraflarla paylaşmıyor ve gizliliğinizi her koşulda ön planda
          tutuyoruz.
        </p>

        <h2 className="mt-8 text-lg font-black text-slate-900">Hangi Verileri Topluyoruz?</h2>
        <p>
          Kayıt sırasında ad, e-posta adresi ve şifreniz alınır. Platform kullanımı
          sırasında danışan kayıtları, analizler, notlar ve yüklenen dosyalar yalnızca
          size ait kiracı alanında saklanır.
        </p>

        <h2 className="mt-8 text-lg font-black text-slate-900">Verileriniz Kime Açık?</h2>
        <p>
          Özel çalışma verilerinize yalnızca siz erişebilirsiniz. Sistem yöneticileri
          ve platform sahibi bu verileri görüntüleyemez, inceleyemez veya üçüncü
          taraflarla paylaşamaz.
        </p>

        <h2 className="mt-8 text-lg font-black text-slate-900">İletişim</h2>
        <p>
          Gizlilik ile ilgili sorularınız için{" "}
          <Link href="/iletisim" className="text-violet-700 underline">
            İletişim sayfamıza
          </Link>{" "}
          ulaşabilirsiniz.
        </p>
      </div>
    </main>
  );
}
