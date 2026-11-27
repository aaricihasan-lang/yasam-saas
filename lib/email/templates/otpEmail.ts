/**
 * GİRİŞ GÜVENLİĞİ F2-D — Türkçe doğrulama kodu e-postası. Saf; IO yok.
 * Kimlik avına karşı: BAĞLANTI / buton YOK (kullanıcı kodu yalnız açık olan Yaşam Sistemi ekranına girer),
 * ek dosya yok, uzaktan görsel yok. Kod ve geçerlilik süresi açıkça yazılır; paylaşılmaması uyarılır.
 */
export type OtpPurpose = "login" | "verify_email" | "owner_test" | "change_email" | "step_up";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderOtpEmail(input: { purpose: OtpPurpose; code?: string; name?: string | null; minutes?: number }): { subject: string; text: string; html: string } {
  const minutes = input.minutes ?? 3;
  const hello = input.name ? `Merhaba ${input.name},` : "Merhaba,";
  if (input.purpose === "owner_test") {
    const subject = "Yaşam Sistemi — e-posta gönderim testi";
    const text = `${hello}\n\nBu ileti Yaşam Sistemi yönetim panelinden başlatılan bir gönderim testidir. Herhangi bir işlem yapmanız gerekmez.\n\nYaşam Sistemi`;
    return { subject, text, html: wrap(`<p>${esc(hello)}</p><p>Bu ileti Yaşam Sistemi yönetim panelinden başlatılan bir <strong>gönderim testidir</strong>. Herhangi bir işlem yapmanız gerekmez.</p>`) };
  }
  const code = String(input.code ?? "");
  if (!/^[0-9]{6}$/.test(code)) throw new Error("otp şablonu: kod 6 hane olmalı");
  const action = input.purpose === "login" ? "Yaşam Sistemi'ne giriş"
    : input.purpose === "change_email" ? "Yaşam Sistemi hesabınızın e-posta adresini bu adresle değiştirme"
      : input.purpose === "step_up" ? "Yaşam Sistemi yönetim panelindeki kritik bir işlemi onaylama"
      : "Yaşam Sistemi e-posta adresinizi doğrulama";
  // Kod KONU satırına yazılmaz: kilit ekranı / bildirim önizlemeleri, posta istemcisi listeleri ve sağlayıcı günlükleri konuyu
  // gösterir. Kod yalnız ileti gövdesinde (metin + HTML) bulunur.
  const subject = "Yaşam Sistemi doğrulama kodunuz";
  const text = [
    hello,
    "",
    `${action} işleminiz için doğrulama kodunuz:`,
    "",
    `    ${code}`,
    "",
    `Kod ${minutes} dakika geçerlidir ve yalnızca bir kez kullanılabilir.`,
    "Bu kodu kimseyle paylaşmayın. Yaşam Sistemi çalışanları bu kodu sizden asla istemez.",
    "Bu işlemi siz başlatmadıysanız bu iletiyi dikkate almayın ve parolanızı değiştirin.",
    "",
    "Yaşam Sistemi",
  ].join("\n");
  const html = wrap(`
    <p style="margin:0 0 12px">${esc(hello)}</p>
    <p style="margin:0 0 16px">${esc(action)} işleminiz için doğrulama kodunuz:</p>
    <p style="margin:0 0 16px;font-family:Consolas,'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#4c1d95">${esc(code)}</p>
    <p style="margin:0 0 8px">Kod <strong>${minutes} dakika</strong> geçerlidir ve yalnızca bir kez kullanılabilir.</p>
    <p style="margin:0 0 8px">Bu kodu <strong>kimseyle paylaşmayın</strong>. Yaşam Sistemi çalışanları bu kodu sizden asla istemez.</p>
    <p style="margin:0;color:#64748b">Bu işlemi siz başlatmadıysanız bu iletiyi dikkate almayın ve parolanızı değiştirin.</p>`);
  return { subject, text, html };
}

function wrap(inner: string): string {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;font-size:15px;line-height:1.5">
<div style="max-width:520px;margin:0 auto;padding:24px 16px"><div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
<p style="margin:0 0 16px;font-weight:700;color:#4c1d95">Yaşam Sistemi</p>${inner}
</div><p style="margin:12px 0 0;font-size:12px;color:#94a3b8">Bu ileti otomatik gönderilmiştir; lütfen yanıtlamayın.</p></div></body></html>`;
}
