import { useEffect } from 'react';
import { trackVisitor, getVisitorIP, checkIPBlocked } from '@/services/supabaseService';

export const useVisitorTracking = () => {
  useEffect(() => {
    const trackPageVisit = async () => {
      try {
        const ip = await getVisitorIP();
        
        // Check if IP is blocked
        const isBlocked = await checkIPBlocked(ip);
        if (isBlocked) {
          // Redirect blocked users or show message
          document.body.innerHTML = `
            <div style="
              display: flex; 
              justify-content: center; 
              align-items: center; 
              height: 100vh; 
              background: #1a1a1a; 
              color: white; 
              font-family: Arial, sans-serif;
              text-align: center;
            ">
              <div>
                <h1>Access Denied</h1>
                <p>Your IP address has been blocked.</p>
              </div>
            </div>
          `;
          return;
        }

        // Track visitor
        await trackVisitor({
          ip_address: ip,
          user_agent: navigator.userAgent,
          page_url: window.location.href,
          referrer: document.referrer || undefined,
        });
      } catch (error) {
        console.error('Error tracking visitor:', error);
      }
    };

    trackPageVisit();
  }, []);
};