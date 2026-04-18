"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// ── helpers ──────────────────────────────────────────────────────────────────

function extractCity(address: string | null): string {
  if (!address) return "your city";
  const parts = address.split(",").map((s) => s.trim());
  // "123 Main St, College Park, MD 20740" → parts[1] = "College Park"
  if (parts.length >= 3) return parts[parts.length - 2];
  if (parts.length === 2) return parts[0];
  return "your city";
}

function todayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function weekAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

// Animates a number from 0 → target over ~1.4 s
function useCountUp(target: number | null): number | null {
  const [display, setDisplay] = useState<number | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (target === null) return;
    const start = performance.now();
    const duration = 1400;
    const from = display ?? 0;

    const tick = (now: number) => {
      const elapsed = Math.min(now - start, duration);
      const progress = elapsed / duration;
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (elapsed < duration) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return display;
}

// ── types ─────────────────────────────────────────────────────────────────────

type FeedMessage = { id: string; text: string };

// ── sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  unit,
  accent,
  live,
}: {
  label: string;
  value: number | null;
  unit?: string;
  accent: string;
  live?: boolean;
}) {
  const animated = useCountUp(value);

  return (
    <div className="flex flex-col gap-2 rounded-3xl border border-white/10 bg-[#060f1e] p-8">
      <div className="flex items-center gap-2">
        {live && (
          <span className="relative flex h-2 w-2">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
              style={{ backgroundColor: accent }}
            />
            <span
              className="relative inline-flex h-2 w-2 rounded-full"
              style={{ backgroundColor: accent }}
            />
          </span>
        )}
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/40">{label}</p>
      </div>
      <p className="text-5xl font-black leading-none text-white md:text-6xl">
        {animated === null ? (
          <span className="animate-pulse text-white/20">—</span>
        ) : (
          animated.toLocaleString()
        )}
        {unit && animated !== null && (
          <span className="ml-2 text-2xl font-bold" style={{ color: accent }}>
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function LiveImpactWall() {
  const [co2Lbs, setCo2Lbs] = useState<number | null>(null);
  const [pointsToday, setPointsToday] = useState<number | null>(null);
  const [ridesThisWeek, setRidesThisWeek] = useState<number | null>(null);
  const [feed, setFeed] = useState<FeedMessage[]>([]);
  const [feedIndex, setFeedIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── data fetch ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      const today = todayIso();
      const weekAgo = weekAgoIso();

      // CO₂ saved: sum distance_miles of all completed rides × 0.89 lbs/mile (EPA avg)
      const { data: milesData } = await supabase
        .from("rides")
        .select("distance_miles")
        .eq("status", "completed");

      if (milesData) {
        const totalMiles = milesData.reduce(
          (acc, r) => acc + Number(r.distance_miles ?? 0),
          0
        );
        setCo2Lbs(Math.round(totalMiles * 0.89));
      }

      // Kind Points awarded today
      const { data: todayRides } = await supabase
        .from("rides")
        .select("kind_points")
        .eq("status", "completed")
        .gte("created_at", today);

      if (todayRides) {
        const pts = todayRides.reduce(
          (acc, r) => acc + Number(r.kind_points ?? 0),
          0
        );
        setPointsToday(pts);
      }

      // Rides this week
      const { count: weekCount } = await supabase
        .from("rides")
        .select("*", { count: "exact", head: true })
        .eq("status", "completed")
        .gte("created_at", weekAgo);

      if (weekCount !== null) setRidesThisWeek(weekCount);

      // Live feed: last 20 completed rides for city names
      const { data: recentRides } = await supabase
        .from("rides")
        .select("id, pickup_address")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(20);

      if (recentRides && recentRides.length > 0) {
        const messages: FeedMessage[] = recentRides.map((r) => ({
          id: r.id as string,
          text: `A neighbor in ${extractCity(r.pickup_address as string | null)} just gave a ride`,
        }));
        setFeed(messages);
      } else {
        // Pre-launch placeholder feed
        setFeed([
          { id: "p1", text: "A neighbor in College Park just gave a ride" },
          { id: "p2", text: "3 riders reached campus together this morning" },
          { id: "p3", text: "A driver in Atlanta completed a church run" },
          { id: "p4", text: "2 volunteers got to the food bank on time" },
          { id: "p5", text: "A neighbor in Houston saved 4 miles of emissions" },
        ]);
      }
    };

    void load();
    const pollInterval = setInterval(() => void load(), 60_000);
    return () => clearInterval(pollInterval);
  }, []);

  // ── feed ticker ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (feed.length === 0) return;
    intervalRef.current = setInterval(() => {
      setFeedIndex((i) => (i + 1) % feed.length);
    }, 3500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [feed]);

  const currentMessage = feed[feedIndex];

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-16 max-w-2xl">
        <div className="mb-3 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal-400" />
          </span>
          <p className="text-sm font-bold uppercase tracking-[0.28em] text-teal-400">
            Live Impact Wall
          </p>
        </div>
        <h2 className="text-4xl font-black tracking-tight text-white md:text-5xl">
          This is happening
          <br />
          right now.
        </h2>
        <p className="mt-4 text-lg leading-8 text-white/60">
          Every number here is a real neighbor. Real miles. Real moments.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <StatCard
          label="CO₂ saved (lbs)"
          value={co2Lbs}
          accent="#0d9488"
          live
        />
        <StatCard
          label="Kind Points — today"
          value={pointsToday}
          accent="#7c3aed"
          live
        />
        <StatCard
          label="Rides this week"
          value={ridesThisWeek}
          accent="#ea580c"
          live
        />
      </div>

      {/* Live feed ticker */}
      <div className="mt-8 flex min-h-[88px] items-center gap-4 rounded-3xl border border-white/10 bg-[#060f1e] px-8 py-6">
        <span className="relative flex h-3 w-3 flex-shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-teal-400" />
        </span>

        <div className="relative flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            {currentMessage && (
              <motion.p
                key={currentMessage.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4 }}
                className="text-base font-semibold text-white/80 md:text-lg"
              >
                {currentMessage.text}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <span className="flex-shrink-0 rounded-full bg-teal-500/10 px-3 py-1 text-xs font-bold text-teal-400">
          LIVE
        </span>
      </div>

      {/* Footnote */}
      <p className="mt-4 text-center text-xs text-white/25">
        Updates every 60 seconds · CO₂ estimate based on EPA average vehicle emissions
      </p>
    </div>
  );
}
