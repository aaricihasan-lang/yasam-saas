// final-a2 Word harness — `@/lib/auth/userGuard` yerine geçen sahte kapı (DB/oturum YOK).
// Döndürülen guard harness tarafından `globalThis.__FA2_GUARD__` ile verilir.
"use strict";
const guard = () => globalThis.__FA2_GUARD__;
exports.requireModuleAccess = async () => guard();
exports.verifyUserRequest = async () => guard();
exports.requireUser = async () => guard();
