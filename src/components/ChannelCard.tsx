// /src/components/ChannelCard.tsx
import { Star } from 'lucide-react';
import { PublicChannel } from '@/types';
import { useFavorites } from '@/contexts/FavoritesContext';
import { useRecents } from '@/contexts/RecentsContext';
import { toast } from "@/components/ui/sonner";

interface ChannelCardProps {
  channel: PublicChannel;
}

const ChannelCard: React.FC<ChannelCardProps> = ({ channel }) => {
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const { addRecent } = useRecents();
  const isChannelFavorite = isFavorite(channel.id);

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isChannelFavorite) {
      removeFavorite(channel.id);
    } else {
      addFavorite(channel);
    }
  };

  const handleChannelClick = () => {
    // Add to recent channels
    addRecent(channel);
    
    // Show stream URL info
    toast.info("Stream Information", {
      description: `Channel: ${channel.name}\nStream URL: ${channel.streamUrl}`,
      duration: 5000,
    });
  };

  return (
    <div 
      onClick={handleChannelClick}
      className="channel-card hover-lift animate-fade-in cursor-pointer"
    >
      <div className="channel-thumbnail">
        <img
          src={channel.logoUrl}
          alt={`${channel.name} logo`}
          onError={(e) => {
            e.currentTarget.src = '/placeholder.svg';
          }}
        />
        <button
          onClick={handleFavoriteClick}
          className={`absolute top-2 right-2 p-1.5 rounded-full transition-all z-10 hover-scale ${
            isChannelFavorite
              ? 'bg-yellow-500 text-white animate-bounce'
              : 'bg-black/50 text-white hover:bg-black/70'
          }`}
          aria-label={isChannelFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star size={14} fill={isChannelFavorite ? 'white' : 'none'} />
        </button>
      </div>
      <div className="channel-info">
        <div className="channel-name">{channel.name}</div>
        <div className="channel-category">{channel.categoryName}</div>
      </div>
    </div>
  );
};

export default ChannelCard;
