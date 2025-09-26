// Categories Manager Component (Fixed version for Admin.tsx)
import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Category } from '@/types';
import { Save, X, Edit, Trash2 } from 'lucide-react';

const CategoriesManager = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [newCategory, setNewCategory] = useState({ name: '', slug: '', iconUrl: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  // Helper function to generate slug from name
  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  };

  const fetchCategories = async () => {
    try {
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
    }
  };

  const handleSaveCategory = async () => {
    if (!newCategory.name.trim()) {
      alert('Category name is required');
      return;
    }
    
    setLoading(true);
    try {
      // Generate slug if not provided or update it based on name
      const finalSlug = newCategory.slug.trim() || generateSlug(newCategory.name);
      
      // Check for duplicate slugs
      const existingCategory = categories.find(cat => 
        cat.slug === finalSlug && cat.id !== editingCategory?.id
      );
      
      if (existingCategory) {
        alert('A category with this name/slug already exists. Please choose a different name.');
        setLoading(false);
        return;
      }

      const categoryData = {
        name: newCategory.name.trim(),
        slug: finalSlug,
        iconUrl: newCategory.iconUrl.trim() || '',
      };

      if (editingCategory) {
        await updateDoc(doc(db, 'categories', editingCategory.id), categoryData);
      } else {
        await addDoc(collection(db, 'categories'), categoryData);
      }
      
      setNewCategory({ name: '', slug: '', iconUrl: '' });
      setEditingCategory(null);
      fetchCategories();
    } catch (error) {
      console.error('Error saving category:', error);
      alert('Failed to save category. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setNewCategory({
      name: category.name,
      slug: category.slug,
      iconUrl: category.iconUrl || '',
    });
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this category? This action cannot be undone.')) return;
    
    try {
      await deleteDoc(doc(db, 'categories', id));
      fetchCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      alert('Failed to delete category. Please try again.');
    }
  };

  const resetForm = () => {
    setNewCategory({ name: '', slug: '', iconUrl: '' });
    setEditingCategory(null);
  };

  // Auto-generate slug when name changes
  const handleNameChange = (name: string) => {
    setNewCategory(prev => ({
      ...prev,
      name,
      slug: prev.slug === generateSlug(prev.name) ? generateSlug(name) : prev.slug
    }));
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Categories Management</h2>
      
      {/* Add/Edit Form */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">
          {editingCategory ? 'Edit Category' : 'Add New Category'}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Category Name *</label>
            <input
              type="text"
              value={newCategory.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g., Sports, Movies, News"
              className="form-input"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">URL Slug</label>
            <input
              type="text"
              value={newCategory.slug}
              onChange={(e) => setNewCategory({ ...newCategory, slug: e.target.value })}
              placeholder="Auto-generated from name"
              className="form-input"
              disabled={loading}
            />
            <p className="text-xs text-text-secondary mt-1">
              Leave empty to auto-generate from name
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Icon URL</label>
            <input
              type="url"
              value={newCategory.iconUrl}
              onChange={(e) => setNewCategory({ ...newCategory, iconUrl: e.target.value })}
              placeholder="https://example.com/icon.png"
              className="form-input"
              disabled={loading}
            />
          </div>
        </div>
        
        {/* Preview */}
        {newCategory.name && (
          <div className="mt-4 p-3 bg-bg-secondary rounded-lg">
            <p className="text-sm text-text-secondary mb-2">Preview:</p>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center text-white text-xs">
                {newCategory.iconUrl ? (
                  <img 
                    src={newCategory.iconUrl} 
                    alt="" 
                    className="w-full h-full object-cover rounded-full"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  newCategory.name.charAt(0).toUpperCase()
                )}
              </div>
              <div>
                <div className="font-medium">{newCategory.name}</div>
                <div className="text-sm text-text-secondary">
                  URL: /category/{newCategory.slug || generateSlug(newCategory.name)}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleSaveCategory}
            disabled={loading || !newCategory.name.trim()}
            className="btn-primary"
          >
            <Save size={16} />
            {loading ? 'Saving...' : editingCategory ? 'Update Category' : 'Add Category'}
          </button>
          {editingCategory && (
            <button onClick={resetForm} className="btn-secondary" disabled={loading}>
              <X size={16} />
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Categories List */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">
          Existing Categories ({categories.length})
        </h3>
        {categories.length === 0 ? (
          <p className="text-text-secondary text-center py-8">
            No categories created yet. Add your first category above.
          </p>
        ) : (
          <div className="space-y-2">
            {categories.map(category => (
              <div key={category.id} className="flex items-center justify-between p-3 bg-bg-secondary rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-accent rounded-full flex items-center justify-center text-white">
                    {category.iconUrl ? (
                      <img 
                        src={category.iconUrl} 
                        alt={category.name} 
                        className="w-full h-full object-cover rounded-full"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const parent = e.currentTarget.parentElement;
                          if (parent) {
                            parent.textContent = category.name.charAt(0).toUpperCase();
                          }
                        }}
                      />
                    ) : (
                      category.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div>
                    <div className="font-medium">{category.name}</div>
                    <div className="text-sm text-text-secondary">
                      /category/{category.slug}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditCategory(category)}
                    className="p-2 text-blue-400 hover:text-blue-300 transition-colors"
                    title="Edit category"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteCategory(category.id)}
                    className="p-2 text-destructive hover:text-red-400 transition-colors"
                    title="Delete category"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CategoriesManager;
