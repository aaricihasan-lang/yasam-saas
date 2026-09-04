// ============================================================
// Danışan Yolculuğu — Not (notlar) render regresyon harness'i.
//
// UAT bulgusu: "Client Journey › Recent Activity › Notes" kartında ham JSON
// zarfı ([{"id":"legacy","content":"…","createdAt":…}]) kullanıcıya sızıyordu.
// Fix: YolculukTab artık lib/clientNotes.notesToPlainText() üzerinden geçiriyor.
//
// Bu harness parseClientNotes/notesToPlainText sözleşmesini kilitler:
//   - JSON-dizi zarfı ASLA düz metne sızmaz (no "id"/"content"/"[{" leak)
//   - eski (legacy) düz metin aynen korunur
//   - bozuk/boş/null girişte crash YOK, kontrollü fallback
// FAIL → exit 1.
// ============================================================
import { parseClientNotes, notesToPlainText } from "../lib/clientNotes";

let pass = 0;
let fail = 0;
const failures: string[] = [];
const ok = (n: string) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n: string, d?: string) => { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); };
const check = (n: string, c: boolean, d?: string) => (c ? ok(n) : bad(n, d));

// UAT'ta görülen tam zarf şekli.
const uatJson =
  '[{"id":"legacy","content":"kulak çınlaması ve baş dönmesi","createdAt":"","updatedAt":"2026-08-24T08:54:08.000Z"}]';

// 1) JSON zarfı → yalnız content; ham JSON anahtarları GÖSTERİLMEZ.
{
  const out = notesToPlainText(uatJson);
  check("JSON zarfı content'e indirgenir", out === "kulak çınlaması ve baş dönmesi", `got: ${out}`);
  check("çıktıda JSON zarfı yok (no [{ )", !out.includes("[{") && !out.includes("{\""));
  check("çıktıda envelope anahtarı yok (id/content/createdAt/updatedAt)",
    !/\b(id|content|createdAt|updatedAt)\b/.test(out), `got: ${out}`);
}

// 2) Eski düz metin aynen korunur (legacy davranışı birebir).
{
  const legacy = "21 gün nefes çalışması, günde 20 dakika";
  check("legacy düz metin değişmeden döner", notesToPlainText(legacy) === legacy);
  const parsed = parseClientNotes(legacy);
  check("legacy → tek not", parsed.length === 1 && parsed[0].content === legacy);
}

// 3) Çok-not JSON → ayraçla birleştirilir, tüm içerik okunur.
{
  const multi = JSON.stringify([
    { id: "a", content: "Yakut", createdAt: "" },
    { id: "b", content: "amazonit", createdAt: "" },
  ]);
  const out = notesToPlainText(multi);
  check("çok-not: her iki içerik de var", out.includes("Yakut") && out.includes("amazonit"));
  check("çok-not: ham JSON sızmaz", !out.includes("\"id\"") && !out.includes("[{"));
}

// 4) Boş / null / undefined → boş string, crash yok.
{
  check("boş dizi [] → ''", notesToPlainText("[]") === "");
  check("null → ''", notesToPlainText(null) === "");
  check("undefined → ''", notesToPlainText(undefined) === "");
  check("boş string → ''", notesToPlainText("   ") === "");
}

// 5) Bozuk JSON ('[' ile başlar ama geçersiz) → legacy düz metin, THROW yok.
{
  let threw = false;
  let out = "";
  try { out = notesToPlainText("[bozuk-json"); } catch { threw = true; }
  check("bozuk JSON crash yaratmaz", !threw);
  check("bozuk JSON → ham metin fallback", out === "[bozuk-json", `got: ${out}`);
}

// 6) Dizi içinde content olmayan öğe → güvenle atlanır.
{
  const mixed = JSON.stringify([{ id: "x" }, { id: "y", content: "geçerli", createdAt: "" }]);
  const out = notesToPlainText(mixed);
  check("content'siz öğe atlanır", out === "geçerli", `got: ${out}`);
}

console.log(`\n=== clientNotes harness: ${pass} PASS / ${fail} FAIL ===`);
if (fail > 0) {
  console.error(`FAILURES: ${failures.join(", ")}`);
  process.exit(1);
}
