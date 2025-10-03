// /src/components/CategoryCard.tsx
import { Link } from 'wouter';
import { Category } from '@/types';
import { Tv } from 'lucide-react';

interface CategoryCardProps {
  category: Category;
}

const CategoryCard: React.FC<CategoryCardProps> = ({ category }) => {
  return (
    <Link to={`/category/${category.slug}`}>
      <a className="block group">
        <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-card border border-border hover:border-accent transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-accent/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            {category.iconUrl ? (
              <img 
                src={category.iconUrl} 
                alt={category.name}
                className="w-16 h-16 sm:w-20 sm:h-20 object-contain rounded-full"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : (
              <Tv size={32} className="text-accent" />
            )}
            <Tv size={32} className="hidden text-accent" />
          </div>
          <span className="text-sm sm:text-base font-semibold text-center text-foreground">{category.name}</span>
        </div>
      </a>
    </Link>
  );
};

export default CategoryCard;
