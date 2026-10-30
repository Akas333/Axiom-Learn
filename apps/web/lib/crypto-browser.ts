// Browser stand-in for node:crypto. The shared core imports it for helpers
// that only ever run on the server; calling them in the browser is a bug.
const serverOnly = (name: string) => () => {
	throw new Error(`node:crypto.${name} is server-only`);
};
export const createHash = serverOnly("createHash");
export const randomBytes = serverOnly("randomBytes");
