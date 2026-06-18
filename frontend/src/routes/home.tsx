import { useNavigate } from "@tanstack/react-router";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { useLogout, useMe } from "../lib/queries";

export function HomePage() {
  const { data } = useMe();
  const navigate = useNavigate();
  const logout = useLogout();

  const onLogout = async () => {
    await logout.mutateAsync();
    await navigate({ to: "/login" });
  };

  return (
    <main className="grid min-h-screen place-items-center bg-gray-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>tatagereja</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            Signed in as <span className="font-medium text-gray-900">{data?.email}</span>
          </p>
          <Button variant="outline" onClick={onLogout} disabled={logout.isPending}>
            Log out
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
