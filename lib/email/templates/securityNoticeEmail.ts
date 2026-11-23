/**
 * GİRİŞ GÜVENLİĞİ F2-E — Türkçe güvenlik bildirimi e-postaları. Saf; IO yok.
 * İçerikte KOD, bağlantı, buton, ek dosya veya uzaktan görsel YOK (kimlik avı yüzeyi yok; kurtarma
 * kodları e-postayla ASLA gönderilmez). Yalnız ne olduğu ve "siz değilseniz ne yapmalı" bilgisi.
 */
export type SecurityNoticeKind =
  | "recovery_login"
  | "owner_offline_login"
  | "recovery_codes_generated"
  | "email_changed_old"
  | "email_changed_new"
  | "recovery_case_opened"
  | "recovery_case_executed";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const CONTENT: Record<SecurityNoticeKind, { subject: string; lines: string[] }> = {
  recovery_login: {
    subject: "Yaşam Sistemi — hesabınıza kurtarma koduyla giriş yapıldı",
    lines: [
      "Hesabınıza bir kurtarma kodu kullanılarak giriş yapıldı. Kullanılan kod artık geçersizdir.",
      "Telefonunuzu kaybettiyseniz Ayarlar › Giriş Yöntemlerim bölümünden kayıp cihazı iptal edin ve yeni kurtarma kodları oluşturun.",
      "Bu girişi siz yapmadıysanız hemen parolanızı değiştirin ve sistem yöneticinize bildirin.",
    ],
  },
  owner_offline_login: {
    subject: "Yaşam Sistemi — Owner çevrimdışı kurtarma kodu kullanıldı",
    lines: [
      "Owner hesabına çevrimdışı kurtarma kitindeki bir kodla giriş yapıldı. Hesabın diğer bütün oturumları kapatıldı.",
      "Bu işlemi siz yapmadıysanız kitin güvenliği bozulmuştur: SQL konsolundan yeni kit üretin ve parolanızı değiştirin.",
    ],
  },
  recovery_codes_generated: {
    subject: "Yaşam Sistemi — kurtarma kodlarınız yenilendi",
    lines: [
      "Hesabınız için yeni kurtarma kodları oluşturuldu. Önceki kodlarınız artık geçersizdir.",
      "Kodlar bu iletide yer almaz; yalnız oluşturulduğu ekranda bir kez gösterilmiştir.",
      "Bu işlemi siz yapmadıysanız hemen parolanızı değiştirin ve sistem yöneticinize bildirin.",
    ],
  },
  email_changed_old: {
    subject: "Yaşam Sistemi — hesabınızın e-posta adresi değiştirildi",
    lines: [
      "Hesabınızın giriş e-posta adresi değiştirildi. Bu adres artık hesabınızla ilişkili değildir.",
      "Bu değişikliği siz yapmadıysanız hemen sistem yöneticinizle iletişime geçin.",
    ],
  },
  email_changed_new: {
    subject: "Yaşam Sistemi — e-posta adresiniz doğrulandı",
    lines: ["Bu adres Yaşam Sistemi hesabınızın giriş e-posta adresi olarak doğrulandı."],
  },
  recovery_case_opened: {
    subject: "Yaşam Sistemi — hesabınız için kurtarma talebi açıldı",
    lines: [
      "Sistem yöneticisi, hesabınıza erişimin kaybedildiği bildirimiyle bir hesap kurtarma talebi açtı.",
      "Güvenliğiniz için talep en erken 72 saat sonra işleme alınabilir.",
      "Bu talebi siz istemediyseniz hesabınıza giriş yapın ve Ayarlar › Giriş Yöntemlerim bölümünden talebi iptal edin.",
    ],
  },
  recovery_case_executed: {
    subject: "Yaşam Sistemi — hesap kurtarma tamamlandı",
    lines: [
      "Hesabınız için kurtarma işlemi tamamlandı: kayıtlı cihazlar iptal edildi ve açık oturumlar kapatıldı.",
      "Girişte, sistem yöneticisinin size ilettiği tek kullanımlık kurtarma biletini kullanın.",
      "Bu işlemi siz istemediyseniz hemen sistem yöneticinizle iletişime geçin.",
    ],
  },
};

export function renderSecurityNotice(kind: SecurityNoticeKind, name?: string | null): { subject: string; text: string; html: string } {
  const c = CONTENT[kind];
  const hello = name ? `Merhaba ${name},` : "Merhaba,";
  const text = [hello, "", ...c.lines, "", "Yaşam Sistemi"].join("\n");
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;font-size:15px;line-height:1.5">
<div style="max-width:520px;margin:0 auto;padding:24px 16px"><div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
<p style="margin:0 0 16px;font-weight:700;color:#4c1d95">Yaşam Sistemi — güvenlik bildirimi</p>
<p style="margin:0 0 12px">${esc(hello)}</p>
${c.lines.map((l) => `<p style="margin:0 0 10px">${esc(l)}</p>`).join("\n")}
</div><p style="margin:12px 0 0;font-size:12px;color:#94a3b8">Bu ileti otomatik gönderilmiştir; lütfen yanıtlamayın.</p></div></body></html>`;
  return { subject: c.subject, text, html };
}
