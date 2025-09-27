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

        const channelData = await getChannel(channelId);
        
        if (!channelData) {
          setError('Channel not found.');
          setLoading(false);
          return;
        }

        if (!channelData.stream_url) {
          setError('Stream URL not available for this channel.');
          setLoading(false);
          return;
        }

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
        
        setCategory({
          id: channelData.category_id,
          name: channelData.categories.name,
          slug: channelData.categories.slug,
          iconUrl: '',
        });
        
        const { streamUrl, authCookie, ...publicChannelData } = adminChannelData;
        addRecent(publicChannelData);

        try {
          const relatedData = await getChannelsByCategory(channelData.category_id);
          const related = relatedData
            .filter((ch: any) => ch.id !== channelId)
            .slice(0, 8) // Show more related channels
            .map((ch: any) => ({
              id: ch.id,
              name: ch.name,
              logoUrl: ch.logo_url,
              categoryId: ch.category_id,
              categoryName: channelData.categories.name,
            })) as PublicChannel[];
          
          setRelatedChannels(related);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="loading-spinner mx-auto mb-4"></div>
          <p className="text-text-secondary">Loading channel...</p>
        </div>
      </div>
    );
  }

  if (error || !channel) {
    return (
      <div className="empty-state">
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
    );
  }

  const categorySlug = category?.slug || generateSlug(channel.categoryName);

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold">{channel.name}</h1>
          <Link 
            to={`/category/${categorySlug}`} 
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            {channel.categoryName}
          </Link>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate(-1)}
          className="flex-shrink-0"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>

      <div className="mb-8 rounded-lg overflow-hidden border shadow-lg bg-black">
        <VideoPlayer
          key={channel.id}
          streamUrl={channel.streamUrl}
          channelName={channel.name}
          autoPlay={true}
          muted={false}
        />
      </div>

      {relatedChannels.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4">More from {channel.categoryName}</h2>
          <div className="channel-grid">
            {relatedChannels.map((relatedChannel) => (
              <ChannelCard key={relatedChannel.id} channel={relatedChannel} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChannelPlayer;
