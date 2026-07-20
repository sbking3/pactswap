import { createRoot } from 'react-dom/client';
import { setAuthTokenGetter } from '@workspace/api-client-react';

import App from './App';

import './index.css';

// Attach the stored JWT to every API call so protected routes get the Bearer token
setAuthTokenGetter(() => localStorage.getItem('pactswap_token'));

// ─── Service Worker registration (PWA) ───────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // BASE_URL already includes trailing slash, e.g. "/pactswap/" or "/"
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker
      .register(swUrl, { scope: import.meta.env.BASE_URL })
      .then((reg) => {
        console.info('[SW] Registered', reg.scope);
      })
      .catch((err) => {
        // Non-fatal — app works fine without SW
        console.warn('[SW] Registration failed:', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
