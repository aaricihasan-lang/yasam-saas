"use client";

/**
 * GİRİŞ GÜVENLİĞİ F2-E — Owner: hesap kurtarma talepleri (bütün giriş yöntemlerini kaybeden kullanıcı).
 *
 * Akış: kullanıcı Owner'a ulaşır → Owner kimliği telefon / yüz yüze / kimlik belgesiyle doğrular ve
 * talep açar → 72 saat bekleme (DB'de zorunlu; kullanıcıya bildirim gider, kullanıcı iptal edebilir) →
 * Owner kimliği YENİDEN teyit eder + kendi parolasını girer → tek işlemde cihazlar/oturumlar/eski kodlar
 * iptal + 24 saatlik tek kullanımlık kurtarma bileti. Bilet yalnız bu ekranda bir kez gösterilir; e-postayla
 * gönderilmez. Kullanıcı girişte parola + bileti kullanır; MFA zorunluluğu hiçbir aşamada kapanmaz.
 * Kimlik güvenilir biçimde doğrulanamıyorsa talep REDDEDİLİR.
 */
import { useCallback, useEffect, useState } from "react";
import { ownerAdminHeaders } from "@/components/admin/notifications/ownerBellStore";

type Case = {
  id: string;
  user_id: string;
  email: string | null;
  name: string | null;
  state: "waiting" | "executed" | "cancelled" | "rejected" | "expired";
  verification_method: string;
  note: string;
  opened_at: string;
  not_before: string;
  expires_at: string;
  closed_at: string | null;
  close_reason: string | null;
  user_active_since_open: boolean;
};

const METHOD_LABEL: Record<string, string> = { telefon: "Kayıtlı numarasından telefonla", yuz_yuze: "Yüz yüze", kimlik_belgesi: "Kimlik belgesiyle" };
const STATE_LABEL: Record<Case["state"], [string, string]> = {
  waiting: ["Bekliyor", "bg-amber-50 text-amber-800"],
  executed: ["Tamamlandı", "bg-emerald-50 text-emerald-700"],
  cancelled: ["İptal edildi", "bg-slate-100 text-slate-600"],
  rejected: ["Reddedildi", "bg-rose-50 text-rose-700"],
  expired: ["Süresi doldu", "bg-slate-100 text-slate-600"],
};

const fmt = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" });
  } catch {
    return iso;
  }
};

function remainingText(target: string, nowMs: number): string {
  const ms = Date.parse(target) - nowMs;
  if (!Number.isFinite(ms) || ms <= 0) return "bekleme doldu";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h} sa ${m} dk kaldı`;
}

const inputCls = "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200";
const btn = "flex h-10 items-center justify-center rounded-lg px-3 text-xs font-bold transition disabled:opacity-60";

export default function HesapKurtarmaPage() {
  const [cases, setCases] = useState<Case[] | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [method, setMethod] = useState("");
  const [note, setNote] = useState("");

  const [execFor, setExecFor] = useState<string | null>(null);
  const [execConfirm, setExecConfirm] = useState(false);
  const [execPassword, setExecPassword] = useState("");
  const [ticket, setTicket] = useState<{ caseId: string; ticket: string; expiresAt: string | null } | null>(null);

  const load = useCallback(async () => {
    const headers = ownerAdminHeaders();
    if (!headers) { setError("Yönetici oturumu bulunamadı."); return; }
    try {
      const res = await fetch("/api/admin/recovery-cases", { headers, cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { cases?: Case[]; now?: string; error?: string };
      if (!res.ok) { setError(j.error ?? "Liste alınamadı."); return; }
      setError(null);
      setCases(Array.isArray(j.cases) ? j.cases : []);
      if (j.now) setServerOffset(Date.parse(j.now) - Date.now());
    } catch {
      setError("Bağlantı hatası. Lütfen yeniden deneyin.");
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => { window.clearTimeout(id); window.clearInterval(t); };
  }, [load]);

  async function call(key: string, url: string, body: unknown): Promise<Record<string, unknown> | null> {
    const headers = ownerAdminHeaders(true);
    if (!headers || busy) return null;
    setBusy(key);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) { setError(typeof j.error === "string" ? j.error : "İşlem yapılamadı."); return null; }
      return j;
    } catch {
      setError("Bağlantı hatası. Lütfen yeniden deneyin.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function open() {
    const j = await call("open", "/api/admin/recovery-cases", { email, verificationMethod: method, note });
    if (!j) return;
    setEmail(""); setMethod(""); setNote("");
    setMsg(`Talep açıldı. En erken ${fmt(typeof j.notBefore === "string" ? j.notBefore : null)} tarihinde yürütülebilir. Kullanıcıya bildirim gönderildi.`);
    void load();
  }

  async function close(c: Case, action: "cancel" | "reject") {
    const reason = action === "reject" ? "Kimlik güvenilir biçimde doğrulanamadı" : "Owner iptal etti";
    const j = await call(`${action}:${c.id}`, `/api/admin/recovery-cases/${c.id}`, { action, reason });
    if (!j) return;
    setMsg(action === "reject" ? "Talep reddedildi." : "Talep iptal edildi.");
    void load();
  }

  async function execute(c: Case) {
    const j = await call(`exec:${c.id}`, `/api/admin/recovery-cases/${c.id}`, { action: "execute", identityReconfirmed: execConfirm, password: execPassword });
    setExecPassword("");
    if (!j || typeof j.ticket !== "string") return;
    setExecFor(null);
    setExecConfirm(false);
    setTicket({ caseId: c.id, ticket: j.ticket, expiresAt: typeof j.ticketExpiresAt === "string" ? j.ticketExpiresAt : null });
    setMsg(`Kurtarma yürütüldü: ${Number(j.devicesRevoked) || 0} cihaz iptal edildi, ${Number(j.sessionsClosed) || 0} oturum kapatıldı.`);
    void load();
  }

  const nowMs = now + serverOffset;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6" data-testid="recovery-admin-page">
      <h1 className="text-xl font-black text-slate-900">Hesap kurtarma</h1>
      <p className="mt-1 text-sm text-slate-600">
        Telefonunu, e-postasını ve kurtarma kodlarını kaybeden kullanıcılar içindir. Talep açıldıktan sonra <strong>72 saat</strong> beklenir;
        bu sürede kullanıcıya bildirim gider ve kullanıcı talebi iptal edebilir. Kimliği güvenilir biçimde doğrulayamıyorsanız talebi reddedin.
      </p>

      {error && <p role="alert" data-testid="recovery-admin-error" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
      {msg && <p role="status" data-testid="recovery-admin-msg" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{msg}</p>}

      {ticket && (
        <div className="mt-4 rounded-xl border-2 border-violet-300 bg-violet-50 p-4" data-testid="recovery-ticket">
          <p className="text-sm font-bold text-violet-900">Tek kullanımlık kurtarma bileti — bir daha gösterilmeyecek</p>
          <p className="mt-2 break-all font-mono text-lg font-extrabold tracking-wider text-violet-900" data-testid="recovery-ticket-value">{ticket.ticket}</p>
          <p className="mt-2 text-xs text-violet-900">
            Bileti kullanıcıya <strong>yüz yüze veya kayıtlı numarasından telefonla</strong> okuyun; e-posta / mesajla göndermeyin.
            Geçerlilik: {fmt(ticket.expiresAt)}. Kullanıcı girişte parolasını girip “kurtarma kodu kullan” bölümüne bu bileti yazar.
            Parolasını da hatırlamıyorsa önce kullanıcı sayfasından parolasını sıfırlayın.
          </p>
          <button type="button" className={`${btn} mt-3 bg-violet-600 text-white`} onClick={() => setTicket(null)}>Bileti ilettim, gizle</button>
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-black text-slate-900">Yeni kurtarma talebi</h2>
        <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); void open(); }}>
          <input type="email" data-testid="recovery-admin-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Kullanıcının kayıtlı e-posta adresi" aria-label="Kullanıcı e-postası" className={inputCls} />
          <select data-testid="recovery-admin-method" value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Kimlik doğrulama yöntemi" className={inputCls}>
            <option value="">Kimliği nasıl doğruladınız?</option>
            <option value="telefon">Kayıtlı numarasından telefonla</option>
            <option value="yuz_yuze">Yüz yüze</option>
            <option value="kimlik_belgesi">Kimlik belgesiyle</option>
          </select>
          <textarea data-testid="recovery-admin-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500}
            placeholder="Doğrulamanın ayrıntısı (ör. kayıtlı numaradan arandı, doğum tarihi ve son danışan randevusu teyit edildi)" aria-label="Doğrulama açıklaması"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200" />
          <button type="submit" data-testid="recovery-admin-open" disabled={busy !== null || !email || !method || note.trim().length < 10}
            className={`${btn} w-full bg-violet-600 text-white hover:bg-violet-700`}>
            Talebi aç (72 saat bekleme başlar)
          </button>
        </form>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-black text-slate-900">Talepler</h2>
        {cases === null ? (
          <p className="mt-2 text-sm text-slate-500">Yükleniyor…</p>
        ) : cases.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500" data-testid="recovery-admin-empty">Kurtarma talebi yok.</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {cases.map((c) => {
              const [label, cls] = STATE_LABEL[c.state] ?? [c.state, "bg-slate-100 text-slate-600"];
              const ready = c.state === "waiting" && Date.parse(c.not_before) <= nowMs;
              return (
                <li key={c.id} data-testid="recovery-case-row" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-bold text-slate-900">{c.name || "—"}</p>
                      <p className="break-all text-xs text-slate-500">{c.email}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`} data-testid="recovery-case-state">{label}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    {METHOD_LABEL[c.verification_method] ?? c.verification_method} · açıldı {fmt(c.opened_at)}
                    {c.state === "waiting" ? ` · en erken ${fmt(c.not_before)} (${remainingText(c.not_before, nowMs)})` : c.closed_at ? ` · kapandı ${fmt(c.closed_at)}` : ""}
                  </p>
                  <p className="mt-1 break-words text-xs text-slate-500">{c.note}</p>
                  {c.state === "waiting" && c.user_active_since_open && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800" data-testid="recovery-case-user-active">
                      Kullanıcı talep açıldıktan sonra ikinci doğrulamayla giriş yaptı — hesaba hâlâ erişimi var. Talep yürütülemez; iptal edin.
                    </p>
                  )}
                  {c.state === "waiting" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" disabled={busy !== null || !ready || c.user_active_since_open} data-testid="recovery-case-execute-open"
                        onClick={() => { setExecFor(c.id); setExecConfirm(false); setExecPassword(""); }}
                        className={`${btn} bg-violet-600 text-white hover:bg-violet-700`}>
                        {ready ? "Kurtarmayı yürüt" : "Bekleme sürüyor"}
                      </button>
                      <button type="button" disabled={busy !== null} data-testid="recovery-case-reject" onClick={() => void close(c, "reject")}
                        className={`${btn} border border-rose-200 bg-rose-50 text-rose-700`}>Reddet (kimlik doğrulanamadı)</button>
                      <button type="button" disabled={busy !== null} data-testid="recovery-case-cancel-admin" onClick={() => void close(c, "cancel")}
                        className={`${btn} border border-slate-200 bg-white text-slate-700`}>İptal et</button>
                    </div>
                  )}
                  {execFor === c.id && (
                    <form className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); void execute(c); }}>
                      <label className="flex items-start gap-2 text-xs font-semibold text-slate-800">
                        <input type="checkbox" data-testid="recovery-exec-confirm" checked={execConfirm} onChange={(e) => setExecConfirm(e.target.checked)} className="mt-0.5 h-4 w-4" />
                        Kullanıcının kimliğini bugün yeniden teyit ettim. Bütün cihazları iptal edilecek, oturumları kapanacak ve eski kurtarma kodları geçersiz olacak.
                      </label>
                      <input type="password" data-testid="recovery-exec-password" value={execPassword} onChange={(e) => setExecPassword(e.target.value)}
                        autoComplete="current-password" placeholder="Owner parolanız" aria-label="Owner parolanız" className={inputCls} />
                      <button type="submit" data-testid="recovery-exec-submit" disabled={busy !== null || !execConfirm || !execPassword}
                        className={`${btn} w-full bg-rose-600 text-white hover:bg-rose-700`}>Kurtarmayı yürüt ve bilet üret</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
