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
        
        // Add timeout to prevent infinite loading
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), 5000)
        );
        
        const fetchPromise = getDocs(q);
        const snapshot = await Promise.race([fetchPromise, timeoutPromise]) as any;
        
        const categoriesData = snapshot.docs.map((doc: any) => ({
          id: doc.id,
          ...doc.data()
        })) as Category[];
        
        setCategories(categoriesData);
      } catch (err) {
        console.error('Error fetching categories:', err);
        setError('Failed to load categories');
        // Set empty categories to prevent loading forever
        setCategories([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] animate-fade-in">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state animate-scale-in">
        <Tv size={48} className="text-accent mb-4 mx-auto animate-pulse" />
        <h3 className="text-xl font-semibold mb-2">Unable to Load Categories</h3>
        <p className="text-text-secondary">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="btn-primary mt-4 hover-lift"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-2 mb-6">
        <Tv size={24} className="text-accent hover-glow" />
        <h1 className="text-2xl font-bold">Select a Category</h1>
      </div>

      {categories.length > 0 ? (
        <div className="category-grid">
          {categories.map((category, index) => (
            <div 
              key={category.id} 
              className="animate-scale-in"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <CategoryCard category={category} />
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state animate-fade-in">
          <Tv size={48} className="text-accent mb-4 mx-auto animate-pulse" />
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