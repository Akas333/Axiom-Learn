import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Who a request (and everything it starts) is running for, in hosted mode.
 *
 * The hosted server sets this once per request (apps/server auth middleware).
 * AsyncLocalStorage carries it through awaits, timers and background jobs the
 * request starts, so stores, keys and events can scope themselves without
 * every call site passing a user id. Desktop and plain dev never set it.
 */
export interface Tenant {
	/** Supabase auth user id (a UUID). Used as a directory name. */
	userId: string;
	email?: string;
}

interface TenantGlobal {
	__lhTenantStore?: AsyncLocalStorage<Tenant>;
}

function storage(): AsyncLocalStorage<Tenant> {
	const g = globalThis as typeof globalThis & TenantGlobal;
	return (g.__lhTenantStore ??= new AsyncLocalStorage<Tenant>());
}

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True on the multi-user cloud deployment (KAPANY_HOSTED=1). */
export function hostedMode(): boolean {
	return process.env.KAPANY_HOSTED === "1";
}

/** Run `fn` (and everything it starts) as `tenant`. */
export function runAsTenant<T>(tenant: Tenant, fn: () => T): T {
	if (!USER_ID.test(tenant.userId)) throw new Error("Invalid user id");
	return storage().run({ ...tenant, userId: tenant.userId.toLowerCase() }, fn);
}

/** The user the current code is running for, if any. */
export function currentTenant(): Tenant | undefined {
	return storage().getStore();
}

/** The current user, or a thrown error. Hosted data access without a signed-in
 *  user is a bug, so it fails closed instead of reading shared files. */
export function requireTenant(): Tenant {
	const tenant = currentTenant();
	if (!tenant) throw new Error("No signed-in user for this operation (hosted mode)");
	return tenant;
}
