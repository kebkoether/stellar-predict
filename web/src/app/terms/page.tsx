export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-4xl font-bold text-white mb-2">Terms of Service</h1>
      <p className="text-sm text-slate-500 mb-10">Last updated: April 2026</p>

      <div className="prose-custom space-y-8 text-slate-300 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-white mb-3">1. Acceptance</h2>
          <p>
            By accessing or using the Stellar (H)edge platform ("Platform"), you agree to
            be bound by these Terms of Service. If you do not agree, do not use the Platform.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">2. Eligibility</h2>
          <p>
            You must be at least 18 years old and legally permitted to use prediction markets
            in your jurisdiction. The Platform is not available to residents of jurisdictions
            where prediction market participation is prohibited by law.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">3. Platform Description</h2>
          <p>
            Stellar (H)edge is a peer-to-peer prediction market platform built on the
            Stellar blockchain. Users trade outcome shares on real-world events using
            USDC. All orders are matched against other users — the platform does not
            take the opposite side of any trade.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">4. Non-Custodial Wallet</h2>
          <p>
            You connect your own Stellar wallet (e.g., Freighter) to interact with the
            Platform. We do not hold your private keys, seed phrases, or passwords.
            You are solely responsible for the security of your wallet.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">5. Trading and Settlement</h2>
          <p>
            All trades settle in USDC on the Stellar network. Winning shares pay $1.00
            each upon market resolution. A 2% taker fee is deducted from winning payouts.
            Market resolution is determined by observable real-world outcomes.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">6. Market Creation Bond</h2>
          <p>
            Creating a new market requires a $25 USDC bond, which is refunded in full
            when the market resolves. This bond discourages spam and ensures market
            creators have skin in the game.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">7. Risks</h2>
          <p>
            Trading prediction market shares involves financial risk. You may lose some
            or all of the funds you deposit. Prices reflect market opinion, not certainty.
            Past performance of any market or outcome does not guarantee future results.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">8. Oracle Reference Prices</h2>
          <p>
            Some markets display reference prices sourced from external oracles
            (e.g., Polymarket). These are informational only and do not constitute
            financial advice or guaranteed pricing. All orders are placed and filled
            based on user-submitted prices.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">9. Prohibited Conduct</h2>
          <p>
            You agree not to: manipulate markets through wash trading or collusion;
            use the Platform for money laundering or other illicit purposes; attempt to
            exploit bugs or vulnerabilities; or interfere with other users&apos; ability
            to use the Platform.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">10. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Stellar (H)edge and its operators
            shall not be liable for any indirect, incidental, or consequential damages
            arising from your use of the Platform. The Platform is provided "as is"
            without warranties of any kind.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">11. Changes to Terms</h2>
          <p>
            We may update these Terms at any time. Continued use of the Platform after
            changes are posted constitutes acceptance of the revised Terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">12. Contact</h2>
          <p>
            Questions about these Terms? Reach out at{' '}
            <a href="mailto:klint@stellar.org" className="text-green-400 hover:underline">
              klint@stellar.org
            </a>{' '}
            or through our{' '}
            <a href="/contact" className="text-green-400 hover:underline">
              contact form
            </a>.
          </p>
        </section>
      </div>
    </div>
  )
}
