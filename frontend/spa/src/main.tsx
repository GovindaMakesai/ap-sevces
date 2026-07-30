import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { queryClient } from './api/queryClient';
import { hydrateAuthFromStorage } from './stores/authStore';
/* Production theme first — SPA shell only adds chrome, not a new design language */
import '../../social-theme.css';
import './styles/shell.css';

hydrateAuthFromStorage();

document.documentElement.classList.add('social-app');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/spa">
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
