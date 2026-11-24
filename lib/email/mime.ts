/**
 * GİRİŞ GÜVENLİĞİ F2-D — RFC 5322 / MIME ileti oluşturucu (UTF-8; Türkçe karakter güvenli).
 * Başlık enjeksiyonuna karşı: CR/LF içeren başlık değerleri reddedilir. Saf; IO yok.
 */
import { randomBytes } from "node:crypto";

const HEADER_UNSAFE = /[\r\n]/;
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;

/**
 * RFC 2047 encoded-word (UTF-8, base64). Her kelime ≤ 75 karakter (RFC 2047 §2): metin ≤ 45 baytlık parçalara bölünür
 * (çok baytlı karakter bölünmez), kelimeler katlanmış başlık satırlarıyla birleştirilir (aradaki boşluk okunurken atılır).
 */
export function encodeHeaderWord(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  const parts: string[] = [];
  let cur = "";
  for (const ch of value) {
    if (cur && Buffer.byteLength(cur + ch, "utf8") > 45) {
      parts.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  if (cur) parts.push(cur);
  return parts.map((p) => `=?UTF-8?B?${Buffer.from(p, "utf8").toString("base64")}?=`).join("\r\n ");
}

function b64Lines(s: string): string {
  return (Buffer.from(s, "utf8").toString("base64").match(/.{1,76}/g) ?? []).join("\r\n");
}

export function isSafeEmailAddress(addr: string): boolean {
  return typeof addr === "string" && addr.length <= 254 && EMAIL_RE.test(addr) && !HEADER_UNSAFE.test(addr);
}

export function buildMimeMessage(input: {
  fromName: string;
  fromAddress: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  date?: Date;
  /** F2-M: "<yerel@alan>" biçiminde Message-ID (SMTP sunucusu eklemeyebilir; Gmail API kendisi ekler). */
  messageId?: string;
}): string {
  for (const v of [input.fromName, input.fromAddress, input.to, input.subject]) {
    if (HEADER_UNSAFE.test(v)) throw new Error("mime: başlıkta satır sonu");
  }
  if (!isSafeEmailAddress(input.fromAddress) || !isSafeEmailAddress(input.to)) throw new Error("mime: geçersiz adres");
  if (input.messageId !== undefined && !/^<[^<>\s@]+@[^<>\s@]+>$/.test(input.messageId)) throw new Error("mime: geçersiz Message-ID");
  const boundary = `ys_${randomBytes(12).toString("hex")}`;
  const date = (input.date ?? new Date()).toUTCString().replace("GMT", "+0000");
  return [
    `From: ${encodeHeaderWord(input.fromName)} <${input.fromAddress}>`,
    `To: <${input.to}>`,
    `Subject: ${encodeHeaderWord(input.subject)}`,
    `Date: ${date}`,
    ...(input.messageId ? [`Message-ID: ${input.messageId}`] : []),
    "MIME-Version: 1.0",
    "Auto-Submitted: auto-generated",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64Lines(input.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64Lines(input.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}
