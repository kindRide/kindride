import type { User } from "@supabase/supabase-js";

import type { TravelDirection } from "@/lib/matching-drivers";
import { supabase } from "@/lib/supabase";

export type DriverIntent = "already_going" | "detour";

export type DriverPresenceRow = {
  driver_id: string;
  display_name: string;
  tier: string;
  intent: DriverIntent;
  heading_direction: TravelDirection;
  current_lat: number | null;
  current_lng: number | null;
  is_available: boolean;
  updated_at: string;
};

export function displayNameFromUser(user: Pick<User, "email" | "user_metadata">): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const full = meta && typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  if (full) return full;
  if (user.email) return user.email.split("@")[0] ?? "Driver";
  return "Driver";
}

export async function fetchMyPresence(driverId: string): Promise<DriverPresenceRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("driver_presence")
    .select("*")
    .eq("driver_id", driverId)
    .maybeSingle();
  if (error || !data) return null;
  return data as DriverPresenceRow;
}

export async function pushDriverPresence(input: {
  driverId: string;
  displayName: string;
  lat: number;
  lng: number;
  heading: TravelDirection;
  intent: DriverIntent;
  isAvailable: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };

  const now = new Date().toISOString();
  const existing = await fetchMyPresence(input.driverId);

  const base = {
    driver_id: input.driverId,
    display_name: existing?.display_name?.trim() || input.displayName,
    tier: existing?.tier ?? "Helper",
    intent: input.intent,
    heading_direction: input.heading,
    current_lat: input.lat,
    current_lng: input.lng,
    is_available: input.isAvailable,
    updated_at: now,
  };

  if (existing) {
    const { error } = await supabase.from("driver_presence").update(base).eq("driver_id", input.driverId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await supabase.from("driver_presence").insert({
    ...base,
    display_name: input.displayName,
    tier: "Helper",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Toggle availability without requiring a fresh GPS fix (uses existing coords when present). */
export async function setDriverAvailabilityOnly(
  driverId: string,
  isAvailable: boolean
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const existing = await fetchMyPresence(driverId);
  if (!existing) return { ok: true };
  const { error } = await supabase
    .from("driver_presence")
    .update({ is_available: isAvailable, updated_at: new Date().toISOString() })
    .eq("driver_id", driverId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
