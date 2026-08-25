// Shared (server + client) name of the wallet-session marker, stored in
// BOTH localStorage (client boot state before hydration) and a cookie
// (lets SSR render restore-skeletons for returning users from byte one).
export const SESSION_MARKER = "sowee.wallet-connected";
