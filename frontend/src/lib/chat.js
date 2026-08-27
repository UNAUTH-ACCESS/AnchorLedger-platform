// No official npm package - Smartsupp's only documented integration is the
// raw loader-script snippet (docs.smartsupp.com/chat-box/installation), so
// this loads it the same way that snippet does, gated to production + a
// real key only.
const SMARTSUPP_KEY = "1d028fc8a7c23d42c051aae5060169b2290f0b52";

let ready = false;

export function initChat() {
  if (ready || !import.meta.env.PROD || !SMARTSUPP_KEY) return;

  window._smartsupp = window._smartsupp || {};
  window._smartsupp.key = SMARTSUPP_KEY;

  (function (d) {
    let c, s;
    const o = (window.smartsupp = function () { o._.push(arguments); });
    o._ = [];
    s = d.getElementsByTagName("script")[0];
    c = d.createElement("script");
    c.type = "text/javascript";
    c.charset = "utf-8";
    c.async = true;
    c.src = "https://www.smartsuppchat.com/loader.js?";
    s.parentNode.insertBefore(c, s);
  })(document);

  ready = true;
}

// docs.smartsupp.com/chat-box/visitor-identification - `email` and
// `variables` are both documented smartsupp() commands.
export function identifyChatUser(email, userId) {
  if (!ready || !window.smartsupp) return;
  if (email) window.smartsupp("email", email);
  window.smartsupp("variables", { User_ID: userId });
}

// Smartsupp's documented JS API (docs.smartsupp.com/chat-box/javascript-api)
// has no logout/reset method, unlike Crisp's session:reset - verified by
// checking their method list directly, not assumed. There is currently no
// supported way to clear a visitor's identity from a shared device short
// of the visitor clearing Smartsupp's own cookie themselves. Left as a
// deliberate no-op rather than a fake reset that doesn't actually reset
// anything - revisit if Smartsupp documents one later.
export function resetChat() {}

// Unlike PostHog, Smartsupp has no opt_out_capturing()-style API and no
// npm SDK - initChat() itself does the one-time script injection, which
// can't be undone. If consent is granted then later revoked in the same
// session, chat:hide is the most this integration can honestly do:
// verified as a real documented command, it stops the widget being
// visible/interactive, but the script stays loaded in memory until the
// next full page load.
export function hideChat() {
  if (!ready || !window.smartsupp) return;
  window.smartsupp("chat:hide");
}
