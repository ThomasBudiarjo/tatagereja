import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { Toaster } from 'sonner';
import { AppErrorBoundary } from '@/components/layout/error-boundary';
import { ThemeEffect } from '@/components/layout/theme';
import { queryClient } from '@/lib/query-client';
import { router } from '@/router';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

createRoot(container).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeEffect />
        <RouterProvider router={router} />
        <Toaster position="top-center" richColors closeButton toastOptions={{ duration: 4000 }} />
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
