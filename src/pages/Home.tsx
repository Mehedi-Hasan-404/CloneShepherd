// /src/pages/Home.tsx
import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Category } from '@/types';
import CategoryCard from '@/components/CategoryCard';
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Tv } from 'lucide-react';

const Home = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const categoriesCol = collection(db, 'categories');
      const q = query(categoriesCol, orderBy('name'));
      const snapshot = await getDocs(q);
      
      const categoriesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Category[];
      
      setCategories(categoriesData);
    } catch (error) {
      console.error('Error fetching categories:', error);
      setError('Failed to load categories. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4 mx-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Tv size={32} className="text-accent" />
          <h1 className="text-3xl font-bold">Live TV Pro</h1>
        </div>
        <p className="text-text-secondary max-w-2xl mx-auto">
          Discover and enjoy live television channels from around the world. 
          Browse by category to find your favorite content.
        </p>
      </div>

      {categories.length === 0 ? (
        <div className="text-center py-12">
          <Tv size={48} className="text-text-secondary mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Categories Available</h3>
          <p className="text-text-secondary">
            Categories will appear here once they are added by the administrator.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Browse Categories</h2>
            <span className="text-sm text-text-secondary">
              {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'} available
            </span>
          </div>
          
          <div className="category-grid">
            {categories.map(category => (
              <CategoryCard key={category.id} category={category} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default Home;
