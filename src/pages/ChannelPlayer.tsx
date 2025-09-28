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
    addDebug(`Component mounted with params: ${JSON.stringify(params)}`);
    addDebug(`channelId extracted: ${channelId}`);
    
    if (channelId) {
      fetchChannel();
      fetchAllChannels();
    } else {
      addDebug('No channelId found in params');
      setError('No channel ID provided in URL');
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    if (allChannels.length > 0 && channel) {
      const filtered = allChannels.filter(ch => 
        ch.id !== channel.id && 
        ch.name && ch.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredChannels(filtered);
    } else if (allChannels.length > 0) {
      const filtered = allChannels.filter(ch => 
        ch.name && ch.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredChannels(filtered);
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

      addDebug(`Total channels loaded: ${allChannelsList.length}`);
      setAllChannels(allChannelsList);
    } catch (error) {
      addDebug(`Error in fetchAllChannels: ${error}`);
    }
  };

  const fetchChannel = async () => {
    addDebug(`Starting fetchChannel for channelId: ${channelId}`);
    try {
      setLoading(true);
      setError(null);

      if (!channelId) {
        const errorMsg = 'Channel ID is required';
        addDebug(errorMsg);
        setError(errorMsg);
        return;
      }

      const decodedChannelId = decodeURIComponent(channelId);
      addDebug(`Decoded channel ID: ${decodedChannelId}`);

      let foundChannel: PublicChannel | null = null;
      
      // Search manual channels first
      try {
        addDebug('Searching manual channels...');
        const channelsRef = collection(db, 'channels');
        const channelsSnapshot = await getDocs(channelsRef);
        
        addDebug(`Found ${channelsSnapshot.docs.length} manual channel documents`);
        
        for (const doc of channelsSnapshot.docs) {
          addDebug(`Checking manual channel doc ID: ${doc.id}`);
          if (doc.id === decodedChannelId || doc.id === channelId) {
            const channelData = doc.data();
            addDebug(`Found matching manual channel data: ${JSON.stringify(channelData)}`);
            
            foundChannel = {
              id: doc.id,
              name: channelData.name || 'Unknown Channel',
              logoUrl: channelData.logoUrl || '/placeholder.svg',
              streamUrl: channelData.streamUrl || '',
              categoryId: channelData.categoryId || '',
              categoryName: channelData.categoryName || 'Unknown Category'
            };
            addDebug(`Created foundChannel: ${JSON.stringify(foundChannel)}`);
            break;
          }
        }
      } catch (manualChannelsError) {
        addDebug(`Error fetching manual channels: ${manualChannelsError}`);
      }

      // Search M3U channels if not found
      if (!foundChannel) {
        addDebug('Not found in manual channels, searching M3U playlists...');
        try {
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
                
                addDebug(`M3U playlist returned ${m3uChannels.length} channels`);
                
                // Log first few channel IDs for debugging
                m3uChannels.slice(0, 3).forEach(ch => {
                  addDebug(`M3U Channel ID sample: ${ch.id}`);
                });
                
                const m3uChannel = m3uChannels.find(ch => 
                  ch.id === decodedChannelId || 
                  ch.id === channelId ||
                  ch.id.includes(decodedChannelId) ||
                  ch.id.includes(channelId)
                );
                
                if (m3uChannel) {
                  foundChannel = {
                    ...m3uChannel,
                    name: m3uChannel.name || 'Unknown Channel',
                    logoUrl: m3uChannel.logoUrl || '/placeholder.svg',
                    streamUrl: m3uChannel.streamUrl || '',
                    categoryId: m3uChannel.categoryId || categoryData.id,
                    categoryName: m3uChannel.categoryName || categoryData.name
                  };
                  addDebug(`Found in M3U playlist: ${JSON.stringify(foundChannel)}`);
                  break;
                }
              } catch (m3uError) {
                addDebug(`Error loading M3U playlist for category ${categoryData.name}: ${m3uError}`);
              }
            }
          }
        } catch (categoriesError) {
          addDebug(`Error fetching categories: ${categoriesError}`);
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

      addDebug(`Setting final channel: ${JSON.stringify(foundChannel)}`);
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
      navigate(`/channel/${encodeURIComponent(selectedChannel.id)}`);
    }
  };

  addDebug(`Current render state - loading: ${loading}, error: ${error}, channel: ${channel ? 'found' : 'null'}, channelId: ${channelId}`);

  // Debug info panel (remove in production)
  const showDebugInfo = process.env.NODE_ENV === 'development';

  if (loading) {
    return (
      <div className="space-y-6 p-4">
        {showDebugInfo && (
          <div className="bg-gray-900 text-green-400 p-4 rounded text-xs font-mono max-h-40 overflow-y-auto">
            <strong>DEBUG INFO:</strong><br />
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

  if (error) {
    return (
      <div className="space-y-6 p-4">
        {showDebugInfo && (
          <div className="bg-gray-900 text-green-400 p-4 rounded text-xs font-mono max-h-60 overflow-y-auto">
            <strong>DEBUG INFO:</strong><br />
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
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="space-y-6 p-4">
        {showDebugInfo && (
          <div className="bg-gray-900 text-green-400 p-4 rounded text-xs font-mono max-h-60 overflow-y-auto">
            <strong>DEBUG INFO:</strong><br />
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
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Channel not found.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const isChannelFavorite = isFavorite(channel.id);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {showDebugInfo && (
        <div className="bg-gray-900 text-green-400 p-4 rounded text-xs font-mono max-h-40 overflow-y-auto">
          <strong>DEBUG INFO:</strong><br />
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
          // 👇 CRITICAL FIX: The 'key' forces React to destroy and rebuild the component 
          // when channel.id changes, preventing HLS instance conflicts.
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
          {channel.categoryName && <span className="text-base text-text-secondary font-normal ml-2">in {channel.categoryName}</span>}
        </h2>
        
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
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
          <div className="text-center py-8 text-text-secondary">
            <p>No other channels found matching your search.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChannelPlayer;
