import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App, { AccountPage, LoginPage } from './App.tsx'
import { I18nProvider } from './i18n.ts'
import { AdminPortal, InvitationPage, RestaurantPortal } from './Portal.tsx'
import { RestaurantPage } from './RestaurantPage.tsx'
import { DiscoveryPage } from './DiscoveryPage.tsx'
import './index.css'

const rootRoute = createRootRoute({ component: Outlet })
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: App,
})
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})
const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/account',
  component: AccountPage,
})
const discoveryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/restaurants',
  component: DiscoveryPage,
})
const restaurantPortalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/restaurant-portal',
  component: RestaurantPortal,
})
const restaurantRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/restaurant/$slug',
  component: RestaurantPage,
})
const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  component: AdminPortal,
})
const invitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/restaurant-invite/$token',
  component: InvitationPage,
})
const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  accountRoute,
  discoveryRoute,
  restaurantPortalRoute,
  restaurantRoute,
  adminRoute,
  invitationRoute,
])
const router = createRouter({ routeTree })
const queryClient = new QueryClient()

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
)
