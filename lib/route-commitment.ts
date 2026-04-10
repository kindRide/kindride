import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  getRouteCommitmentsAttestUrlOrNull,
  getRouteCommitmentsRegisterUrlOrNull,
} from "@/lib/backend-api-urls";
import { supabase } from "@/lib/supabase";

type LatLng = { latitude: number; longitude: number };

type CorridorBBox = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

type RouteIntent = "zero_detour" | "detour";

type DeviceKeyMaterial = {
  privateJwk: JsonWebKey;
  publicJwk: JsonWebKey;
};

const DEVICE_KEY_STORAGE = "kindride.route_commitment.device_keys.v1";

function getCryptoApi(): Crypto | null {
  const cryptoApi = (globalThis as { crypto?: Crypto }).crypto;
  return cryptoApi?.subtle ? cryptoApi : null;
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa !== "function") {
    throw new Error("Base64 encoding is not available in this runtime.");
  }
  return btoa(binary);
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  if (typeof atob !== "function") {
    throw new Error("Base64 decoding is not available in this runtime.");
  }
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function createNonce(byteLength = 16): string {
  const cryptoApi = getCryptoApi();
  if (!cryptoApi) {
    return `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  const bytes = new Uint8Array(byteLength);
  cryptoApi.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function expandBBox(a: LatLng, b: LatLng, paddingDegrees = 0.003): CorridorBBox {
  return {
    minLat: Number((Math.min(a.latitude, b.latitude) - paddingDegrees).toFixed(6)),
    maxLat: Number((Math.max(a.latitude, b.latitude) + paddingDegrees).toFixed(6)),
    minLng: Number((Math.min(a.longitude, b.longitude) - paddingDegrees).toFixed(6)),
    maxLng: Number((Math.max(a.longitude, b.longitude) + paddingDegrees).toFixed(6)),
  };
}

async function getOrCreateDeviceKeys(): Promise<DeviceKeyMaterial | null> {
  const cryptoApi = getCryptoApi();
  if (!cryptoApi?.subtle) return null;

  const cached = await AsyncStorage.getItem(DEVICE_KEY_STORAGE);
  if (cached) {
    try {
      return JSON.parse(cached) as DeviceKeyMaterial;
    } catch {
      await AsyncStorage.removeItem(DEVICE_KEY_STORAGE);
    }
  }

  const keyPair = await cryptoApi.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  const privateJwk = (await cryptoApi.subtle.exportKey("jwk", keyPair.privateKey)) as JsonWebKey;
  const publicJwk = (await cryptoApi.subtle.exportKey("jwk", keyPair.publicKey)) as JsonWebKey;
  const material = { privateJwk, publicJwk };
  await AsyncStorage.setItem(DEVICE_KEY_STORAGE, JSON.stringify(material));
  return material;
}

async function signPayload(payload: string): Promise<{ signature: string; publicKey: string } | null> {
  const cryptoApi = getCryptoApi();
  if (!cryptoApi?.subtle) return null;

  const keys = await getOrCreateDeviceKeys();
  if (!keys) return null;

  const privateKey = await cryptoApi.subtle.importKey(
    "jwk",
    keys.privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await cryptoApi.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    encodeUtf8(payload)
  );

  return {
    signature: bytesToBase64(new Uint8Array(signature)),
    publicKey: JSON.stringify(keys.publicJwk),
  };
}

async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const session = await supabase.auth.getSession();
  return session.data.session?.access_token ?? null;
}

export async function registerRouteCommitment(args: {
  rideId: string;
  pickup: LatLng;
  destination: LatLng;
  declaredIntent: RouteIntent;
}): Promise<{ status: "registered" | "skipped"; reason?: string } | null> {
  const endpoint = getRouteCommitmentsRegisterUrlOrNull();
  const accessToken = await getAccessToken();
  if (!endpoint || !accessToken) return null;

  const signedPayload = stableStringify({
    version: 1,
    rideId: args.rideId,
    declaredIntent: args.declaredIntent,
    corridorBBox: expandBBox(args.pickup, args.destination),
    nonce: createNonce(),
    committedAt: new Date().toISOString(),
    keyStorage: "software-keystore",
  });

  const signed = await signPayload(signedPayload);
  if (!signed) {
    return { status: "skipped", reason: "webcrypto_unavailable" };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      rideId: args.rideId,
      declaredIntent: args.declaredIntent,
      corridorBBox: expandBBox(args.pickup, args.destination),
      signedPayload,
      commitmentSig: signed.signature,
      devicePublicKey: signed.publicKey,
      signatureAlgorithm: "ecdsa-p256-sha256",
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Route commitment registration failed (${response.status}).`);
  }

  return { status: "registered" };
}

export async function attestRouteCommitment(args: {
  rideId: string;
  declaredIntent: RouteIntent;
  pickup?: LatLng | null;
  dropoff?: LatLng | null;
  destination?: LatLng | null;
  distanceMiles: number;
}): Promise<{ status: "attested" | "skipped"; verificationStatus?: string; reason?: string } | null> {
  const endpoint = getRouteCommitmentsAttestUrlOrNull();
  const accessToken = await getAccessToken();
  if (!endpoint || !accessToken) return null;

  const signedPayload = stableStringify({
    version: 1,
    rideId: args.rideId,
    declaredIntent: args.declaredIntent,
    attestedAt: new Date().toISOString(),
    keyStorage: "software-keystore",
    actual: {
      pickup: args.pickup
        ? { latitude: args.pickup.latitude, longitude: args.pickup.longitude }
        : null,
      dropoff: args.dropoff
        ? { latitude: args.dropoff.latitude, longitude: args.dropoff.longitude }
        : null,
      destination: args.destination
        ? { latitude: args.destination.latitude, longitude: args.destination.longitude }
        : null,
      distanceMiles: Number(args.distanceMiles.toFixed(3)),
    },
  });

  const signed = await signPayload(signedPayload);
  if (!signed) {
    return { status: "skipped", reason: "webcrypto_unavailable" };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      rideId: args.rideId,
      attestationPayload: signedPayload,
      attestationSig: signed.signature,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Route commitment attestation failed (${response.status}).`);
  }

  const body = (await response.json()) as { verification_status?: string };
  return {
    status: "attested",
    verificationStatus: body.verification_status,
  };
}

export function parseStoredRouteCommitmentPublicKey(publicKey: string): JsonWebKey | null {
  try {
    return JSON.parse(publicKey) as JsonWebKey;
  } catch {
    return null;
  }
}

export function decodeBase64UrlField(value: string): Uint8Array {
  return base64UrlToBytes(value);
}
