CREATE TABLE IF NOT EXISTS trip_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id    uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  sender_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (char_length(body) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tm_ride_id_idx ON trip_messages(ride_id);

ALTER TABLE trip_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip_messages_read" ON trip_messages;
CREATE POLICY "trip_messages_read" ON trip_messages FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM rides
    WHERE rides.id = ride_id
      AND (rides.driver_id = auth.uid() OR rides.passenger_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "trip_messages_insert" ON trip_messages;
CREATE POLICY "trip_messages_insert" ON trip_messages FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM rides
    WHERE rides.id = ride_id
      AND (rides.driver_id = auth.uid() OR rides.passenger_id = auth.uid())
  )
);

ALTER TABLE rides ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

CREATE INDEX IF NOT EXISTS rides_scheduled_for_idx
  ON rides(scheduled_for)
  WHERE scheduled_for IS NOT NULL;
