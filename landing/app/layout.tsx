import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Latent — Monetize the Void",
  description:
    "Crypto-native ad marketplace for AI agents. x402 micropayments on Base. Get paid to wait.",
  openGraph: {
    title: "Latent — Monetize the Void",
    description:
      "Crypto-native ad marketplace for AI agents. x402 micropayments on Base.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="engrave-texture" />
          <div className="grain" />
          {children}
        </Providers>
      </body>
    </html>
  );
}
