"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

// ── types ──────────────────────────────────────────────────────────────────────

type HubInfo = {
  id: string;
  name: string;
  type: string;
  slug: string;
  verified: boolean;
};

type MemberRow = {
  user_id: string;
  role: string;
  joined_at: string;
  profiles: { display_name: string | null } | null;
};

type RideRow = {
  id: string;
  status: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  created_at: string;
  kind_points: number | null;
  distance_miles: number | null;
};

// ── helpers ───────────────────────────────────────────────────────────────────

const HUB_TYPE_COLORS: Record<string, string> = {
  university: "bg-blue-500/20 text-blue-300",
  church: "bg-purple-500/20 text-purple-300",
  nonprofit: "bg-orange-500/20 text-orange-300",
  corporate: "bg-slate-500/20 text-slate-300",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function RideBadge({ status }: { status: string | null }) {
  const map: Record<string, string> = {
    completed: "bg-teal-500/20 text-teal-300",
    cancelled: "bg-red-500/20 text-red-300",
    in_progress: "bg-blue-500/20 text-blue-300",
  };
  const cls = map[status ?? ""] ?? "bg-white/10 text-white/50";
  const label = status ? status.replace(/_/g, " ") : "unknown";
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${cls}`}>
      {label}
    </span>
  );
}

// ── login view ────────────────────────────────────────────────────────────────

function LoginView({ onLogin }: { onLogin: (s: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (authError || !data.session) {
      setError(authError?.message ?? "Sign-in failed. Please try again.");
      setLoading(false);
      return;
    }
    onLogin(data.session);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0c1f3f] px-6">
      <div className="w-full max-w-sm">
        <p className="mb-10 text-center text-3xl font-black tracking-tight text-white">
          Kind<span className="text-teal-400">Ride</span>
        </p>
        <h1 className="mb-2 text-center text-2xl font-black text-white">Hub Admin Portal</h1>
        <p className="mb-8 text-center text-sm text-white/50">
          Sign in with your KindRide account to access your hub dashboard.
        </p>

        <div className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleSignIn()}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 focus:border-teal-500 focus:outline-none"
          />
          {error && (
            <p className="text-center text-sm font-medium text-red-400">{error}</p>
          )}
          <button
            onClick={() => void handleSignIn()}
            disabled={loading || !email || !password}
            className="rounded-2xl bg-teal-500 px-8 py-4 font-bold text-white transition-colors hover:bg-teal-400 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── dashboard view ────────────────────────────────────────────────────────────

function Dashboard({
  session,
  hub,
  onSignOut,
}: {
  session: Session;
  hub: HubInfo;
  onSignOut: () => void;
}) {
  const [totalRides, setTotalRides] = useState<number | null>(null);
  const [activeMembers, setActiveMembers] = useState<number | null>(null);
  const [totalPoints, setTotalPoints] = useState<number | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [rides, setRides] = useState<RideRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // suppress unused warning — session used for future write operations
  void session;

  useEffect(() => {
    const loadAll = async () => {
      setLoadingData(true);

      const [ridesCount, membersCount, ridesPoints, membersData, ridesData] =
        await Promise.all([
          // Total completed rides
          supabase
            .from("rides")
            .select("*", { count: "exact", head: true })
            .eq("hub_id", hub.id)
            .eq("status", "completed"),

          // Active members
          supabase
            .from("hub_members")
            .select("*", { count: "exact", head: true })
            .eq("hub_id", hub.id)
            .eq("is_active", true),

          // Kind Points sum
          supabase
            .from("rides")
            .select("kind_points")
            .eq("hub_id", hub.id)
            .eq("status", "completed"),

          // Member list
          supabase
            .from("hub_members")
            .select("user_id, role, joined_at, profiles(display_name)")
            .eq("hub_id", hub.id)
            .eq("is_active", true)
            .order("joined_at", { ascending: false })
            .limit(20),

          // Recent rides
          supabase
            .from("rides")
            .select(
              "id, status, pickup_address, dropoff_address, created_at, kind_points, distance_miles"
            )
            .eq("hub_id", hub.id)
            .order("created_at", { ascending: false })
            .limit(10),
        ]);

      setTotalRides(ridesCount.count ?? 0);
      setActiveMembers(membersCount.count ?? 0);

      if (ridesPoints.data) {
        const pts = ridesPoints.data.reduce(
          (acc, r) => acc + Number(r.kind_points ?? 0),
          0
        );
        setTotalPoints(pts);
      }

      setMembers((membersData.data ?? []) as MemberRow[]);
      setRides((ridesData.data ?? []) as RideRow[]);
      setLoadingData(false);
    };

    void loadAll();
  }, [hub.id]);

  const typeClass =
    HUB_TYPE_COLORS[hub.type] ?? "bg-white/10 text-white/50";

  return (
    <div className="min-h-screen bg-[#0c1f3f]">
      {/* Nav */}
      <nav className="flex items-center justify-between border-b border-white/10 px-8 py-5">
        <span className="text-xl font-black tracking-tight text-white">
          Kind<span className="text-teal-400">Ride</span>
        </span>
        <div className="flex items-center gap-4">
          <span className="rounded-full bg-teal-500/15 px-4 py-1.5 text-sm font-bold text-teal-400">
            {hub.name}
          </span>
          <button
            onClick={onSignOut}
            className="text-sm font-semibold text-white/50 transition-colors hover:text-white"
          >
            Sign Out
          </button>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-8 py-12">
        {/* Hub identity */}
        <div className="mb-10">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${typeClass}`}>
              {hub.type}
            </span>
            {hub.verified ? (
              <span className="rounded-full bg-teal-500/15 px-3 py-1 text-xs font-bold text-teal-400">
                ✓ Verified
              </span>
            ) : (
              <span className="rounded-full bg-yellow-500/15 px-3 py-1 text-xs font-bold text-yellow-400">
                ⏳ Pending Approval
              </span>
            )}
          </div>
          <h1 className="text-4xl font-black text-white md:text-5xl">{hub.name}</h1>
          <p className="mt-2 text-sm text-white/40">
            Join link:{" "}
            <span className="font-mono text-teal-400">kindride.app/join/{hub.slug}</span>
          </p>
        </div>

        {/* Stats */}
        {loadingData ? (
          <div className="mb-10 flex h-40 items-center justify-center">
            <div className="text-white/40">Loading data…</div>
          </div>
        ) : (
          <div className="mb-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {[
              { label: "Completed Rides", value: totalRides, accent: "#0d9488" },
              { label: "Active Members", value: activeMembers, accent: "#7c3aed" },
              { label: "Kind Points Earned", value: totalPoints, accent: "#ea580c" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-3xl border border-white/10 bg-[#060f1e] p-8"
              >
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-white/40">
                  {stat.label}
                </p>
                <p className="text-5xl font-black text-white">
                  {(stat.value ?? 0).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Members */}
          <div className="rounded-3xl border border-white/10 bg-[#060f1e] p-8">
            <p className="mb-6 text-xs font-bold uppercase tracking-[0.22em] text-white/40">
              Members (recent {members.length})
            </p>
            {members.length === 0 ? (
              <p className="text-sm text-white/30">No members yet.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {members.map((m) => (
                  <div key={m.user_id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {m.profiles?.display_name ?? "—"}
                      </p>
                      <p className="text-xs text-white/40">{formatDate(m.joined_at)}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${
                        m.role === "hub_admin"
                          ? "bg-teal-500/20 text-teal-300"
                          : "bg-white/10 text-white/50"
                      }`}
                    >
                      {m.role.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent rides */}
          <div className="rounded-3xl border border-white/10 bg-[#060f1e] p-8">
            <p className="mb-6 text-xs font-bold uppercase tracking-[0.22em] text-white/40">
              Recent Rides
            </p>
            {rides.length === 0 ? (
              <p className="text-sm text-white/30">No rides yet.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {rides.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-2xl border border-white/5 bg-white/3 p-4"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <RideBadge status={r.status} />
                      <span className="text-xs text-white/30">{formatDate(r.created_at)}</span>
                    </div>
                    <p className="truncate text-sm text-white/70">
                      {r.pickup_address ?? "—"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-white/40">
                      → {r.dropoff_address ?? "—"}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-white/30">
                      <span>{Number(r.distance_miles ?? 0).toFixed(1)} mi</span>
                      {r.kind_points && r.kind_points > 0 && (
                        <span className="font-semibold text-teal-400">
                          +{r.kind_points} pts
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── access denied ─────────────────────────────────────────────────────────────

function AccessDenied({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0c1f3f] px-6 text-center">
      <p className="mb-4 text-6xl">🔒</p>
      <h2 className="mb-2 text-2xl font-black text-white">No hub admin access</h2>
      <p className="mb-8 text-white/50">
        This account doesn&apos;t have hub admin permissions.
        <br />
        Contact <a href="mailto:admin@kindride.app" className="text-teal-400">admin@kindride.app</a> if this is a mistake.
      </p>
      <button
        onClick={onSignOut}
        className="rounded-2xl border border-white/20 px-8 py-3 text-sm font-bold text-white/70 hover:text-white"
      >
        Sign Out
      </button>
    </div>
  );
}

// ── root ──────────────────────────────────────────────────────────────────────

export default function HubAdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [hub, setHub] = useState<HubInfo | null | undefined>(undefined); // undefined = loading
  const [authChecked, setAuthChecked] = useState(false);

  // Check existing session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });
  }, []);

  // Resolve hub when session changes
  useEffect(() => {
    if (!session) {
      setHub(null);
      return;
    }

    const resolveHub = async () => {
      setHub(undefined); // loading
      const { data } = await supabase
        .from("hub_members")
        .select("hub_id, role, hubs(id, name, type, slug, verified)")
        .eq("user_id", session.user.id)
        .eq("role", "hub_admin")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (!data?.hubs) {
        setHub(null);
        return;
      }

      const h = data.hubs as unknown as HubInfo;
      setHub(h);
    };

    void resolveHub();
  }, [session]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setHub(null);
  };

  // Initial auth check in progress
  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0c1f3f]">
        <div className="text-white/40">Loading…</div>
      </div>
    );
  }

  // Not signed in
  if (!session) {
    return <LoginView onLogin={setSession} />;
  }

  // Hub resolution in progress
  if (hub === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0c1f3f]">
        <div className="text-white/40">Loading your hub…</div>
      </div>
    );
  }

  // Signed in but no hub admin membership
  if (hub === null) {
    return <AccessDenied onSignOut={() => void handleSignOut()} />;
  }

  // Signed in + hub admin
  return (
    <Dashboard
      session={session}
      hub={hub}
      onSignOut={() => void handleSignOut()}
    />
  );
}
