import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'
import { WalletProvider } from '@/context/WalletContext'

export const metadata: Metadata = {
  title: 'Stellar Foresure - Prediction Markets on Stellar',
  description: 'Prediction market platform on Stellar',
  viewport: 'width=device-width, initial-scale=1',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-white">
        <WalletProvider>
          <Navbar />
          <main className="min-h-screen">
            {children}
          </main>
          <footer className="border-t border-slate-800 bg-slate-900 py-8 mt-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
                <div>
                  <h4 className="font-semibold text-white mb-4">About</h4>
                  <ul className="space-y-2 text-slate-400 text-sm">
                    <li><a href="#" className="hover:text-white transition">About Us</a></li>
                    <li><a href="#" className="hover:text-white transition">Blog</a></li>
                    <li><a href="#" className="hover:text-white transition">Careers</a></li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-white mb-4">Developers</h4>
                  <ul className="space-y-2 text-slate-400 text-sm">
                    <li><a href="#" className="hover:text-white transition">Documentation</a></li>
                    <li><a href="#" className="hover:text-white transition">API</a></li>
                    <li><a href="#" className="hover:text-white transition">GitHub</a></li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-white mb-4">Legal</h4>
                  <ul className="space-y-2 text-slate-400 text-sm">
                    <li><a href="#" className="hover:text-white transition">Terms of Service</a></li>
                    <li><a href="#" className="hover:text-white transition">Privacy Policy</a></li>
                    <li><a href="#" className="hover:text-white transition">Disclaimer</a></li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-white mb-4">Connect</h4>
                  <ul className="space-y-2 text-slate-400 text-sm">
                    <li><a href="#" className="hover:text-white transition">Twitter</a></li>
                    <li><a href="#" className="hover:text-white transition">Discord</a></li>
                    <li><a href="#" className="hover:text-white transition">Email</a></li>
                  </ul>
                </div>
              </div>
              <div className="border-t border-slate-800 pt-8 text-center text-slate-400 text-sm">
                <p>&copy; 2026 Stellar Foresure. All rights reserved.</p>
              </div>
            </div>
          </footer>
        </WalletProvider>
      </body>
    </html>
  )
}
