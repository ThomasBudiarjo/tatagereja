import { wrap } from 'svelte-spa-router/wrap';
import Login from '../routes/Login.svelte';
import Dashboard from '../routes/Dashboard.svelte';
import Jemaat from '../routes/Jemaat.svelte';
import NotFound from '../routes/NotFound.svelte';
import { auth } from './stores/auth.svelte';

const requireAuth = (Component: any) =>
  wrap({
    component: Component,
    conditions: [() => auth.isAuthenticated],
  });

export const routes = {
  '/': requireAuth(Dashboard),
  '/login': Login,
  '/jemaat': requireAuth(Jemaat),
  '*': NotFound,
};
