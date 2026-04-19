-- Run this in Supabase SQL Editor
-- Captures questions submitted from the kindride.app website

CREATE TABLE IF NOT EXISTS website_questions (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  question    text        NOT NULL CHECK (char_length(question) BETWEEN 5 AND 600),
  email       text        CHECK (email IS NULL OR char_length(email) <= 200),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE website_questions ENABLE ROW LEVEL SECURITY;

-- Anyone (anon key from website) can insert
CREATE POLICY "website_questions_insert"
  ON website_questions FOR INSERT
  WITH CHECK (true);

-- Only the founder (admin role) can read
CREATE POLICY "website_questions_admin_select"
  ON website_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
