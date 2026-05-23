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
      <Router base="/app">
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
        </Route>
        <Route path="*" component={() => <Navigate href="/jemaat" />} />
      </Router>
    </QueryClientProvider>
  );
}
