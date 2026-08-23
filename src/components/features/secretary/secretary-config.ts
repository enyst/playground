// Where the Secretary's voice + agent-brain endpoints live.
//
// PROTOTYPE SEAM: the realtime token mint (which needs a server-side secret)
// and the agent-brain bridge run in the standalone secretary server
// (spikes-style, default http://127.0.0.1:4820). odie stays frontend-only for
// now and calls it cross-origin (that server sends permissive CORS). When this
// graduates, these endpoints move into odie's own static-server.mjs and this
// constant becomes same-origin ("").
export const SECRETARY_SERVER_URL =
  (typeof window !== "undefined" &&
    (window as unknown as { __SECRETARY_SERVER_URL__?: string })
      .__SECRETARY_SERVER_URL__) ||
  "http://127.0.0.1:4820";

export const secretaryUrl = (path: string) => `${SECRETARY_SERVER_URL}${path}`;
