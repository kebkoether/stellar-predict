export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-4xl font-bold text-white mb-2">Privacy Policy</h1>
      <p className="text-sm text-slate-500 mb-10">Last updated: April 2026</p>

      <div className="space-y-8 text-slate-300 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-white mb-3">Overview</h2>
          <p>
            Stellar (H)edge is designed with privacy in mind. We collect the minimum
            amount of information necessary to operate the platform. We do not sell
            your data to third parties.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">What We Collect</h2>
          <p>
            <span className="font-semibold text-white">Wallet address:</span> When you
            connect your Freighter wallet, we store your Stellar public key to track
            balances, orders, and positions. We never access your private keys.
          </p>
          <p className="mt-3">
            <span className="font-semibold text-white">Trading data:</span> Orders,
            trades, deposits, and withdrawals are recorded for orderbook integrity,
            settlement, and dispute resolution.
          </p>
          <p className="mt-3">
            <span className="font-semibold text-white">Contact form submissions:</span> If
            you use our contact form, we store your name, email, and message to respond
            to your inquiry.
          </p>
          <p className="mt-3">
            <span className="font-semibold text-white">Usage analytics:</span> We may
            collect anonymized usage data (page views, feature engagement) to improve the
            platform. No personally identifiable information is included.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">What We Don&apos;t Collect</h2>
          <p>
            We do not collect your real name, government ID, phone number, or any
            personal information beyond what you voluntarily submit through our contact
            form. We do not run KYC/AML checks — your wallet address is your identity
            on the platform.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">Blockchain Transparency</h2>
          <p>
            Deposits and withdrawals settle on the Stellar public blockchain. Transactions
            on Stellar are publicly visible and permanent. This is a feature of
            blockchain-based settlement, not a privacy vulnerability — your wallet
            address is pseudonymous.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">Data Retention</h2>
          <p>
            Trading records are retained for the lifetime of the platform to ensure
            orderbook integrity and auditability. Contact form submissions are retained
            for up to 12 months. You may request deletion of contact data by emailing us.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">Cookies</h2>
          <p>
            The platform uses only essential cookies for session management. We do not
            use advertising or tracking cookies.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">Third-Party Services</h2>
          <p>
            Oracle reference prices are fetched from Polymarket&apos;s public API. No
            user data is shared with Polymarket or any other third party in this process.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-3">Contact</h2>
          <p>
            For privacy questions or data deletion requests, email{' '}
            <a href="mailto:klint@stellar.org" className="text-green-400 hover:underline">
              klint@stellar.org
            </a>.
          </p>
        </section>
      </div>
    </div>
  )
}
