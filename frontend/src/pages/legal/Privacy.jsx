import { LegalLayout, Section, P, UL } from "./LegalLayout";

export default function Privacy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      effectiveDate="[TO BE COMPLETED UPON LAUNCH]"
      operator="[LEGAL NAME / ENTITY — TO BE COMPLETED]"
    >
      <Section n={1} title="Introduction">
        <P>
          This Privacy Policy explains what information QuantEdge ("we," "us") collects when you use the Platform, how it is used, and the choices available to you. It applies to all Users of the Platform.
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
          "With blockchain networks themselves — note that wallet addresses and on-chain transactions are, by the nature of public blockchains, visible on-chain regardless of anything QuantEdge does.",
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
          We retain account and identity-verification information for as long as your account is active and for a period afterward as required for legal, security, or dispute-resolution purposes [SPECIFIC RETENTION PERIODS TO BE SET WITH COUNSEL, informed by applicable law]. On-chain data (wallet addresses, transaction records) persists on public blockchains independently of QuantEdge and cannot be deleted by us.
        </P>
      </Section>

      <Section n={7} title="Your Rights">
        <P>
          Depending on where you are located, you may have rights to access, correct, or request deletion of your personal information, or to object to certain processing. [SPECIFIC RIGHTS AND MECHANISMS TO BE FINALIZED WITH COUNSEL BASED ON APPLICABLE LAW — e.g. NDPR for Nigerian residents, GDPR for EU/UK residents, CCPA for California residents.] To make a request, contact us using the details in Section 11. Note that we may be unable to delete certain records where retention is required for security, legal, or regulatory reasons, and that on-chain data cannot be altered or deleted by us regardless of request.
        </P>
      </Section>

      <Section n={8} title="International Data Transfers">
        <P>
          The Platform may process and store information in countries other than your own. [SPECIFIC TRANSFER SAFEGUARDS — e.g. standard contractual clauses — TO BE CONFIRMED WITH COUNSEL if serving EU/UK residents.]
        </P>
      </Section>

      <Section n={9} title="Cookies and Tracking">
        <P>
          [TO BE COMPLETED based on actual analytics/cookie usage in the product — if none currently in use, state that explicitly; if added later, this section and any required consent banner must be updated accordingly.]
        </P>
      </Section>

      <Section n={10} title="Children's Privacy">
        <P>
          The Platform is not directed to individuals under 18, and we do not knowingly collect information from anyone under 18. If we become aware that we have done so, we will take steps to delete that information.
        </P>
      </Section>

      <Section n={11} title="Contact">
        <P>
          Questions about this Privacy Policy, or requests regarding your information, may be directed to [SUPPORT/PRIVACY CONTACT EMAIL — TO BE COMPLETED].
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
