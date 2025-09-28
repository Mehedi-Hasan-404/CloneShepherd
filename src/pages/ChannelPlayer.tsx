// /src/pages/ChannelPlayer.tsx - Debug Version
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
import ErrorBoundary from '@/components/ErrorBoundary'; // NEW: Error Boundary Import

const ChannelPlayer = () => {
  const params = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const [channel, setChannel] = useState<PublicChannel | null>(null);
  const [allChannels, setAllChannels] = useState<PublicChannel[]>([]);
  const [filteredChannels, setFilteredChannels] = useState<PublicChannel[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const { addRecent } = useRecents();

  // Helper function to add debug info
  const addDebug = (message: string) => {
    console.log(`[ChannelPlayer] ${message}`);
    setDebugInfo(prev => [...prev, `${new Date().toISOString()}: ${message}`]);
  };

  // Get channelId from params
  const channelId = params.channelId;

  useEffect(() => {
    addDebug(`Component mounted/channelId changed with: ${channelId}`);
    
    if (channelId) {
      // Ensure we re-fetch all data when channelId changes
      fetchChannel();
      fetchAllChannels();
    } else {
      addDebug('No channelId found in params');
      setError('No channel ID provided in URL');
      setLoading(false);
    }
    // Dependency array ensures this runs only when the channelId in the URL changes
  }, [channelId]);

  useEffect(() => {
    if (allChannels.length > 0) {
      // Filter out the currently playing channel
      const baseChannels = channel ? allChannels.filter(ch => ch.id !== channel.id) : allChannels;

      const filtered = baseChannels.filter(ch => 
        ch.name && ch.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredChannels(filtered);
    } else {
      setFilteredChannels([]);
    }
  }, [searchQuery, allChannels, channel]);

  const parseM3U = (m3uContent: string, categoryId: string, categoryName: string): PublicChannel[] => {
    addDebug(`Parsing M3U content for category: ${categoryName}`);
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
        const cleanChannelName = currentChannel.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const channel: PublicChannel = {
          // IMPORTANT: Consistent ID generation for M3U channels
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

    addDebug(`Parsed ${channels.length} channels from M3U`);
    return channels;
  };

  const fetchM3UPlaylist = async (m3uUrl: string, categoryId: string, categoryName: string): Promise<PublicChannel[]> => {
    try {
      addDebug(`Fetching M3U playlist: ${m3uUrl}`);
      const response = await fetch(m3uUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const m3uContent = await response.text();
      return parseM3U(m3uContent, categoryId, categoryName);
    } catch (error) {
      addDebug(`Error fetching M3U playlist: ${error}`);
      return [];
    }
  };

  const fetchAllChannels = async () => {
    addDebug('Starting fetchAllChannels');
    try {
      const categoriesRef = collection(db, 'categories');
      const categoriesSnapshot = await getDocs(categoriesRef);
      
      let allChannelsList: PublicChannel[] = [];

      // Get manual channels
      try {
        const channelsRef = collection(db, 'channels');
        const channelsSnapshot = await getDocs(channelsRef);
        const manualChannels = channelsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as PublicChannel[];
        allChannelsList = [...allChannelsList, ...manualChannels];
        addDebug(`Found ${manualChannels.length} manual channels`);
      } catch (manualChannelsError) {
        addDebug(`Error fetching manual channels: ${manualChannelsError}`);
      }

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
            if (m3uChannels.length > 0) {
              allChannelsList = [...allChannelsList, ...m3uChannels];
              addDebug(`Added ${m3uChannels.length} M3U channels from ${categoryData.name}`);
            }
          } catch (m3uError) {
            addDebug(`Error loading M3U playlist for category ${categoryData.name}: ${m3uError}`);
          }
        }
      }

      // Filter out duplicates (important if a channel is both manual and in an M3U)
      const uniqueChannels = allChannelsList.filter((ch, index, self) =>
        index === self.findIndex((t) => t.id === ch.id)
      );

      addDebug(`Total unique channels loaded: ${uniqueChannels.length}`);
      setAllChannels(uniqueChannels);
    } catch (error) {
      addDebug(`Error in fetchAllChannels: ${error}`);
    }
  };

  const fetchChannel = async () => {
    addDebug(`Starting fetchChannel for channelId: ${channelId}`);
    try {
      setLoading(true);
      setError(null);
      setChannel(null); // Reset channel state when fetching a new one

      if (!channelId) {
        const errorMsg = 'Channel ID is required';
        addDebug(errorMsg);
        setError(errorMsg);
        return;
      }

      const decodedChannelId = decodeURIComponent(channelId);
      addDebug(`Decoded channel ID: ${decodedChannelId}`);

      let foundChannel: PublicChannel | null = null;
      
      // 1. Search manual channels first
      try {
        addDebug('Searching manual channels...');
        const channelsRef = collection(db, 'channels');
        const channelsSnapshot = await getDocs(channelsRef);
        
        for (const doc of channelsSnapshot.docs) {
          if (doc.id === decodedChannelId) {
            const channelData = doc.data();
            foundChannel = {
              id: doc.id,
              name: channelData.name || 'Unknown Channel',
              logoUrl: channelData.logoUrl || '/placeholder.svg',
              streamUrl: channelData.streamUrl || '',
              categoryId: channelData.categoryId || '',
              categoryName: channelData.categoryName || 'Unknown Category'
            };
            break;
          }
        }
      } catch (manualChannelsError) {
        addDebug(`Error fetching manual channels: ${manualChannelsError}`);
      }

      // 2. Search M3U channels if not found (This is the slow path)
      if (!foundChannel) {
        addDebug('Not found in manual channels, searching M3U playlists...');
        const categoriesRef = collection(db, 'categories');
        const categoriesSnapshot = await getDocs(categoriesRef);
          
        for (const categoryDoc of categoriesSnapshot.docs) {
          const categoryData = { id: categoryDoc.id, ...categoryDoc.data() } as Category;
          
          if (categoryData.m3uUrl) {
            addDebug(`Checking M3U playlist for category: ${categoryData.name}`);
            try {
              const m3uChannels = await fetchM3UPlaylist(
                categoryData.m3uUrl,
                categoryData.id,
                categoryData.name
              );
              
              const m3uChannel = m3uChannels.find(ch => 
                ch.id === decodedChannelId
              );
              
              if (m3uChannel) {
                foundChannel = m3uChannel;
                addDebug(`Found in M3U playlist: ${JSON.stringify(foundChannel)}`);
                break;
              }
            } catch (m3uError) {
              addDebug(`Error loading M3U playlist for category ${categoryData.name}: ${m3uError}`);
            }
          }
        }
      }

      if (!foundChannel) {
        const errorMsg = 'Channel not found. The channel may have been removed or the link is invalid.';
        addDebug(errorMsg);
        setError(errorMsg);
        return;
      }

      if (!foundChannel.streamUrl) {
        const errorMsg = 'Channel stream URL is missing or invalid.';
        addDebug(`${errorMsg} Found channel: ${JSON.stringify(foundChannel)}`);
        setError(errorMsg);
        return;
      }

      addDebug(`Setting final channel: ${foundChannel.id}`);
      setChannel(foundChannel);
      
      if (addRecent) {
        addRecent(foundChannel);
      }

    } catch (error) {
      const errorMsg = `Failed to load channel: ${error}`;
      addDebug(errorMsg);
      setError(errorMsg);
    } finally {
      setLoading(false);
      addDebug('fetchChannel completed');
    }
  };

  const handleFavoriteToggle = () => {
    if (!channel) return;
    try {
      if (isFavorite(channel.id)) {
        removeFavorite(channel.id);
        toast.info(`${channel.name} removed from favorites`);
      } else {
        addFavorite(channel);
        toast.success(`${channel.name} added to favorites!`);
      }
    } catch (error) {
      addDebug(`Error toggling favorite: ${error}`);
      toast.error("Failed to update favorites");
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
        addDebug(`Error sharing: ${error}`);
      }
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        toast.success("Link copied to clipboard!");
      } catch (error) {
        toast.error("Failed to copy link");
      }
    }
  };

  const handleChannelSelect = (selectedChannel: PublicChannel) => {
    if (selectedChannel && selectedChannel.id) {
      addDebug(`Navigating to channel: ${selectedChannel.id}`);
      // Navigate to the new channel, which triggers the useEffect and fetches the new stream
      navigate(`/channel/${encodeURIComponent(selectedChannel.id)}`);
    }
  };

  const showDebugInfo = process.env.NODE_ENV === 'development';

  if (loading) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        {showDebugInfo && (
          <div className="bg-gray-900 text-green-400 p-4 rounded text-xs font-mono max-h-40 overflow-y-auto">
            <strong>DEBUG INFO (LOADING):</strong><br />
            {debugInfo.slice(-10).map((info, i) => (
              <div key={i}>{info}</div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-48" />
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

  if (error || !channel) {
    const displayError = error || 'Channel not found or stream is missing.';
    return (
      <div className="space-y-6 p-4 sm:p-6">
        {showDebugInfo && (
          <div className="bg-gray-900 text-green-400 p-4 rounded text-xs font-mono max-h-60 overflow-y-auto">
            <strong>DEBUG INFO (ERROR):</strong><br />
            {debugInfo.map((info, i) => (
              <div key={i}>{info}</div>
            ))}
          </div>
        )}
        <Button 
          variant="ghost" 
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft size={16} className="mr-2" />
          Go Back
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{displayError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const isChannelFavorite = isFavorite(channel.id);

  return (
    <ErrorBoundary>
      <div className="space-y-6 p-4 sm:p-6">
        {showDebugInfo && (
          <div className="bg-gray-900 text-green-400 p-4 rounded text-xs font-mono max-h-40 overflow-y-auto">
            <strong>DEBUG INFO (LIVE):</strong><br />
            {debugInfo.slice(-5).map((info, i) => (
              <div key={i}>{info}</div>
            ))}
          </div>
        )}
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} className="mr-2" />
            Back
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleFavoriteToggle}
              className={isChannelFavorite ? 'text-yellow-500' : ''}
            >
              <Star size={16} fill={isChannelFavorite ? 'currentColor' : 'none'} className="mr-1" />
              {isChannelFavorite ? 'Favorited' : 'Add to Favorites'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 size={16} className="mr-1" />
              Share
            </Button>
          </div>
        </div>

        {/* Channel Info */}
        <div className="flex items-center gap-4">
          <img
            src={channel.logoUrl || '/placeholder.svg'}
            alt={channel.name}
            className="w-16 h-16 object-contain p-1 bg-white dark:bg-gray-800 rounded-lg shadow"
            onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
          />
          <div>
            <h1 className="text-2xl font-bold">{channel.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary">{channel.categoryName}</Badge>
              <Badge variant="destructive" className="animate-pulse">LIVE</Badge>
            </div>
          </div>
        </div>

        {/* Video Player */}
        <div className="w-full aspect-video bg-black rounded-lg overflow-hidden shadow-2xl">
          <VideoPlayer
            // CRITICAL FIX: The 'key' forces React to destroy and rebuild the component 
            // when channel.id changes, ensuring HLS is fully reset.
            key={channel.id} 
            streamUrl={channel.streamUrl}
            channelName={channel.name}
            autoPlay={true}
            muted={false}
            className="w-full h-full"
          />
        </div>

        {/* Rest of the component: Related Channels */}
        <div className="related-channels-section pt-4">
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">
            More Channels
            {channel.categoryName && <span className="text-base text-gray-500 font-normal ml-2">in {channel.categoryName}</span>}
          </h2>
          
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <input
              type="search"
              placeholder="Search related channels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg bg-card text-card-foreground focus:ring-2 focus:ring-accent focus:border-accent shadow-inner"
            />
          </div>

          {filteredChannels.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredChannels.map(ch => (
                <div 
                  key={ch.id} 
                  className="channel-card cursor-pointer p-3 border rounded-lg hover:border-accent transition-colors bg-card shadow-sm"
                  onClick={() => handleChannelSelect(ch)}
                >
                  <img
                    src={ch.logoUrl || '/placeholder.svg'}
                    alt={ch.name}
                    className="w-full h-12 sm:h-16 object-contain mb-2 p-1"
                  />
                  <p className="text-sm font-medium truncate text-center">{ch.name}</p>
                  <Badge className="mt-2 flex w-fit mx-auto items-center gap-1 text-xs" variant="default">
                    <Play size={12} />
                    Watch
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>No other channels found matching your search.</p>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default ChannelPlayer;
