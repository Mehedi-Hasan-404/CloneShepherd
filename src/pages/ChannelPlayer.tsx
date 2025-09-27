import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getChannel, getChannelsByCategory } from '@/services/supabaseService';
import { useRecents } from '@/contexts/RecentsContext';
import { useChannelTracking } from '@/hooks/useChannelTracking';
import { PublicChannel, AdminChannel, Category } from '@/types';

import VideoPlayer from '@/components/VideoPlayer';
import ChannelCard from '@/components/ChannelCard';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Tv, Info } from 'lucide-react';

const ChannelPlayer = () => {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const { addRecent } = useRecents();

  const [channel, setChannel] = useState<AdminChannel | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [relatedChannels, setRelatedChannels] = useState<PublicChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track channel viewing analytics
  useChannelTracking(channelId || '');

  // Helper function to generate slug from name
  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  };

  useEffect(() => {
    const fetchChannelData = async () => {
      if (!channelId) {
        setError('No channel specified');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch channel data from Supabase
        const channelData = await getChannel(channelId);
        
        if (!channelData) {
          setError('Channel not found.');
          setLoading(false);
          return;
        }

        // Validate required fields
        if (!channelData.stream_url) {
          setError('Stream URL not available for this channel.');
          setLoading(false);
          return;
        }

        // Transform to AdminChannel format
        const adminChannelData: AdminChannel = {
          id: channelData.id,
          name: channelData.name,
          logoUrl: channelData.logo_url,
          streamUrl: channelData.stream_url,
          categoryId: channelData.category_id,
          categoryName: channelData.categories.name,
          authCookie: channelData.auth_cookie,
        };

        setChannel(adminChannelData);
        
        // Set category data
        setCategory({
          id: channelData.category_id,
          name: channelData.categories.name,
          slug: channelData.categories.slug,
          iconUrl: '',
        });
        
        // Add to recents
        const { streamUrl, authCookie, ...publicChannelData } = adminChannelData;
        addRecent(publicChannelData);

        // Fetch related channels
        try {
          const relatedData = await getChannelsByCategory(channelData.category_id);
          const relatedChannels = relatedData
            .filter((ch: any) => ch.id !== channelId)
            .slice(0, 4)
            .map((ch: any) => ({
              id: ch.id,
              name: ch.name,
              logoUrl: ch.logo_url,
              categoryId: ch.category_id,
              categoryName: channelData.categories.name,
            })) as PublicChannel[];
          
          setRelatedChannels(relatedChannels);
        } catch (relatedError) {
          console.warn('Could not fetch related channels:', relatedError);
          setRelatedChannels([]);
        }

      } catch (err) {
        console.error("Error fetching channel data:", err);
        setError('Failed to load channel data. Please check your connection.');
      } finally {
        setLoading(false);
      }
    };

    fetchChannelData();
  }, [channelId, addRecent]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner mx-auto mb-4"></div>
          <p className="text-text-secondary">Loading channel...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !channel) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <Info className="mx-auto h-12 w-12 text-destructive mb-4" />
          <h2 className="text-lg font-semibold mb-2">{error || 'Channel not found'}</h2>
          <p className="text-text-secondary mb-4">
            The requested channel could not be loaded or is not available.
          </p>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => navigate(-1)} variant="outline">
              Go Back
            </Button>
            <Button onClick={() => navigate('/')}>
              Go Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Generate category link - use stored slug if available, otherwise generate from name
  const categorySlug = category?.slug || generateSlug(channel.categoryName);

  return (
    <div className="min-h-screen bg-background">
      {/* Full-screen video player - no other UI elements interfering */}
      <div className="relative w-full h-screen">
        <VideoPlayer
          key={channel.id} // Force re-render when channel changes
          streamUrl={channel.streamUrl}
          channelName={channel.name}
          autoPlay={true}
          muted={false} // Start unmuted for better UX
          className="w-full h-full"
        />
        
        {/* Overlay controls - positioned over the video player */}
        <div className="absolute top-4 left-4 z-50">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="bg-black/50 hover:bg-black/70 text-white border-0"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        {/* Channel info overlay */}
        <div className="absolute top-4 right-4 z-50 bg-black/50 backdrop-blur-sm rounded-lg p-3 text-white max-w-sm">
          <div className="flex items-center gap-3">
            <img
              src={channel.logoUrl}
              alt={channel.name}
              className="h-12 w-12 rounded object-contain bg-white/10 p-1"
              onError={(e) => {
                e.currentTarget.src = '/placeholder.svg';
              }}
            />
            <div className="min-w-0">
              <h1 className="font-bold text-lg truncate">{channel.name}</h1>
              <div className="flex items-center gap-2 text-sm text-white/80">
                <Link 
                  to={`/category/${categorySlug}`} 
                  className="hover:text-white hover:underline transition-colors truncate"
                >
                  {channel.categoryName}
                </Link>
                <span>•</span>
                <span className="flex items-center gap-1 flex-shrink-0">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  LIVE
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Related channels overlay - bottom of screen */}
        {relatedChannels.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 z-40">
            <div className="max-w-6xl mx-auto">
              <h3 className="text-white font-bold mb-3">More from {channel.categoryName}</h3>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {relatedChannels.map((relatedChannel) => (
                  <Link
                    key={relatedChannel.id}
                    to={`/channel/${relatedChannel.id}`}
                    className="flex-shrink-0 w-32 group"
                  >
                    <img
                      src={relatedChannel.logoUrl}
                      alt={relatedChannel.name}
                      className="w-full h-20 object-contain bg-white/10 rounded group-hover:bg-white/20 transition-colors"
                      onError={(e) => {
                        e.currentTarget.src = '/placeholder.svg';
                      }}
                    />
                    <p className="text-white text-xs mt-1 truncate group-hover:text-white/80">
                      {relatedChannel.name}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChannelPlayer;
