import type { TravelDirection } from "@/lib/matching-drivers";

type Point = {
  latitude: number;
  longitude: number;
};

export function bearingDegrees(from: Point, to: Point): number {
  const φ1 = (from.latitude * Math.PI) / 180;
  const φ2 = (to.latitude * Math.PI) / 180;
  const λ1 = (from.longitude * Math.PI) / 180;
  const λ2 = (to.longitude * Math.PI) / 180;
  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  const θ = (Math.atan2(y, x) * 180) / Math.PI;
  return (θ + 360) % 360;
}

export function directionFromBearing(deg: number): TravelDirection {
  if (deg >= 45 && deg < 135) return "east";
  if (deg >= 135 && deg < 225) return "south";
  if (deg >= 225 && deg < 315) return "west";
  return "north";
}

export function directionFromPoints(from: Point, to: Point): TravelDirection {
  return directionFromBearing(bearingDegrees(from, to));
}

