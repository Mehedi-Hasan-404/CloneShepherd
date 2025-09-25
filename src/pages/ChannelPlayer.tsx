import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AdminChannel, PublicChannel } from '@/types';
import VideoPlayer from '@/components/VideoPlayer';
import ChannelCard from '@/components/ChannelCard';
import { useRecents } from '@/contexts/RecentsContext';
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
        
        // Fetch channel data
        const channelDoc = doc(db, 'channels', channelId);
        const channelSnap = await getDoc(channelDoc);
        
        if (!channelSnap.exists()) {
          setError('Channel not found');
          return;
        }

        const channelData = {
          id: channelSnap.id,
          ...channelSnap.data()
        } as AdminChannel;
        
        setChannel(channelData);

        // Add to recent channels
        addRecent({
          id: channelData.id,
          name: channelData.name,
          logoUrl: channelData.logoUrl,
          categoryId: channelData.categoryId,
          categoryName: channelData.categoryName,
        });

        // Fetch related channels from same category
        const channelsCol = collection(db, 'channels');
        const relatedQuery = query(
          channelsCol,
          where('categoryId', '==', channelData.categoryId),
          orderBy('name'),
          limit(8)
        );
        const relatedSnapshot = await getDocs(relatedQuery);
        
        const relatedData = relatedSnapshot.docs
          .map(doc => ({
            id: doc.id,
            name: doc.data().name,
            logoUrl: doc.data().logoUrl,
            categoryId: doc.data().categoryId,
            categoryName: doc.data().categoryName,
          }))
          .filter(ch => ch.id !== channelId) as PublicChannel[];
        
        setRelatedChannels(relatedData);
      } catch (err) {
        console.error('Error fetching channel:', err);
        setError('Failed to load channel');
      } finally {
        setLoading(false);
      }
    };

    fetchChannelData();
  }, [channelId, addRecent]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (error || !channel) {
    return (
      <div className="empty-state">
        <Tv size={48} className="text-accent mb-4 mx-auto" />
        <h3 className="text-xl font-semibold mb-2">Channel Not Found</h3>
        <p className="text-text-secondary">{error || 'The requested channel could not be found.'}</p>
        <button 
          onClick={() => navigate('/')}
          className="btn-primary mt-4"
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-text-secondary hover:text-accent transition-colors"
      >
        <ArrowLeft size={20} />
        <span>Back</span>
      </button>

      {/* Video Player */}
      <div className="relative">
        <VideoPlayer streamUrl={channel.streamUrl} channelName={channel.name} />
      </div>

      {/* Channel Info */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <img
              src={channel.logoUrl}
              alt={`${channel.name} logo`}
              className="w-16 h-16 object-contain rounded-lg bg-bg-tertiary"
              onError={(e) => {
                e.currentTarget.src = '/api/placeholder/64/64';
              }}
            />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold mb-2">{channel.name}</h2>
            <div className="flex items-center gap-2 text-text-secondary mb-2">
              <Info size={16} />
              <span>Category: {channel.categoryName}</span>
            </div>
            <div className="flex items-center gap-2 text-green-400">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium">LIVE</span>
            </div>
          </div>
        </div>
      </div>

      {/* Related Channels */}
      {relatedChannels.length > 0 && (
        <div>
          <h3 className="text-xl font-bold mb-4">More from {channel.categoryName}</h3>
          <div className="channel-grid">
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