import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
    
    const initialWidth = window.innerWidth;
    const initialHeight = window.innerHeight;
    const smallestDimension = Math.min(initialWidth, initialHeight);
    
    const isMobileDevice = isMobileUA || (isTouchDevice && smallestDimension < MOBILE_BREAKPOINT);
    
    setIsMobile(isMobileDevice);
  }, []);

  return !!isMobile;
}
