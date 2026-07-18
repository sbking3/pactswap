import { Route, Switch, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

import { AuthProvider } from '@/contexts/AuthContext';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';

// Pages
import Home from '@/pages/Home';
import Signup from '@/pages/Signup';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Marketplace from '@/pages/Marketplace';
import CreateOffer from '@/pages/CreateOffer';
import Orders from '@/pages/Orders';
import OrderDetail from '@/pages/OrderDetail';
import Profile from '@/pages/Profile';
import KYC from '@/pages/KYC';
import SecuritySettings from '@/pages/SecuritySettings';
import UserProfile from '@/pages/UserProfile';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/signup" component={Signup} />
        <Route path="/login" component={Login} />
        <Route path="/users/:walletAddress" component={UserProfile} />
        
        {/* Protected Routes */}
        <Route path="/dashboard">
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        </Route>
        
        <Route path="/marketplace">
          <ProtectedRoute>
            <Marketplace />
          </ProtectedRoute>
        </Route>
        
        <Route path="/offers/create">
          <ProtectedRoute>
            <CreateOffer />
          </ProtectedRoute>
        </Route>
        
        <Route path="/orders">
          <ProtectedRoute>
            <Orders />
          </ProtectedRoute>
        </Route>
        
        <Route path="/orders/:id">
          <ProtectedRoute>
            <OrderDetail />
          </ProtectedRoute>
        </Route>
        
        <Route path="/profile">
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        </Route>

        <Route path="/kyc">
          <ProtectedRoute>
            <KYC />
          </ProtectedRoute>
        </Route>
        
        <Route path="/settings/security">
          <ProtectedRoute>
            <SecuritySettings />
          </ProtectedRoute>
        </Route>

        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster theme="dark" position="top-center" />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;