// Horary tenant yedeği — GPG simetrik şifreleme (AES-256). Düz metin JSON DİSKE YAZILMAZ: dışa aktarma gpg'nin standart girdisine
// verilir; geri yükleme dosyayı yalnız belleğe çözer. Parola yalnız dosyadan (--passphrase-file); komut satırında / günlükte yok.
// Altın Yedek ile aynı yöntem (gpg --symmetric AES256). gpg yolu: HORARY_GPG ya da PATH'teki "gpg".
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const GPG = process.env.HORARY_GPG || "gpg";
const BASE = ["--batch", "--quiet", "--no-tty", "--pinentry-mode", "loopback"];

export function encryptJsonToFile(obj, outFile, passphraseFile) {
  if (!outFile.endsWith(".gpg")) throw new Error("HORARY_BACKUP_OUT_NOT_GPG");
  if (fs.existsSync(outFile)) throw new Error("HORARY_BACKUP_OUT_EXISTS");
  if (!fs.existsSync(passphraseFile)) throw new Error("HORARY_BACKUP_PASSPHRASE_MISSING");
  const r = spawnSync(GPG, [...BASE, "--symmetric", "--cipher-algo", "AES256", "--passphrase-file", passphraseFile, "--output", outFile], { input: JSON.stringify(obj), maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`HORARY_BACKUP_ENCRYPT_FAILED:${String(r.stderr ?? "").split("\n")[0].slice(0, 120)}`);
  try {
    fs.chmodSync(outFile, 0o600);
  } catch {}
}

export function decryptFileToJson(inFile, passphraseFile) {
  if (!fs.existsSync(passphraseFile)) throw new Error("HORARY_BACKUP_PASSPHRASE_MISSING");
  const r = spawnSync(GPG, [...BASE, "--decrypt", "--passphrase-file", passphraseFile, inFile], { maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error("HORARY_BACKUP_DECRYPT_FAILED");
  return JSON.parse(r.stdout.toString("utf8"));
}
