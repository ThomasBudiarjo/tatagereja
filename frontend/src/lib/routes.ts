import { wrap } from 'svelte-spa-router/wrap';
import Login from '../routes/Login.svelte';
import Dashboard from '../routes/Dashboard.svelte';
import Jemaat from '../routes/Jemaat.svelte';
import JemaatDetail from '../routes/JemaatDetail.svelte';
import Pelayan from '../routes/Pelayan.svelte';
import ServiceTypes from '../routes/ServiceTypes.svelte';
import Kebaktian from '../routes/Kebaktian.svelte';
import KebaktianDetail from '../routes/KebaktianDetail.svelte';
import NotFound from '../routes/NotFound.svelte';
import { auth } from './stores/auth.svelte';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const requireAuth = (Component: any) =>
  wrap({
    component: Component,
    conditions: [() => auth.isAuthenticated],
  });

export const routes = {
  '/': requireAuth(Dashboard),
  '/login': Login,
  '/jemaat': requireAuth(Jemaat),
  '/jemaat/:id': requireAuth(JemaatDetail),
  '/pelayan': requireAuth(Pelayan),
  '/service-types': requireAuth(ServiceTypes),
  '/kebaktian': requireAuth(Kebaktian),
  '/kebaktian/:id': requireAuth(KebaktianDetail),
  '*': NotFound,
};
