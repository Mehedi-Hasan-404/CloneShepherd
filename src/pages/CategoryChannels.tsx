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

  // Helper function to normalize slugs
  const normalizeSlug = (text: string): string => {
    return text.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .trim();
  };

  useEffect(() => {
    const fetchCategoryAndChannels = async () => {
      if (!slug) {
        setError('No category specified');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        // Add timeout to prevent infinite loading
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), 10000)
        );
        
        // First, try to find category by exact slug match
        const categoriesCol = collection(db, 'categories');
        let categoryQuery = query(categoriesCol, where('slug', '==', slug));
        let categorySnapshot = await Promise.race([getDocs(categoryQuery), timeoutPromise]) as any;
        
        // If no exact match found, try with normalized slug
        if (categorySnapshot.empty) {
          categoryQuery = query(categoriesCol);
          const allCategoriesSnapshot = await Promise.race([getDocs(categoryQuery), timeoutPromise]) as any;
          
          // Find category by normalized slug or name
          const matchingCategory = allCategoriesSnapshot.docs.find((doc: any) => {
            const data = doc.data();
            const normalizedSlug = normalizeSlug(data.slug || data.name);
            const normalizedInputSlug = normalizeSlug(slug);
            return normalizedSlug === normalizedInputSlug || 
                   normalizeSlug(data.name) === normalizedInputSlug;
          });
          
          if (!matchingCategory) {
            setError('Category not found');
            setLoading(false);
            return;
          }
          
          categorySnapshot = {
            docs: [matchingCategory],
            empty: false
          };
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
        
        try {
          const channelsSnapshot = await Promise.race([getDocs(channelsQuery), timeoutPromise]) as any;
          
          const channelsData = channelsSnapshot.docs.map((doc: any) => ({
            id: doc.id,
            name: doc.data().name,
            logoUrl: doc.data().logoUrl,
            categoryId: doc.data().categoryId,
            categoryName: doc.data().categoryName,
          })) as PublicChannel[];
          
          setChannels(channelsData);
          setFilteredChannels(channelsData);
        } catch (channelError) {
          console.error('Error fetching channels:', channelError);
          // Set empty channels array instead of failing completely
          setChannels([]);
          setFilteredChannels([]);
        }

      } catch (err) {
        console.error('Error fetching category data:', err);
        setError('Failed to load category data. Please check your internet connection.');
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
      <div className="flex items-center justify-center min-h-[400px] animate-fade-in">
        <div className="text-center">
          <div className="loading-spinner mx-auto mb-4"></div>
          <p className="text-text-secondary">Loading category...</p>
        </div>
      </div>
    );
  }

  if (error || !category) {
    return (
      <div className="empty-state animate-scale-in">
        <Tv size={48} className="text-accent mb-4 mx-auto animate-pulse" />
        <h3 className="text-xl font-semibold mb-2">Category Not Found</h3>
        <p className="text-text-secondary mb-4">{error || 'The requested category could not be found.'}</p>
        <div className="flex gap-2 justify-center">
          <button 
            onClick={() => window.history.back()}
            className="btn-secondary"
          >
            Go Back
          </button>
          <button 
            onClick={() => window.location.href = '/'}
            className="btn-primary"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <div className="category-icon flex-shrink-0">
          {category.iconUrl ? (
            <img 
              src={category.iconUrl} 
              alt={category.name}
              className="w-full h-full object-cover rounded-full"
              onError={(e) => {
                // Fallback to TV icon if image fails
                e.currentTarget.style.display = 'none';
                const tvIcon = e.currentTarget.parentElement?.querySelector('.fallback-icon');
                if (tvIcon) {
                  tvIcon.classList.remove('hidden');
                }
              }}
            />
          ) : (
            <Tv size={24} />
          )}
          <Tv size={24} className="fallback-icon hidden" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{category.name}</h1>
          <p className="text-text-secondary text-sm">
            {channels.length} {channels.length === 1 ? 'channel' : 'channels'} available
          </p>
        </div>
      </div>

      {/* Search Bar - only show if there are channels */}
      {channels.length > 0 && (
        <div className="search-bar">
          <Search size={20} className="text-text-secondary" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Search in ${category.name}...`}
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
      )}

      {/* Channels Grid */}
      {filteredChannels.length > 0 ? (
        <div className="channel-grid">
          {filteredChannels.map((channel, index) => (
            <div 
              key={channel.id}
              className="animate-fade-in"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <ChannelCard channel={channel} />
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state animate-fade-in">
          <Tv size={48} className="text-accent mb-4 mx-auto animate-pulse" />
          <h3 className="text-xl font-semibold mb-2">
            {searchTerm ? 'No Matching Channels' : 'No Channels Available'}
          </h3>
          <p className="text-text-secondary mb-4">
            {searchTerm 
              ? `No channels found matching "${searchTerm}" in ${category.name}`
              : `No channels have been added to the ${category.name} category yet.`
            }
          </p>
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="btn-primary"
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
