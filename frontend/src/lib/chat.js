// No official npm package - Smartsupp's only documented integration is the
// raw loader-script snippet (docs.smartsupp.com/chat-box/installation), so
// this loads it the same way that snippet does, gated to production + a
// real key only.
const SMARTSUPP_KEY = "";

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
