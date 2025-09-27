import { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { Shield, LogOut, Plus, Edit, Trash2, Save, X, Upload, Users, BarChart3, Link as LinkIcon, Eye, Ban, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getChannels,
  createChannel,
  updateChannel,
  deleteChannel,
  getM3UPlaylists,
  createM3UPlaylist,
  updateM3UPlaylist,
  deleteM3UPlaylist,
  getVisitorAnalytics,
  getChannelAnalytics,
  getBlockedIPs,
  blockIP,
  unblockIP,
} from '@/services/supabaseService';

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
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Shield size={48} className="text-accent mx-auto mb-4" />
          <CardTitle className="text-2xl">Admin Login</CardTitle>
          <CardDescription>Sign in to manage your IPTV system</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                disabled={loading}
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                disabled={loading}
              />
            </div>
            {error && (
              <div className="text-destructive text-sm bg-destructive/10 p-3 rounded-lg">{error}</div>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

// Categories Manager
const CategoriesManager = () => {
  const [categories, setCategories] = useState<any[]>([]);
  const [editingCategory, setEditingCategory] = useState<any | null>(null);
  const [newCategory, setNewCategory] = useState({ name: '', slug: '', icon_url: '' });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const data = await getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast({
        title: "Error",
        description: "Failed to fetch categories",
        variant: "destructive",
      });
    }
  };

  const handleSaveCategory = async () => {
    if (!newCategory.name.trim()) {
      toast({
        title: "Error",
        description: "Category name is required",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);
    try {
      const finalSlug = newCategory.slug.trim() || generateSlug(newCategory.name);
      
      const existingCategory = categories.find(cat => 
        cat.slug === finalSlug && cat.id !== editingCategory?.id
      );
      
      if (existingCategory) {
        toast({
          title: "Error",
          description: "A category with this name/slug already exists",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const categoryData = {
        name: newCategory.name.trim(),
        slug: finalSlug,
        icon_url: newCategory.icon_url.trim() || undefined,
      };

      if (editingCategory) {
        await updateCategory(editingCategory.id, categoryData);
        toast({
          title: "Success",
          description: "Category updated successfully",
        });
      } else {
        await createCategory(categoryData);
        toast({
          title: "Success",
          description: "Category created successfully",
        });
      }
      
      setNewCategory({ name: '', slug: '', icon_url: '' });
      setEditingCategory(null);
      await fetchCategories();
    } catch (error) {
      console.error('Error saving category:', error);
      toast({
        title: "Error",
        description: "Failed to save category",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditCategory = (category: any) => {
    setEditingCategory(category);
    setNewCategory({
      name: category.name,
      slug: category.slug,
      icon_url: category.icon_url || '',
    });
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    
    try {
      await deleteCategory(id);
      toast({
        title: "Success",
        description: "Category deleted successfully",
      });
      await fetchCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      toast({
        title: "Error",
        description: "Failed to delete category",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setNewCategory({ name: '', slug: '', icon_url: '' });
    setEditingCategory(null);
  };

  const handleNameChange = (name: string) => {
    setNewCategory(prev => ({
      ...prev,
      name,
      slug: prev.slug === generateSlug(prev.name) ? generateSlug(name) : prev.slug
    }));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {editingCategory ? 'Edit Category' : 'Add New Category'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="categoryName">Category Name *</Label>
              <Input
                id="categoryName"
                value={newCategory.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g., Sports, Movies, News"
                disabled={loading}
              />
            </div>
            <div>
              <Label htmlFor="categorySlug">URL Slug</Label>
              <Input
                id="categorySlug"
                value={newCategory.slug}
                onChange={(e) => setNewCategory({ ...newCategory, slug: e.target.value })}
                placeholder="Auto-generated from name"
                disabled={loading}
              />
            </div>
            <div>
              <Label htmlFor="categoryIcon">Icon URL</Label>
              <Input
                id="categoryIcon"
                type="url"
                value={newCategory.icon_url}
                onChange={(e) => setNewCategory({ ...newCategory, icon_url: e.target.value })}
                placeholder="https://example.com/icon.png"
                disabled={loading}
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button onClick={handleSaveCategory} disabled={loading || !newCategory.name.trim()}>
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Saving...' : editingCategory ? 'Update' : 'Add'}
            </Button>
            {editingCategory && (
              <Button variant="outline" onClick={resetForm} disabled={loading}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Categories ({categories.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No categories created yet.
            </p>
          ) : (
            <div className="space-y-2">
              {categories.map(category => (
                <div key={category.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white">
                      {category.icon_url ? (
                        <img 
                          src={category.icon_url} 
                          alt={category.name} 
                          className="w-full h-full object-cover rounded-full"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        category.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div>
                      <div className="font-medium">{category.name}</div>
                      <div className="text-sm text-muted-foreground">
                        /category/{category.slug}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditCategory(category)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteCategory(category.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// Channels Manager
const ChannelsManager = () => {
  const [channels, setChannels] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [editingChannel, setEditingChannel] = useState<any | null>(null);
  const [newChannel, setNewChannel] = useState({
    name: '',
    logo_url: '',
    stream_url: '',
    category_id: '',
    auth_cookie: '',
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchChannels();
    fetchCategories();
  }, []);

  const fetchChannels = async () => {
    try {
      const data = await getChannels();
      setChannels(data);
    } catch (error) {
      console.error('Error fetching channels:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const handleSaveChannel = async () => {
    if (!newChannel.name.trim() || !newChannel.stream_url.trim() || !newChannel.category_id) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);
    try {
      const channelData = {
        name: newChannel.name.trim(),
        logo_url: newChannel.logo_url.trim() || undefined,
        stream_url: newChannel.stream_url.trim(),
        category_id: newChannel.category_id,
        auth_cookie: newChannel.auth_cookie.trim() || undefined,
      };

      if (editingChannel) {
        await updateChannel(editingChannel.id, channelData);
        toast({
          title: "Success",
          description: "Channel updated successfully",
        });
      } else {
        await createChannel(channelData);
        toast({
          title: "Success",
          description: "Channel created successfully",
        });
      }
      
      setNewChannel({ name: '', logo_url: '', stream_url: '', category_id: '', auth_cookie: '' });
      setEditingChannel(null);
      await fetchChannels();
    } catch (error) {
      console.error('Error saving channel:', error);
      toast({
        title: "Error",
        description: "Failed to save channel",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditChannel = (channel: any) => {
    setEditingChannel(channel);
    setNewChannel({
      name: channel.name,
      logo_url: channel.logo_url || '',
      stream_url: channel.stream_url,
      category_id: channel.category_id,
      auth_cookie: channel.auth_cookie || '',
    });
  };

  const handleDeleteChannel = async (id: string) => {
    if (!confirm('Are you sure you want to delete this channel?')) return;
    
    try {
      await deleteChannel(id);
      toast({
        title: "Success",
        description: "Channel deleted successfully",
      });
      await fetchChannels();
    } catch (error) {
      console.error('Error deleting channel:', error);
      toast({
        title: "Error",
        description: "Failed to delete channel",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setNewChannel({ name: '', logo_url: '', stream_url: '', category_id: '', auth_cookie: '' });
    setEditingChannel(null);
  };

  // Filter channels by category
  const filteredChannels = selectedCategoryId 
    ? channels.filter(channel => channel.category_id === selectedCategoryId)
    : channels;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {editingChannel ? 'Edit Channel' : 'Add New Channel'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="channelName">Channel Name *</Label>
              <Input
                id="channelName"
                value={newChannel.name}
                onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
                placeholder="e.g., CNN, BBC News, ESPN"
                disabled={loading}
              />
            </div>
            <div>
              <Label htmlFor="channelLogo">Logo URL</Label>
              <Input
                id="channelLogo"
                type="url"
                value={newChannel.logo_url}
                onChange={(e) => setNewChannel({ ...newChannel, logo_url: e.target.value })}
                placeholder="https://example.com/logo.png"
                disabled={loading}
              />
            </div>
            <div>
              <Label htmlFor="streamUrl">Stream URL (m3u8) *</Label>
              <Input
                id="streamUrl"
                type="url"
                value={newChannel.stream_url}
                onChange={(e) => setNewChannel({ ...newChannel, stream_url: e.target.value })}
                placeholder="https://example.com/stream.m3u8"
                disabled={loading}
              />
            </div>
            <div>
              <Label htmlFor="category">Category *</Label>
              <Select value={newChannel.category_id} onValueChange={(value) => setNewChannel({ ...newChannel, category_id: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(category => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="authCookie">Authentication Cookie (Optional)</Label>
              <Textarea
                id="authCookie"
                value={newChannel.auth_cookie}
                onChange={(e) => setNewChannel({ ...newChannel, auth_cookie: e.target.value })}
                placeholder="Cookie string for authenticated streams"
                rows={2}
                disabled={loading}
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button onClick={handleSaveChannel} disabled={loading || !newChannel.name.trim() || !newChannel.stream_url.trim() || !newChannel.category_id}>
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Saving...' : editingChannel ? 'Update' : 'Add'}
            </Button>
            {editingChannel && (
              <Button variant="outline" onClick={resetForm} disabled={loading}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Channels ({filteredChannels.length})</CardTitle>
          <div className="flex gap-2">
            <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Categories</SelectItem>
                {categories.map(category => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredChannels.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No channels found.
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredChannels.map(channel => (
                <div key={channel.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-3">
                    <img
                      src={channel.logo_url || '/placeholder.svg'}
                      alt={channel.name}
                      className="w-10 h-10 object-contain bg-white rounded"
                      onError={(e) => {
                        e.currentTarget.src = '/placeholder.svg';
                      }}
                    />
                    <div>
                      <div className="font-medium">{channel.name}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <span>{categories.find(c => c.id === channel.category_id)?.name}</span>
                        {channel.stream_url && (
                          <Badge variant="secondary">Live</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditChannel(channel)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteChannel(channel.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// M3U Playlists Manager
const M3UPlaylistsManager = () => {
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [editingPlaylist, setEditingPlaylist] = useState<any | null>(null);
  const [newPlaylist, setNewPlaylist] = useState({
    name: '',
    url: '',
    auto_sync: false,
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchPlaylists();
  }, []);

  const fetchPlaylists = async () => {
    try {
      const data = await getM3UPlaylists();
      setPlaylists(data);
    } catch (error) {
      console.error('Error fetching playlists:', error);
    }
  };

  const handleSavePlaylist = async () => {
    if (!newPlaylist.name.trim() || !newPlaylist.url.trim()) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);
    try {
      const playlistData = {
        name: newPlaylist.name.trim(),
        url: newPlaylist.url.trim(),
        auto_sync: newPlaylist.auto_sync,
      };

      if (editingPlaylist) {
        await updateM3UPlaylist(editingPlaylist.id, playlistData);
        toast({
          title: "Success",
          description: "Playlist updated successfully",
        });
      } else {
        await createM3UPlaylist(playlistData);
        toast({
          title: "Success", 
          description: "Playlist created successfully",
        });
      }
      
      setNewPlaylist({ name: '', url: '', auto_sync: false });
      setEditingPlaylist(null);
      await fetchPlaylists();
    } catch (error) {
      console.error('Error saving playlist:', error);
      toast({
        title: "Error",
        description: "Failed to save playlist",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditPlaylist = (playlist: any) => {
    setEditingPlaylist(playlist);
    setNewPlaylist({
      name: playlist.name,
      url: playlist.url,
      auto_sync: playlist.auto_sync || false,
    });
  };

  const handleDeletePlaylist = async (id: string) => {
    if (!confirm('Are you sure you want to delete this playlist?')) return;
    
    try {
      await deleteM3UPlaylist(id);
      toast({
        title: "Success",
        description: "Playlist deleted successfully",
      });
      await fetchPlaylists();
    } catch (error) {
      console.error('Error deleting playlist:', error);
      toast({
        title: "Error",
        description: "Failed to delete playlist",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setNewPlaylist({ name: '', url: '', auto_sync: false });
    setEditingPlaylist(null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {editingPlaylist ? 'Edit M3U Playlist' : 'Add M3U Playlist'}
          </CardTitle>
          <CardDescription>
            Add M3U playlist URLs to automatically import channels
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="playlistName">Playlist Name *</Label>
              <Input
                id="playlistName"
                value={newPlaylist.name}
                onChange={(e) => setNewPlaylist({ ...newPlaylist, name: e.target.value })}
                placeholder="e.g., Sports Channels, Movies"
                disabled={loading}
              />
            </div>
            <div>
              <Label htmlFor="playlistUrl">M3U URL *</Label>
              <Input
                id="playlistUrl"
                type="url"
                value={newPlaylist.url}
                onChange={(e) => setNewPlaylist({ ...newPlaylist, url: e.target.value })}
                placeholder="https://example.com/playlist.m3u"
                disabled={loading}
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button onClick={handleSavePlaylist} disabled={loading || !newPlaylist.name.trim() || !newPlaylist.url.trim()}>
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Saving...' : editingPlaylist ? 'Update' : 'Add'}
            </Button>
            {editingPlaylist && (
              <Button variant="outline" onClick={resetForm} disabled={loading}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>M3U Playlists ({playlists.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {playlists.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No playlists added yet.
            </p>
          ) : (
            <div className="space-y-2">
              {playlists.map(playlist => (
                <div key={playlist.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-3">
                    <LinkIcon className="w-8 h-8 text-primary" />
                    <div>
                      <div className="font-medium">{playlist.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {playlist.url}
                      </div>
                      <div className="flex gap-2 mt-1">
                        <Badge variant={playlist.status === 'active' ? 'default' : 'secondary'}>
                          {playlist.status}
                        </Badge>
                        {playlist.last_sync && (
                          <Badge variant="outline">
                            Last sync: {new Date(playlist.last_sync).toLocaleDateString()}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditPlaylist(playlist)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeletePlaylist(playlist.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// Analytics Manager
const AnalyticsManager = () => {
  const [visitorAnalytics, setVisitorAnalytics] = useState<any[]>([]);
  const [channelAnalytics, setChannelAnalytics] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const [visitors, channels] = await Promise.all([
        getVisitorAnalytics(),
        getChannelAnalytics(),
      ]);
      setVisitorAnalytics(visitors);
      setChannelAnalytics(channels);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const uniqueVisitors = new Set(visitorAnalytics.map(v => v.ip_address)).size;
  const totalViews = channelAnalytics.length;
  const popularChannels = channelAnalytics.reduce((acc: any, view: any) => {
    acc[view.channel_id] = (acc[view.channel_id] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Unique Visitors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{uniqueVisitors}</div>
            <p className="text-muted-foreground">Total unique IP addresses</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Channel Views
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalViews}</div>
            <p className="text-muted-foreground">Total channel views</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Popular Channels
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {Object.keys(popularChannels).length}
            </div>
            <p className="text-muted-foreground">Channels with views</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="visitors" className="space-y-4">
        <TabsList>
          <TabsTrigger value="visitors">Visitor Logs</TabsTrigger>
          <TabsTrigger value="channels">Channel Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="visitors">
          <Card>
            <CardHeader>
              <CardTitle>Recent Visitors</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Loading...</div>
              ) : visitorAnalytics.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No visitor data available
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {visitorAnalytics.slice(0, 100).map((visitor, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div>
                        <div className="font-medium">{visitor.ip_address}</div>
                        <div className="text-sm text-muted-foreground">
                          {visitor.page_url}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(visitor.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="text-sm">
                        {visitor.country && <Badge variant="outline">{visitor.country}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="channels">
          <Card>
            <CardHeader>
              <CardTitle>Channel Views</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Loading...</div>
              ) : channelAnalytics.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No channel analytics available
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {channelAnalytics.slice(0, 100).map((view, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div>
                        <div className="font-medium">Channel: {view.channel_id}</div>
                        <div className="text-sm text-muted-foreground">
                          IP: {view.ip_address}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(view.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="text-sm">
                        {view.watch_duration && (
                          <Badge variant="outline">{view.watch_duration}s</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// IP Management
const IPManagement = () => {
  const [blockedIPs, setBlockedIPs] = useState<any[]>([]);
  const [newIP, setNewIP] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchBlockedIPs();
  }, []);

  const fetchBlockedIPs = async () => {
    try {
      const data = await getBlockedIPs();
      setBlockedIPs(data);
    } catch (error) {
      console.error('Error fetching blocked IPs:', error);
    }
  };

  const handleBlockIP = async () => {
    if (!newIP.trim()) {
      toast({
        title: "Error",
        description: "Please enter an IP address",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      await blockIP({
        ip_address: newIP.trim(),
        reason: reason.trim() || 'Manually blocked',
        blocked_by: 'admin',
      });
      
      toast({
        title: "Success",
        description: "IP address blocked successfully",
      });
      
      setNewIP('');
      setReason('');
      await fetchBlockedIPs();
    } catch (error) {
      console.error('Error blocking IP:', error);
      toast({
        title: "Error",
        description: "Failed to block IP address",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUnblockIP = async (id: string) => {
    if (!confirm('Are you sure you want to unblock this IP?')) return;
    
    try {
      await unblockIP(id);
      toast({
        title: "Success",
        description: "IP address unblocked successfully",
      });
      await fetchBlockedIPs();
    } catch (error) {
      console.error('Error unblocking IP:', error);
      toast({
        title: "Error",
        description: "Failed to unblock IP address",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ban className="w-5 h-5" />
            Block IP Address
          </CardTitle>
          <CardDescription>
            Block specific IP addresses from accessing your platform
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ipAddress">IP Address *</Label>
              <Input
                id="ipAddress"
                value={newIP}
                onChange={(e) => setNewIP(e.target.value)}
                placeholder="192.168.1.1"
                disabled={loading}
              />
            </div>
            <div>
              <Label htmlFor="reason">Reason</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Abuse, spam, etc."
                disabled={loading}
              />
            </div>
          </div>
          
          <Button onClick={handleBlockIP} disabled={loading || !newIP.trim()}>
            <Ban className="w-4 h-4 mr-2" />
            {loading ? 'Blocking...' : 'Block IP'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Blocked IPs ({blockedIPs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {blockedIPs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No blocked IPs
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {blockedIPs.map((blockedIP) => (
                <div key={blockedIP.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-destructive" />
                      {blockedIP.ip_address}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Reason: {blockedIP.reason}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Blocked: {new Date(blockedIP.blocked_at).toLocaleString()}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleUnblockIP(blockedIP.id)}
                  >
                    Unblock
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
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
    { path: '/admin/playlists', label: 'M3U Playlists' },
    { path: '/admin/analytics', label: 'Analytics' },
    { path: '/admin/ips', label: 'IP Management' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield size={24} className="text-accent" />
            <h1 className="text-xl font-bold">Live TV Pro Admin</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground text-sm">
              {user?.email}
            </span>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut size={16} className="mr-2" />
              Logout
            </Button>
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
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
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
                    <Card>
                      <CardHeader>
                        <CardTitle>Quick Actions</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <Link to="/admin/categories">
                          <Button variant="outline" className="w-full justify-start">
                            <Plus size={16} className="mr-2" />
                            Manage Categories
                          </Button>
                        </Link>
                        <Link to="/admin/channels">
                          <Button variant="outline" className="w-full justify-start">
                            <Plus size={16} className="mr-2" />
                            Manage Channels
                          </Button>
                        </Link>
                        <Link to="/admin/playlists">
                          <Button variant="outline" className="w-full justify-start">
                            <Upload size={16} className="mr-2" />
                            M3U Playlists
                          </Button>
                        </Link>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader>
                        <CardTitle>System Info</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1 text-sm">
                        <div>Live TV Pro Admin</div>
                        <div>Version 2.0.0</div>
                        <div>Admin: {user?.email}</div>
                        <Badge className="mt-2">System Online</Badge>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader>
                        <CardTitle>Features</CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm space-y-2">
                        <p>• M3U playlist support</p>
                        <p>• Visitor tracking & analytics</p>
                        <p>• IP blocking system</p>
                        <p>• Category-wise channel management</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              } />
              <Route path="/categories" element={<CategoriesManager />} />
              <Route path="/channels" element={<ChannelsManager />} />
              <Route path="/playlists" element={<M3UPlaylistsManager />} />
              <Route path="/analytics" element={<AnalyticsManager />} />
              <Route path="/ips" element={<IPManagement />} />
            </Routes>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main Admin Component
const NewAdmin = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AdminLogin />;
  }

  return <AdminDashboard />;
};

export default NewAdmin;