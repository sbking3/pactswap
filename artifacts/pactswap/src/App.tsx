import { Switch, Route, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

import { AuthProvider } from '@/contexts/AuthContext';
import { SupabaseAuthProvider } from '@/contexts/SupabaseAuthContext';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';

import Home from '@/pages/Home';
import Login from '@/pages/Login';
import WalletLogin from '@/pages/WalletLogin';
import Signup from '@/pages/Signup';
import Marketplace from '@/pages/Marketplace';
import Dashboard from '@/pages/Dashboard';
import Orders from '@/pages/Orders';
import OrderDetail from '@/pages/OrderDetail';
import MyOffers from '@/pages/MyOffers';
import CreateOffer from '@/pages/CreateOffer';
import Profile from '@/pages/Profile';
import SecuritySettings from '@/pages/SecuritySettings';
import UserProfile from '@/pages/UserProfile';
import Admin from '@/pages/Admin';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const protectedPage = (Page: React.ComponentType) => () => (
  <ProtectedRoute>
    <Page />
  </ProtectedRoute>
);

function Routes() {
  return (
    <Switch>
      {/* Homepage is the marketplace */}
      <Route path="/" component={Marketplace} />
      <Route path="/marketplace" component={Marketplace} />
      <Route path="/welcome" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/login/wallet" component={WalletLogin} />
      <Route path="/signup" component={Signup} />
      <Route path="/users/:walletAddress" component={UserProfile} />

      <Route path="/dashboard" component={protectedPage(Dashboard)} />
      <Route path="/orders" component={protectedPage(Orders)} />
      <Route path="/orders/:id" component={protectedPage(OrderDetail)} />
      <Route path="/my-offers" component={protectedPage(MyOffers)} />
      <Route path="/offers/create" component={protectedPage(CreateOffer)} />
      <Route path="/profile" component={protectedPage(Profile)} />
      <Route path="/settings/security" component={protectedPage(SecuritySettings)} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return (
    <QueryClientProvider client={queryClient}>
      <SupabaseAuthProvider>
      <AuthProvider>
        <WouterRouter base={base}>
          <Switch>
            {/* Admin renders its own Layout */}
            <Route path="/admin" component={protectedPage(Admin)} />
            <Route>
              <Layout>
                <Routes />
              </Layout>
            </Route>
          </Switch>
        </WouterRouter>
        <Toaster richColors position="top-right" />
      </AuthProvider>
      </SupabaseAuthProvider>
    </QueryClientProvider>
  );
}

export default App;
