import type { Metadata, Viewport } from 'next'
import { Fraunces, Geist_Mono, Instrument_Serif, Outfit } from 'next/font/google'
import localFont from 'next/font/local'
import { Providers } from './providers'
import './globals.css'

const fraunces = Fraunces({ subsets: ['latin'], display: 'swap', variable: '--font-fraunces' })
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['italic', 'normal'],
  display: 'swap',
  variable: '--font-instrument-serif',
})
const outfit = Outfit({ subsets: ['latin'], display: 'swap', variable: '--font-outfit' })
const geistMono = Geist_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-geist-mono' })
const calSans = localFont({
  src: '../public/fonts/CalSans-Regular.woff2',
  weight: '400',
  display: 'swap',
  variable: '--font-cal-sans',
})

export const metadata: Metadata = {
  title: 'Lyra AI — a Sui-native, policy-bound AI agent',
  description:
    'The AI proposes. Sui policies enforce. Walrus remembers. A Sui-native AI agent for autonomous DeFi — every action checked against an on-chain policy and recorded as a verifiable Walrus receipt.',
  applicationName: 'lyra',
}

export const viewport: Viewport = {
  themeColor: '#0e0d0a',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${fraunces.variable} ${instrumentSerif.variable} ${outfit.variable} ${geistMono.variable} ${calSans.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
