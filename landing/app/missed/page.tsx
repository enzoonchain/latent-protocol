import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Missed } from "@/components/Missed";

export const metadata: Metadata = {
  title: "What you left on the table — Latent",
  description:
    "Scan Hermes, Codex, MiMo, or OpenClaw. See how much USDC you could have earned without Latent — and what you will earn when you turn it on.",
};

export default function MissedPage() {
  return (
    <>
      <Nav />
      <Missed />
      <Footer />
    </>
  );
}
