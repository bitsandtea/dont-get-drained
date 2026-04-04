import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import TopNav from "@/components/TopNav";
import { TxToasterProvider } from "@/components/TxToaster";
import { WalletProvider } from "@/components/WalletProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Swap Guard",
  description: "AI-powered transaction firewall for Safe wallets",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <WalletProvider>
          <TxToasterProvider>
            <TopNav />
            {children}
          </TxToasterProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
