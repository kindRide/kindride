"""
create_storage_bucket.py
========================
Creates the private "trip-recordings" Supabase Storage bucket.

Run once from the project root:
  python supabase/create_storage_bucket.py

Requires:
  - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in backend/.env
  - SUPABASE_SERVICE_ROLE_KEY must be the LEGACY JWT (starts with eyJ…).
    Dashboard → Project Settings → API → "Legacy API keys" → service_role

If you see 403 Unauthorized, update SUPABASE_SERVICE_ROLE_KEY in backend/.env
to the legacy JWT value and re-run.
"""

import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / "backend" / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env")
    sys.exit(1)

BUCKET_ID = "trip-recordings"

headers = {
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "apikey": SERVICE_ROLE_KEY,
}

payload = {
    "id": BUCKET_ID,
    "name": BUCKET_ID,
    "public": False,
    "fileSizeLimit": 52_428_800,  # 50 MB max per recording
    "allowedMimeTypes": ["video/mp4", "video/quicktime", "video/x-m4v"],
}

with httpx.Client() as client:
    r = client.post(f"{SUPABASE_URL}/storage/v1/bucket", headers=headers, json=payload)

if r.status_code == 200:
    print(f"Bucket '{BUCKET_ID}' created successfully (private).")
elif r.status_code == 409 or "already exists" in r.text.lower():
    print(f"Bucket '{BUCKET_ID}' already exists — nothing to do.")
else:
    print(f"ERROR {r.status_code}: {r.text}")
    print("\nIf you see 403 Unauthorized:")
    print("  1. Go to Supabase Dashboard → Project Settings → API")
    print("  2. Under 'Legacy API keys', copy the service_role JWT (starts with eyJ...)")
    print("  3. Update SUPABASE_SERVICE_ROLE_KEY in backend/.env")
    print("  4. Re-run this script.")
    print("\nAlternatively, create the bucket manually:")
    print("  Supabase Dashboard → Storage → New bucket")
    print("  Name: trip-recordings  |  Public: OFF  |  File size limit: 50 MB")
    sys.exit(1)

# Set bucket-level RLS policy: service role only for all operations.
# (Supabase Storage policies are separate from table RLS.)
policies = [
    {
        "name": "service-role-all",
        "definition": "bucket_id = 'trip-recordings'",
        "check": "bucket_id = 'trip-recordings'",
        "roles": ["service_role"],
        "allowedOperations": ["SELECT", "INSERT", "UPDATE", "DELETE"],
    }
]

print("\nNote: Apply RLS policies via Supabase Dashboard → Storage → trip-recordings → Policies")
print("  or use the SQL in supabase/recording_cleanup_cron.sql to restrict access.")
print("\nDone.")
