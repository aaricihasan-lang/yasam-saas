"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";

const inputClass =
  "h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-700 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100";

export default function RegisterPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const name = fullName.trim();
    const mail = email.trim().toLowerCase();
    const pass = password.trim();
    const passRepeat = passwordRepeat.trim();

    if (!name || !mail || !pass) {
      showToast({
        title: "İşlem başarısız",
        message: "Tüm alanları doldurunuz.",
        type: "error",
      });
      return;
    }

    if (pass !== passRepeat) {
      showToast({
        title: "İşlem başarısız",
        message: "Şifreler eşleşmiyor.",
        type: "error",
      });
      return;
    }

    setSaving(true);

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: name, email: mail, password: pass }),
    });

    const json = (await res.json()) as { ok?: boolean; error?: string };

    if (!res.ok || !json.ok) {
      showToast({
        title: "İşlem başarısız",
        message: json.error ?? "Kayıt tamamlanamadı.",
        type: "error",
      });
      setSaving(false);
      return;
    }

    showToast({
      title: "Başarılı",
      message:
        "Hesabınız oluşturuldu. Yönetici onayından sonra giriş yapabilirsiniz.",
      type: "success",
    });

    setSaving(false);
    router.push("/?login=1");
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(135deg,#f8fafc_0%,#eef2ff_46%,#fdf2f8_100%)] text-slate-950">
      <div className="pointer-events-none absolute left-[-130px] top-[-150px] h-[330px] w-[330px] rounded-full bg-violet-200/38 blur-3xl" />
      <div className="pointer-events-none absolute right-[-110px] top-[70px] h-[360px] w-[360px] rounded-full bg-cyan-200/36 blur-3xl" />

      <div className="relative z-10 flex min-h-screen w-full items-center justify-center px-5 py-10 md:px-8">
        <div className="w-full max-w-[560px] md:max-w-[620px]">
        <div className="relative overflow-hidden rounded-[30px] border border-white/80 bg-white/92 p-8 shadow-[0_30px_90px_rgba(15,23,42,0.28)] backdrop-blur-2xl md:p-10">
          <div className="pointer-events-none absolute right-[-70px] top-[-80px] h-[180px] w-[180px] rounded-full bg-violet-200/70 blur-3xl" />
          <div className="pointer-events-none absolute bottom-[-80px] left-[-80px] h-[180px] w-[180px] rounded-full bg-cyan-200/50 blur-3xl" />

          <div className="relative z-10">
            <div className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">
              Uzman Kaydı
            </div>
            <h1 className="mt-4 text-3xl font-black text-slate-950 md:text-4xl">Kayıt Ol</h1>
            <p className="mt-2 text-base leading-7 text-slate-500 md:text-lg">
              Uzman hesabınızı oluşturun. Yönetici onayından sonra giriş
              yapabilirsiniz.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-base font-semibold text-slate-700">
                  Ad Soyad
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Adınız Soyadınız"
                  className={inputClass}
                  autoComplete="name"
                />
              </div>

              <div>
                <label className="mb-2 block text-base font-semibold text-slate-700">
                  E-posta
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="uzman@ornek.com"
                  className={inputClass}
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="mb-2 block text-base font-semibold text-slate-700">
                  Şifre
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={inputClass}
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className="mb-2 block text-base font-semibold text-slate-700">
                  Şifre Tekrar
                </label>
                <input
                  type="password"
                  value={passwordRepeat}
                  onChange={(e) => setPasswordRepeat(e.target.value)}
                  placeholder="••••••••"
                  className={inputClass}
                  autoComplete="new-password"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-slate-950 via-violet-900 to-fuchsia-700 px-4 text-base font-bold text-white shadow-xl shadow-violet-200 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Kaydediliyor…
                  </span>
                ) : (
                  "Kayıt Ol"
                )}
              </button>
            </form>

            <p className="relative z-10 mt-5 text-center text-sm font-semibold text-slate-600">
              Zaten hesabınız var mı?{" "}
              <Link
                href="/?login=1"
                className="font-black text-violet-700 no-underline hover:text-violet-900"
              >
                Giriş yapın
              </Link>
            </p>
          </div>
        </div>
        </div>
      </div>
    </main>
  );
}
