"use client";

/**
 * GİRİŞ GÜVENLİĞİ F2-D — Owner e-posta gönderim durumu.
 *
 * Gösterir: sağlayıcı yapılandırması (var/yok — gizli değer ASLA), kayan 24 saat gönderim sayıları,
 * kota eşikleri, son hata kodu, doğrulanmış e-posta sayısı, açık uyarılar. Owner kendi adresine kod
 * içermeyen bir test iletisi gönderebilir. Alıcı adresleri ve kodlar bu ekranda yoktur.
 * Yetki sunucuda/DB'de (yalnız is_super_admin Owner).
 */
import { useCallback, useEffect, useState } from "react";
import { ownerAdminHeaders } from "@/components/admin/notifications/ownerBellStore";

type Status = {
  configured: boolean;
  provider: string | null;
  configIssue?: string | null;
  pepperConfigured: boolean;
  limits: { dailyLimit: number; warnAt: number };
  hourlyLimit?: number | null;
  selfServiceScope?: { roles: string[]; ignored: number; isDefault: boolean };
  testRecipient?: { available: boolean; masked: string | null; issue: string | null };
  last24h: { sent: number; failed: number; reserved: number } | null;
  lastFailure: { code: string | null; at: string | null } | null;
  lastSuccessAt: string | null;
  verifiedUsers: number;
  openAlerts: { reason: string | null; at: string }[];
};

/** F3: kayıtlı test hesabı alıcısı kullanılamıyorsa nedeni (yalnız kod; adres sunucudan gelmez). */
const TEST_RECIPIENT_ISSUE: Record<string, string> = {
  invalid_address: "ayardaki adres geçersiz",
  not_registered: "adres kayıtlı bir hesaba ait değil",
  ambiguous: "adres birden çok hesapta kayıtlı",
  not_eligible: "hesap etkin değil / demo / arşivde / pasif",
  lookup_failed: "hesap kontrol edilemedi",
};

const SCOPE_LABEL: Record<string, string> = { owner: "yalnız Owner", admin: "bütün yöneticiler", expert: "bütün uzmanlar" };

const ERROR_LABEL: Record<string, string> = {
  quota: "Sağlayıcının gönderim sınırına ulaşıldı",
  kota_doldu: "Günlük gönderim sınırına ulaşıldı",
  kota_esigi: "Günlük gönderim sınırına yaklaşıldı",
  oauth_invalid_grant: "Google yetkisi geçersiz (yeniden yetkilendirme gerekir)",
  smtp_auth_failed: "SMTP kullanıcı adı / parola reddedildi",
  smtp_tls_error: "SMTP güvenli bağlantı (TLS) kurulamadı",
  oauth_error: "Google yetki yenilemesi başarısız",
  provider_down: "E-posta sağlayıcısına ulaşılamadı",
  not_configured: "Sağlayıcı yapılandırılmamış",
  rejected: "İleti reddedildi",
  invalid_recipient: "Geçersiz alıcı adresi",
  timeout: "Zaman aşımı",
  network: "Ağ hatası",
};

/** F2-M: SMTP yapılandırma sorunu (yalnız kod; değerler sunucudan hiç gelmez). */
const SMTP_ISSUE_LABEL: Record<string, string> = {
  smtp_host_missing: "sunucu adı (SMTP_HOST) yok",
  smtp_host_invalid: "sunucu adı geçersiz (IP / şema / port yazılmamalı)",
  smtp_port_invalid: "port yalnız 465 (TLS) veya 587 (STARTTLS) olabilir",
  smtp_user_missing: "kullanıcı adı (SMTP_USER) yok",
  smtp_password_missing: "parola (SMTP_PASSWORD) yok",
  smtp_sender_invalid: "gönderen adresi (SMTP_SENDER) geçersiz",
  smtp_sender_mismatch: "gönderen adresi kullanıcı adıyla aynı olmalı",
};

const fmt = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" });
  } catch {
    return iso;
  }
};

export default function EpostaDurumuPage() {
  const [st, setSt] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<"test" | "test_account" | "ack" | null>(null);
  const [testAccountConfirm, setTestAccountConfirm] = useState(false);

  const load = useCallback(async () => {
    const headers = ownerAdminHeaders();
    if (!headers) { setError("Yönetici oturumu bulunamadı."); return; }
    try {
      const res = await fetch("/api/admin/email-status", { headers, cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as Status & { error?: string };
      if (!res.ok) { setError(j.error ?? "Durum alınamadı."); return; }
      setError(null);
      setSt(j);
    } catch {
      setError("Bağlantı hatası. Lütfen yeniden deneyin.");
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  async function act(action: "test" | "test_account" | "ack") {
    const headers = ownerAdminHeaders(true);
    if (!headers || busy) return;
    setBusy(action);
    setMsg(null);
    try {
      const payload = action === "test_account" ? { action: "test", target: "test_account" } : { action };
      const res = await fetch("/api/admin/email-status", { method: "POST", headers, body: JSON.stringify(payload) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string; closed?: number };
      if (res.ok && j.ok) {
        setMsg(action === "test" ? "Test iletisi kendi adresinize gönderildi. Gelen kutunuzu (ve istenmeyen klasörünü) kontrol edin."
          : action === "test_account" ? "Test iletisi kayıtlı test hesabının adresine gönderildi. Gelen kutusunu (ve istenmeyen klasörünü) kontrol edin."
            : `${j.closed ?? 0} uyarı kapatıldı.`);
        if (action === "test_account") setTestAccountConfirm(false);
      } else {
        setMsg(`${j.error ?? "İşlem başarısız."}${j.code ? ` (${ERROR_LABEL[j.code] ?? j.code})` : ""}`);
      }
    } catch {
      setMsg("Bağlantı hatası.");
    } finally {
      setBusy(null);
      void load();
    }
  }

  const used = st?.last24h ? st.last24h.sent + st.last24h.failed + st.last24h.reserved : 0;
  const pct = st ? Math.min(100, Math.round((used / Math.max(1, st.limits.dailyLimit)) * 100)) : 0;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6" data-testid="email-status-page">
      <h1 className="text-xl font-extrabold text-slate-900">E-posta doğrulama gönderimi</h1>
      <p className="mt-1 text-sm text-slate-600">
        Giriş ve e-posta doğrulama kodlarının gönderim durumu. Gönderim durursa e-posta yöntemi geçici olarak kullanılamaz;
        ikinci doğrulama <span className="font-semibold">atlanmaz</span>, Android QR yöntemi etkilenmez.
      </p>

      {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
      {msg && <p role="status" className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">{msg}</p>}

      {st && (
        <>
          <section className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Yapılandırma</p>
              <p className={`mt-1 text-lg font-extrabold ${st.configured ? "text-emerald-700" : "text-amber-700"}`} data-testid="email-configured">
                {st.configured ? "Hazır" : "Yapılandırılmamış"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Sağlayıcı: {st.provider === "gmail" ? "Google Workspace (Gmail API)" : st.provider === "smtp" ? "Kurumsal posta (SMTP)" : st.provider === "synthetic" ? "Sentetik (yalnız test)" : "yok"} ·
                Kod anahtarı: {st.pepperConfigured ? "var" : "yok"}
              </p>
              {st.hourlyLimit != null && (
                <p className="mt-1 text-xs text-slate-500" data-testid="email-hourly-limit">Saatlik gönderim tavanı: {st.hourlyLimit}</p>
              )}
              {st.selfServiceScope && (
                <p className="mt-1 text-xs text-slate-500" data-testid="email-self-service-scope">
                  Kullanıcı e-posta işlemleri: {st.selfServiceScope.roles.map((r) => SCOPE_LABEL[r] ?? r).join(", ")}
                  {st.selfServiceScope.isDefault ? " (varsayılan)" : ""}
                  {st.selfServiceScope.ignored > 0 ? ` · tanınmayan ${st.selfServiceScope.ignored} değer yok sayıldı` : ""}
                </p>
              )}
              {st.configIssue && (
                <p className="mt-1 text-xs font-semibold text-amber-700" data-testid="email-config-issue">
                  SMTP ayarı eksik / geçersiz: {SMTP_ISSUE_LABEL[st.configIssue] ?? st.configIssue}
                </p>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Son 24 saat</p>
              <p className="mt-1 text-lg font-extrabold text-slate-900">
                {used} / {st.limits.dailyLimit} <span className="text-xs font-semibold text-slate-500">(uyarı {st.limits.warnAt})</span>
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                <div className={`h-full ${used >= st.limits.warnAt ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Gönderildi {st.last24h?.sent ?? 0} · Hata {st.last24h?.failed ?? 0} · Bekleyen {st.last24h?.reserved ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Son başarılı gönderim</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{fmt(st.lastSuccessAt)}</p>
              <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-500">Son hata</p>
              <p className="mt-1 text-sm font-bold text-slate-900">
                {st.lastFailure?.code ? `${ERROR_LABEL[st.lastFailure.code] ?? st.lastFailure.code} · ${fmt(st.lastFailure.at)}` : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Doğrulanmış e-posta</p>
              <p className="mt-1 text-lg font-extrabold text-slate-900">{st.verifiedUsers} hesap</p>
              <p className="mt-1 text-xs text-slate-500">E-posta yöntemi yalnız adresini doğrulamış hesaplara sunulur.</p>
            </div>
          </section>

          <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-bold text-slate-900">Açık uyarılar</p>
            {st.openAlerts.length === 0 ? (
              <p className="mt-1 text-xs text-slate-500">Açık uyarı yok.</p>
            ) : (
              <ul className="mt-2 space-y-1" data-testid="email-open-alerts">
                {st.openAlerts.map((a, i) => (
                  <li key={i} className="text-sm text-orange-800">{ERROR_LABEL[a.reason ?? ""] ?? a.reason ?? "Uyarı"} · {fmt(a.at)}</li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="email-test-send"
                disabled={busy !== null || !st.configured}
                onClick={() => void act("test")}
                className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {busy === "test" ? "Gönderiliyor…" : "Kendime test iletisi gönder"}
              </button>
              {st.openAlerts.length > 0 && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void act("ack")}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-60"
                >
                  Sorun giderildi — uyarıları kapat
                </button>
              )}
              <button type="button" onClick={() => void load()} className="rounded-lg px-3 py-2 text-sm font-bold text-violet-700 hover:underline">
                Yenile
              </button>
            </div>
            {st.testRecipient && (st.testRecipient.available || st.testRecipient.issue !== "not_configured") && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="email-test-account">
                <p className="text-sm font-bold text-slate-800">Kayıtlı test hesabına test iletisi</p>
                {st.testRecipient.available ? (
                  <>
                    <p className="mt-1 text-xs text-slate-600">
                      Alıcı (sunucu ayarından, değiştirilemez): <span className="font-mono" data-testid="email-test-account-masked">{st.testRecipient.masked}</span>
                    </p>
                    <label className="mt-2 flex items-start gap-2 text-xs text-slate-700">
                      <input type="checkbox" data-testid="email-test-account-confirm" checked={testAccountConfirm} onChange={(e) => setTestAccountConfirm(e.target.checked)} className="mt-0.5" />
                      Alıcının benim eriştiğim kayıtlı test hesabı olduğunu kontrol ettim. (Kod içermez; saatte en çok 5 test.)
                    </label>
                    <button
                      type="button"
                      data-testid="email-test-account-send"
                      disabled={busy !== null || !st.configured || !testAccountConfirm}
                      onClick={() => void act("test_account")}
                      className="mt-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
                    >
                      {busy === "test_account" ? "Gönderiliyor…" : "Test hesabına test iletisi gönder"}
                    </button>
                  </>
                ) : (
                  <p className="mt-1 text-xs font-semibold text-amber-700" data-testid="email-test-account-issue">
                    Kullanılamıyor: {TEST_RECIPIENT_ISSUE[st.testRecipient.issue ?? ""] ?? st.testRecipient.issue}
                  </p>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
