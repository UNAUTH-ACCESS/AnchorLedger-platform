import { LegalLayout, Section, P, UL } from "./LegalLayout";

export default function Privacy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      effectiveDate="August 27, 2026"
      operator="Anchor Ledger, a sole proprietorship operated from Germany. [NOTE — see the equivalent note in the Terms of Service regarding personal liability and German Impressum disclosure requirements.]"
    >
      <Section n={1} title="Introduction">
        <P>
          This Privacy Policy explains what information Anchor Ledger ("we," "us") collects when you use the Platform, how it is used, and the choices available to you. It applies to all Users of the Platform.
        </P>
      </Section>

      <Section n={2} title="Information We Collect">
        <p style={{ fontWeight: 600, color: "inherit", margin: "0 0 8px" }}>Account and identity information:</p>
        <UL items={[
          "Email address, hashed password, and workspace/account details you provide at signup.",
          "For identity verification: legal name, date of birth, country of residence and citizenship, address, government ID type and number, and images of your identity document(s) and a selfie. This is encrypted at rest and access-restricted to authorized review.",
        ]}/>
        <p style={{ fontWeight: 600, color: "inherit", margin: "0 0 8px" }}>Wallet and trading information:</p>
        <UL items={[
          "Public wallet addresses you link to your account, and the on-chain delegated-authority status of each.",
          "Trading activity generated through the Platform: signals acted on, trade proposals, executions, positions, and performance history.",
        ]}/>
        <p style={{ fontWeight: 600, color: "inherit", margin: "0 0 8px" }}>Technical and device information:</p>
        <UL items={[
          "Device identifiers used for security features such as recognized-device tracking and two-factor authentication.",
          "Standard web request metadata (IP address, browser/user-agent, timestamps) as captured in server logs.",
        ]}/>
        <p style={{ fontWeight: 600, color: "inherit", margin: "0 0 8px" }}>Communications:</p>
        <UL items={[
          "Records of transactional emails sent to you (e.g., verification, KYC decisions, password resets, trade/risk notifications) and their delivery status.",
        ]}/>
      </Section>

      <Section n={3} title="How We Use Information">
        <UL items={[
          "To create and secure your account, including authentication and known-device recognition.",
          "To perform identity verification and comply with our own risk-management standards.",
          "To operate the Platform's core function: generating signals and executing delegated trades on your behalf.",
          "To send you transactional notifications about your account, trades, risk events, and KYC status.",
          "To investigate and prevent fraud, abuse, or security incidents.",
          "To comply with legal obligations where applicable.",
        ]}/>
        <P>
          We do not use your identity-verification documents or trading data for advertising, and we do not sell your personal information.
        </P>
      </Section>

      <Section n={4} title="How Information Is Shared">
        <P>We share information only as necessary to operate the Platform:</P>
        <UL items={[
          "With infrastructure and service providers who process data on our behalf (e.g., our email-delivery provider, for sending transactional notifications), under confidentiality obligations.",
          "With blockchain networks themselves — note that wallet addresses and on-chain transactions are, by the nature of public blockchains, visible on-chain regardless of anything Anchor Ledger does.",
          "Where required by law, regulation, or valid legal process.",
          "In connection with a merger, acquisition, or sale of assets, subject to continued protection of your information under materially similar terms.",
        ]}/>
        <P>
          We do not otherwise sell, rent, or share your personal information with third parties for their own marketing purposes.
        </P>
      </Section>

      <Section n={5} title="Data Security">
        <P>
          Identity-verification documents are encrypted at rest. Access to identity-verification data is restricted to personnel/processes with a legitimate need to review it. No system is perfectly secure, and we cannot guarantee absolute security of information transmitted to or stored by the Platform.
        </P>
      </Section>

      <Section n={6} title="Data Retention">
        <P>
          We retain account information for as long as your account is active. Identity-verification records are retained for 5 years after account closure, a period commonly required under anti-money-laundering recordkeeping practices [SPECIFIC RETENTION PERIODS — CONFIRM WITH COUNSEL against the AML/KYC regime actually applicable once an operating entity and its jurisdiction are established]. On-chain data (wallet addresses, transaction records) persists on public blockchains independently of Anchor Ledger and cannot be deleted by us.
        </P>
      </Section>

      <Section n={7} title="Your Rights">
        <P>
          Because Anchor Ledger is operated from Germany, the EU General Data Protection Regulation (GDPR) applies to our processing of your information regardless of where you personally are located — this follows from where we operate, not from targeting any particular region. Under GDPR, you have the right to access, rectify, erase, or restrict processing of your personal information, to data portability, to object to certain processing, and to lodge a complaint with a supervisory authority (in Germany, the competent State Data Protection Authority). To make a request, contact us using the details in Section 11. [CONFIRM WITH COUNSEL that our actual practices satisfy each of these rights in full — this section states the rights that apply, not yet a complete operational process for fulfilling every request type.] Note that we may be unable to delete certain records where retention is required for security, legal, or regulatory reasons, and that on-chain data cannot be altered or deleted by us regardless of request.
        </P>
      </Section>

      <Section n={8} title="International Data Transfers">
        <P>
          The Platform may process and store information in countries other than your own. Our primary infrastructure (database and application servers) is hosted in the Netherlands, within the EU, alongside our own operation from Germany. Some third-party processors we rely on (see Section 9 — email delivery, analytics, live chat) may store or process data outside the EU depending on their own infrastructure. [CONFIRM WITH COUNSEL which of these processors' data flows require standard contractual clauses or another Article 46 GDPR safeguard — this has not yet been verified processor-by-processor.]
        </P>
      </Section>

      <Section n={9} title="Cookies and Tracking">
        <P>
          We use PostHog, a third-party analytics provider, to understand how visitors use the
          Platform and to improve it. This is limited to:
        </P>
        <UL items={[
          "Which pages you view and when, so we know what's actually working",
          "Your account ID once you're logged in, so we can see the path from a first visit to a signed-up account",
        ]}/>
        <P>
          We do not use session recording, and we do not automatically capture clicks, keystrokes,
          or form input — only the specific events listed above are ever sent. Logging out clears
          this identification from your device.
        </P>
        <P>
          We also use Smartsupp for live chat support. If you use it while logged in, your email
          address and account ID are shared with Smartsupp so a support reply can reach you and
          reference your account — chat messages themselves are stored by Smartsupp, not on our
          servers. Unlike our analytics provider, Smartsupp does not currently offer a way for us
          to clear this identification when you log out — on a shared or public device, we
          recommend clearing your browser's cookies for this site afterward.
        </P>
        <P>
          Because Anchor Ledger is operated from Germany, GDPR/ePrivacy rules on consent for
          non-essential cookies apply here regardless of visitor location, the same as the rights
          described in Section 7. Both PostHog and Smartsupp are off by default and load only
          after you make a choice in the cookie banner shown on your first visit — analytics and
          chat can each be individually accepted or rejected via "Customize," and you can change
          that choice at any time via "Cookie Settings" in the footer or "Manage Cookie
          Preferences" in Settings. [CONFIRM WITH COUNSEL that this implementation — banner
          copy, granularity, and the underlying opt-in/opt-out mechanism — actually satisfies
          GDPR/ePrivacy requirements; this is a good-faith implementation, not a legal sign-off.]
        </P>
      </Section>

      <Section n={10} title="Children's Privacy">
        <P>
          The Platform is not directed to individuals under 18, and we do not knowingly collect information from anyone under 18. If we become aware that we have done so, we will take steps to delete that information.
        </P>
      </Section>

      <Section n={11} title="Contact">
        <P>
          Questions about this Privacy Policy, or requests regarding your information, may be directed to support@anchorledger.space.
        </P>
      </Section>

      <Section n={12} title="Changes to This Policy">
        <P>
          We may update this Privacy Policy from time to time. Material changes will be communicated to Users through the Platform or by email prior to taking effect.
        </P>
      </Section>
    </LegalLayout>
  );
}
