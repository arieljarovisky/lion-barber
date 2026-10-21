import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ensurePushServiceWorker, isWebPushSupported } from './utils/webPush';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (isWebPushSupported()) {
  void ensurePushServiceWorker().catch(() => undefined);
}