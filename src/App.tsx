import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { LeadsProvider } from "@/contexts/LeadsContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { lazy, Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import NotFound from "./pages/NotFound";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const LeadsPage = lazy(() => import("./pages/LeadsPage"));
const FunnelPage = lazy(() => import("./pages/FunnelPage"));
const AssistantPage = lazy(() => import("./pages/AssistantPage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const WhatsAppPage = lazy(() => import("./pages/WhatsAppPage"));
const FollowUpPage = lazy(() => import("./pages/FollowUpPage"));
const TodayPage = lazy(() => import("./pages/TodayPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ActivityPage = lazy(() => import("./pages/ActivityPage"));

const queryClient = new QueryClient();

function SuspenseWrap({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Carregando...</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <LeadsProvider>
      <AppLayout>
        <Routes>
          <Route path="/" element={<SuspenseWrap><Dashboard /></SuspenseWrap>} />
          <Route path="/today" element={<SuspenseWrap><TodayPage /></SuspenseWrap>} />
          <Route path="/leads" element={<SuspenseWrap><LeadsPage /></SuspenseWrap>} />
          <Route path="/funnel" element={<SuspenseWrap><FunnelPage /></SuspenseWrap>} />
          <Route path="/assistant" element={<SuspenseWrap><AssistantPage /></SuspenseWrap>} />
          <Route path="/whatsapp" element={<SuspenseWrap><WhatsAppPage /></SuspenseWrap>} />
          <Route path="/follow-up" element={<SuspenseWrap><FollowUpPage /></SuspenseWrap>} />
          <Route path="/settings" element={<SuspenseWrap><SettingsPage /></SuspenseWrap>} />
          <Route path="/activity" element={<SuspenseWrap><ActivityPage /></SuspenseWrap>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppLayout>
    </LeadsProvider>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to="/" replace /> : <SuspenseWrap><AuthPage /></SuspenseWrap>} />
      <Route path="/*" element={<ProtectedRoutes />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
