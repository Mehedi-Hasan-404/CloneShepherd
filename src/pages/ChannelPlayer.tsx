// /src/pages/ChannelPlayer.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PublicChannel, Category } from '@/types';
import VideoPlayer from '@/components/VideoPlayer';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Star, Share2, AlertCircle, Search, Play } from 'lucide-react';
import { useFavorites } from '@/contexts/FavoritesContext';
import { useRecents } from '@/contexts/RecentsContext';
import { toast } from "@/components/ui/sonner";

const ChannelPlayer = () => {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const [channel, setChannel] = useState<PublicChannel | null>(null);
  const [allChannels, setAllChannels] = useState<PublicChannel[]>([]);
  const [filteredChannels, setFilteredChannels] = useState<PublicChannel[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const { addRecent } = useRecents();

  useEffect(() => {
    if (channelId) {
      fetchChannel();
      fetchAllChannels();
    }
  }, [channelId]);

  useEffect(() => {
    const filtered = allChannels.filter(ch => 
      ch.id !== channel?.id && // Exclude current playing channel
      ch.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredChannels(filtered);
  }, [searchQuery, allChannels, channel]);

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
        // Create consistent ID format for M3U channels
        const cleanChannelName = currentChannel.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const channel: PublicChannel = {
          id: `${categoryId}_${cleanChannelName}_${channels.length}`,
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

  const fetchAllChannels = async () => {
    try {
      // Fetch all categories and their channels
      const categoriesRef = collection(db, 'categories');
      const categoriesSnapshot = await getDocs(categoriesRef);
      
      let allChannelsList: PublicChannel[] = [];

      // Get manual channels
      const channelsRef = collection(db, 'channels');
      const channelsSnapshot = await getDocs(channelsRef);
      const manualChannels = channelsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PublicChannel[];
      allChannelsList = [...allChannelsList, ...manualChannels];

      // Get M3U channels from all categories
      for (const categoryDoc of categoriesSnapshot.docs) {
        const categoryData = { id: categoryDoc.id, ...categoryDoc.data() } as Category;
        
        if (categoryData.m3uUrl) {
          try {
            const m3uChannels = await fetchM3UPlaylist(
              categoryData.m3uUrl,
              categoryData.id,
              categoryData.name
            );
            allChannelsList = [...allChannelsList, ...m3uChannels];
          } catch (m3uError) {
            console.error('Error loading M3U playlist for category:', categoryData.name, m3uError);
          }
        }
      }

      setAllChannels(allChannelsList);
    } catch (error) {
      console.error('Error fetching all channels:', error);
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

      console.log('Looking for channel with ID:', channelId);

      // Decode the channel ID in case it's URL encoded
      const decodedChannelId = decodeURIComponent(channelId);
      console.log('Decoded channel ID:', decodedChannelId);

      let foundChannel: PublicChannel | null = null;
      
      // First try to find in manual channels
      const channelsRef = collection(db, 'channels');
      const channelsSnapshot = await getDocs(channelsRef);
      
      // Check manual channels first
      for (const doc of channelsSnapshot.docs) {
        if (doc.id === decodedChannelId || doc.id === channelId) {
          foundChannel = { id: doc.id, ...doc.data() } as PublicChannel;
          console.log('Found in manual channels:', foundChannel);
          break;
        }
      }

      // If not found in manual channels, search in M3U playlists
      if (!foundChannel) {
        console.log('Not found in manual channels, searching M3U playlists...');
        const categoriesRef = collection(db, 'categories');
        const categoriesSnapshot = await getDocs(categoriesRef);
        
        for (const categoryDoc of categoriesSnapshot.docs) {
          const categoryData = { id: categoryDoc.id, ...categoryDoc.data() } as Category;
          
          if (categoryData.m3uUrl) {
            console.log(`Checking M3U playlist for category: ${categoryData.name}`);
            try {
              const m3uChannels = await fetchM3UPlaylist(
                categoryData.m3uUrl,
                categoryData.id,
                categoryData.name
              );
              
              console.log(`Found ${m3uChannels.length} channels in M3U playlist`);
              
              // Try both exact match and partial match for M3U channels
              const m3uChannel = m3uChannels.find(ch => 
                ch.id === decodedChannelId || 
                ch.id === channelId ||
                ch.id.includes(decodedChannelId) ||
                ch.id.includes(channelId)
              );
              
              if (m3uChannel) {
                foundChannel = m3uChannel;
                console.log('Found in M3U playlist:', foundChannel);
                break;
              }
            } catch (m3uError) {
              console.error('Error loading M3U playlist for category:', categoryData.name, m3uError);
            }
          }
        }
      }

      if (!foundChannel) {
        console.log('Channel not found anywhere');
        setError('Channel not found. The channel may have been removed or the link is invalid.');
        return;
      }

      console.log('Setting channel:', foundChannel);
      setChannel(foundChannel);
      
      // Add to recent channels
      addRecent(foundChannel);

    } catch (error) {
      console.error('Error fetching channel:', error);
      setError('Failed to load channel. Please try again.');
    } finally {
      setLoading(false);
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

  const handleChannelSelect = (selectedChannel: PublicChannel) => {
    navigate(`/channel/${encodeURIComponent(selectedChannel.id)}`);
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
      <div className="space-y-6">
        <Button 
          variant="ghost" 
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft size={16} />
          Go Back
        </Button>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Channel not found.</AlertDescription>
        </Alert>
      </div>
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

      {/* Search Bar for Other Channels */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Other Channels</h2>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-secondary w-5 h-5" />
          <input
            type="text"
            placeholder="Search all channels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input pl-10"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-secondary hover:text-text-primary transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          )}
        </div>

        {/* Other Channels Grid */}
        {filteredChannels.length === 0 && searchQuery ? (
          <div className="text-center py-8">
            <Search size={48} className="text-text-secondary mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No channels found</h3>
            <p className="text-text-secondary">
              No channels match "{searchQuery}". Try a different search term.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 max-h-96 overflow-y-auto">
            {filteredChannels.slice(0, 50).map(ch => (
              <div
                key={ch.id}
                className="bg-card border border-border rounded-lg p-3 cursor-pointer hover:bg-bg-secondary transition-colors group"
                onClick={() => handleChannelSelect(ch)}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={ch.logoUrl}
                    alt={ch.name}
                    className="w-10 h-10 object-contain bg-white rounded flex-shrink-0"
                    onError={(e) => {
                      e.currentTarget.src = '/placeholder.svg';
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className="font-medium text-sm truncate group-hover:text-accent transition-colors">
                      {ch.name}
                    </h4>
                    <p className="text-xs text-text-secondary truncate">{ch.categoryName}</p>
                  </div>
                  <Play size={16} className="text-text-secondary group-hover:text-accent transition-colors flex-shrink-0" />
                </div>
              </div>
            ))}
          </div>
        )}
        
        {filteredChannels.length > 50 && (
          <p className="text-center text-text-secondary text-sm">
            Showing first 50 channels. Use search to find specific channels.
          </p>
        )}
      </div>
    </div>
  );
};

export default ChannelPlayer;
