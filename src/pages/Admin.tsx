import { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { Category, AdminChannel } from '@/types';
import { Shield, LogOut, Plus, Edit, Trash2, Save, X } from 'lucide-react';

// Login Component
const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Invalid email or password.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please try again later.');
      } else {
        setError('Login failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-lg p-6">
        <div className="text-center mb-6">
          <Shield size={48} className="text-accent mx-auto mb-4" />
          <h1 className="text-2xl font-bold">Admin Login</h1>
          <p className="text-text-secondary">Sign in to manage your IPTV system</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="form-input"
              disabled={loading}
            />
          </div>
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="form-input"
              disabled={loading}
            />
          </div>
          {error && (
            <div className="text-destructive text-sm bg-destructive/10 p-3 rounded-lg">{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

// Categories Manager Component
const CategoriesManager = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [newCategory, setNewCategory] = useState({ name: '', slug: '', iconUrl: '' });
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const categoriesCol = collection(db, 'categories');
      const q = query(categoriesCol, orderBy('name'));
      
      // Add timeout to prevent infinite loading
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), 10000)
      );
      
      const snapshot = await Promise.race([getDocs(q), timeoutPromise]) as any;
      const categoriesData = snapshot.docs.map((doc: any) => ({
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
      await fetchCategories();
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
      await fetchCategories();
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

// Channels Manager Component
const ChannelsManager = () => {
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingChannel, setEditingChannel] = useState<AdminChannel | null>(null);
  const [newChannel, setNewChannel] = useState({
    name: '',
    logoUrl: '',
    streamUrl: '',
    categoryId: '',
    authCookie: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchChannels();
    fetchCategories();
  }, []);

  const fetchChannels = async () => {
    try {
      const channelsCol = collection(db, 'channels');
      const q = query(channelsCol, orderBy('name'));
      
      // Add timeout to prevent infinite loading
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), 10000)
      );
      
      const snapshot = await Promise.race([getDocs(q), timeoutPromise]) as any;
      const channelsData = snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
      })) as AdminChannel[];
      
      setChannels(channelsData);
    } catch (error) {
      console.error('Error fetching channels:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const categoriesCol = collection(db, 'categories');
      const q = query(categoriesCol, orderBy('name'));
      
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), 10000)
      );
      
      const snapshot = await Promise.race([getDocs(q), timeoutPromise]) as any;
      const categoriesData = snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
      })) as Category[];
      
      setCategories(categoriesData);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const handleSaveChannel = async () => {
    if (!newChannel.name.trim() || !newChannel.streamUrl.trim() || !newChannel.categoryId) {
      alert('Please fill in all required fields (Name, Stream URL, Category)');
      return;
    }
    
    // Validate stream URL
    if (!newChannel.streamUrl.includes('m3u8') && !newChannel.streamUrl.includes('mp4')) {
      if (!confirm('Stream URL does not appear to be a valid video format. Continue anyway?')) {
        return;
      }
    }
    
    setLoading(true);
    try {
      const category = categories.find(cat => cat.id === newChannel.categoryId);
      if (!category) {
        alert('Please select a valid category');
        setLoading(false);
        return;
      }

      const channelData = {
        name: newChannel.name.trim(),
        logoUrl: newChannel.logoUrl.trim() || '/placeholder.svg',
        streamUrl: newChannel.streamUrl.trim(),
        categoryId: newChannel.categoryId,
        categoryName: category.name,
        authCookie: newChannel.authCookie.trim() || null,
      };

      if (editingChannel) {
        await updateDoc(doc(db, 'channels', editingChannel.id), channelData);
      } else {
        await addDoc(collection(db, 'channels'), channelData);
      }
      
      setNewChannel({ name: '', logoUrl: '', streamUrl: '', categoryId: '', authCookie: '' });
      setEditingChannel(null);
      await fetchChannels();
    } catch (error) {
      console.error('Error saving channel:', error);
      alert('Failed to save channel. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditChannel = (channel: AdminChannel) => {
    setEditingChannel(channel);
    setNewChannel({
      name: channel.name,
      logoUrl: channel.logoUrl,
      streamUrl: channel.streamUrl,
      categoryId: channel.categoryId,
      authCookie: channel.authCookie || '',
    });
  };

  const handleDeleteChannel = async (id: string) => {
    if (!confirm('Are you sure you want to delete this channel? This action cannot be undone.')) return;
    
    try {
      await deleteDoc(doc(db, 'channels', id));
      await fetchChannels();
    } catch (error) {
      console.error('Error deleting channel:', error);
      alert('Failed to delete channel. Please try again.');
    }
  };

  const resetForm = () => {
    setNewChannel({ name: '', logoUrl: '', streamUrl: '', categoryId: '', authCookie: '' });
    setEditingChannel(null);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Channels Management</h2>
      
      {/* Add/Edit Form */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">
          {editingChannel ? 'Edit Channel' : 'Add New Channel'}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Channel Name *</label>
            <input
              type="text"
              value={newChannel.name}
              onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
              placeholder="e.g., CNN, BBC News, ESPN"
              className="form-input"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Logo URL</label>
            <input
              type="url"
              value={newChannel.logoUrl}
              onChange={(e) => setNewChannel({ ...newChannel, logoUrl: e.target.value })}
              placeholder="https://example.com/logo.png"
              className="form-input"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Stream URL (m3u8) *</label>
            <input
              type="url"
              value={newChannel.streamUrl}
              onChange={(e) => setNewChannel({ ...newChannel, streamUrl: e.target.value })}
              placeholder="https://example.com/stream.m3u8"
              className="form-input"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Category *</label>
            <select
              value={newChannel.categoryId}
              onChange={(e) => setNewChannel({ ...newChannel, categoryId: e.target.value })}
              className="form-input"
              disabled={loading}
            >
              <option value="">Select Category</option>
              {categories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-2">Authentication Cookie (Optional)</label>
            <textarea
              value={newChannel.authCookie}
              onChange={(e) => setNewChannel({ ...newChannel, authCookie: e.target.value })}
              placeholder="Cookie string for authenticated streams (if required)"
              className="form-input min-h-[60px] font-mono text-xs"
              rows={2}
              disabled={loading}
            />
          </div>
        </div>
        
        {/* Channel Preview */}
        {newChannel.name && newChannel.categoryId && (
          <div className="mt-4 p-3 bg-bg-secondary rounded-lg">
            <p className="text-sm text-text-secondary mb-2">Preview:</p>
            <div className="flex items-center gap-3">
              <img
                src={newChannel.logoUrl || '/placeholder.svg'}
                alt={newChannel.name}
                className="w-10 h-10 object-contain bg-white rounded"
                onError={(e) => {
                  e.currentTarget.src = '/placeholder.svg';
                }}
              />
              <div>
                <div className="font-medium">{newChannel.name}</div>
                <div className="text-sm text-text-secondary">
                  {categories.find(c => c.id === newChannel.categoryId)?.name}
                  {newChannel.streamUrl && (
                    <span className="ml-2 text-green-500">• Stream URL provided</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleSaveChannel}
            disabled={loading || !newChannel.name.trim() || !newChannel.streamUrl.trim() || !newChannel.categoryId}
            className="btn-primary"
          >
            <Save size={16} />
            {loading ? 'Saving...' : editingChannel ? 'Update Channel' : 'Add Channel'}
          </button>
          {editingChannel && (
            <button onClick={resetForm} className="btn-secondary" disabled={loading}>
              <X size={16} />
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Channels List */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">
          Existing Channels ({channels.length})
        </h3>
        {channels.length === 0 ? (
          <p className="text-text-secondary text-center py-8">
            No channels created yet. Add your first channel above.
          </p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {channels.map(channel => (
              <div key={channel.id} className="flex items-center justify-between p-3 bg-bg-secondary rounded-lg">
                <div className="flex items-center gap-3">
                  <img
                    src={channel.logoUrl}
                    alt={channel.name}
                    className="w-10 h-10 object-contain bg-white rounded"
                    onError={(e) => {
                      e.currentTarget.src = '/placeholder.svg';
                    }}
                  />
                  <div>
                    <div className="font-medium">{channel.name}</div>
                    <div className="text-sm text-text-secondary flex items-center gap-2">
                      <span>{channel.categoryName}</span>
                      {channel.streamUrl && (
                        <span className="text-green-500">• Live</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditChannel(channel)}
                    className="p-2 text-blue-400 hover:text-blue-300 transition-colors"
                    title="Edit channel"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteChannel(channel.id)}
                    className="p-2 text-destructive hover:text-red-400 transition-colors"
                    title="Delete channel"
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

// Main Admin Dashboard
const AdminDashboard = () => {
  const location = useLocation();
  const { user } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const navItems = [
    { path: '/admin', label: 'Dashboard', exact: true },
    { path: '/admin/categories', label: 'Categories' },
    { path: '/admin/channels', label: 'Channels' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield size={24} className="text-accent" />
            <h1 className="text-xl font-bold">IPTV Admin Panel</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-text-secondary text-sm">
              Logged in as: {user?.email}
            </span>
            <button onClick={handleLogout} className="btn-secondary">
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar Navigation */}
          <div className="lg:w-64 flex-shrink-0">
            <nav className="bg-card border border-border rounded-lg p-4">
              <ul className="space-y-2">
                {navItems.map(item => {
                  const isActive = item.exact 
                    ? location.pathname === item.path 
                    : location.pathname.startsWith(item.path);
                  
                  return (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        className={`block p-3 rounded-lg transition-colors ${
                          isActive
                            ? 'bg-accent text-white'
                            : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            <Routes>
              <Route path="/" element={
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold">Dashboard</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="bg-card border border-border rounded-lg p-6">
                      <h3 className="text-lg font-semibold mb-2">Quick Actions</h3>
                      <div className="space-y-2">
                        <Link to="/admin/categories" className="btn-secondary w-full justify-start">
                          <Plus size={16} />
                          Manage Categories
                        </Link>
                        <Link to="/admin/channels" className="btn-secondary w-full justify-start">
                          <Plus size={16} />
                          Manage Channels
                        </Link>
                      </div>
                    </div>
                    <div className="bg-card border border-border rounded-lg p-6">
                      <h3 className="text-lg font-semibold mb-2">System Info</h3>
                      <div className="text-text-secondary space-y-1 text-sm">
                        <div>IPTV Management System</div>
                        <div>Version 1.0.0</div>
                        <div>Admin: {user?.email}</div>
                        <div className="text-green-500 mt-2">System Online</div>
                      </div>
                    </div>
                    <div className="bg-card border border-border rounded-lg p-6">
                      <h3 className="text-lg font-semibold mb-2">Important Notes</h3>
                      <div className="text-text-secondary text-sm space-y-2">
                        <p>• Stream URLs must be valid m3u8 or mp4 links</p>
                        <p>• Category slugs are auto-generated from names</p>
                        <p>• Always test streams before publishing</p>
                      </div>
                    </div>
                  </div>
                </div>
              } />
              <Route path="/categories" element={<CategoriesManager />} />
              <Route path="/channels" element={<ChannelsManager />} />
            </Routes>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main Admin Component
const Admin = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner mx-auto mb-4"></div>
          <p className="text-text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AdminLogin />;
  }

  return <AdminDashboard />;
};

export default Admin;
