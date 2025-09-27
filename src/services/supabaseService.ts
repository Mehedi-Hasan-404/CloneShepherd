import { supabase } from '@/integrations/supabase/client';

// Track visitor analytics
export const trackVisitor = async (visitorData: {
  ip_address: string;
  user_agent?: string;
  page_url?: string;
  referrer?: string;
  country?: string;
  city?: string;
}) => {
  try {
    const { error } = await supabase
      .from('visitor_logs')
      .insert(visitorData);
    
    if (error) console.error('Error tracking visitor:', error);
  } catch (error) {
    console.error('Error tracking visitor:', error);
  }
};

// Track channel view analytics
export const trackChannelView = async (channelViewData: {
  channel_id: string;
  ip_address?: string;
  user_agent?: string;
  watch_duration?: number;
  quality?: string;
}) => {
  try {
    const { error } = await supabase
      .from('channel_analytics')
      .insert(channelViewData);
    
    if (error) console.error('Error tracking channel view:', error);
  } catch (error) {
    console.error('Error tracking channel view:', error);
  }
};

// Get visitor IP (client-side approximation)
export const getVisitorIP = async (): Promise<string> => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip || 'unknown';
  } catch (error) {
    console.error('Error getting IP:', error);
    return 'unknown';
  }
};

// Categories
export const getCategories = async () => {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name');
  
  if (error) throw error;
  return data;
};

export const createCategory = async (category: {
  name: string;
  slug: string;
  icon_url?: string;
}) => {
  const { data, error } = await supabase
    .from('categories')
    .insert(category)
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

export const updateCategory = async (id: string, updates: {
  name?: string;
  slug?: string;
  icon_url?: string;
}) => {
  const { data, error } = await supabase
    .from('categories')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

export const deleteCategory = async (id: string) => {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
};

// Channels
export const getChannels = async () => {
  const { data, error } = await supabase
    .from('channels')
    .select(`
      *,
      categories!inner(name)
    `)
    .eq('is_active', true)
    .order('name');
  
  if (error) throw error;
  return data;
};

export const getChannelsByCategory = async (categoryId: string) => {
  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .eq('category_id', categoryId)
    .eq('is_active', true)
    .order('name');
  
  if (error) throw error;
  return data;
};

export const getChannel = async (id: string) => {
  const { data, error } = await supabase
    .from('channels')
    .select(`
      *,
      categories!inner(name, slug)
    `)
    .eq('id', id)
    .eq('is_active', true)
    .single();
  
  if (error) throw error;
  return data;
};

export const createChannel = async (channel: {
  name: string;
  logo_url?: string;
  stream_url: string;
  category_id: string;
  auth_cookie?: string;
}) => {
  const { data, error } = await supabase
    .from('channels')
    .insert(channel)
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

export const updateChannel = async (id: string, updates: {
  name?: string;
  logo_url?: string;
  stream_url?: string;
  category_id?: string;
  auth_cookie?: string;
  is_active?: boolean;
}) => {
  const { data, error } = await supabase
    .from('channels')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

export const deleteChannel = async (id: string) => {
  const { error } = await supabase
    .from('channels')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
};

// M3U Playlists
export const getM3UPlaylists = async () => {
  const { data, error } = await supabase
    .from('m3u_playlists')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data;
};

export const createM3UPlaylist = async (playlist: {
  name: string;
  url: string;
  auto_sync?: boolean;
}) => {
  const { data, error } = await supabase
    .from('m3u_playlists')
    .insert(playlist)
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

export const updateM3UPlaylist = async (id: string, updates: {
  name?: string;
  url?: string;
  auto_sync?: boolean;
  status?: string;
  last_sync?: string;
}) => {
  const { data, error } = await supabase
    .from('m3u_playlists')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

export const deleteM3UPlaylist = async (id: string) => {
  const { error } = await supabase
    .from('m3u_playlists')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
};

// Analytics
export const getVisitorAnalytics = async (startDate?: string, endDate?: string) => {
  let query = supabase
    .from('visitor_logs')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (startDate) {
    query = query.gte('created_at', startDate);
  }
  
  if (endDate) {
    query = query.lte('created_at', endDate);
  }
  
  const { data, error } = await query.limit(1000);
  
  if (error) throw error;
  return data;
};

export const getChannelAnalytics = async (startDate?: string, endDate?: string) => {
  let query = supabase
    .from('channel_analytics')
    .select(`
      *,
      channels!channel_analytics_channel_id_fkey(name, logo_url)
    `)
    .order('created_at', { ascending: false });
  
  if (startDate) {
    query = query.gte('created_at', startDate);
  }
  
  if (endDate) {
    query = query.lte('created_at', endDate);
  }
  
  const { data, error } = await query.limit(1000);
  
  if (error) throw error;
  return data;
};

// Blocked IPs
export const getBlockedIPs = async () => {
  const { data, error } = await supabase
    .from('blocked_ips')
    .select('*')
    .order('blocked_at', { ascending: false });
  
  if (error) throw error;
  return data;
};

export const blockIP = async (ipData: {
  ip_address: string;
  reason?: string;
  blocked_by?: string;
}) => {
  const { data, error } = await supabase
    .from('blocked_ips')
    .insert(ipData)
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

export const unblockIP = async (id: string) => {
  const { error } = await supabase
    .from('blocked_ips')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
};

export const checkIPBlocked = async (ip: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('blocked_ips')
    .select('id')
    .eq('ip_address', ip)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error('Error checking blocked IP:', error);
    return false;
  }
  
  return !!data;
};