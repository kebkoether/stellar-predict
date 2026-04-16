import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'
import { WalletProvider } from '@/context/WalletContext'
import { ToastProvider } from '@/components/Toast'

export const metadata: Metadata = {
  title: 'Stellar (H)edge — Prediction Markets on Stellar',
  description: 'Hedge your conviction. Prediction markets settled on-chain.',
  viewport: 'width=device-width, initial-scale=1',
  icons: {
    icon: '/favicon.svg',
  },
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
          <ToastProvider>
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
                    <li><a href="/about" className="hover:text-white transition">About Us</a></li>
                    <li><a href="/contact" className="hover:text-white transition">Contact</a></li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-white mb-4">Developers</h4>
                  <ul className="space-y-2 text-slate-400 text-sm">
                    <li><a href="/docs" className="hover:text-white transition">API Documentation</a></li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-white mb-4">Legal</h4>
                  <ul className="space-y-2 text-slate-400 text-sm">
                    <li><a href="/terms" className="hover:text-white transition">Terms of Service</a></li>
                    <li><a href="/privacy" className="hover:text-white transition">Privacy Policy</a></li>
                    <li><a href="/disclaimer" className="hover:text-white transition">Disclaimer</a></li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-white mb-4">Connect</h4>
                  <ul className="space-y-2 text-slate-400 text-sm">
                    <li><a href="mailto:klint@stellar.org" className="hover:text-white transition">Email</a></li>
                  </ul>
                </div>
              </div>
              <div className="border-t border-slate-800 pt-8 text-center text-slate-400 text-sm">
                <p>&copy; 2026 Stellar (H)edge. All rights reserved. Powered by Stellar.</p>
              </div>
            </div>
          </footer>
        </ToastProvider>
        </WalletProvider>
      </body>
    </html>
  )
}
