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
      setError('Login failed. Please check your credentials.');
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
            <div className="text-destructive text-sm">{error}</div>
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

  useEffect(() => {
    fetchCategories();
  }, []);

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
    if (!newCategory.name.trim()) return;
    
    setLoading(true);
    try {
      const categoryData = {
        name: newCategory.name.trim(),
        slug: newCategory.slug.trim() || newCategory.name.toLowerCase().replace(/\s+/g, '-'),
        iconUrl: newCategory.iconUrl.trim(),
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
    } finally {
      setLoading(false);
    }
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setNewCategory({
      name: category.name,
      slug: category.slug,
      iconUrl: category.iconUrl,
    });
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    
    try {
      await deleteDoc(doc(db, 'categories', id));
      fetchCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
    }
  };

  const resetForm = () => {
    setNewCategory({ name: '', slug: '', iconUrl: '' });
    setEditingCategory(null);
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
          <input
            type="text"
            value={newCategory.name}
            onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
            placeholder="Category Name"
            className="form-input"
          />
          <input
            type="text"
            value={newCategory.slug}
            onChange={(e) => setNewCategory({ ...newCategory, slug: e.target.value })}
            placeholder="URL Slug (optional)"
            className="form-input"
          />
          <input
            type="url"
            value={newCategory.iconUrl}
            onChange={(e) => setNewCategory({ ...newCategory, iconUrl: e.target.value })}
            placeholder="Icon URL"
            className="form-input"
          />
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleSaveCategory}
            disabled={loading || !newCategory.name.trim()}
            className="btn-primary"
          >
            <Save size={16} />
            {loading ? 'Saving...' : editingCategory ? 'Update' : 'Add'}
          </button>
          {editingCategory && (
            <button onClick={resetForm} className="btn-secondary">
              <X size={16} />
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Categories List */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Existing Categories ({categories.length})</h3>
        <div className="space-y-2">
          {categories.map(category => (
            <div key={category.id} className="flex items-center justify-between p-3 bg-bg-secondary rounded-lg">
              <div className="flex items-center gap-3">
                {category.iconUrl && (
                  <img src={category.iconUrl} alt={category.name} className="w-8 h-8 object-contain" />
                )}
                <div>
                  <div className="font-medium">{category.name}</div>
                  <div className="text-sm text-text-secondary">/{category.slug}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEditCategory(category)}
                  className="p-2 text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <Edit size={16} />
                </button>
                <button
                  onClick={() => handleDeleteCategory(category.id)}
                  className="p-2 text-destructive hover:text-red-400 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
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
      const snapshot = await getDocs(q);
      const channelsData = snapshot.docs.map(doc => ({
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

  const handleSaveChannel = async () => {
    if (!newChannel.name.trim() || !newChannel.streamUrl.trim() || !newChannel.categoryId) return;
    
    setLoading(true);
    try {
      const category = categories.find(cat => cat.id === newChannel.categoryId);
      if (!category) return;

      const channelData = {
        name: newChannel.name.trim(),
        logoUrl: newChannel.logoUrl.trim(),
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
      fetchChannels();
    } catch (error) {
      console.error('Error saving channel:', error);
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
    if (!confirm('Are you sure you want to delete this channel?')) return;
    
    try {
      await deleteDoc(doc(db, 'channels', id));
      fetchChannels();
    } catch (error) {
      console.error('Error deleting channel:', error);
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
          <input
            type="text"
            value={newChannel.name}
            onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
            placeholder="Channel Name"
            className="form-input"
          />
          <input
            type="url"
            value={newChannel.logoUrl}
            onChange={(e) => setNewChannel({ ...newChannel, logoUrl: e.target.value })}
            placeholder="Logo URL"
            className="form-input"
          />
          <input
            type="url"
            value={newChannel.streamUrl}
            onChange={(e) => setNewChannel({ ...newChannel, streamUrl: e.target.value })}
            placeholder="Stream URL (m3u8)"
            className="form-input"
          />
          <select
            value={newChannel.categoryId}
            onChange={(e) => setNewChannel({ ...newChannel, categoryId: e.target.value })}
            className="form-input"
          >
            <option value="">Select Category</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <div className="md:col-span-2">
            <textarea
              value={newChannel.authCookie}
              onChange={(e) => setNewChannel({ ...newChannel, authCookie: e.target.value })}
              placeholder="Authentication Cookie (Optional)"
              className="form-input min-h-[60px] font-mono text-xs"
              rows={2}
            />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleSaveChannel}
            disabled={loading || !newChannel.name.trim() || !newChannel.streamUrl.trim() || !newChannel.categoryId}
            className="btn-primary"
          >
            <Save size={16} />
            {loading ? 'Saving...' : editingChannel ? 'Update' : 'Add'}
          </button>
          {editingChannel && (
            <button onClick={resetForm} className="btn-secondary">
              <X size={16} />
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Channels List */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Existing Channels ({channels.length})</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {channels.map(channel => (
            <div key={channel.id} className="flex items-center justify-between p-3 bg-bg-secondary rounded-lg">
              <div className="flex items-center gap-3">
                <img
                  src={channel.logoUrl}
                  alt={channel.name}
                  className="w-10 h-10 object-contain"
                  onError={(e) => {
                    e.currentTarget.src = '/api/placeholder/40/40';
                  }}
                />
                <div>
                  <div className="font-medium">{channel.name}</div>
                  <div className="text-sm text-text-secondary">{channel.categoryName}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEditChannel(channel)}
                  className="p-2 text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <Edit size={16} />
                </button>
                <button
                  onClick={() => handleDeleteChannel(channel.id)}
                  className="p-2 text-destructive hover:text-red-400 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Main Admin Dashboard
const AdminDashboard = () => {
  const location = useLocation();
  const { user } = useAuth();

  const handleLogout = () => {
    signOut(auth);
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
            <h1 className="text-xl font-bold">Admin Panel</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-text-secondary">{user?.email}</span>
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
                {navItems.map(item => (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      className={`block p-3 rounded-lg transition-colors ${
                        (item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path))
                          ? 'bg-accent text-white'
                          : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            <Routes>
              <Route path="/" element={
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold">Dashboard</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                      <div className="text-text-secondary space-y-1">
                        <div>IPTV Management System</div>
                        <div>Version 1.0.0</div>
                        <div>Logged in as: {user?.email}</div>
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
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (!user) {
    return <AdminLogin />;
  }

  return <AdminDashboard />;
};

export default Admin;