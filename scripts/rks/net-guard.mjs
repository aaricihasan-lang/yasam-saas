/**
 * RKS-3 ağ koruması — `node --import <bu dosya>` (NODE_OPTIONS ile alt Node süreçlerine de geçer).
 *
 * Yalnız yerel adreslere (127.0.0.0/8, ::1, localhost, Unix/pipe soketleri) bağlantıya izin verir.
 * Production / Supabase / Roxy / ücretli API dahil HER dış bağlantı engellenir ve
 * RKS_NET_LOG dosyasına yazılır; koşucu bu kaydı görürse test PASS sayılmaz.
 * (http, https, fetch/undici, pg, tls — hepsi net.Socket.prototype.connect üzerinden geçer.)
 */
import fs from "node:fs";
import net from "node:net";

const LOG = process.env.RKS_NET_LOG;
const isLocal = (h) => {
  if (h == null || h === "") return true;
  const s = String(h).replace(/^\[|\]$/g, "").toLowerCase();
  return s === "localhost" || s === "::1" || s === "0.0.0.0" || /^127\./.test(s) || s === "::ffff:127.0.0.1";
};

function record(host, port) {
  const msg = `RKS-NET-ENGEL pid=${process.pid} host=${host} port=${port ?? ""}`;
  try { if (LOG) fs.appendFileSync(LOG, msg + "\n"); } catch { /* yok */ }
  try { process.stderr.write(msg + "\n"); } catch { /* yok */ }
}

const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function rksGuardedConnect(...args) {
  let opts = args[0];
  if (Array.isArray(opts)) opts = opts[0];
  let host;
  let port;
  let isPath = false;
  if (opts && typeof opts === "object") {
    if (opts.path) isPath = true;
    host = opts.host ?? opts.hostname;
    port = opts.port;
  } else if (typeof opts === "number" || (typeof opts === "string" && /^\d+$/.test(opts))) {
    port = opts;
    host = typeof args[1] === "string" ? args[1] : "localhost";
  } else if (typeof opts === "string") {
    isPath = true;
  }
  if (!isPath && !isLocal(host)) {
    record(host, port);
    const err = Object.assign(new Error(`RKS net-guard: dış ağ bağlantısı engellendi (${host}:${port ?? ""})`), { code: "ERKSNETBLOCK" });
    process.nextTick(() => this.destroy(err));
    return this;
  }
  return origConnect.apply(this, args);
};
