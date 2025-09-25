import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PublicChannel, Category } from '@/types';
import ChannelCard from '@/components/ChannelCard';
import { Search, X, Tv } from 'lucide-react';

const CategoryChannels = () => {
  const { slug } = useParams<{ slug: string }>();
  const [category, setCategory] = useState<Category | null>(null);
  const [channels, setChannels] = useState<PublicChannel[]>([]);
  const [filteredChannels, setFilteredChannels] = useState<PublicChannel[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCategoryAndChannels = async () => {
      if (!slug) return;

      try {
        setLoading(true);
        
        // Fetch category by slug
        const categoriesCol = collection(db, 'categories');
        const categoryQuery = query(categoriesCol, where('slug', '==', slug));
        const categorySnapshot = await getDocs(categoryQuery);
        
        if (categorySnapshot.empty) {
          setError('Category not found');
          return;
        }

        const categoryData = {
          id: categorySnapshot.docs[0].id,
          ...categorySnapshot.docs[0].data()
        } as Category;
        
        setCategory(categoryData);

        // Fetch channels for this category
        const channelsCol = collection(db, 'channels');
        const channelsQuery = query(
          channelsCol, 
          where('categoryId', '==', categoryData.id),
          orderBy('name')
        );
        const channelsSnapshot = await getDocs(channelsQuery);
        
        const channelsData = channelsSnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name,
          logoUrl: doc.data().logoUrl,
          categoryId: doc.data().categoryId,
          categoryName: doc.data().categoryName,
        })) as PublicChannel[];
        
        setChannels(channelsData);
        setFilteredChannels(channelsData);
      } catch (err) {
        console.error('Error fetching category data:', err);
        setError('Failed to load category data');
      } finally {
        setLoading(false);
      }
    };

    fetchCategoryAndChannels();
  }, [slug]);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredChannels(channels);
    } else {
      const filtered = channels.filter(channel =>
        channel.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredChannels(filtered);
    }
  }, [searchTerm, channels]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (error || !category) {
    return (
      <div className="empty-state">
        <Tv size={48} className="text-accent mb-4 mx-auto" />
        <h3 className="text-xl font-semibold mb-2">Category Not Found</h3>
        <p className="text-text-secondary">{error || 'The requested category could not be found.'}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <div className="category-icon">
          {category.iconUrl ? (
            <img 
              src={category.iconUrl} 
              alt={category.name}
              className="w-full h-full object-cover rounded-full"
            />
          ) : (
            <Tv size={24} />
          )}
        </div>
        <h1 className="text-2xl font-bold">{category.name}</h1>
      </div>

      {/* Search Bar */}
      <div className="search-bar">
        <Search size={20} className="text-text-secondary" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search channels..."
          className="search-input"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="p-1 text-text-secondary hover:text-text-primary transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Channels Grid */}
      {filteredChannels.length > 0 ? (
        <div className="channel-grid">
          {filteredChannels.map(channel => (
            <ChannelCard key={channel.id} channel={channel} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Tv size={48} className="text-accent mb-4 mx-auto" />
          <h3 className="text-xl font-semibold mb-2">
            {searchTerm ? 'No Matching Channels' : 'No Channels Available'}
          </h3>
          <p className="text-text-secondary">
            {searchTerm 
              ? `No channels found matching "${searchTerm}"`
              : `No channels have been added to the ${category.name} category yet.`
            }
          </p>
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="btn-primary mt-4"
            >
              Clear Search
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default CategoryChannels;