// /src/components/CategoryCard.tsx
import { Link } from 'react-router-dom';
import { Category } from '@/types';
import { Tv, Link as LinkIcon } from 'lucide-react';

interface CategoryCardProps {
  category: Category;
}

const CategoryCard: React.FC<CategoryCardProps> = ({ category }) => {
  return (
    <Link to={`/category/${category.slug}`} className="category-card hover-lift animate-fade-in">
      <div className="category-icon hover-scale">
        {category.iconUrl ? (
          <img 
            src={category.iconUrl} 
            alt={category.name}
            className="w-full h-full object-cover rounded-full"
            onError={(e) => {
              // Fallback to icon if image fails to load
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : (
          <Tv size={24} />
        )}
        <Tv size={24} className="hidden" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="category-name">{category.name}</span>
        {category.m3uUrl && (
          <div className="flex items-center gap-1 text-xs text-green-500">
            <LinkIcon size={10} />
            <span>M3U</span>
          </div>
        )}
      </div>
    </Link>
  );
};

export default CategoryCard;
