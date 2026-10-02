import type { Metadata } from "next";
import Link from "next/link";
import {
  CONTACT_EMAIL,
  CUSTOMER_SERVICE_DISPLAY,
  buildMailtoHref,
  buildTelHref,
} from "@/lib/contact/info";

export const metadata: Metadata = {
  title: "İletişim — Yaşam Sistemi",
  description: "Yaşam Sistemi'ne e-posta, telefon veya uygulama içi destek kanalıyla ulaşın.",
};

/**
 * İletişim (P1-6): gerçek kanallar — tek kaynak lib/contact/info.ts.
 * Gizlilik Politikası "Haklarınız" bölümü buraya yönlendirir.
 */
export default function IletisimPage() {
  return (
    <main className="mx-auto w-full min-w-0 max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-violet-700 no-underline hover:text-violet-900"
      >
        ← Ana Sayfa
      </Link>

      <h1 className="mt-4 text-3xl font-black text-slate-950">İletişim</h1>
      <p className="mt-3 text-base text-slate-600">
        Sorularınız, destek talepleriniz, üyelik işlemleri ve kişisel verilerinize ilişkin
        başvurularınız için aşağıdaki kanallardan bize ulaşabilirsiniz.
      </p>

      <div className="mt-10 space-y-4">
        <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-5 py-5 shadow-sm sm:px-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">E-posta</p>
          <a
            href={buildMailtoHref()}
            className="mt-2 inline-block break-all text-base font-bold text-slate-900 underline decoration-violet-300 underline-offset-4 hover:text-violet-800"
          >
            {CONTACT_EMAIL}
          </a>
          <p className="mt-1 text-sm text-slate-600">Destek, üyelik ve kişisel veri başvuruları.</p>
        </div>

        <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-5 py-5 shadow-sm sm:px-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">Telefon</p>
          <a
            href={buildTelHref()}
            className="mt-2 inline-block text-base font-bold text-slate-900 underline decoration-violet-300 underline-offset-4 hover:text-violet-800"
          >
            {CUSTOMER_SERVICE_DISPLAY}
          </a>
          <p className="mt-1 text-sm text-slate-600">Müşteri hizmetleri hattı.</p>
        </div>

        <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-5 py-5 shadow-sm sm:px-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">
            Uygulama İçi Destek
          </p>
          <p className="mt-2 text-sm text-slate-700">
            Oturum açtıktan sonra <strong>Ayarlar → Admin ile İrtibat</strong> bölümünden mesaj
            gönderebilirsiniz. Parola, üyelik ve modül erişimiyle ilgili talepleriniz için de bu kanalı
            kullanabilirsiniz.
          </p>
        </div>
      </div>

      <p className="mt-10 text-sm text-slate-500">
        Danışanı olduğunuz bir uzmanın tuttuğu kayıtlarla ilgili talepleriniz için öncelikle o uzmana
        başvurun. Ayrıntılar:{" "}
        <Link href="/gizlilik-politikasi" className="font-semibold text-violet-700 underline">
          Gizlilik Politikası
        </Link>
        .
      </p>
    </main>
  );
}
