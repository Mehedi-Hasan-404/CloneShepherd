-- Create categories table
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  icon_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create channels table
CREATE TABLE public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  stream_url TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  auth_cookie TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create M3U playlists table
CREATE TABLE public.m3u_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  auto_sync BOOLEAN DEFAULT false,
  last_sync TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create visitor tracking table
CREATE TABLE public.visitor_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address INET NOT NULL,
  user_agent TEXT,
  page_url TEXT,
  referrer TEXT,
  country TEXT,
  city TEXT,
  is_blocked BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create blocked IPs table
CREATE TABLE public.blocked_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address INET NOT NULL UNIQUE,
  reason TEXT,
  blocked_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  blocked_by TEXT DEFAULT 'admin'
);

-- Create analytics table for channel views
CREATE TABLE public.channel_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE,
  ip_address INET,
  user_agent TEXT,
  watch_duration INTEGER DEFAULT 0, -- in seconds
  quality TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m3u_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_analytics ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access (no auth required for viewing)
CREATE POLICY "Categories are publicly readable" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Active channels are publicly readable" ON public.channels FOR SELECT USING (is_active = true);

-- Create policies for analytics (public can insert, admins can read)
CREATE POLICY "Anyone can log channel views" ON public.channel_analytics FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can log visits" ON public.visitor_logs FOR INSERT WITH CHECK (true);

-- Admin-only policies (will be updated when auth is implemented)
CREATE POLICY "Admin full access to categories" ON public.categories FOR ALL USING (true);
CREATE POLICY "Admin full access to channels" ON public.channels FOR ALL USING (true);
CREATE POLICY "Admin full access to playlists" ON public.m3u_playlists FOR ALL USING (true);
CREATE POLICY "Admin can read visitor logs" ON public.visitor_logs FOR SELECT USING (true);
CREATE POLICY "Admin can manage blocked IPs" ON public.blocked_ips FOR ALL USING (true);
CREATE POLICY "Admin can read analytics" ON public.channel_analytics FOR SELECT USING (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON public.channels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_m3u_playlists_updated_at BEFORE UPDATE ON public.m3u_playlists FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_channels_category_id ON public.channels(category_id);
CREATE INDEX idx_channels_is_active ON public.channels(is_active);
CREATE INDEX idx_visitor_logs_ip ON public.visitor_logs(ip_address);
CREATE INDEX idx_visitor_logs_created_at ON public.visitor_logs(created_at);
CREATE INDEX idx_blocked_ips_ip ON public.blocked_ips(ip_address);
CREATE INDEX idx_channel_analytics_channel_id ON public.channel_analytics(channel_id);
CREATE INDEX idx_channel_analytics_created_at ON public.channel_analytics(created_at);