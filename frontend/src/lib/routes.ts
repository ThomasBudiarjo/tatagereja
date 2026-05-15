import { wrap } from 'svelte-spa-router/wrap';
import Login from '../routes/Login.svelte';
import Dashboard from '../routes/Dashboard.svelte';
import Jemaat from '../routes/Jemaat.svelte';
import JemaatDetail from '../routes/JemaatDetail.svelte';
import Pelayan from '../routes/Pelayan.svelte';
import PelayanDetail from '../routes/PelayanDetail.svelte';
import ServiceTypes from '../routes/ServiceTypes.svelte';
import Kebaktian from '../routes/Kebaktian.svelte';
import KebaktianDetail from '../routes/KebaktianDetail.svelte';
import KebaktianPrint from '../routes/KebaktianPrint.svelte';
import Keluarga from '../routes/Keluarga.svelte';
import KeluargaDetail from '../routes/KeluargaDetail.svelte';
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
  '/keluarga': requireAuth(Keluarga),
  '/keluarga/:id': requireAuth(KeluargaDetail),
  '/pelayan': requireAuth(Pelayan),
  '/pelayan/:id': requireAuth(PelayanDetail),
  '/service-types': requireAuth(ServiceTypes),
  '/kebaktian': requireAuth(Kebaktian),
  '/kebaktian/:id': requireAuth(KebaktianDetail),
  '/kebaktian/:id/print': requireAuth(KebaktianPrint),
  '*': NotFound,
};
