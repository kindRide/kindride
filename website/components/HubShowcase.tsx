"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

import { supabase } from "@/lib/supabase";

type HubType = "university" | "church" | "nonprofit" | "corporate";

type HubRecord = {
  id: string;
  name: string;
  type: HubType;
  slug: string;
  logo_url: string | null;
};

type HubCard = HubRecord & {
  memberCount: number;
};

const badgeClasses: Record<HubType, string> = {
  university: "bg-[#0d9488] text-white",
  church: "bg-[#7c3aed] text-white",
  nonprofit: "bg-[#ea580c] text-white",
  corporate: "bg-[#1d4ed8] text-white",
};

export default function HubShowcase() {
  const [hubs, setHubs] = useState<HubCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHubs = async () => {
      try {
        const { data, error: hubError } = await supabase
          .from("hubs")
          .select("id, name, type, slug, logo_url")
          .eq("verified", true)
          .not("approved_by", "is", null);

        if (hubError) {
          throw hubError;
        }

        const hubRows = (data ?? []) as HubRecord[];
        const hubsWithCounts = await Promise.all(
          hubRows.map(async (hub) => {
            const { count, error: countError } = await supabase
              .from("hub_members")
              .select("hub_id", { count: "exact" })
              .eq("hub_id", hub.id)
              .eq("is_active", true);

            if (countError) {
              throw countError;
            }

            return {
              ...hub,
              memberCount: count ?? 0,
            };
          })
        );

        setHubs(hubsWithCounts);
        setError(null);
      } catch {
        setError("We could not load hubs right now. Please try again soon.");
      } finally {
        setLoading(false);
      }
    };

    void fetchHubs();
  }, []);

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-56 animate-pulse rounded-2xl border border-[#e2e8f0] bg-white"
            />
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <div className="rounded-2xl border border-[#e2e8f0] bg-white p-8 text-center text-slate-600">
          {error}
        </div>
      );
    }

    if (hubs.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-[#cbd5e1] bg-white p-10 text-center">
          <a
            href="#apply"
            className="text-lg font-semibold text-[#0d9488] transition-colors hover:text-[#0f766e]"
          >
            {"Be the first hub in your community ->"}
          </a>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {hubs.map((hub, index) => (
          <motion.div
            key={hub.id}
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: index * 0.08 }}
            whileHover={{ scale: 1.03, y: -4 }}
            className="rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_20px_40px_rgba(15,23,42,0.12)]"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
                {hub.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={hub.logo_url}
                    alt={`${hub.name} logo`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-3xl font-bold text-slate-400">O</span>
                )}
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] ${badgeClasses[hub.type]}`}
              >
                {hub.type}
              </span>
            </div>

            <h3 className="text-2xl font-black tracking-tight text-slate-900">{hub.name}</h3>
            <p className="mt-2 text-sm font-medium text-slate-500">kindride.app/join/{hub.slug}</p>
            <p className="mt-6 text-base font-semibold text-slate-700">
              {hub.memberCount.toLocaleString()} {hub.memberCount === 1 ? "member" : "members"}
            </p>
          </motion.div>
        ))}
      </div>
    );
  }, [error, hubs, loading]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-10 max-w-2xl">
        <p className="text-sm font-bold uppercase tracking-[0.28em] text-[#0d9488]">Hub Network</p>
        <h2 className="mt-3 text-4xl font-black tracking-tight text-slate-950 md:text-5xl">
          Communities already building rides together.
        </h2>
        <p className="mt-4 text-lg leading-8 text-slate-600">
          Universities, churches, nonprofits, and local employers can all become trust anchors
          for neighbor-powered transportation.
        </p>
      </div>
      {content}
    </div>
  );
}
