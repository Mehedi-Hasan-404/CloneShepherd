// /src/pages/ChannelPlayer.tsx - Comprehensive Channel Player Page with Firebase Fetch, Auth Passthrough, UI Controls, Favorites/Recents Integration, Related Channels, Error Handling, and HLS Download with Duration Options
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { Heart, ArrowLeft, Loader2, AlertCircle, Clock, PlayCircle, Share2, Download, DownloadCloud, StopCircle, Clock as ClockIcon } from 'lucide-react';
// Added Clock for duration
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
// For download progress
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// For duration selector
import { toast } from "@/components/ui/sonner";
import { useAuth } from '@/hooks/useAuth'; // Custom auth hook for user data
import { useFavorites } from '@/contexts/FavoritesContext'; // Correct hook for favorites
import { useRecents } from '@/contexts/RecentsContext';
// Recents context for tracking viewed channels
import VideoPlayer from '@/components/VideoPlayer';
import { HLSDownloader } from 'hlsdownloader'; // For HLS download (npm i hlsdownloader)
import { db } from '@/lib/firebase'; // Firebase Firestore import
import { cn } from '@/lib/utils';
// shadcn classnames util
import { Channel as ChannelType } from '@/types';
// Assuming types/index.ts defines Channel

interface Channel extends ChannelType {
  isFavorite?: boolean;
// Client-side flag from context
  isRecent?: boolean; // Client-side flag from recents
}

interface RelatedChannel {
  id: string;
  name: string;
  logoUrl?: string;
  categoryName: string;
}

interface DownloadState {
  isDownloading: boolean;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  filename: string;
  selectedDuration: number;
// Selected duration in seconds (default 300)
}

const ChannelPlayer: React.FC = () => {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth(); // Correctly get user data
  const { addFavorite, removeFavorite, isFavorite } = useFavorites(); // Correctly get favorite functions
  const { addRecent } = useRecents(); // Correctly get recents function
  
  const [channel, setChannel] = useState<Channel | null>(null);
  const [relatedChannels, setRelatedChannels] = useState<RelatedChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddingFavorite, setIsAddingFavorite] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [downloadState, setDownloadState] = useState<DownloadState>({
    isDownloading: false,
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    filename: '',
    selectedDuration: 300, // Default 5 minutes
  });
  const [showDurationSelect, setShowDurationSelect] = useState(false); // Toggle for duration picker

  // Duration options: 1 min, 5 min, 10 min, 30 min, 60 min
  const durationOptions = [
    { value: 60, label: '1 min' },
    { value: 300, label: '5 min' },
    { value: 600, label: '10 min' },
    { value: 1800, label: '30 min' },
    { value: 3600, label: '1 hour' },
  ];

  // Fetch channel and related channels from Firestore
  useEffect(() => {
    const fetchData = async () => {
      if (!channelId) {
        setError('Invalid channel ID');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Fetch main channel
        const channelDoc = await getDoc(doc(db, 'channels', channelId));
        if (channelDoc.exists()) {
          const data = channelDoc.data() as Omit<Channel, 'id' | 'isFavorite' | 'isRecent'>;
          const fullChannel: Channel = {
            id: channelDoc.id,
            ...data,
            isFavorite: isFavorite(channelDoc.id), // Correctly check favorite status by ID
            isRecent: false, // Will be set via recents context
          };
          setChannel(fullChannel);

          // Add to recents
          addRecent(fullChannel);
          // Re-check if now recent (for UI)
          fullChannel.isRecent = true;


          // Fetch related channels (same category, limit 4, exclude self)
          const relatedQuery = query(
            collection(db, 'channels'),
            where('categoryId', '==', data.categoryId),
            where('id', '!=', channelId),
            orderBy('name'),
          );
          const relatedSnapshot = await getDocs(relatedQuery);
          const relatedList: RelatedChannel[] = relatedSnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name,
            logoUrl: doc.data().logoUrl,
            categoryName: doc.data().categoryName,
          })).slice(0, 4);
          setRelatedChannels(relatedList);
        } else {
          setError('Channel not found');
        }
      } catch (err) {
        console.error('Error fetching channel data:', err);
        setError('Failed to load channel. Please check your connection.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [channelId, isFavorite, addRecent]);

  // Toggle favorite with loading state
  const handleToggleFavorite = async () => {
    if (!channel) {
      toast.error('Cannot update favorites.', {
        description: 'Channel data is not available.',
      });
      return;
    }

    setIsAddingFavorite(true);
    try {
      if (channel.isFavorite) {
        removeFavorite(channel.id); // Correct function name and argument
        setChannel(prev => prev ? { ...prev, isFavorite: false } : null);
        toast.success(`${channel.name} removed from favorites`);
      } else {
        addFavorite(channel); // Correct function name
        setChannel(prev => prev ? { ...prev, isFavorite: true } : null);
        toast.success(`${channel.name} added to favorites`);
      }
    } catch (err) {
      console.error('Favorite toggle error:', err);
      toast.error('Failed to update favorites', {
        description: 'Please try again.',
      });
    } finally {
      setIsAddingFavorite(false);
    }
  };

  // Share channel (native share API or copy link)
  const handleShare = async () => {
    if (!channel) return;
    setIsSharing(true);
    try {
      const shareData = {
        title: `${channel.name} - Live TV Pro`,
        text: `Watch ${channel.name} live on Live TV Pro`,
        url: `${window.location.origin}${location.pathname}`,
      };
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        // Fallback: Copy to clipboard
        await navigator.clipboard.writeText(shareData.url);
        toast.success('Link copied to clipboard!');
      }
    } catch (err) {
      console.error('Share error:', err);
      toast.error('Failed to share', {
        description: 'Please copy the link manually.',
      });
    } finally {
      setIsSharing(false);
    }
  };

  // Updated: Download HLS stream with selected duration
  const handleDownload = useCallback(async () => {
    if (!channel || !channel.streamUrl || downloadState.isDownloading) return;

    // Check if HLS (only support HLS downloads)
    if (!channel.streamUrl.toLowerCase().includes('.m3u8')) {
      toast.error('Download not supported', {
        description: 'Only HLS streams (.m3u8) can be downloaded.',
      });
      return;
    }

    // Use selected duration
    const duration = downloadState.selectedDuration;
    const durationLabel = durationOptions.find(opt => opt.value === duration)?.label || '5 min';

    setDownloadState(prev => ({
      ...prev,
      isDownloading: true,
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      filename: `${channel.name.replace(/[^a-z0-9]/gi, '_')}_${durationLabel.replace(' ', '_')}_${new Date().toISOString().split('T')[0]}.mp4`,
    }));

    try {
      const downloader = new HLSDownloader({
        url: channel.streamUrl, // Use raw streamUrl; proxy handled in VideoPlayer, but for download use direct or proxied if needed
        authHeader: channel.authCookie ? { 'X-Auth-Cookie': channel.authCookie } : undefined, // Passthrough auth
        onProgress: (progress, downloaded, total) => {
          setDownloadState(prev => ({
            ...prev,
            progress: progress * 100,
            downloadedBytes: downloaded,
            totalBytes: total,
          }));
        },
        onError: (err) => {
          console.error('Download error:', err);
          toast.error('Download failed', {
            description: err.message || 'Unknown error',
          });
          setDownloadState(prev => ({ ...prev, isDownloading: false }));
        },
        onComplete: (filePath) => {
          // Trigger browser download
          const link = document.createElement('a');
          link.href = filePath; // Assuming downloader returns blob URL
          link.download = downloadState.filename;
          link.click();
          toast.success('Download complete!', { 
            description: `Saved ${durationLabel} clip as ${downloadState.filename}` 
          });
          setDownloadState(prev => ({ ...prev, isDownloading: false }));
        },
      });

      await downloader.download(duration); // Download specified duration in seconds
    } catch (err) {
      console.error('Download init error:', err);
      toast.error('Download initialization failed', {
        description: 'Check stream URL and permissions.',
      });
      setDownloadState(prev => ({ ...prev, isDownloading: false }));
    }
  }, [channel, downloadState.isDownloading, downloadState.selectedDuration, downloadState.filename]);

  // Handle duration selection
  const handleDurationChange = (value: string) => {
    const duration = parseInt(value, 10);
    setDownloadState(prev => ({ ...prev, selectedDuration: duration }));
    setShowDurationSelect(false); // Close dropdown after selection
  };

  // Cancel download
  const handleCancelDownload = () => {
    // Assuming downloader has abort method; implement if needed
    setDownloadState(prev => ({ 
      ...prev, 
      isDownloading: false, 
      progress: 0, 
      downloadedBytes: 0, 
      totalBytes: 0 
    }));
    toast.info('Download cancelled');
  };

  // Toggle duration selector
  const toggleDurationSelect = () => {
    setShowDurationSelect(prev => !prev);
  };

  // Navigate to related channel
  const handleRelatedClick = (relatedId: string) => {
    navigate(`/channel/${relatedId}`);
  };

  // Back navigation with referrer handling
  const handleBack = () => {
    if (location.state?.from) {
      navigate(location.state.from);
    } else {
      navigate(-1);
    }
  };

  // Memoized related channels UI
  const relatedSection = useMemo(() => {
    if (relatedChannels.length === 0) return null;
    return (
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Related Channels
            <Badge variant="secondary">{channel?.categoryName}</Badge>
          </CardTitle>
          <CardDescription>Explore more in the same category</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {relatedChannels.map((rel) => (
            <Button
              key={rel.id}
              variant="ghost"
              className="h-auto p-4 flex flex-col items-center space-y-2 rounded-lg hover:bg-muted"
              onClick={() => handleRelatedClick(rel.id)}
            >
              {rel.logoUrl ? (
                <img src={rel.logoUrl} alt={rel.name} className="h-12 w-12 object-contain rounded" />
              ) : (
                <div className="h-12 w-12 bg-muted rounded flex items-center justify-center">
                  <PlayCircle className="h-6 w-6" />
                </div>
              )}
              <span className="text-sm font-medium text-center">{rel.name}</span>
            </Button>
          ))}
        </CardContent>
      </Card>
    );
  }, [relatedChannels, channel?.categoryName, navigate]);

  // Memoized download UI with duration selector
  const downloadSection = useMemo(() => {
    if (!channel) return null;
    return (
      <CardFooter className="p-4 pt-2 justify-between items-center">
        <div className="text-sm text-muted-foreground">
          Powered by HLS.js with adaptive bitrate for smooth streaming
        </div>
        <div className="flex items-center space-x-2">
          
          {downloadState.isDownloading ? (
            <Button variant="outline" size="sm" onClick={handleCancelDownload}>
              <StopCircle className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          ) : (
            <>
              <Select open={showDurationSelect} onOpenChange={setShowDurationSelect} value={downloadState.selectedDuration.toString()}>
                <SelectTrigger className="w-[120px] text-xs">
                  <ClockIcon className="h-3 w-3 mr-1" />
                  <SelectValue placeholder="Duration" />
                </SelectTrigger>
                <SelectContent>
                  {durationOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value.toString()} onSelect={() => handleDurationChange(opt.value.toString())}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDownload}
                className="flex items-center"
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </>
          )}
        </div>
      </CardFooter>
    );
  }, [channel, downloadState, showDurationSelect, handleDownload, handleCancelDownload, durationOptions, handleDurationChange]);

  // Progress overlay during download
  const downloadProgress = useMemo(() => {
    if (!downloadState.isDownloading) return null;
    const durationLabel = durationOptions.find(opt => opt.value === downloadState.selectedDuration)?.label || '5 min';
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <DownloadCloud className="h-5 w-5 animate-pulse" />
              <span>Downloading {channel?.name}</span>
            </CardTitle>
            <CardDescription>{durationLabel} clip</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={downloadState.progress} className="w-full" />
            <div className="flex justify-between text-sm">
              <span>{Math.round(downloadState.downloadedBytes / 1024 / 1024)} MB / {Math.round(downloadState.totalBytes / 1024 / 1024)} MB</span>
              <span>{Math.round(downloadState.progress)}%</span>
            </div>
            <p className="text-sm text-muted-foreground">File: {downloadState.filename}</p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" onClick={handleCancelDownload} className="w-full">Cancel Download</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }, [downloadState, channel?.name, durationOptions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading {channelId ? 'channel' : 'page'}...</p>
        </div>
      </div>
    );
  }

  if (error || !channel) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-center text-destructive">
              <AlertCircle className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl text-center">Channel Error</CardTitle>
            <CardDescription className="text-center">{error || 'Channel not available'}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col space-y-2">
            <Button onClick={handleBack} variant="outline" className="w-full">Go Back</Button>
            <Button onClick={() => window.location.reload()} variant="secondary" className="w-full">Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      {/* Download Progress Overlay */}
      {downloadProgress}

      <div className="min-h-screen bg-background">
        {/* Sticky Header */}
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
          <div className="container flex items-center justify-between h-16 px-4">
            <Button variant="ghost" onClick={handleBack} size="sm" className="h-10 px-3">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to {channel.categoryName}
            </Button>
            <div className="flex items-center space-x-2">
              <Badge variant="default" className="bg-primary">{channel.categoryName}</Badge>
              {user && (
                <>
                  <Separator orientation="vertical" className="h-6" />
                  <Button
                    variant={channel.isFavorite ? 'destructive' : 'outline'}
                    size="sm"
                    onClick={handleToggleFavorite}
                    disabled={isAddingFavorite}
                    className="h-10 px-3"
                  >
                    {isAddingFavorite ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    <Heart className={cn("h-4 w-4 mr-2", channel.isFavorite && "fill-current")} />
                    {channel.isFavorite ? 'Remove' : 'Favorite'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleShare}
                    disabled={isSharing}
                    className="h-10 px-3"
                  >
                    {isSharing ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Share2 className="h-4 w-4 mr-2" />
                    )}
                    Share
                  </Button>
                  <div className="flex items-center space-x-1">
                    <Select 
                      value={downloadState.selectedDuration.toString()} 
                      onValueChange={handleDurationChange}
                    >
                      <SelectTrigger className="w-[100px] h-10 text-xs">
                        <ClockIcon className="h-3 w-3 mr-1" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {durationOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value.toString()}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownload}
                      disabled={downloadState.isDownloading}
                      className="h-10 px-3"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Main Container */}
        <main className="container mx-auto px-4 py-6 space-y-6">
          {/* Channel Info Card */}
          <Card className="max-w-4xl mx-auto">
            <CardHeader className="flex flex-row items-start space-x-4 pb-4">
              {channel.logoUrl ? (
                <img
                  src={channel.logoUrl}
                  alt={channel.name}
                  className="h-16 w-16 flex-shrink-0 rounded-lg object-contain bg-muted"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="h-16 w-16 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                  <PlayCircle className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <CardTitle className="text-2xl font-bold truncate">{channel.name}</CardTitle>
                <div className="flex items-center space-x-4 mt-2 text-sm text-muted-foreground">
                  <div className="flex items-center space-x-1">
                    <Clock className="h-4 w-4" />
                    <span>Live Now</span>
                  </div>
                  {channel.isRecent && (
                    <Badge variant="secondary" className="text-xs">Recently Viewed</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardFooter className="flex justify-between pt-0">
              <div className="text-sm text-muted-foreground">
                Category: {channel.categoryName}
              </div>
              {user && channel.isFavorite && (
                <Badge variant="default">★ Favorite</Badge>
              )}
            </CardFooter>
          </Card>

          <Separator />

          {/* Video Player Card */}
          <Card className="max-w-4xl mx-auto overflow-hidden">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center space-x-2">
                <PlayCircle className="h-5 w-5" />
                <span>Live Stream</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <VideoPlayer
                streamUrl={channel.streamUrl} // Auto-proxies HLS via internal logic
                channelName={channel.name}
                autoPlay={true}
                muted={true}
                authCookie={channel.authCookie} // Passes to proxy for upstream auth
                className="aspect-video w-full"
                onPlay={() => toast.success(`Now playing: ${channel.name}`)}
                onPause={() => toast.info('Stream paused')}
                onError={(err) => {
                  console.error('Player error:', err);
                  setError(err);
                  toast.error('Playback Error', {
                    description: err,
                    action: {
                        label: "Retry",
                        onClick: () => window.location.reload()
                    }
                  });
                }}
              />
            </CardContent>
            {downloadSection}
          </Card>

          {/* Related Channels Section */}
          {relatedSection}

          {/* Footer Info */}
          <Card className="max-w-4xl mx-auto">
            <CardContent className="p-4 text-sm text-muted-foreground text-center">
              <p>
                Enjoy {channel.name} from {channel.categoryName}. 
                For support, visit the admin dashboard or contact us.
              </p>
              <div className="flex justify-center space-x-4 mt-2">
                <Button variant="link" size="sm" onClick={() => navigate('/admin')}>
                  Admin Dashboard
                </Button>
                <Button variant="link" size="sm" onClick={() => navigate('/')}>
                  Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </>
  );
};

export default ChannelPlayer;
