import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Category } from '@/types';
import CategoryCard from '@/components/CategoryCard';
import { Tv } from 'lucide-react';

const Home = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoading(true);
        const categoriesCol = collection(db, 'categories');
        const q = query(categoriesCol, orderBy('name'));
        const snapshot = await getDocs(q);
        const categoriesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Category[];
        setCategories(categoriesData);
      } catch (err) {
        console.error('Error fetching categories:', err);
        setError('Failed to load categories');
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <Tv size={48} className="text-accent mb-4 mx-auto" />
        <h3 className="text-xl font-semibold mb-2">Unable to Load Categories</h3>
        <p className="text-text-secondary">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="btn-primary mt-4"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Tv size={24} className="text-accent" />
        <h1 className="text-2xl font-bold">Select a Category</h1>
      </div>

      {categories.length > 0 ? (
        <div className="category-grid">
          {categories.map(category => (
            <CategoryCard key={category.id} category={category} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Tv size={48} className="text-accent mb-4 mx-auto" />
          <h3 className="text-xl font-semibold mb-2">No Categories Available</h3>
          <p className="text-text-secondary">
            Categories will appear here once they are added by an administrator.
          </p>
        </div>
      )}
    </div>
  );
};

export default Home;