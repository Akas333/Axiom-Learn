import { hostedMode } from "@axiom/engine/tenant.ts";
import { currentTenant } from "@axiom/engine/tenant.ts";
import { installHostedEnv } from "@axiom/engine/src/server/hosted.ts";
import { setEventScopeResolver } from "@axiom/engine/src/core/events.ts";

/** Hosted (multi-user) server? Set KAPANY_HOSTED=1. */
export const hosted = hostedMode();

if (hosted) {
	installHostedEnv();
	setEventScopeResolver(() => currentTenant()?.userId);
}
