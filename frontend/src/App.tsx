import { JSX, Show } from "solid-js";
import { Router, Route, Navigate } from "@solidjs/router";
import { QueryClientProvider, useQuery } from "@tanstack/solid-query";
import { queryClient } from "./queryClient";
import { api } from "./api/client";
import type { User } from "./api/types";
import Layout from "./components/Layout";
import { FullSpinner } from "./components/ui";

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import JemaatList from "./pages/jemaat/List";
import JemaatDetail from "./pages/jemaat/Detail";
import JemaatForm from "./pages/jemaat/Form";
import KeluargaList from "./pages/keluarga/List";
import KeluargaDetail from "./pages/keluarga/Detail";
import KeluargaForm from "./pages/keluarga/Form";
import PelayanList from "./pages/pelayan/List";
import PelayanDetail from "./pages/pelayan/Detail";
import PelayanForm from "./pages/pelayan/Form";
import ServiceTypeList from "./pages/servicetypes/List";
import KebaktianList from "./pages/kebaktian/List";
import KebaktianDetail from "./pages/kebaktian/Detail";
import KebaktianForm from "./pages/kebaktian/Form";
import JadwalEditor from "./pages/kebaktian/Jadwal";

function ProtectedLayout(props: { children?: JSX.Element }) {
  const me = useQuery(() => ({
    queryKey: ["me"],
    queryFn: () => api.get<{ user: User }>("/me"),
    staleTime: 60_000,
  }));

  return (
    <Show when={!me.isPending} fallback={<FullSpinner />}>
      <Show when={me.isSuccess && me.data} fallback={<Navigate href="/login" />}>
        <Layout user={me.data!.user}>{props.children}</Layout>
      </Show>
    </Show>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />
        <Route path="/" component={ProtectedLayout}>
          <Route path="/" component={() => <Navigate href="/jemaat" />} />
          <Route path="/jemaat" component={JemaatList} />
          <Route path="/jemaat/new" component={JemaatForm} />
          <Route path="/jemaat/:id" component={JemaatDetail} />
          <Route path="/jemaat/:id/edit" component={JemaatForm} />
          <Route path="/keluarga" component={KeluargaList} />
          <Route path="/keluarga/new" component={KeluargaForm} />
          <Route path="/keluarga/:id" component={KeluargaDetail} />
          <Route path="/keluarga/:id/edit" component={KeluargaForm} />
          <Route path="/pelayan" component={PelayanList} />
          <Route path="/pelayan/new" component={PelayanForm} />
          <Route path="/pelayan/:id" component={PelayanDetail} />
          <Route path="/pelayan/:id/edit" component={PelayanForm} />
          <Route path="/service-types" component={ServiceTypeList} />
          <Route path="/kebaktian" component={KebaktianList} />
          <Route path="/kebaktian/new" component={KebaktianForm} />
          <Route path="/kebaktian/:id" component={KebaktianDetail} />
          <Route path="/kebaktian/:id/edit" component={KebaktianForm} />
          <Route path="/kebaktian/:id/jadwal" component={JadwalEditor} />
        </Route>
        <Route path="*" component={() => <Navigate href="/jemaat" />} />
      </Router>
    </QueryClientProvider>
  );
}
