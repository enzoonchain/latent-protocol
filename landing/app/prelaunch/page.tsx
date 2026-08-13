import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Prelaunch } from "@/components/Prelaunch";

export const metadata: Metadata = {
  title: "Pre-launch — Latent",
  description:
    "Register a wallet before Latent goes live. Scan Hermes, Codex, MiMo, or OpenClaw and see what you left on the table.",
};

export default function PrelaunchPage() {
  return (
    <>
      <Nav />
      <Prelaunch />
      <Footer />
    </>
  );
}
