"use client";

import { motion } from "framer-motion";

type Story = {
  id: string;
  name: string;
  role: string;
  location: string;
  quote: string;
  detail: string;
  accent: string;
  initial: string;
};

const STORIES: Story[] = [
  {
    id: "s1",
    name: "Marcus T.",
    role: "University Driver · 3 years",
    location: "College Park, MD",
    quote: "I was already heading to campus every morning. Now 4 students ride with me. Nothing changed about my day — except it matters more.",
    detail: "312 rides given · 1,840 Kind Points",
    accent: "#0d9488",
    initial: "M",
  },
  {
    id: "s2",
    name: "Diane O.",
    role: "Church Hub Driver · 18 months",
    location: "Atlanta, GA",
    quote: "Our pastor put us in touch. I drive three elders to Sunday service every week. They'd have stayed home otherwise. That's not a small thing.",
    detail: "148 rides given · 920 Kind Points",
    accent: "#7c3aed",
    initial: "D",
  },
  {
    id: "s3",
    name: "Kwame A.",
    role: "Nonprofit Hub Driver · 2 years",
    location: "Houston, TX",
    quote: "I work at a food bank. Half my rides are volunteers getting there. KindRide turned my commute into something the whole organization depends on.",
    detail: "267 rides given · 1,540 Kind Points",
    accent: "#ea580c",
    initial: "K",
  },
  {
    id: "s4",
    name: "Rosa M.",
    role: "Community Driver · 1 year",
    location: "Phoenix, AZ",
    quote: "A new family moved in two streets away — no car, no English yet. I've driven them to the immigration office four times. We don't need words.",
    detail: "89 rides given · 640 Kind Points",
    accent: "#1d4ed8",
    initial: "R",
  },
];

export default function DriverStories() {
  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-16 max-w-2xl">
        <p className="text-sm font-bold uppercase tracking-[0.28em] text-teal-400">
          Driver Stories
        </p>
        <h2 className="mt-3 text-4xl font-black tracking-tight text-white md:text-5xl">
          Real neighbors.
          <br />
          Real reasons.
        </h2>
        <p className="mt-4 text-lg leading-8 text-white/60">
          These aren't gig workers. They're people who were already going somewhere
          — and chose to bring someone with them.
        </p>
      </div>

      {/* Stories grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {STORIES.map((story, index) => (
          <motion.div
            key={story.id}
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-[#060f1e] p-8"
          >
            {/* Accent glow */}
            <div
              className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-10 blur-3xl transition-opacity duration-500 group-hover:opacity-20"
              style={{ backgroundColor: story.accent }}
            />

            {/* Quote */}
            <div>
              <span
                className="mb-6 block text-4xl font-black leading-none"
                style={{ color: story.accent }}
              >
                &ldquo;
              </span>
              <p className="text-lg font-medium leading-8 text-white/85">
                {story.quote}
              </p>
            </div>

            {/* Attribution */}
            <div className="mt-8 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {/* Avatar */}
                <div
                  className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-lg font-black text-white"
                  style={{ backgroundColor: story.accent }}
                >
                  {story.initial}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{story.name}</p>
                  <p className="text-xs text-white/50">{story.role}</p>
                  <p className="text-xs text-white/40">{story.location}</p>
                </div>
              </div>

              {/* Stats */}
              <div className="text-right">
                <p className="text-xs font-semibold text-white/40">{story.detail}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Bottom CTA strip */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.45 }}
        className="mt-14 flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-[#060f1e] px-8 py-10 text-center"
      >
        <p className="text-sm font-bold uppercase tracking-[0.28em] text-teal-400">
          Your turn
        </p>
        <h3 className="text-2xl font-black text-white md:text-3xl">
          You&apos;re already going somewhere.
        </h3>
        <p className="max-w-lg text-base text-white/55">
          Download the app, set yourself as available, and let a neighbor join your route.
          No detour required.
        </p>
        <a
          href="#download"
          className="mt-2 rounded-2xl bg-teal-500 px-8 py-4 text-base font-bold text-white transition-colors hover:bg-teal-400"
        >
          Become a driver
        </a>
      </motion.div>
    </div>
  );
}
