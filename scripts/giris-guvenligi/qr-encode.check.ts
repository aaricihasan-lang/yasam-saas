/**
 * GİRİŞ GÜVENLİĞİ F2-C — QR kodlayıcı BAĞIMSIZ doğrulaması.
 * lib/qr/qrEncode.ts çıktısı, ayrı bir çözücüyle (OpenCV QRCodeDetector, Python) çözülür ve metin
 * birebir karşılaştırılır. Python/OpenCV yoksa SKIP (PASS DEĞİL) yazar ve 2 ile çıkar.
 * Çalıştır: npx tsx scripts/giris-guvenligi/qr-encode.check.ts
 */
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { encodeQr, qrToSvgPath } from "@/lib/qr/qrEncode";

const texts = ["A", "HELLO WORLD", "https://www.yasamsistemi.com", "Türkçe ğüşıöç İ", "x".repeat(60), "y".repeat(120)];
for (let i = 0; i < 40; i++) {
  texts.push(`https://www.yasamsistemi.com/m/onay#c=${randomUUID()}&n=${randomBytes(24).toString("base64url")}`);
}
const cases: { text: string; ecc: "L" | "M"; size: number; m: number[][] }[] = [];
for (const text of texts) {
  for (const ecc of ["L", "M"] as const) {
    const q = encodeQr(text, ecc);
    cases.push({ text, ecc, size: q.size, m: q.modules.map((r) => r.map((b) => (b ? 1 : 0))) });
  }
}
let tooLong = false;
try { encodeQr("z".repeat(400), "M"); } catch { tooLong = true; }
const svg = qrToSvgPath(encodeQr("https://www.yasamsistemi.com/m/onay#c=x&n=y"));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qr-check-"));
const file = path.join(dir, "cases.json");
fs.writeFileSync(file, JSON.stringify(cases));
const py = `
import json,sys
try:
    import numpy as np, cv2
except Exception as e:
    print("SKIP", e); sys.exit(2)
data=json.load(open(sys.argv[1],encoding='utf-8'))
# İki BAĞIMSIZ çözücü (OpenCV standart + Aruco tabanlı). Biri birebir çözmeli; hiçbiri YANLIŞ metin üretmemeli.
std=cv2.QRCodeDetector(); aru=cv2.QRCodeDetectorAruco(); ok=0; bad=[]; vers=set(); std_ok=0; aru_ok=0; wrong=0
for d in data:
    m=np.array(d["m"],dtype=np.uint8); vers.add((d["size"]-17)//4)
    img=np.pad(1-m,4,constant_values=1)*255
    img=cv2.resize(img.astype(np.uint8),None,fx=8,fy=8,interpolation=cv2.INTER_NEAREST)
    t1,_,_=std.detectAndDecode(img); t2,_,_=aru.detectAndDecode(img)
    std_ok+= t1==d["text"]; aru_ok+= t2==d["text"]
    if (t1 and t1!=d["text"]) or (t2 and t2!=d["text"]): wrong+=1
    if (t1==d["text"] or t2==d["text"]) and not ((t1 and t1!=d["text"]) or (t2 and t2!=d["text"])): ok+=1
    else: bad.append([d["ecc"],d["size"],d["text"][:40],t1[:40],t2[:40]])
print(json.dumps({"ok":ok,"bad":bad,"versions":sorted(vers),"cv2":cv2.__version__,"std_ok":std_ok,"aru_ok":aru_ok,"wrong":wrong}))
`;
const r = spawnSync("python", ["-c", py, file], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* yoksay */ }
if (r.status === 2 || /SKIP/.test(r.stdout)) { console.log(`SKIP (OpenCV yok): ${r.stdout.trim()}`); process.exit(2); }
let res: { ok: number; bad: unknown[]; versions: number[]; cv2: string; std_ok: number; aru_ok: number; wrong: number };
try { res = JSON.parse(r.stdout.trim().split(/\r?\n/).pop() ?? "{}"); } catch { console.log("FAIL çözücü çıktısı okunamadı", r.stdout, r.stderr); process.exit(1); }
const loginCase = cases.find((c) => c.text.includes("/m/onay#c=") && c.ecc === "M");
const checks: [boolean, string][] = [
  [res.ok === cases.length && res.bad.length === 0, `OpenCV ${res.cv2} bağımsız çözüm (standart ∪ Aruco): ${res.ok}/${cases.length} birebir · standart ${res.std_ok} · Aruco ${res.aru_ok}`],
  [res.wrong === 0, `hiçbir çözücü YANLIŞ metin üretmedi (${res.wrong})`],
  [res.versions.some((v) => v >= 7), `sürüm bilgisi gerektiren sürümler (≥7) dahil: ${res.versions.join(",")}`],
  [!!loginCase && (loginCase.size - 17) / 4 <= 10, `giriş QR'si (ECC M) sürüm ${loginCase ? (loginCase.size - 17) / 4 : "?"} ≤ 10`],
  [tooLong, "kapasite aşımı açık hata verir"],
  [/^0 0 \d+ \d+$/.test(svg.viewBox) && svg.d.startsWith("M"), "SVG yolu üretilir"],
];
let fails = 0;
for (const [c, m] of checks) { console.log(`  ${c ? "PASS" : "FAIL"} ${m}`); if (!c) fails++; }
if (res.bad.length) console.log("  çözülemeyenler:", JSON.stringify(res.bad).slice(0, 400));
console.log(`\nqr-encode check: ${checks.length - fails} PASS / ${fails} FAIL`);
process.exit(fails ? 1 : 0);
