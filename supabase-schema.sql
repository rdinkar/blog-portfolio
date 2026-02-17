-- Run this in your Supabase SQL editor to create the subscribers table
-- Required for the subscribe to blog feature

CREATE TABLE IF NOT EXISTS subscribers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  source TEXT DEFAULT 'blog',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
CREATE INDEX IF NOT EXISTS idx_subscribers_created_at ON subscribers(created_at);

-- Enable Row Level Security (optional, for extra security)
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

-- Policy: Allow inserts from anyone (for the subscribe form)
CREATE POLICY "Allow public insert" ON subscribers
  FOR INSERT
  WITH CHECK (true);

-- Policy: Restrict reads (only you can view subscribers via Supabase dashboard with service role)
CREATE POLICY "Restrict reads" ON subscribers
  FOR SELECT
  USING (false);
