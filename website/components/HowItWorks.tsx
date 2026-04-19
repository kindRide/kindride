"use client";

import { motion } from "framer-motion";

// ── Story data ─────────────────────────────────────────────────────────────────

const PASSENGER_BEATS = [
  {
    time: "6:47 am",
    heading: "The alarm. The problem.",
    body: "Maya has a clinical rotation at 7:30. Her Uber balance says $2.14. The early hospital bus doesn't run this route. She's done the math already. It doesn't work.",
  },
  {
    time: "6:51 am",
    heading: "She opens the app.",
    body: "She drops a pin at the hospital. KindRide searches for drivers already heading that direction — not drivers for hire. Drivers who are simply going somewhere near her.",
  },
  {
    time: "6:53 am",
    heading: "A match. 22 seconds.",
    body: "Someone accepted her request while she was still putting on her shoes. She sees his name, his rating, and one detail that stops her: his route passes her street. The detour to pick her up — zero minutes.",
  },
  {
    time: "7:28 am",
    heading: "She walks in. On time.",
    body: "They didn't talk much. He turned the radio down when she got in. She noticed. She won't forget this particular Tuesday morning, even though nothing dramatic happened. That's the thing — it didn't need to.",
  },
];

const DRIVER_BEATS = [
  {
    time: "6:47 am",
    heading: "The same road. Again.",
    body: "Marcus has driven to work at UMD for three years. Same route, same time, Monday through Friday. The passenger seat has never carried anyone. It never once occurred to him that it should.",
  },
  {
    time: "6:49 am",
    heading: "He taps the power button.",
    body: "Before backing out of the driveway, he turned on his KindRide availability. Takes one second. He doesn't think of it as charity. He thinks of it as not wasting a seat that's going there anyway.",
  },
  {
    time: "6:53 am",
    heading: "A request. 0.4 miles away.",
    body: "A nursing student. The hospital. It's directly on his route — not slightly near it. Directly on it. He accepts before he finishes reading her name.",
  },
  {
    time: "7:31 am",
    heading: "10 Kind Points earned.",
    body: "Credited automatically when she marks arrived. He doesn't particularly care about the points. He cares that she made it. He's starting to understand that this is the thing that actually matters.",
  },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function Beat({
  beat,
  index,
  side,
}: {
  beat: { time: string; heading: string; body: string };
  index: number;
  side: "passenger" | "driver";
}) {
  const isDriver = side === "driver";
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, delay: index * 0.07 }}
      className={`rounded-2xl border p-6 ${
        isDriver
          ? "border-teal-900/60 bg-[#041f19]"
          : "border-white/8 bg-[#0a1628]"
      }`}
    >
      <p
        className={`mb-2 font-mono text-xs font-bold tracking-widest ${
          isDriver ? "text-teal-500" : "text-white/35"
        }`}
      >
        {beat.time}
      </p>
      <p className="mb-3 text-base font-black leading-snug text-white">
        {beat.heading}
      </p>
      <p className="text-sm leading-7 text-white/55">{beat.body}</p>
    </motion.div>
  );
}

function CharacterPill({
  name,
  detail,
  side,
}: {
  name: string;
  detail: string;
  side: "passenger" | "driver";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      className={`mb-6 inline-flex flex-col gap-1 rounded-2xl border px-5 py-3 ${
        side === "driver"
          ? "border-teal-900/60 bg-[#041f19]"
          : "border-white/10 bg-[#0a1628]"
      }`}
    >
      <span className="text-base font-black text-white">{name}</span>
      <span
        className={`text-xs font-semibold ${
          side === "driver" ? "text-teal-400" : "text-white/45"
        }`}
      >
        {detail}
      </span>
    </motion.div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function HowItWorks() {
  return (
    <div className="mx-auto max-w-6xl">

      {/* ── Section label ──────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        className="mb-6"
      >
        <p className="text-sm font-bold uppercase tracking-[0.28em] text-teal-400">
          How It Works
        </p>
      </motion.div>

      {/* ── The hook ───────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.55 }}
        className="mb-20"
      >
        <h2 className="mb-6 max-w-4xl text-4xl font-black leading-[1.1] tracking-tight text-white md:text-6xl">
          The ride was already
          <br />
          <span className="text-teal-400">happening.</span>
        </h2>
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:gap-16">
          <div>
            <p className="text-7xl font-black leading-none text-white md:text-9xl">
              35<span className="text-teal-400">%</span>
            </p>
            <p className="mt-3 text-sm font-bold uppercase tracking-[0.22em] text-white/35">
              of daily urban vehicle capacity travels empty
            </p>
          </div>
          <div className="max-w-lg">
            <p className="text-lg leading-8 text-white/60">
              The supply already exists — in driveways, on roads, in parking lots.
              Someone near you is heading somewhere right now, with an empty seat.
              They just don't know you need it.
            </p>
            <p className="mt-4 text-lg font-semibold leading-8 text-white/80">
              KindRide doesn&apos;t create trips. It reveals them.
            </p>
          </div>
        </div>
      </motion.div>

      {/* ── The story setup ─────────────────────────────────────────────────── */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        <CharacterPill
          name="Maya"
          detail="19 · Nursing student · No car · $2.14 Uber balance"
          side="passenger"
        />
        <CharacterPill
          name="Marcus"
          detail="34 · UMD facilities · Same route · 3 years · Empty passenger seat"
          side="driver"
        />
      </div>

      {/* ── Parallel story beats ─────────────────────────────────────────────── */}
      <div className="relative mb-6 flex flex-col gap-4">
        {/* Desktop: connector line down the center */}
        <div className="absolute bottom-0 left-1/2 top-0 hidden w-px -translate-x-1/2 bg-white/5 md:block" />

        {PASSENGER_BEATS.map((beat, i) => (
          <div key={i} className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-x-10">
            <Beat beat={beat} index={i} side="passenger" />
            <Beat beat={DRIVER_BEATS[i]} index={i} side="driver" />
          </div>
        ))}
      </div>

      {/* ── Convergence ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.6 }}
        className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-r from-[#0a1628] via-[#0d4a3a] to-[#041f19]"
      >
        <div className="border border-teal-900/50 p-10 text-center md:p-14">
          <p className="mb-2 font-mono text-sm font-bold tracking-widest text-teal-500">
            6:53 am · Tuesday
          </p>
          <p className="mb-6 text-2xl font-black leading-snug text-white md:text-4xl">
            Two people who had never met<br className="hidden md:block" /> shared a car for 34 minutes and 6.2 miles.
          </p>
          <p className="mx-auto max-w-xl text-lg text-white/55">
            Nobody paid. Nobody profited. Nobody owed anyone anything.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-8">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-white/40" />
              <p className="text-base font-semibold text-white/70">She made it to her rotation.</p>
            </div>
            <div className="hidden h-px w-8 bg-white/20 sm:block" />
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-teal-400" />
              <p className="text-base font-semibold text-white/70">He mattered on his commute.</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── The insight ──────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.5 }}
        className="mb-20 rounded-3xl border border-white/8 bg-[#0a1628] p-10 md:p-14"
      >
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-8 text-sm font-bold uppercase tracking-[0.28em] text-white/30">
            The Insight
          </p>
          <p className="mb-6 text-2xl font-black leading-relaxed text-white md:text-3xl">
            &ldquo;In a world obsessed with money, KindRide is building
            a parallel economy — where the currency is generosity,
            the capital is trust, and the reward is belonging
            to something larger than your commute.&rdquo;
          </p>
          <div className="mx-auto mt-6 h-px w-16 bg-teal-500/40" />
          <p className="mt-6 text-sm font-semibold text-white/35">
            The platform · Community rideshare, redefined
          </p>
        </div>
      </motion.div>

      {/* ── How the app actually works (mechanics) ───────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.5 }}
        className="mb-20"
      >
        <p className="mb-10 text-sm font-bold uppercase tracking-[0.28em] text-white/35">
          The mechanics — both sides of the same moment
        </p>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-white/8 bg-white/8 md:grid-cols-2">
          {/* Passenger column */}
          <div className="bg-[#060f1e] p-8 md:p-10">
            <p className="mb-8 text-xs font-bold uppercase tracking-[0.25em] text-white/40">
              If you need a ride
            </p>
            {[
              { step: "1", text: "Open the app and enter your destination." },
              { step: "2", text: "KindRide scans for drivers already heading your way and broadcasts your request." },
              { step: "3", text: "You see matched drivers — their distance, ETA, and community reputation score." },
              { step: "4", text: "Choose the driver that feels right. You're never forced." },
              { step: "5", text: "Track your driver live. Ride safely. Rate afterward." },
            ].map(({ step, text }, i) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="mb-5 flex gap-4 last:mb-0"
              >
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-white/15 text-xs font-black text-white/50">
                  {step}
                </div>
                <p className="pt-0.5 text-sm leading-7 text-white/65">{text}</p>
              </motion.div>
            ))}
          </div>

          {/* Driver column */}
          <div className="bg-[#041f19] p-8 md:p-10">
            <p className="mb-8 text-xs font-bold uppercase tracking-[0.25em] text-teal-600">
              If you want to give one
            </p>
            {[
              { step: "1", text: "Toggle availability on — whenever you're heading somewhere." },
              { step: "2", text: "You see nearby ride requests with the passenger's profile, ETA, and pickup location." },
              { step: "3", text: "Accept or decline freely. No penalty, no algorithm pressure." },
              { step: "4", text: "Complete the ride. Earn Humanitarian Points. Build your community profile." },
              { step: "5", text: "Rate your passenger. Grow your social capital credential with every trip." },
            ].map(({ step, text }, i) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="mb-5 flex gap-4 last:mb-0"
              >
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-teal-800 text-xs font-black text-teal-500">
                  {step}
                </div>
                <p className="pt-0.5 text-sm leading-7 text-white/65">{text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Closing ──────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        <p className="mb-3 text-2xl font-black text-white md:text-3xl">
          Someone near you is heading somewhere.
        </p>
        <p className="mb-10 text-xl text-white/50">
          So are you.
        </p>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href="#download"
            className="rounded-2xl bg-teal-500 px-10 py-4 text-base font-bold text-white transition-colors hover:bg-teal-400"
          >
            Get a ride
          </a>
          <a
            href="#download"
            className="rounded-2xl border border-white/15 bg-white/5 px-10 py-4 text-base font-bold text-white transition-colors hover:bg-white/10"
          >
            Give one
          </a>
        </div>
      </motion.div>

    </div>
  );
}
