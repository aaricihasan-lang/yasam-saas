// Final-A1 test stub: @/lib/auth/userGuard → sahte oturum + sahte DB (globalThis.__yhFake).
const { NextResponse } = require("next/server");
exports.verifyUserRequest = async () => {
  const f = globalThis.__yhFake;
  return { ok: true, db: f.db, tenantId: f.tenantId, is_demo_account: false, profile: f.profile };
};
exports.membershipInactiveResponse = () => NextResponse.json({ ok: false, code: "MEMBERSHIP_INACTIVE" }, { status: 403 });
