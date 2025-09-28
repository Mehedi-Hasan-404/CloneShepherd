// /src/components/CategoryCard.tsx
import { Link } from 'react-router-dom';
import { Category } from '@/types';
import { Tv } from 'lucide-react';
 
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
              [span_5](start_span)// Fallback to icon if image fails to load[span_5](end_span)
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : (
          [span_6](start_span)// Default icon if no iconUrl[span_6](end_span)
          <Tv size={24} />
        )}
        [span_7](start_span){/* Fallback Lucide icon, hidden by default[span_7](end_span) */}
        <Tv size={24} className="hidden" />
      </div>
      <span className="category-name">{category.name}</span>
    </Link>
  );
};
 
export default CategoryCard;
