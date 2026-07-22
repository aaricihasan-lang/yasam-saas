/**
 * HD-0 runtime auth harness — GERÇEK route handler çalıştırır (metin araması DEĞİL).
 *
 * Offline & yazma-YOK: verifyUserRequest, eksik/geçersiz kimlik header'ında
 * getServerDb()'den ÖNCE 401 döndürür → oturumsuz senaryolar DB/ağ olmadan doğrulanır.
 * Ayrıca paylaşımlı path-sahiplik predicate'i (signed-URL/delete/upload cleanup'ın
 * kullandığı) cross-tenant / keyfi / legacy girdilerle test edilir.
 *
 * Çalıştırma:  npx tsx scripts/hd0-auth-runtime.ts
 */
import { NextRequest } from "next/server";
import { POST as uploadPOST } from "../app/api/hd/upload-chart-image/route";
import { POST as deletePOST } from "../app/api/hd/delete-chart-image/route";
import { GET as signedGET } from "../app/api/hd/chart-image-url/route";
import { isOwnedChartImagePath, isHttpUrl } from "../lib/human-design/api/chartImagePath";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function check(desc: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${desc}`);
  } else {
    fail++;
    fails.push(desc);
    console.log(`  FAIL  ${desc}`);
  }
}

function reqNoAuth(url: string, method: "GET" | "POST"): NextRequest {
  return new NextRequest(url, { method });
}
function reqPartialAuth(url: string, method: "GET" | "POST"): NextRequest {
  // x-user-id var, x-session-token YOK → guard ikinci kontrolde 401.
  return new NextRequest(url, { method, headers: { "x-user-id": "00000000-0000-0000-0000-000000000000" } });
}

async function main() {
  console.log("── RUNTIME: oturumsuz → 401 (gerçek handler) ──");
  {
    const r = await uploadPOST(reqNoAuth("http://localhost/api/hd/upload-chart-image", "POST"));
    check("upload (header yok) → 401", r.status === 401);
  }
  {
    const r = await deletePOST(reqNoAuth("http://localhost/api/hd/delete-chart-image", "POST"));
    check("delete (header yok) → 401", r.status === 401);
  }
  {
    const r = await signedGET(reqNoAuth("http://localhost/api/hd/chart-image-url?clientId=x", "GET"));
    check("signed-url (header yok) → 401", r.status === 401);
  }

  console.log("── RUNTIME: x-user-id var / session-token YOK → 401 ──");
  {
    const r = await uploadPOST(reqPartialAuth("http://localhost/api/hd/upload-chart-image", "POST"));
    check("upload (token yok) → 401", r.status === 401);
  }
  {
    const r = await deletePOST(reqPartialAuth("http://localhost/api/hd/delete-chart-image", "POST"));
    check("delete (token yok) → 401", r.status === 401);
  }
  {
    const r = await signedGET(reqPartialAuth("http://localhost/api/hd/chart-image-url?clientId=x", "GET"));
    check("signed-url (token yok) → 401", r.status === 401);
  }

  console.log("── PREDICATE: keyfi/cross-tenant path imzalanamaz/silinemez ──");
  const T = "tenantA";
  const C = "clientA";
  check("kendi path'i → sahiplenilir", isOwnedChartImagePath(`${T}/${C}/img.png`, T, C) === true);
  check("başka tenant path'i → RED", isOwnedChartImagePath(`tenantB/${C}/img.png`, T, C) === false);
  check("başka client path'i → RED", isOwnedChartImagePath(`${T}/clientB/img.png`, T, C) === false);
  check("keyfi/absolute path → RED", isOwnedChartImagePath("../../secrets/x.png", T, C) === false);
  check("prefix-benzeri sahte path → RED", isOwnedChartImagePath(`${T}/${C}EVIL/img.png`, T, C) === false);
  check("legacy http URL → RED (imzalanmaz)", isOwnedChartImagePath(`https://x/public/hd-chart-images/${T}/${C}/a.png`, T, C) === false);
  check("boş/null → RED", isOwnedChartImagePath("", T, C) === false && isOwnedChartImagePath(null, T, C) === false);
  check("isHttpUrl: legacy tespiti", isHttpUrl("https://x/y") === true && isHttpUrl(`${T}/${C}/a.png`) === false);

  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    console.log("FAILED:");
    for (const f of fails) console.log("  - " + f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("RUNTIME HARNESS HATASI:", e?.message ?? e);
  process.exit(1);
});
