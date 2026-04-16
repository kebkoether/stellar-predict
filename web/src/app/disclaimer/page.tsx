export default function DisclaimerPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-4xl font-bold text-white mb-2">Disclaimer</h1>
      <p className="text-sm text-slate-500 mb-10">Last updated: April 2026</p>

      <div className="space-y-8 text-slate-300 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-white mb-3">Not Financial Advice</h2>
          <p>
            The information displayed on Stellar (H)edge — including market prices,
            probabilities, oracle reference prices, and trading volumes — is for
            informational purposes only. Nothing on this platform constitutes financial
            advice, investment advice, or a recommendation to buy or sell any asset.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">Risk of Loss</h2>
          <p>
            Prediction market trading involves substantial risk of loss. You should only
            trade with funds you can afford to lose. Market prices reflect aggregate
            opinion, not certainty — events may resolve differently than expected.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">No Guarantees</h2>
          <p>
            The Platform is provided on an "as-is" and "as-available" basis. We make no
            guarantees regarding uptime, accuracy of displayed information, or the outcome
            of any market. Oracle reference prices are sourced from third-party APIs
            and may be delayed, inaccurate, or unavailable.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">Smart Contract Risk</h2>
          <p>
            While we make every effort to ensure the integrity of our matching engine
            and settlement logic, software bugs are possible. Blockchain transactions
            are irreversible. Always verify transaction details before signing with
            your wallet.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">Regulatory Status</h2>
          <p>
            Stellar (H)edge is an experimental platform. The regulatory status of
            prediction markets varies by jurisdiction. It is your responsibility to
            determine whether participation is lawful in your location. We do not
            provide legal advice.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">Market Resolution</h2>
          <p>
            Markets are resolved based on observable real-world outcomes. In cases of
            ambiguity, the platform operators make the final determination. Resolution
            decisions are final and binding. If you disagree with a resolution, you may
            submit a dispute through our{' '}
            <a href="/contact" className="text-green-400 hover:underline">
              contact form
            </a>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">Third-Party Links</h2>
          <p>
            The Platform may contain links to third-party websites or services. We are
            not responsible for the content, privacy practices, or availability of these
            external resources.
          </p>
        </section>
      </div>
    </div>
  )
}
