// Yaşam Hafızası™ — BF-4B: approval gate PARİTE harness (saf; DB/ağ YOK).
//
// approvalGate (SAF çekirdek) ile yasamUser (delege eden mevcut API) DAVRANIŞININ
// birebir eşleştiğini GERÇEK import ile kanıtlar. Onay matrisi: approved/pending/
// rejected/unknown-nonempty/legacy-undefined/empty-string × active true/false.
// Çalıştırma:  npx tsx scripts/yh-approval-gate-harness.ts

import {
  evaluateRawRowTenantReady,
  isExpertReady,
  normalizeApprovalStatus as normPure,
  resolveApprovalStatus as resolvePure,
} from "../lib/auth/approvalGate";
import {
  isExpertAccountReady,
  normalizeApprovalStatus,
  resolveApprovalStatus,
  type YasamUser,
} from "../lib/auth/yasamUser";

let total = 0;
const errors: string[] = [];
function check(cond: boolean, msg: string): void {
  total += 1;
  if (!cond) errors.push(msg);
}
function J(v: unknown): string {
  return JSON.stringify(v);
}

const APPROVALS: Array<string | undefined> = [
  "approved",
  "pending",
  "rejected",
  "custom-nonempty", // bilinen olmayan ama non-empty → isExpertReady false
  "  Approved  ", // trim/case normalize
  "",
  undefined,
];

function main(): void {
  // ══ A — isExpertReady vs yasamUser.isExpertAccountReady PARİTE (matris) ══════
  for (const approval of APPROVALS) {
    for (const active of [true, false] as const) {
      const user = { id: "u", role: "expert", active, approval_status: approval } as unknown as YasamUser;
      const legacy = isExpertAccountReady(user);
      const pure = isExpertReady({ active, approval });
      check(legacy === pure, `A parite approval=${J(approval)} active=${active} legacy=${legacy} pure=${pure}`);
    }
  }
  // Bilinen doğruluk noktaları (regresyon çıpası).
  check(isExpertReady({ active: true, approval: "approved" }) === true, "A approved+active → true");
  check(isExpertReady({ active: true, approval: undefined }) === true, "A legacy-undefined+active → true");
  check(isExpertReady({ active: true, approval: "" }) === true, "A empty-string+active → true");
  check(isExpertReady({ active: true, approval: "pending" }) === false, "A pending → false");
  check(isExpertReady({ active: true, approval: "rejected" }) === false, "A rejected → false");
  check(isExpertReady({ active: true, approval: "custom-nonempty" }) === false, "A unknown-nonempty → false");
  check(isExpertReady({ active: false, approval: "approved" }) === false, "A inactive → false");

  // ══ B — resolveApprovalStatus PARİTE (yasamUser delege) ═════════════════════
  const resolveRows: Array<Record<string, unknown>> = [
    { approval_status: "approved" },
    { approval_status: "  Rejected " },
    { approval_status: "" }, // boş → alt kurallara düş
    { is_approved: true },
    { is_approved: false },
    { approved: true },
    { approved: false },
    { status: "approved" },
    { status: "pending" },
    { status: "rejected" },
    { status: "banned" }, // izinli değil → undefined
    {}, // hiçbiri → undefined
  ];
  for (const row of resolveRows) {
    const legacy = resolveApprovalStatus(row);
    const pure = resolvePure(row);
    check(legacy === pure, `B resolve parite row=${J(row)} legacy=${J(legacy)} pure=${J(pure)}`);
  }
  check(resolvePure({ approval_status: "approved" }) === "approved", "B approval_status öncelik");
  check(resolvePure({ is_approved: true }) === "approved", "B is_approved true");
  check(resolvePure({ is_approved: false }) === "pending", "B is_approved false");
  check(resolvePure({ status: "rejected" }) === "rejected", "B status rejected");
  check(resolvePure({}) === undefined, "B boş → undefined");
  check(resolvePure({ status: "banned" }) === undefined, "B izinsiz status → undefined");

  // ══ C — normalizeApprovalStatus PARİTE ══════════════════════════════════════
  for (const v of ["APPROVED", "  pending  ", "", undefined, 123, null]) {
    check(normalizeApprovalStatus(v) === normPure(v), `C normalize parite ${J(v)}`);
  }

  // ══ D — evaluateRawRowTenantReady (raw satır değerlendirici) ═════════════════
  // isExpert: role varyasyonları.
  check(evaluateRawRowTenantReady({ role: "expert" }).isExpert === true, "D role expert → isExpert");
  check(evaluateRawRowTenantReady({ role: "  Expert " }).isExpert === true, "D role trim/case → isExpert");
  check(evaluateRawRowTenantReady({ role: "admin" }).isExpert === false, "D role admin → isExpert false");
  check(evaluateRawRowTenantReady({ role: "" }).isExpert === false, "D role boş → isExpert false");

  // isDemo: yalnız kesin true.
  check(evaluateRawRowTenantReady({ role: "expert", is_demo_account: true }).isDemo === true, "D demo true");
  check(evaluateRawRowTenantReady({ role: "expert", is_demo_account: false }).isDemo === false, "D demo false");
  check(evaluateRawRowTenantReady({ role: "expert", is_demo_account: "true" }).isDemo === false, "D demo coercion YOK");

  // ready: expert + isExpertReady(active, resolveApprovalStatus(row)).
  {
    const row = { role: "expert", active: true, approval_status: "approved", is_demo_account: false };
    const ev = evaluateRawRowTenantReady(row);
    const expected = isExpertReady({ active: true, approval: resolvePure(row) });
    check(ev.ready === expected && ev.ready === true, "D expert+approved+active → ready");
  }
  {
    const row = { role: "expert", active: true, is_demo_account: false }; // legacy-undefined onay
    check(evaluateRawRowTenantReady(row).ready === true, "D expert+legacy-undefined+active → ready");
  }
  {
    const row = { role: "expert", active: false, approval_status: "approved" };
    check(evaluateRawRowTenantReady(row).ready === false, "D inactive → not ready");
  }
  {
    const row = { role: "expert", active: true, approval_status: "pending" };
    check(evaluateRawRowTenantReady(row).ready === false, "D pending → not ready");
  }
  {
    const row = { role: "admin", active: true, approval_status: "approved" };
    check(evaluateRawRowTenantReady(row).ready === false, "D admin → not ready (isExpert false)");
  }
  {
    // is_approved boolean yolunu da tenant-ready değerlendirici kapsar.
    const row = { role: "expert", active: true, is_approved: false };
    check(evaluateRawRowTenantReady(row).ready === false, "D is_approved false → pending → not ready");
  }

  // ── Sonuç ──
  if (errors.length === 0) {
    console.log(`✅ yh-approval-gate-harness PASS`);
    console.log(`CHECK: ${total} kontrol OK, 0 FAIL.`);
  } else {
    console.error(`❌ yh-approval-gate-harness FAIL`);
    for (const e of errors) console.error("   - " + e);
    console.log(`CHECK: ${total - errors.length} kontrol OK, ${errors.length} FAIL.`);
    process.exitCode = 1;
  }
}

main();
