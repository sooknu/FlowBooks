import { useRef, useCallback } from 'react';

export function useTabScroll() {
  const tabsRef = useRef(null);

  const scrollToTabs = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    // Only scroll if the tab bar has scrolled above the mobile header (48px + buffer)
    // If tabs are visible near the top, don't snap — that's the "not too sensitive" part
    if (rect.top < 60) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return { tabsRef, scrollToTabs };
}
