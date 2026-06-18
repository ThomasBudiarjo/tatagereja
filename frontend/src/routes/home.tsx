import { useLogout, useMe } from "../lib/queries";

export function HomePage() {
  const { data } = useMe();
  const logout = useLogout();
  return (
    <main className="grid min-h-screen place-items-center gap-4">
      <p>Signed in as {data?.email}</p>
      <button type="button" onClick={() => logout.mutate()}>
        Log out
      </button>
    </main>
  );
}
