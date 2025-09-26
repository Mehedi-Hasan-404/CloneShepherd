import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { collection, getDocs, doc, getDoc, query, where, limit, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useRecents } from '@/contexts/RecentsContext';
import { PublicChannel, AdminChannel, Category } from '@/types';

import VideoPlayer from '@/components/VideoPlayer';
import ChannelCard from '@/components/ChannelCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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

        // Fetch channel data
        const channelDocRef = doc(db, 'channels', channelId);
        const channelDoc = await getDoc(channelDocRef);

        if (!channelDoc.exists()) {
          setError('Channel not found.');
          setLoading(false);
          return;
        }

        const channelData = { id: channelDoc.id, ...channelDoc.data() } as AdminChannel;
        
        // Validate required fields
        if (!channelData.streamUrl) {
          setError('Stream URL not available for this channel.');
          setLoading(false);
          return;
        }

        setChannel(channelData);
        
        // Add to recents, excluding admin-only fields for type safety
        const { streamUrl, authCookie, ...publicChannelData } = channelData;
        addRecent(publicChannelData);

        // Fetch category data for proper slug generation
        try {
          const categoryDocRef = doc(db, 'categories', channelData.categoryId);
          const categoryDoc = await getDoc(categoryDocRef);
          
          if (categoryDoc.exists()) {
            const categoryData = { id: categoryDoc.id, ...categoryDoc.data() } as Category;
            setCategory(categoryData);
          }
        } catch (categoryError) {
          console.warn('Could not fetch category data:', categoryError);
          // Don't fail the entire component if category fetch fails
        }

        // Fetch related channels
        try {
          const channelsCol = collection(db, 'channels');
          const relatedQuery = query(
            channelsCol,
            where('categoryId', '==', channelData.categoryId),
            where('__name__', '!=', channelId),
            orderBy('__name__'),
            limit(4)
          );
          
          const relatedSnapshot = await getDocs(relatedQuery);
          const relatedData = relatedSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              name: data.name,
              logoUrl: data.logoUrl,
              categoryId: data.categoryId,
              categoryName: data.categoryName,
            };
          }) as PublicChannel[];
          
          setRelatedChannels(relatedData);
        } catch (relatedError) {
          console.warn('Could not fetch related channels:', relatedError);
          // Don't fail if related channels can't be fetched
          setRelatedChannels([]);
        }

      } catch (err) {
        console.error("Error fetching channel data:", err);
        setError('Failed to load channel data.');
      } finally {
        setLoading(false);
      }
    };

    fetchChannelData();
  }, [channelId, addRecent]);

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-200px)] items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner mx-auto mb-4"></div>
          <p className="text-text-secondary">Loading channel...</p>
        </div>
      </div>
    );
  }

  if (error || !channel) {
    return (
      <div className="flex min-h-[calc(100vh-200px)] items-center justify-center">
        <div className="text-center">
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
    <div className="animate-fade-in">
      <div className="mb-4">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        
        <div className="flex items-center gap-4">
          <img
            src={channel.logoUrl}
            alt={channel.name}
            className="h-16 w-16 rounded-lg object-contain bg-card p-1 border border-border"
            onError={(e) => {
              e.currentTarget.src = '/placeholder.svg';
            }}
          />
          <div>
            <h1 className="text-2xl font-bold">{channel.name}</h1>
            <div className="flex items-center gap-2 text-text-secondary">
              <Link 
                to={`/category/${categorySlug}`} 
                className="hover:text-accent hover:underline transition-colors"
              >
                {channel.categoryName}
              </Link>
              <span>•</span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                LIVE
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Video Player */}
      <Card className="aspect-video overflow-hidden mb-8 border-0">
        {channel.streamUrl ? (
          <VideoPlayer
            streamUrl={channel.streamUrl}
            channelName={channel.name}
            autoPlay={true}
            muted={true}
          />
        ) : (
          <div className="aspect-video bg-black flex items-center justify-center">
            <div className="text-center text-white">
              <Info className="w-12 h-12 mx-auto mb-3 text-red-400" />
              <div className="text-lg font-medium mb-2">Stream Unavailable</div>
              <div className="text-sm text-gray-300">
                No stream URL is configured for this channel.
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Related Channels */}
      {relatedChannels.length > 0 && (
        <div>
          <h3 className="mb-4 text-xl font-bold">More from {channel.categoryName}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {relatedChannels.map((relatedChannel, index) => (
              <div 
                key={relatedChannel.id}
                className="animate-fade-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <ChannelCard channel={relatedChannel} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Channel Info */}
      <div className="mt-8 bg-card border border-border rounded-lg p-6">
        <h4 className="font-semibold mb-2">Channel Information</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-text-secondary">
          <div>
            <span className="font-medium">Name:</span> {channel.name}
          </div>
          <div>
            <span className="font-medium">Category:</span> {channel.categoryName}
          </div>
          <div>
            <span className="font-medium">Status:</span> 
            <span className="text-green-500 ml-1">Live</span>
          </div>
          <div>
            <span className="font-medium">Quality:</span> Auto
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChannelPlayer;
