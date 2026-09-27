// hday.harness.ts — "@/lib/auth/userGuard" test stub'ı. Guard sonucu harness'in
// globalThis.__HDAY_GUARD__ fonksiyonundan gelir (fake db + profil). Üretimde KULLANILMAZ.
function call(kind, req, moduleKey, options) {
  const fn = globalThis.__HDAY_GUARD__;
  if (typeof fn !== "function") throw new Error("__HDAY_GUARD__ tanımlı değil");
  return fn({ kind, req, moduleKey: moduleKey ?? null, options: options ?? null });
}
module.exports = {
  verifyUserRequest: async (req, options) => call("verify", req, null, options),
  requireModuleAccess: async (req, moduleKey, options) => call("module", req, moduleKey, options),
  requireAdminUserRequest: async (req, options) => call("admin", req, null, options),
};
