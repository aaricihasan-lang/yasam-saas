/**
 * GİRİŞ GÜVENLİĞİ F2-M — SMTP testleri için ortak araçlar: geçici test sertifikaları (openssl) ve SAHTE SMTP sunucuları
 * (smtp-server + ham TLS soketleri; yalnız 127.0.0.1). Gerçek posta sunucusuna / internete bağlanılmaz. Depoda özel anahtar YOK.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import tls from "node:tls";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

// ── Test sertifikaları (openssl; geçici klasör) ─────────────────────────────────────────────────────────────────────
export const HOST = "smtp.ornek-alan.test";
function findOpenssl(): string {
  const cands = ["openssl", "C:/Program Files/Git/mingw64/bin/openssl.exe", "C:/Program Files/Git/usr/bin/openssl.exe"];
  for (const c of cands) {
    const r = spawnSync(c, ["version"], { encoding: "utf8" });
    if (r.status === 0) return c;
  }
  throw new Error("openssl bulunamadı (test sertifikası üretilemez)");
}
export function makeCerts() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f2m-smtp-tls-"));
  const ossl = findOpenssl();
  const run = (args: string[]) => {
    const r = spawnSync(ossl, args, { cwd: dir, encoding: "utf8", env: { ...process.env, MSYS2_ARG_CONV_EXCL: "*", MSYS_NO_PATHCONV: "1" } });
    if (r.status !== 0) throw new Error(`openssl ${args[0]}: ${r.stderr}`);
  };
  run(["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.pem", "-days", "2", "-subj", "/CN=YS F2-M Test CA",
    "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign"]);
  const leaf = (name: string, san: string) => {
    run(["req", "-newkey", "rsa:2048", "-nodes", "-keyout", `${name}.key`, "-out", `${name}.csr`, "-subj", `/CN=${san}`]);
    fs.writeFileSync(path.join(dir, `${name}.ext`), `subjectAltName=DNS:${san}\nextendedKeyUsage=serverAuth\n`);
    run(["x509", "-req", "-in", `${name}.csr`, "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-out", `${name}.pem`, "-days", "2", "-extfile", `${name}.ext`]);
  };
  leaf("srv", HOST);
  leaf("other", "baska.ornek-alan.test");
  run(["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "self.key", "-out", "self.pem", "-days", "2", "-subj", `/CN=${HOST}`, "-addext", `subjectAltName=DNS:${HOST}`]);
  const rd = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");
  return { dir, ca: rd("ca.pem"), srv: { key: rd("srv.key"), cert: rd("srv.pem") }, other: { key: rd("other.key"), cert: rd("other.pem") }, self: { key: rd("self.key"), cert: rd("self.pem") } };
}

// ── Sahte sunucular ──────────────────────────────────────────────────────────────────────────────────────────────────
const req = createRequire(path.join(process.cwd(), "package.json"));
type SmtpServerCtor = new (opts: Record<string, unknown>) => { listen: (port: number, host: string, cb: () => void) => void; server: net.Server; close: (cb: () => void) => void; on: (ev: string, fn: () => void) => void };
const { SMTPServer } = req("smtp-server") as { SMTPServer: SmtpServerCtor };

export type Box = { connects: number; auths: { user: string; pass: string; secure: boolean }[]; mails: { from: string; to: string[]; raw: string }[] };
export type Rej = { code: number; msg: string } | null;
export async function startSmtp(o: { secure: boolean; tlsPair: { key: string; cert: string }; noStartTls?: boolean; authFail?: boolean; mailFrom?: Rej; rcpt?: Rej; data?: Rej }) {
  const box: Box = { connects: 0, auths: [], mails: [] };
  const err = (r: NonNullable<Rej>) => Object.assign(new Error(r.msg), { responseCode: r.code });
  const s = new SMTPServer({
    secure: o.secure, key: o.tlsPair.key, cert: o.tlsPair.cert, logger: false, banner: "sahte",
    // noStartTls: sunucu STARTTLS'i HİÇ desteklemez ve düz metin AUTH'u KABUL EDER (istemcinin düşüşü reddettiğinin kanıtı).
    ...(o.noStartTls ? { disabledCommands: ["STARTTLS"], allowInsecureAuth: true } : {}),
    authMethods: ["PLAIN", "LOGIN"], size: 1024 * 1024,
    onConnect(_s: unknown, cb: (e?: Error) => void) { box.connects++; cb(); },
    onAuth(auth: { username: string; password: string }, sess: { secure?: boolean }, cb: (e: Error | null, r?: { user: string }) => void) {
      box.auths.push({ user: auth.username, pass: auth.password, secure: sess.secure === true });
      if (o.authFail) return cb(Object.assign(new Error("Invalid username or password"), { responseCode: 535 }));
      cb(null, { user: auth.username });
    },
    onMailFrom(_a: unknown, _s: unknown, cb: (e?: Error) => void) { cb(o.mailFrom ? err(o.mailFrom) : undefined); },
    onRcptTo(_a: unknown, _s: unknown, cb: (e?: Error) => void) { cb(o.rcpt ? err(o.rcpt) : undefined); },
    onData(stream: NodeJS.ReadableStream, session: { envelope: { mailFrom: { address: string }; rcptTo: { address: string }[] } }, cb: (e?: Error | null) => void) {
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => {
        box.mails.push({ from: session.envelope.mailFrom.address, to: session.envelope.rcptTo.map((r) => r.address), raw: Buffer.concat(chunks).toString("utf8") });
        cb(o.data ? err(o.data) : null);
      });
    },
  });
  s.server.on("error", () => {});
  s.on("error", () => {}); // istemcinin TLS'i reddetmesi sunucuda soket hatası doğurur (beklenen)
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  const port = (s.server.address() as net.AddressInfo).port;
  return { box, port, close: () => new Promise<void>((r) => s.close(() => r())) };
}

/** Ham TLS sunucusu: 'silent' karşılama yazmaz; 'drop-after-data' iletiyi alıp 250 yerine bağlantıyı keser; 'stall-after-data' susar. */
export async function startRaw(mode: "silent" | "drop-after-data" | "stall-after-data", pair: { key: string; cert: string }) {
  const st = { connects: 0, messages: 0 };
  const sockets = new Set<tls.TLSSocket>();
  const srv = tls.createServer({ key: pair.key, cert: pair.cert }, (sock) => {
    st.connects++; sockets.add(sock); sock.on("error", () => {}); sock.on("close", () => sockets.delete(sock));
    if (mode === "silent") return;
    sock.write("220 sahte ESMTP\r\n");
    let buf = ""; let inData = false;
    sock.on("data", (d: Buffer) => {
      buf += d.toString("utf8");
      if (inData) {
        if (buf.includes("\r\n.\r\n")) {
          st.messages++; inData = false; buf = "";
          if (mode === "drop-after-data") sock.destroy();
        }
        return;
      }
      let i: number;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO") sock.write("250-sahte\r\n250 AUTH PLAIN LOGIN\r\n");
        else if (cmd === "AUTH") sock.write("235 tamam\r\n");
        else if (cmd === "MAIL" || cmd === "RCPT") sock.write("250 tamam\r\n");
        else if (cmd === "DATA") { sock.write("354 gönder\r\n"); inData = true; return; }
        else if (cmd === "QUIT") { sock.write("221 güle güle\r\n"); sock.end(); }
        else sock.write("250 tamam\r\n");
      }
    });
  });
  srv.on("error", () => {});
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  const port = (srv.address() as net.AddressInfo).port;
  return { st, port, close: () => new Promise<void>((r) => { for (const s of sockets) s.destroy(); srv.close(() => r()); }) };
}

