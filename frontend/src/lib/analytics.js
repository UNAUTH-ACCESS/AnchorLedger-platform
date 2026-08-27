import posthog from "posthog-js";

// A PostHog project API key is meant to be public/client-embeddable (same
// as a GA tracking ID) - PostHog's actual protection is server-side
// ingestion permissions, not secrecy of this value. No env-var plumbing
// needed for something that isn't a secret.
const POSTHOG_KEY  = "";
const POSTHOG_HOST = "https://us.i.posthog.com";

let ready = false;

// Only in production, and only once a real key is set - stays completely
// inert on localhost/dev builds and before the key exists, rather than
// half-initializing against a placeholder.
export function initAnalytics() {
  if (ready || !import.meta.env.PROD || !POSTHOG_KEY) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // autocapture logs every click/input value by default - this app has
    // KYC forms and financial data on screen, so only ever send events we
    // explicitly name below, never raw DOM interaction.
    autocapture: false,
    disable_session_recording: true,
    // SPA route changes don't fire a real page load, so PostHog's own
    // pageview autocapture only ever sees the first URL - pageviews are
    // sent manually via trackPageview() on every route change instead.
    capture_pageview: false,
  });
  ready = true;
}

export function trackPageview(pathname) {
  if (!ready) return;
  posthog.capture("$pageview", { $current_url: window.location.origin + pathname });
}

// Links a user's prior anonymous (pre-signup) activity to their real
// account the moment they authenticate, so the landing-page-to-signup
// funnel is actually visible instead of two disconnected identities.
export function identifyUser(userId) {
  if (!ready) return;
  posthog.identify(userId);
}

// Must run on logout - otherwise the next person on a shared device
// starts out identified as whoever logged out.
export function resetAnalytics() {
  if (!ready) return;
  posthog.reset();
}
