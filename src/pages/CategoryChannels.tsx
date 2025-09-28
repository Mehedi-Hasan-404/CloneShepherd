// /src/pages/CategoryChannels.tsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { collection, query, where, getDocs, or } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PublicChannel, Category } from '@/types';
import ChannelCard from '@/components/ChannelCard';
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Tv, Search } from 'lucide-react';
import { Input } from "@/components/ui/input"; 

const CategoryChannels = () => {
  const { slug } = useParams<{ slug: string }>();
  const [channels, setChannels] = useState<PublicChannel[]>([]);
  const [category, setCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredChannels, setFilteredChannels] = useState<PublicChannel[]>([]);

  [span_0](start_span)// Function to parse M3U content[span_0](end_span)
  const parseM3U = (m3uContent: string, categoryId: string, categoryName: string): PublicChannel[] => {
    const lines = m3uContent.split('\n').map(line => line.trim()).filter(line => line);
    const m3uChannels: PublicChannel[] = [];
    let currentChannel: Partial<PublicChannel> = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('#EXTINF:')) {
        const nameMatch = line.match(/,(.+)$/);
        const channelName = nameMatch ? nameMatch[1].trim() : 'Unknown Channel';
        const logoMatch = line.match(/tvg-logo="([^"]+)"/);
        const logoUrl = logoMatch ? logoMatch[1] : '/placeholder.svg';

        currentChannel = { name: channelName, logoUrl: logoUrl, categoryId, categoryName };
      } else if (line && !line.startsWith('#') && currentChannel.name) {
        const cleanChannelName = currentChannel.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const channel: PublicChannel = {
          id: `${categoryId}_${cleanChannelName}_${m3uChannels.length}`,
          name: currentChannel.name!,
          logoUrl: currentChannel.logoUrl || '/placeholder.svg',
          streamUrl: line,
          categoryId,
          categoryName,
        };
        m3uChannels.push(channel);
        currentChannel = {}; 
      }
    }
    return m3uChannels;
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
    if (!slug) return;
    try {
      setLoading(true);
      setError(null);

      [span_1](start_span)// Find the category by slug[span_1](end_span)
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

      [span_2](start_span)// 1. Fetch M3U channels if URL is present[span_2](end_span)
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
        }
      }

      [span_3](start_span)// 2. Fetch manually added channels from Firestore[span_3](end_span)
      try {
        const channelsRef = collection(db, 'channels');
        const channelsQuery = query(
          channelsRef,
          or(
            where('categoryId', '==', categoryData.id),
            where('categoryName', '==', categoryData.name)
          )
        );
        const channelsSnapshot = await getDocs(channelsQuery);
        const firestoreChannels = channelsSnapshot.docs.map((doc: any) => ({
          id: doc.id,
          ...doc.data(),
        })) as PublicChannel[];

        allChannels = [...allChannels, ...firestoreChannels];
      } catch (dbError) {
        console.error('Error loading Firestore channels:', dbError);
        if (allChannels.length === 0) {
          setError('Failed to load channels for this category. Please try again.');
        }
      }
      
      const uniqueChannels = allChannels.filter((channel, index, self) =>
        index === self.findIndex((t) => (
          t.id === channel.id || (t.name === channel.name && t.streamUrl === channel.streamUrl)
        ))
      );

      setChannels(uniqueChannels);
      setLoading(false);

    } catch (e) {
      console.error(e);
      setError('An unexpected error occurred while fetching category details.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategoryAndChannels();
  }, [slug]);

  useEffect(() => {
    [span_4](start_span)// Filter channels based on search query[span_4](end_span)
    const filtered = channels.filter(channel => 
      channel.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredChannels(filtered);
  }, [searchQuery, channels]);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {[...Array(12)].map((_, i) => (
            <Skeleton key={i} className="h-[150px] w-full rounded-lg" />
          ))}
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

    if (channels.length === 0) {
      return (
        <div className="text-center py-12 text-text-secondary">
          <Tv size={40} className="mx-auto mb-4" />
          <p>No channels found in the "{category?.name}" category.</p>
        </div>
      );
    }

    if (filteredChannels.length === 0 && searchQuery) {
      return (
        <div className="text-center py-12 text-text-secondary">
          <Search size={40} className="mx-auto mb-4" />
          <p>No channels match "{searchQuery}" in this category.</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {filteredChannels.map(channel => (
          <ChannelCard key={channel.id} channel={channel} />
        ))}
      </div>
    );
  };

  return (
    <div className="category-channels-page p-4 sm:p-6">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-3">
        <Tv size={28} className="text-accent" />
        {category ? category.name : 'Category'} Channels
      </h1>
      
      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary" />
        <Input
          type="search"
          placeholder="Search channels in this category..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {renderContent()}
    </div>
  );
};

export default CategoryChannels;
