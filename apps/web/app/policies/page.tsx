import { LegalSection, LegalShell } from '@/components/legal/LegalShell'

export const metadata = {
  title: 'Other Policies · lyra',
  description:
    'Acceptable use, risk disclosure, responsible disclosure, and open-source licensing for lyra.',
}

export default function PoliciesPage() {
  return (
    <LegalShell
      label="policies"
      title="Other Policies"
      updated="June 15, 2026"
      intro="Supplementary policies that sit alongside our Terms of Use and Privacy Policy."
    >
      <LegalSection heading="Acceptable Use">
        <p>
          Don’t use lyra to break the law, to launder funds, to attempt to bypass its policy or
          safety controls, to abuse rate limits or infrastructure, or to harm others. We may suspend
          access that threatens the Service or other users.
        </p>
      </LegalSection>

      <LegalSection heading="Risk Disclosure">
        <p>
          DeFi carries real risk: smart-contract bugs, market volatility, slippage, liquidation,
          oracle failures, and bridge or protocol exploits. Simulations and policy checks reduce
          mistakes but cannot eliminate risk. Never commit funds you can’t afford to lose, and review
          every action before you sign.
        </p>
      </LegalSection>

      <LegalSection heading="Responsible Disclosure">
        <p>
          Found a security issue? Please report it privately before disclosing publicly — reach us via{' '}
          <a className="underline" href="https://x.com/lyraai_space" target="_blank" rel="noreferrer">
            @lyraai_space
          </a>{' '}
          or by opening a security advisory on{' '}
          <a
            className="underline"
            href="https://github.com/rifkyeasy/lyra/security"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          . We appreciate good-faith research and will not pursue researchers who act responsibly.
        </p>
      </LegalSection>

      <LegalSection heading="Open-source licensing">
        <p>
          lyra’s SDK and CLI are published as open-source packages. Your use of those packages is
          governed by their respective licenses in the{' '}
          <a
            className="underline"
            href="https://github.com/rifkyeasy/lyra"
            target="_blank"
            rel="noreferrer"
          >
            source repository
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>These policies may be updated as the Service evolves.</p>
      </LegalSection>
    </LegalShell>
  )
}
