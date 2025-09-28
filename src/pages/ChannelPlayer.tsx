// /src/pages/ChannelPlayer.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PublicChannel, Category } from '@/types';
import VideoPlayer from '@/components/VideoPlayer';
import ChannelCard from '@/components/ChannelCard';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Star, Share2, AlertCircle } from 'lucide-react';
import { useFavorites } from '@/contexts/FavoritesContext';
import { useRecents } from '@/contexts/RecentsContext';
import { toast } from "@/components/ui/sonner";

const ChannelPlayer = () => {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const [channel, setChannel] = useState<PublicChannel | null>(null);
  const [relatedChannels, setRelatedChannels] = useState<PublicChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const { addRecent } = useRecents();

    useEffect(() => {
    if (channelId) {
      fetchChannel();
    }
  }, [channelId]);

  const parseM3U = (m3uContent: string, categoryId: string, categoryName: string): PublicChannel[] => {
    const lines = m3uContent.split('\n').map(line => line.trim()).filter(line => line);
    const channels: PublicChannel[] = [];
    let currentChannel: Partial<PublicChannel> = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.startsWith('#EXTINF:')) {
        const nameMatch = line.match(/,(.+)$/);
        const channelName = nameMatch ? nameMatch[1].trim() : 'Unknown Channel';
        const logoMatch = line.match(/tvg-logo="([^"]+)"/);
        const logoUrl = logoMatch ? logoMatch[1] : '/placeholder.svg';
        
        currentChannel = {
          name: channelName,
          logoUrl: logoUrl,
          categoryId,
          categoryName,
        };
      } else if (line && !line.startsWith('#') && currentChannel.name) {
        const channel: PublicChannel = {
          id: `${categoryId}_${channels.length}_${Date.now()}`,
          name: currentChannel.name,
          logoUrl: currentChannel.logoUrl || '/placeholder.svg',
          streamUrl: line,
          categoryId,
          categoryName,
        };
        channels.push(channel);
        currentChannel = {};
      }
    }

    return channels;
  };

  const fetchM3UPlaylist = async (m3uUrl: string, categoryId: string, categoryName: string): Promise<PublicChannel[]> => {
    try {
      const response = await fetch(m3uUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch M3U playlist: ${response.statusText}`);
      }
      const m3uContent = await response.text();
      return parseM3U(m3uContent, categoryId, categoryName);
    } catch (error) {
      console.error('Error fetching M3U playlist:', error);
      throw error;
    }
  };

  const fetchChannel = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!channelId) {
        setError('Channel ID is required');
        return;
      }

      // First try to find in manual channels
      const channelsRef = collection(db, 'channels');
      const channelsSnapshot = await getDocs(channelsRef);
      
      let foundChannel: PublicChannel | null = null;
      
      // Check manual channels first
      for (const doc of channelsSnapshot.docs) {
        if (doc.id === channelId) {
          foundChannel = { id: doc.id, ...doc.data() } as PublicChannel;
          break;
        }
      }

      // If not found in manual channels, search in M3U playlists
      if (!foundChannel) {
        const categoriesRef = collection(db, 'categories');
        const categoriesSnapshot = await getDocs(categoriesRef);
        
        for (const categoryDoc of categoriesSnapshot.docs) {
          const categoryData = { id: categoryDoc.id, ...categoryDoc.data() } as Category;
          
          if (categoryData.m3uUrl) {
            try {
              const m3uChannels = await fetchM3UPlaylist(
                categoryData.m3uUrl,
                categoryData.id,
                categoryData.name
              );
              
              const m3uChannel = m3uChannels.find(ch => ch.id === channelId);
              if (m3uChannel) {
                foundChannel = m3uChannel;
                break;
              }
            } catch (m3uError) {
              console.error('Error loading M3U playlist for category:', categoryData.name, m3uError);
            }
          }
        }
      }

      if (!foundChannel) {
        setError('Channel not found');
        return;
      }

      setChannel(foundChannel);
      
      // Add to recent channels
      addRecent(foundChannel);

      // Fetch related channels from same category
      await fetchRelatedChannels(foundChannel.categoryId, foundChannel.id);

    } catch (error) {
      console.error('Error fetching channel:', error);
      setError('Failed to load channel. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRelatedChannels = async (categoryId: string, currentChannelId: string) => {
    try {
      let allChannels: PublicChannel[] = [];

      // Get category info
      const categoriesRef = collection(db, 'categories');
      const categoriesSnapshot = await getDocs(categoriesRef);
      const category = categoriesSnapshot.docs.find(doc => doc.id === categoryId);
      
      if (category) {
        const categoryData = { id: category.id, ...category.data() } as Category;
        
        // Fetch M3U channels if available
        if (categoryData.m3uUrl) {
          try {
            const m3uChannels = await fetchM3UPlaylist(
              categoryData.m3uUrl,
              categoryData.id,
              categoryData.name
            );
            allChannels = [...allChannels, ...m3uChannels];
          } catch (error) {
            console.error('Error fetching M3U channels for related:', error);
          }
        }

        // Fetch manual channels
        const channelsRef = collection(db, 'channels');
        const channelsQuery = query(channelsRef, where('categoryId', '==', categoryId));
        const channelsSnapshot = await getDocs(channelsQuery);
        
        const manualChannels = channelsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as PublicChannel[];

        allChannels = [...allChannels, ...manualChannels];
      }

      // Filter out current channel and limit to 8 related channels
      const related = allChannels
        .filter(ch => ch.id !== currentChannelId)
        .slice(0, 8);
      
      setRelatedChannels(related);
    } catch (error) {
      console.error('Error fetching related channels:', error);
    }
  };

  const handleFavoriteToggle = () => {
    if (!channel) return;

    if (isFavorite(channel.id)) {
      removeFavorite(channel.id);
    } else {
      addFavorite(channel);
    }
  };

  const handleShare = async () => {
    if (!channel) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: channel.name,
          text: `Watch ${channel.name} on Live TV Pro`,
          url: window.location.href,
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(window.location.href);
        toast.success("Link copied to clipboard!");
      } catch (error) {
        toast.error("Failed to copy link");
      }
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="aspect-video w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Button 
          variant="ghost" 
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft size={16} />
          Go Back
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!channel) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Channel not found.</AlertDescription>
      </Alert>
    );
  }

  const isChannelFavorite = isFavorite(channel.id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button 
          variant="ghost" 
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft size={16} />
          Back
        </Button>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleFavoriteToggle}
            className={isChannelFavorite ? 'text-yellow-500' : ''}
          >
            <Star size={16} fill={isChannelFavorite ? 'currentColor' : 'none'} />
            {isChannelFavorite ? 'Favorited' : 'Add to Favorites'}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleShare}
          >
            <Share2 size={16} />
            Share
          </Button>
        </div>
      </div>

      {/* Channel Info */}
      <div className="flex items-center gap-4">
        <img
          src={channel.logoUrl}
          alt={channel.name}
          className="w-16 h-16 object-contain bg-white rounded-lg"
          onError={(e) => {
            e.currentTarget.src = '/placeholder.svg';
          }}
        />
        <div>
          <h1 className="text-2xl font-bold">{channel.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">{channel.categoryName}</Badge>
            <Badge variant="destructive" className="animate-pulse">
              LIVE
            </Badge>
          </div>
        </div>
      </div>

      {/* Video Player */}
      <div className="w-full">
        <VideoPlayer
          streamUrl={channel.streamUrl}
          channelName={channel.name}
          autoPlay={true}
          muted={false}
          className="w-full"
        />
      </div>

      {/* Related Channels */}
      {relatedChannels.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">More from {channel.categoryName}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {relatedChannels.map(relatedChannel => (
              <ChannelCard key={relatedChannel.id} channel={relatedChannel} />
            ))}
          </div>
        </div>
      )}

      {/* Channel Details */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">About this Channel</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-text-secondary">Channel Name:</span>
            <div className="font-medium">{channel.name}</div>
          </div>
          <div>
            <span className="text-text-secondary">Category:</span>
            <div className="font-medium">{channel.categoryName}</div>
          </div>
          <div>
            <span className="text-text-secondary">Quality:</span>
            <div className="font-medium">HD</div>
          </div>
          <div>
            <span className="text-text-secondary">Status:</span>
            <div className="font-medium text-green-500">Live</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChannelPlayer;
