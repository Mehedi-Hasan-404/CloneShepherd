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
      if (!channelId) {
        setError('No channel ID provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        // Fetch channel data
        const channelDoc = doc(db, 'channels', channelId);
        const channelSnap = await getDoc(channelDoc);
        
        if (!channelSnap.exists()) {
          setError('Channel not found');
          setLoading(false);
          return;
        }

        const channelData = {
          id: channelSnap.id,
          ...channelSnap.data()
        } as AdminChannel;

        // Validate required fields
        if (!channelData.streamUrl || !channelData.name) {
          setError('Channel data is incomplete');
          setLoading(false);
          return;
        }
        
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
        if (channelData.categoryId) {
          try {
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
          } catch (relatedError) {
            console.warn('Failed to load related channels:', relatedError);
            // Don't set error for related channels failure
          }
        }

        setLoading(false);
      } catch (err) {
        console.error('Error fetching channel:', err);
        setError('Failed to load channel');
        setLoading(false);
      }
    };

    fetchChannelData();
  }, [channelId, addRecent]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="loading-spinner mb-4"></div>
          <p className="text-text-secondary">Loading channel...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !channel) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Tv size={48} className="text-accent mb-4 mx-auto" />
          <h3 className="text-xl font-semibold mb-2">Channel Not Available</h3>
          <p className="text-text-secondary mb-4">{error || 'The requested channel could not be found.'}</p>
          <button 
            onClick={() => navigate('/')}
            className="btn-primary"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Back Button */}
      <div className="p-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-text-secondary hover:text-accent transition-colors mb-4"
        >
          <ArrowLeft size={20} />
          <span>Back</span>
        </button>
      </div>

      {/* Video Player Section */}
      <div className="px-4 mb-6">
        <div className="w-full max-w-6xl mx-auto">
          <VideoPlayer 
            streamUrl={channel.streamUrl} 
            channelName={channel.name}
            key={channel.id} // Force re-mount when channel changes
          />
        </div>
      </div>

      {/* Channel Info */}
      <div className="px-4 mb-6">
        <div className="max-w-6xl mx-auto">
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <img
                  src={channel.logoUrl}
                  alt={`${channel.name} logo`}
                  className="w-16 h-16 object-contain rounded-lg bg-bg-tertiary"
                  onError={(e) => {
                    e.currentTarget.src = '/placeholder.svg';
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
        </div>
      </div>

      {/* Related Channels */}
      {relatedChannels.length > 0 && (
        <div className="px-4 pb-20"> {/* Extra padding for bottom nav */}
          <div className="max-w-6xl mx-auto">
            <h3 className="text-xl font-bold mb-4">More from {channel.categoryName}</h3>
            <div className="channel-grid">
              {relatedChannels.map(relatedChannel => (
                <ChannelCard key={relatedChannel.id} channel={relatedChannel} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChannelPlayer;
