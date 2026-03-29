import type { Metadata } from 'next';
import { Inter, Roboto_Mono } from "next/font/google";
import Script from 'next/script';
import { Providers } from './providers';
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "TraviXO",
    template: "%s | TraviXO",
  },
  description: "Asset Tracking & VGP Compliance for Equipment Rental Companies",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${robotoMono.variable}`}>
        <Providers>
          {children}
        </Providers>
        <Script
          id="register-sw"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(console.error); }`,
          }}
        />
      </body>
    </html>
  );
}
