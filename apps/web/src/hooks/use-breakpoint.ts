'use client';

import { useState, useEffect } from 'react';

export function useBreakpoint() {
  const [breakpoint, setBreakpoint] = useState({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      const width = window.innerWidth;
      const isMobile = width < 768;
      const isTablet = width >= 768 && width < 1280;
      const isDesktop = width >= 1280;

      setBreakpoint({ isMobile, isTablet, isDesktop });
    };

    handleResize(); // Initialize on client-side mount
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return breakpoint;
}
