// /src/pages/CategoryChannels.tsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PublicChannel, Category } from '@/types';
import ChannelCard from '@/components/ChannelCard';
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Tv } from 'lucide-react';

const CategoryChannels = () => {
  const { slug } = useParams<{ slug: string }>();
  const [channels, setChannels] = useState<PublicChannel[]>([]);
  const [category, setCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (slug) {
      fetchCategoryAndChannels();
    }
  }, [slug]);

  const parseM3U = (m3uContent: string, categoryId: string, categoryName: string): PublicChannel[] => {
    const lines = m3uContent.split('\n').map(line => line.trim()).filter(line => line);
    const channels: PublicChannel[] = [];
    let currentChannel: Partial<PublicChannel> = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.startsWith('#EXTINF:')) {
        // Extract channel name (after the comma)
        const nameMatch = line.match(/,(.+)$/);
        const channelName = nameMatch ? nameMatch[1].trim() : 'Unknown Channel';
        
        // Extract logo URL from tvg-logo attribute
        const logoMatch = line.match(/tvg-logo="([^"]+)"/);
        const logoUrl = logoMatch ? logoMatch[1] : '/placeholder.svg';
        
        currentChannel = {
          name: channelName,
          logoUrl: logoUrl,
          categoryId,
          categoryName,
        };
      } else if (line && !line.startsWith('#') && currentChannel.name) {
        // This is a stream URL
        const channel: PublicChannel = {
          id: `m3u_${categoryId}_${channels.length}`,
          name: currentChannel.name,
          logoUrl: currentChannel.logoUrl || '/placeholder.svg',
          streamUrl: line,
          categoryId,
          categoryName,
        };
        channels.push(channel);
        currentChannel = {}; // Reset for next channel
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

  const fetchCategoryAndChannels = async () => {
    try {
      setLoading(true);
      setError(null);

      // Find the category by slug
      const categoriesRef = collection(db, 'categories');
      const categoryQuery = query(categoriesRef, where('slug', '==', slug));
      const categorySnapshot = await getDocs(categoryQuery);

      if (categorySnapshot.empty) {
        setError('Category not found');
        setLoading(false);
        return;
      }

      const categoryDoc = categorySnapshot.docs[0];
      const categoryData = { id: categoryDoc.id, ...categoryDoc.data() } as Category;
      setCategory(categoryData);

      let allChannels: PublicChannel[] = [];

      // If category has M3U URL, fetch and parse it to get channels
      if (categoryData.m3uUrl) {
        try {
          const m3uChannels = await fetchM3UPlaylist(
            categoryData.m3uUrl, 
            categoryData.id, 
            categoryData.name
          );
          allChannels = [...allChannels, ...m3uChannels];
        } catch (m3uError) {
          console.error('Error loading M3U playlist:', m3uError);
          setError('Failed to load M3U playlist. Please check the playlist URL.');
        }
      }

      // Also fetch manually added channels from Firestore
      const channelsRef = collection(db, 'channels');
      const channelsQuery = query(channelsRef, where('categoryId', '==', categoryData.id));
      const channelsSnapshot = await getDocs(channelsQuery);
      
      const manualChannels = channelsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PublicChannel[];

      allChannels = [...allChannels, ...manualChannels];
      setChannels(allChannels);

    } catch (error) {
      console.error('Error fetching category and channels:', error);
      setError('Failed to load channels. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-video w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!category) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Category not found.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Tv size={24} />
          {category.name}
        </h1>
        <p className="text-text-secondary">
          {channels.length} channel{channels.length !== 1 ? 's' : ''} available
          {category.m3uUrl && (
            <span className="ml-2 text-green-500">• M3U Playlist Loaded</span>
          )}
        </p>
      </div>

      {channels.length === 0 ? (
        <div className="text-center py-12">
          <Tv size={48} className="text-text-secondary mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Channels Available</h3>
          <p className="text-text-secondary">
            {category.m3uUrl 
              ? "M3U playlist might be empty or invalid." 
              : "No channels have been added to this category yet."
            }
          </p>
        </div>
      ) : (
        <div className="channel-grid">
          {channels.map(channel => (
            <ChannelCard key={channel.id} channel={channel} />
          ))}
        </div>
      )}
    </div>
  );
};

export default CategoryChannels;
