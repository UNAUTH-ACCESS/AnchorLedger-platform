import { Crisp } from "crisp-sdk-web";

// Same reasoning as lib/analytics.js's PostHog key: a Crisp Website ID is
// meant to be public/client-embeddable, so it's a plain constant here, not
// an env var - currently empty, stays completely inert until set.
const CRISP_WEBSITE_ID = "";

let configured = false;

export function initChat() {
  if (configured || !import.meta.env.PROD || !CRISP_WEBSITE_ID) return;
  Crisp.configure(CRISP_WEBSITE_ID);
  configured = true;
}

// Crisp.configure() sets up the same window.$crisp queue every Crisp
// integration relies on under the hood. Using the raw, officially
// documented $crisp.push() commands here (docs.crisp.chat/.../dollar-crisp)
// rather than guessing at the npm wrapper's convenience method names keeps
// this on Crisp's stable, versioned public API surface.
export function identifyChatUser(email, userId) {
  if (!configured || !window.$crisp) return;
  if (email) window.$crisp.push(["set", "user:email", [email]]);
  window.$crisp.push(["set", "session:data", [[["user-id", userId]]]]);
}

// Must run on logout - otherwise the next person on a shared device
// resumes the previous user's chat session and history.
export function resetChat() {
  if (!configured || !window.$crisp) return;
  window.$crisp.push(["do", "session:reset"]);
}
