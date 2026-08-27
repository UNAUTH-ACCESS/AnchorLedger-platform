// GDPR applies to Anchor Ledger regardless of visitor location, because the
// operator is established in Germany (Article 3(1) GDPR) - see Privacy.jsx
// Section 9. Non-essential cookies/tracking (PostHog analytics, Smartsupp
// chat) require prior opt-in consent, not just a link explaining them.
//
// Storage itself (this one localStorage key, to remember the choice) is
// strictly necessary and doesn't require consent - that's the one
// exemption every cookie-consent regime carries, since you can't ask
// consent to remember whether consent was given.

const KEY = "al_cookie_consent";
const listeners = new Set();
const reviewListeners = new Set();

export function getConsent() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function hasConsentDecision() {
  return getConsent() !== null;
}

export function setConsent({ analytics, chat }) {
  const prefs = { analytics: !!analytics, chat: !!chat, decidedAt: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(prefs));
  listeners.forEach(fn => fn(prefs));
}

// Fires immediately with the current stored decision (or null), then again
// on every change - lets App.jsx apply consent without polling.
export function onConsentChange(fn) {
  listeners.add(fn);
  fn(getConsent());
  return () => listeners.delete(fn);
}

// The banner hides itself after a decision - this is how a "Cookie
// Settings" link elsewhere (footer, Settings page) reopens it to change
// that decision later, which every consent regime requires be possible.
export function requestConsentReview() {
  reviewListeners.forEach(fn => fn());
}

export function onConsentReviewRequested(fn) {
  reviewListeners.add(fn);
  return () => reviewListeners.delete(fn);
}
