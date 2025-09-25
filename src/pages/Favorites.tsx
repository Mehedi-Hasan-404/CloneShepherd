import { useFavorites } from '@/contexts/FavoritesContext';
import ChannelCard from '@/components/ChannelCard';
import { Star } from 'lucide-react';

const Favorites = () => {
  const { favorites } = useFavorites();

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Star size={24} className="text-yellow-500" />
        <h1 className="text-2xl font-bold">Favorite Channels</h1>
      </div>

      {favorites.length > 0 ? (
        <div className="channel-grid">
          {favorites.map(favorite => (
            <ChannelCard key={favorite.id} channel={favorite} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Star size={48} className="text-yellow-500 mb-4 mx-auto" />
          <h3 className="text-xl font-semibold mb-2">No Favorite Channels</h3>
          <p className="text-text-secondary">
            Add channels to your favorites by clicking the star icon on any channel card.
          </p>
        </div>
      )}
    </div>
  );
};

export default Favorites;