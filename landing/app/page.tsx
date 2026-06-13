import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Ticker } from "@/components/Ticker";
import { HowItWorks } from "@/components/HowItWorks";
import { AdSurfaces } from "@/components/AdSurfaces";
import { Economics } from "@/components/Economics";
import { Protocol } from "@/components/Protocol";
import { Plate } from "@/components/Plate";
import { OpenSource } from "@/components/OpenSource";
import { Install } from "@/components/Install";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <main className="relative z-10">
      <Nav />
      <Hero />
      <Ticker />
      <HowItWorks />
      <AdSurfaces />
      <Economics />
      <Protocol />
      <Plate />
      <OpenSource />
      <Install />
      <Footer />
    </main>
  );
}
