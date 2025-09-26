import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Tv, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import ChannelCard from '@/components/ChannelCard';
import type { PublicChannel } from '@/types';

const ChannelPlayer = () => {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const [channel, setChannel] = useState<PublicChannel | null>(null);
  const [relatedChannels, setRelatedChannels] = useState<PublicChannel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock data for demonstration
    const mockChannel: PublicChannel = {
      id: channelId || '1',
      name: 'Sample Channel',
      logoUrl: '/placeholder.svg',
      categoryId: '1',
      categoryName: 'Entertainment'
    };

    const mockRelated: PublicChannel[] = [
      {
        id: '2',
        name: 'Related Channel 1',
        logoUrl: '/placeholder.svg',
        categoryId: '1',
        categoryName: 'Entertainment'
      },
      {
        id: '3',
        name: 'Related Channel 2',
        logoUrl: '/placeholder.svg',
        categoryId: '1',
        categoryName: 'Entertainment'
      }
    ];

    setChannel(mockChannel);
    setRelatedChannels(mockRelated);
    setLoading(false);
  }, [channelId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Tv className="mx-auto h-12 w-12 text-muted-foreground" />
          <p className="mt-2 text-muted-foreground">Loading channel...</p>
        </div>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Info className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-2 text-lg font-semibold">Channel not found</h2>
          <Button onClick={() => navigate('/')} className="mt-4">
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 py-4">
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
              className="h-16 w-16 rounded-lg object-cover"
              onError={(e) => {
                e.currentTarget.src = '/placeholder.svg';
              }}
            />
            <div>
              <h1 className="text-2xl font-bold">{channel.name}</h1>
              <p className="text-muted-foreground">{channel.categoryName}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Video Player Area */}
      <div className="mx-auto max-w-6xl px-4 py-6">
        <Card className="aspect-video overflow-hidden">
          <div className="flex h-full items-center justify-center bg-muted">
            <div className="text-center">
              <Tv className="mx-auto h-16 w-16 text-muted-foreground" />
              <p className="mt-2 text-lg font-semibold">Video Player</p>
              <p className="text-muted-foreground">Stream would appear here</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Related Channels */}
      {relatedChannels.length > 0 && (
        <div className="mx-auto max-w-6xl px-4 py-6">
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
