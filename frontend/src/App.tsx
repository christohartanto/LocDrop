import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useSession } from "./auth/session";
import { AppShell } from "./components/AppShell";
import { LocationOverride } from "./dev/LocationOverride";
import { AuthPage } from "./pages/AuthPage";
import { ComposePage } from "./pages/ComposePage";
import { MyNotesPage } from "./pages/MyNotesPage";
import { NotePage } from "./pages/NotePage";

// The map library is big, so it is only downloaded after login.
const MapPage = lazy(() => import("./pages/MapPage").then((m) => ({ default: m.MapPage })));

export function App() {
  const { username } = useSession();

  return (
    <>
      {username ? (
        <AppShell>
          <Routes>
            <Route
              path="/"
              element={
                <Suspense fallback={<div className="mappage" />}>
                  <MapPage />
                </Suspense>
              }
            />
            <Route path="/note/:id" element={<NotePage />} />
            <Route path="/new" element={<ComposePage />} />
            <Route path="/mine" element={<MyNotesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      ) : (
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      )}
      <LocationOverride />
    </>
  );
}
