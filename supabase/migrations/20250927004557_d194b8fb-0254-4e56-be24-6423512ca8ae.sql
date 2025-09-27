-- Relax channel_analytics.channel_id type to TEXT to support external IDs
ALTER TABLE public.channel_analytics DROP CONSTRAINT IF EXISTS channel_analytics_channel_id_fkey;
ALTER TABLE public.channel_analytics ALTER COLUMN channel_id TYPE TEXT USING channel_id::text;

-- Optional: index on channel_id text
CREATE INDEX IF NOT EXISTS idx_channel_analytics_channel_id_text ON public.channel_analytics(channel_id);
