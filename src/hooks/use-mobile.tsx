import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const compute = () => {
      const minDim = Math.min(window.innerWidth, window.innerHeight);
      const isCoarse = window.matchMedia("(pointer: coarse)").matches;
      setIsMobile(minDim < MOBILE_BREAKPOINT || isCoarse);
    };

    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("orientationchange", compute);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
    };
  }, []);

  return !!isMobile;
}
