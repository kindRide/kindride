import CommunityNetworkSection from "@/components/CommunityNetworkSection";
import DifferenceSection from "@/components/DifferenceSection";
import DriverStories from "@/components/DriverStories";
import HubApplicationForm from "@/components/HubApplicationForm";
import HubShowcase from "@/components/HubShowcase";
import LiveCounter from "@/components/LiveCounter";
import LiveImpactWall from "@/components/LiveImpactWall";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-[#0c1f3f]">
      <nav className="flex items-center justify-between px-8 py-6">
        <span className="text-2xl font-black tracking-tight text-white">
          Kind<span className="text-teal-400">Ride</span>
        </span>
        <div className="flex gap-6 text-sm font-semibold text-white/70">
          <a href="#hubs" className="transition-colors hover:text-white">
            Hubs
          </a>
          <a href="#difference" className="transition-colors hover:text-white">
            Why Us
          </a>
          <a href="#apply" className="transition-colors hover:text-white">
            Join as Hub
          </a>
        </div>
      </nav>

      <section className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-24 text-center">
        <div className="flex flex-col items-center gap-3">
          <span className="text-sm font-bold uppercase tracking-widest text-teal-400">
            Community Rideshare
          </span>
          <h1 className="max-w-3xl text-5xl font-black leading-tight text-white md:text-7xl">
            Your neighbor
            <br />
            is your driver.
          </h1>
          <p className="mt-2 max-w-xl text-xl text-white/60">
            Not Uber. Not Lyft. A community that moves together.
          </p>
        </div>

        <LiveCounter />

        <div className="mt-4 flex flex-col gap-4 sm:flex-row">
          <a
            href="#download"
            className="rounded-2xl bg-teal-500 px-8 py-4 text-lg font-bold text-white transition-colors hover:bg-teal-400"
          >
            Download the App
          </a>
          <a
            href="#apply"
            className="rounded-2xl border border-white/20 bg-white/10 px-8 py-4 text-lg font-bold text-white transition-colors hover:bg-white/20"
          >
            {"Join as a Hub ->"}
          </a>
        </div>
      </section>

      <section className="border-t border-white/10 bg-[#0a1628] px-8 py-10">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 text-center sm:grid-cols-3">
          {[
            { label: "Community hubs", value: "Growing" },
            { label: "CO2 saved (est.)", value: "Tons" },
            { label: "Kind Points awarded", value: "Thousands" },
          ].map((item) => (
            <div key={item.label} className="flex flex-col gap-1">
              <span className="text-4xl font-black text-teal-400">{item.value}</span>
              <span className="text-sm font-semibold uppercase tracking-wider text-white/50">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#060f1e] px-8 py-24">
        <LiveImpactWall />
      </section>

      <section className="bg-[#0c1f3f] px-8 py-24">
        <CommunityNetworkSection />
      </section>

      <section id="difference" className="bg-[#0c1f3f] px-8 py-24">
        <DifferenceSection />
      </section>

      <section className="bg-[#060f1e] px-8 py-24">
        <DriverStories />
      </section>

      <section id="hubs" className="bg-[#f8fafc] px-8 py-24">
        <HubShowcase />
      </section>

      <section id="apply" className="bg-[#0c1f3f] px-8 py-24">
        <HubApplicationForm />
      </section>

      <footer className="bg-[#060f1e] px-8 py-10 text-center text-sm text-white/40">
        <p className="mb-2 font-bold text-white/70">KindRide</p>
        <p className="mb-4">Moving communities, one neighbor at a time.</p>
        <a href="mailto:admin@kindride.app" className="transition-colors hover:text-white">
          admin@kindride.app
        </a>
        <p className="mt-4 text-xs text-white/20">
          &copy; {new Date().getFullYear()} KindRide. All rights reserved.
        </p>
      </footer>
    </main>
  );
}
