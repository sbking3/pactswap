import { createRoot } from 'react-dom/client';
import { setAuthTokenGetter } from '@workspace/api-client-react';

import App from './App';

import './index.css';

// Attach the stored JWT to every API call so protected routes get the Bearer token
setAuthTokenGetter(() => localStorage.getItem('pactswap_token'));

createRoot(document.getElementById('root')!).render(<App />);
