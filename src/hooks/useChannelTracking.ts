import { useEffect, useRef } from 'react';
import { trackChannelView, getVisitorIP } from '@/services/supabaseService';

export const useChannelTracking = (channelId: string) => {
  const startTimeRef = useRef<number>(Date.now());
  const trackedRef = useRef<boolean>(false);

  useEffect(() => {
    const trackView = async () => {
      if (trackedRef.current) return;
      trackedRef.current = true;

      try {
        const ip = await getVisitorIP();
        
        await trackChannelView({
          channel_id: channelId,
          ip_address: ip,
          user_agent: navigator.userAgent,
          quality: 'auto',
        });
      } catch (error) {
        console.error('Error tracking channel view:', error);
      }
    };

    trackView();

    // Track duration on page unload
    const handleBeforeUnload = async () => {
      const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
      
      if (duration > 5) { // Only track if watched for more than 5 seconds
        try {
          const ip = await getVisitorIP();
          
          navigator.sendBeacon('/api/track-duration', JSON.stringify({
            channel_id: channelId,
            ip_address: ip,
            watch_duration: duration,
          }));
        } catch (error) {
          console.error('Error tracking duration:', error);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [channelId]);

  return {
    startTime: startTimeRef.current,
  };
};