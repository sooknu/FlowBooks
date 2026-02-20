import { useState, useEffect } from 'react';

const CALLBACK_NAME = '__googleMapsCallback';
let loadPromise = null;

export function useGoogleMaps(apiKey) {
  const [isLoaded, setIsLoaded] = useState(!!window.google?.maps?.places);

  useEffect(() => {
    if (!apiKey || window.google?.maps?.places) {
      if (window.google?.maps?.places) setIsLoaded(true);
      return;
    }
    if (!loadPromise) {
      loadPromise = new Promise((resolve, reject) => {
        window[CALLBACK_NAME] = () => { resolve(); delete window[CALLBACK_NAME]; };
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=${CALLBACK_NAME}`;
        script.async = true;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    loadPromise.then(() => setIsLoaded(true)).catch(() => {});
  }, [apiKey]);

  return isLoaded;
}
