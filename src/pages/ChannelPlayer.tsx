import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { collection, getDocs, doc, getDoc, query, where, limit, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useRecents } from '@/contexts/RecentsContext';
import { PublicChannel, AdminChannel } from '@/types';

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
  const [relatedChannels, setRelatedChannels] = useState<PublicChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchChannelData = async () => {
      if (!channelId) return;

      try {
        setLoading(true);
        setError(null);

        const channelDocRef = doc(db, 'channels', channelId);
        const channelDoc = await getDoc(channelDocRef);

        if (!channelDoc.exists()) {
          setError('Channel not found.');
          return;
        }

        const channelData = { id: channelDoc.id, ...channelDoc.data() } as AdminChannel;
        setChannel(channelData);
        
        // Add to recents, excluding admin-only fields for type safety
        const { streamUrl, authCookie, ...publicChannelData } = channelData;
        addRecent(publicChannelData);

        const channelsCol = collection(db, 'channels');
        const relatedQuery = query(
          channelsCol,
          where('categoryId', '==', channelData.categoryId),
          where('__name__', '!=', channelId),
          limit(4)
        );
        const relatedSnapshot = await getDocs(relatedQuery);
        const relatedData = relatedSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as PublicChannel[];
        setRelatedChannels(relatedData);

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
          <Tv className="mx-auto h-12 w-12 animate-pulse text-muted-foreground" />
          <p className="mt-2 text-muted-foreground">Loading channel...</p>
        </div>
      </div>
    );
  }

  if (error || !channel) {
    return (
      <div className="flex min-h-[calc(100vh-200px)] items-center justify-center">
        <div className="text-center">
          <Info className="mx-auto h-12 w-12 text-destructive" />
          <h2 className="mt-2 text-lg font-semibold">{error || 'Channel not found'}</h2>
          <Button onClick={() => navigate('/')} className="mt-4">
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to {channel.categoryName}
        </Button>
        
        <div className="flex items-center gap-4">
          <img
            src={channel.logoUrl}
            alt={channel.name}
            className="h-16 w-16 rounded-lg object-contain bg-card p-1"
            onError={(e) => {
              e.currentTarget.src = '/placeholder.svg';
            }}
          />
          <div>
            <h1 className="text-2xl font-bold">{channel.name}</h1>
            <Link to={`/category/${channel.categoryName.toLowerCase().replace(/\s+/g, '-')}`} className="text-muted-foreground hover:underline">
              {channel.categoryName}
            </Link>
          </div>
        </div>
      </div>

      <Card className="aspect-video overflow-hidden mb-8">
        <VideoPlayer
          streamUrl={channel.streamUrl}
          channelName={channel.name}
        />
      </Card>

      {relatedChannels.length > 0 && (
        <div>
          <h3 className="mb-4 text-xl font-bold">More from {channel.categoryName}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {relatedChannels.map(relatedChannel => (
              <ChannelCard key={relatedChannel.id} channel={relatedChannel} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChannelPlayer;

