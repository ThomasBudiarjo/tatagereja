import Login from '../routes/Login.svelte';
import Dashboard from '../routes/Dashboard.svelte';
import Jemaat from '../routes/Jemaat.svelte';
import JemaatDetail from '../routes/JemaatDetail.svelte';
import Keluarga from '../routes/Keluarga.svelte';
import KeluargaDetail from '../routes/KeluargaDetail.svelte';
import ServiceTypes from '../routes/ServiceTypes.svelte';
import Pelayan from '../routes/Pelayan.svelte';
import Kebaktian from '../routes/Kebaktian.svelte';
import KebaktianDetail from '../routes/KebaktianDetail.svelte';
import JadwalEditor from '../routes/JadwalEditor.svelte';
import JadwalMaster from '../routes/JadwalMaster.svelte';
import More from '../routes/More.svelte';
import NotFound from '../routes/NotFound.svelte';

export const routes = {
  '/login': Login,
  '/': Dashboard,
  '/jemaat': Jemaat,
  '/jemaat/:id': JemaatDetail,
  '/keluarga': Keluarga,
  '/keluarga/:id': KeluargaDetail,
  '/service-types': ServiceTypes,
  '/pelayan': Pelayan,
  '/kebaktian': Kebaktian,
  '/kebaktian/:id': KebaktianDetail,
  '/kebaktian/:id/jadwal': JadwalEditor,
  '/jadwal-master': JadwalMaster,
  '/more': More,
  '*': NotFound,
};
