import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect, lazy, Suspense } from "react";
import { RouteGuard } from "./components/auth/RouteGuard";
import { AppShell } from "./components/layout/AppShell";
import { useSocket } from "./hooks/useSocket";
import useAuthStore from "./store/auth.store";
import useSystemStore from "./store/system.store";
import { signals as signalsApi } from "./api/endpoints";
import { initAnalytics, trackPageview, setAnalyticsConsent } from "./lib/analytics";
import { initChat, hideChat } from "./lib/chat";
import { onConsentChange } from "./lib/consent";
import CookieConsentBanner from "./components/consent/CookieConsentBanner";

// Eager — the first-paint critical path (marketing landing + the auth
// entry points a logged-out visitor hits immediately).
import HomePage    from "./pages/home/HomePage";
import LoginPage   from "./pages/login/LoginPage";
import SignupPage  from "./pages/login/SignupPage";

// Lazy — everything behind auth, plus secondary marketing/legal pages. This
// is what keeps the wallet SDKs (@solana/web3.js, tronweb, @tronweb3 — the
// bulk of the old single bundle) off the landing/login path: they only load
// when someone actually opens /wallets or /onboarding.
const VerifyEmailPage    = lazy(() => import("./pages/verify-email/VerifyEmailPage"));
const ForgotPasswordPage = lazy(() => import("./pages/forgot-password/ForgotPasswordPage"));
const ResetPasswordPage  = lazy(() => import("./pages/reset-password/ResetPasswordPage"));
const SubscribePage      = lazy(() => import("./pages/subscribe/SubscribePage"));
const Terms              = lazy(() => import("./pages/legal/Terms"));
const Privacy            = lazy(() => import("./pages/legal/Privacy"));
const ArchitecturePage   = lazy(() => import("./pages/architecture/ArchitecturePage"));
const SecurityPage       = lazy(() => import("./pages/security/SecurityPage"));
const BlogIndex          = lazy(() => import("./pages/blog/BlogIndex"));
const BlogPost           = lazy(() => import("./pages/blog/BlogPost"));
const OnboardingPage     = lazy(() => import("./pages/onboarding/OnboardingPage"));
const WalletCallback     = lazy(() => import("./pages/wallets/WalletCallback"));

const Dashboard      = lazy(() => import("./pages/dashboard/Dashboard"));
const Signals        = lazy(() => import("./pages/signals/Signals"));
const Proposals      = lazy(() => import("./pages/proposals/Proposals"));
const Positions      = lazy(() => import("./pages/positions/Positions"));
const Portfolio      = lazy(() => import("./pages/portfolio/Portfolio"));
const AuditLog       = lazy(() => import("./pages/audit/AuditLog"));
const Settings       = lazy(() => import("./pages/settings/Settings"));
const WalletConnect  = lazy(() => import("./pages/wallets/WalletConnect"));
const PnLDashboard   = lazy(() => import("./pages/pnl/PnLDashboard"));
const AdminKycQueue  = lazy(() => import("./pages/admin/AdminKycQueue"));
const AdminOperations = lazy(() => import("./pages/admin/AdminOperations"));
const KycSubmission  = lazy(() => import("./pages/kyc/KycSubmission"));
const WithdrawalPage = lazy(() => import("./pages/withdrawals/WithdrawalPage"));

function RouteFallback() {
  return (
    <div style={{
      minHeight: "100vh", background: "#0A0A0F",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
      color: "#5A6478", letterSpacing: "0.06em",
    }}>
      Loading…
    </div>
  );
}

function RootRoute() {
  const { status } = useAuthStore();

  // Don't flash the marketing page for a returning session that's about to
  // resolve to "authenticated" — same loading treatment RouteGuard uses.
  if (status === "authenticating") {
    return <RouteFallback />;
  }

  if (status === "authenticated") {
    return <Navigate to="/dashboard" replace />;
  }

  return <HomePage/>;
}

function AuthenticatedApp() {
  useSocket(); // Initialize WebSocket connection
  const { setRegime } = useSystemStore();

  // Bootstrap regime state on mount + poll every 5 minutes
  useEffect(() => {
    const fetchRegime = () => {
      signalsApi.regimeCurrent()
        .then(res => setRegime(res.data.data))
        .catch(() => {});
    };
    fetchRegime();
    const t = setInterval(fetchRegime, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/dashboard"  element={<Dashboard/>} />
          <Route path="/signals"    element={<Signals/>}   />
          <Route path="/proposals"  element={<Proposals/>} />
          <Route path="/positions"  element={<Positions/>} />
          <Route path="/portfolio"  element={<Portfolio/>} />
          <Route path="/audit"      element={<AuditLog/>}  />
          <Route path="/settings"   element={<Settings/>}  />
          <Route path="/wallets"   element={<WalletConnect/>} />
          <Route path="/withdrawals" element={<WithdrawalPage/>} />
          <Route path="/pnl"      element={<PnLDashboard/>} />
          <Route path="/admin/kyc"  element={<AdminKycQueue/>} />
          <Route path="/admin/ops"  element={<AdminOperations/>} />
          <Route path="/kyc"        element={<KycSubmission/>} />
          <Route path="*"           element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const location = useLocation();

  useEffect(() => {
    bootstrap();
    // initAnalytics() always runs - it loads PostHog opted-out by default
    // (verified against posthog-js's own type definitions) so it's silent
    // until setAnalyticsConsent(true) below, never a tracking-before-
    // consent problem. Chat has no such opt-out API, so initChat() itself
    // only ever runs once consent is actually granted.
    initAnalytics();
    return onConsentChange((prefs) => {
      setAnalyticsConsent(!!prefs?.analytics);
      if (prefs?.chat) initChat();
      else hideChat();
    });
  }, []);

  // React Router's client-side navigation never fires a real page load, so
  // this is the only thing that tells analytics a route actually changed.
  useEffect(() => {
    trackPageview(location.pathname);
  }, [location.pathname]);

  return (
    <>
    <Suspense fallback={<RouteFallback />}>
    <Routes>
      <Route path="/" element={<RootRoute/>} />
      {/* Unconditional — RootRoute above redirects an authenticated session
          straight to /dashboard, so a logged-in user (or a link shared from
          one) needs a stable URL that always shows the marketing homepage. */}
      <Route path="/home" element={<HomePage/>} />
      <Route path="/login" element={<LoginPage/>} />
      <Route path="/signup" element={<SignupPage/>} />
      <Route path="/verify-email" element={<VerifyEmailPage/>} />
      <Route path="/forgot-password" element={<ForgotPasswordPage/>} />
      <Route path="/reset-password" element={<ResetPasswordPage/>} />
      <Route path="/subscribe" element={<SubscribePage/>} />
      <Route path="/terms" element={<Terms/>} />
      <Route path="/privacy" element={<Privacy/>} />
      <Route path="/architecture" element={<ArchitecturePage/>} />
      <Route path="/security" element={<SecurityPage/>} />
      <Route path="/blog" element={<BlogIndex/>} />
      <Route path="/blog/:slug" element={<BlogPost/>} />
      <Route path="/onboarding" element={<RouteGuard onboardingExempt><OnboardingPage/></RouteGuard>} />
      {/* Phantom's deep-link redirect can land here for a user who is still
          mid-onboarding (deposit-sweep approval now happens in Stage 9) -
          this must be reachable regardless of onboarding-completion status.
          Previously nested inside AuthenticatedApp's single non-exempt
          RouteGuard, which bounced any incomplete-onboarding user straight
          back to /onboarding before WalletCallback's own effect ever ran -
          a real, latent bug that predates this session's onboarding
          changes, only surfaced once the mobile deep-link path was
          actually exercised for the first time. */}
      <Route path="/wallet-callback" element={<RouteGuard onboardingExempt><WalletCallback/></RouteGuard>} />
      <Route path="/unsubscribe" element={<SubscribePage/>} />
      <Route path="/*" element={
        <RouteGuard>
          <AuthenticatedApp/>
        </RouteGuard>
      }/>
    </Routes>
    </Suspense>
    <CookieConsentBanner/>
    </>
  );
}
