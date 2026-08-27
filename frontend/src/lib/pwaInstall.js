// Chrome's automatic install banner works, but it fires on Chrome's own
// engagement heuristics and looks generic. Capturing beforeinstallprompt
// lets us show our own branded "Install" CTA on our own timing instead,
// while still using the browser's real, native install flow underneath -
// this doesn't replace anything, it just controls when/how it's offered.

let deferredPrompt = null;
const listeners = new Set();

function notify() {
  listeners.forEach(fn => fn(!!deferredPrompt));
}

window.addEventListener("beforeinstallprompt", (e) => {
  // Without this, Chrome shows its own automatic mini-infobar immediately -
  // preventing it is what makes a custom-timed CTA possible at all.
  e.preventDefault();
  deferredPrompt = e;
  notify();
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  notify();
});

export function isRunningInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true; // iOS Safari's own flag
}

// Fires with true/false whenever installability changes - lets a component
// show/hide its own CTA without polling.
export function onInstallAvailabilityChange(fn) {
  listeners.add(fn);
  fn(!!deferredPrompt);
  return () => listeners.delete(fn);
}

export async function promptInstall() {
  if (!deferredPrompt) return null;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  notify();
  return choice.outcome; // "accepted" | "dismissed"
}
