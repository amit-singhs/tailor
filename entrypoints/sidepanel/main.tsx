import '@/assets/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/components/App';
import { AppProvider } from '@/components/state';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
