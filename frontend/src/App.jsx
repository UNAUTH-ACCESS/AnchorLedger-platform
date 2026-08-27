import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { RouteGuard } from "./components/auth/RouteGuard";
import { AppShell } from "./components/layout/AppShell";
import { useSocket } from "./hooks/useSocket";
import useAuthStore from "./store/auth.store";
import useSystemStore from "./store/system.store";
import { signals as signalsApi } from "./api/endpoints";
import { initAnalytics, trackPageview } from "./lib/analytics";
import { initChat } from "./lib/chat";

// Pages
import LoginPage    from "./pages/login/LoginPage";
import SignupPage   from "./pages/login/SignupPage";
import VerifyEmailPage from "./pages/verify-email/VerifyEmailPage";
import ForgotPasswordPage from "./pages/forgot-password/ForgotPasswordPage";
import ResetPasswordPage  from "./pages/reset-password/ResetPasswordPage";
import Dashboard    from "./pages/dashboard/Dashboard";
import Signals      from "./pages/signals/Signals";
import Proposals    from "./pages/proposals/Proposals";
import Positions    from "./pages/positions/Positions";
import Portfolio    from "./pages/portfolio/Portfolio";
import AuditLog     from "./pages/audit/AuditLog";
import Settings       from "./pages/settings/Settings";
import WalletConnect  from "./pages/wallets/WalletConnect";
import PnLDashboard  from "./pages/pnl/PnLDashboard";
import SubscribePage   from "./pages/subscribe/SubscribePage";
import OnboardingPage from "./pages/onboarding/OnboardingPage";
import AdminKycQueue from "./pages/admin/AdminKycQueue";
import AdminOperations from "./pages/admin/AdminOperations";
import WalletCallback from "./pages/wallets/WalletCallback";
import Terms from "./pages/legal/Terms";
import Privacy from "./pages/legal/Privacy";
import ArchitecturePage from "./pages/architecture/ArchitecturePage";
import SecurityPage from "./pages/security/SecurityPage";
import KycSubmission from "./pages/kyc/KycSubmission";
import WithdrawalPage from "./pages/withdrawals/WithdrawalPage";
import HomePage from "./pages/home/HomePage";

function RootRoute() {
  const { status } = useAuthStore();

  // Don't flash the marketing page for a returning session that's about to
  // resolve to "authenticated" — same loading treatment RouteGuard uses.
  if (status === "authenticating") {
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
    </AppShell>
  );
}

export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const location = useLocation();

  useEffect(() => {
    bootstrap();
    initAnalytics();
    initChat();
  }, []);

  // React Router's client-side navigation never fires a real page load, so
  // this is the only thing that tells analytics a route actually changed.
  useEffect(() => {
    trackPageview(location.pathname);
  }, [location.pathname]);

  return (
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
  );
}
