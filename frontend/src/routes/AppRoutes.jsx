import React from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Layouts
import StudentLayout from '../layouts/StudentLayout';
import ShopOwnerLayout from '../layouts/ShopOwnerLayout';
import AdminLayout from '../layouts/AdminLayout';
import PlatformOwnerLayout from '../layouts/PlatformOwnerLayout';

// Guards
import ProtectedRoute from './ProtectedRoute';
import RoleRoute from './RoleRoute';

// Auth Pages
import Login from '../pages/auth/Login';
import Register from '../pages/auth/Register';
import ForgotPassword from '../pages/auth/ForgotPassword';
import PlatformOwnerLogin from '../pages/platformOwner/PlatformOwnerLogin';

// Platform Owner Pages
import PlatformOwnerDashboard from '../pages/platformOwner/PlatformOwnerDashboard';
import PlatformOwnerAdmins from '../pages/platformOwner/PlatformOwnerAdmins';
import PlatformOwnerUsers from '../pages/platformOwner/PlatformOwnerUsers';
import PlatformOwnerShopOwners from '../pages/platformOwner/PlatformOwnerShopOwners';
import PlatformOwnerShops from '../pages/platformOwner/PlatformOwnerShops';
import PlatformOwnerDeliveries from '../pages/platformOwner/PlatformOwnerDeliveries';
import PlatformOwnerOrders from '../pages/platformOwner/PlatformOwnerOrders';
import PlatformOwnerPayments from '../pages/platformOwner/PlatformOwnerPayments';
import PlatformOwnerInventory from '../pages/platformOwner/PlatformOwnerInventory';
import PlatformOwnerPredictions from '../pages/platformOwner/PlatformOwnerPredictions';
import PlatformOwnerPrinting from '../pages/platformOwner/PlatformOwnerPrinting';
import PlatformOwnerOffers from '../pages/platformOwner/PlatformOwnerOffers';
import PlatformOwnerLocations from '../pages/platformOwner/PlatformOwnerLocations';
import PlatformOwnerAuditLogs from '../pages/platformOwner/PlatformOwnerAuditLogs';
import PlatformOwnerNotifications from '../pages/platformOwner/PlatformOwnerNotifications';
import PlatformOwnerProfile from '../pages/platformOwner/PlatformOwnerProfile';

// Student Pages
import StudentHome from '../pages/student/StudentHome';
import StudentShops from '../pages/student/StudentShops';
import ShopDetail from '../pages/student/ShopDetail';
import ProductDetail from '../pages/student/ProductDetail';
import StudentCart from '../pages/student/StudentCart';
import StudentCheckout from '../pages/student/StudentCheckout';
import StudentOrders from '../pages/student/StudentOrders';
import StudentOrderDetail from '../pages/student/StudentOrderDetail';
import StudentPrinting from '../pages/student/StudentPrinting';
import StudentPrintOrders from '../pages/student/StudentPrintOrders';
import StudentPrintOrderDetail from '../pages/student/StudentPrintOrderDetail';
import StudentProfile from '../pages/student/StudentProfile';
import StudentAddresses from '../pages/student/StudentAddresses';
import StudentPlanner from '../pages/student/StudentPlanner';
import StudentBulkOrders from '../pages/student/StudentBulkOrders';
import StudentBulkOrderDetail from '../pages/student/StudentBulkOrderDetail';
import StudentWishlist from '../pages/student/StudentWishlist';
import StudentFavorites from '../pages/student/StudentFavorites';
import StudentOffers from '../pages/student/StudentOffers';
import StudentComplaints from '../pages/student/StudentComplaints';
import StudentNotificationPreferences from '../pages/student/StudentNotificationPreferences';
import StudentNotifications from '../pages/student/StudentNotifications';
import StudentPayments from '../pages/student/StudentPayments';

// Shop Owner Pages
import ShopOwnerDashboard from '../pages/shopOwner/ShopOwnerDashboard';
import ShopOwnerPrintingQueue from '../pages/shopOwner/ShopOwnerPrintingQueue';
import ShopOwnerPickupSlots from '../pages/shopOwner/ShopOwnerPickupSlots';
import ShopOwnerOrders from '../pages/shopOwner/ShopOwnerOrders';
import ShopOwnerDelivery from '../pages/shopOwner/ShopOwnerDelivery';
import ShopOwnerProducts from '../pages/shopOwner/ShopOwnerProducts';
import ShopOwnerInventory from '../pages/shopOwner/ShopOwnerInventory';
import ShopOwnerDemandPrediction from '../pages/shopOwner/ShopOwnerDemandPrediction';
import ShopOwnerPurchaseAdvisor from '../pages/shopOwner/ShopOwnerPurchaseAdvisor';
import ShopOwnerBulkPricing from '../pages/shopOwner/ShopOwnerBulkPricing';
import ShopOwnerReviews from '../pages/shopOwner/ShopOwnerReviews';
import ShopOwnerOffers from '../pages/shopOwner/ShopOwnerOffers';
import ShopOwnerPayments from '../pages/shopOwner/ShopOwnerPayments';
import ShopOwnerAnalytics from '../pages/shopOwner/ShopOwnerAnalytics';
import ShopOwnerLocation from '../pages/shopOwner/ShopOwnerLocation';
import ShopOwnerProfile from '../pages/shopOwner/ShopOwnerProfile';
import ShopOwnerNotifications from '../pages/shopOwner/ShopOwnerNotifications';
import ShopOwnerCustomers from '../pages/shopOwner/ShopOwnerCustomers';

// Delivery Agent Pages & Layouts
import DeliveryAgentLayout from '../layouts/DeliveryAgentLayout';
import DeliveryAgentDashboard from '../pages/deliveryAgent/DeliveryAgentDashboard';
import DeliveryAgentProfile from '../pages/deliveryAgent/DeliveryAgentProfile';

// Admin Pages
import AdminDashboard from '../pages/admin/AdminDashboard';
import AdminProfile from '../pages/admin/AdminProfile';
import AdminAnalytics from '../pages/admin/AdminAnalytics';
import AdminDemandAnalytics from '../pages/admin/AdminDemandAnalytics';
import AdminAcademicCalendar from '../pages/admin/AdminAcademicCalendar';
import AdminRecommendations from '../pages/admin/AdminRecommendations';
import AdminReviewsModeration from '../pages/admin/AdminReviewsModeration';
import AdminComplaintsManagement from '../pages/admin/AdminComplaintsManagement';
import AdminOffersManagement from '../pages/admin/AdminOffersManagement';
import AdminPaymentsDashboard from '../pages/admin/AdminPaymentsDashboard';
import AdminReports from '../pages/admin/AdminReports';
import AdminUsers from '../pages/admin/AdminUsers';
import AdminShopOwners from '../pages/admin/AdminShopOwners';
import AdminNotifications from '../pages/admin/AdminNotifications';
import AdminLogin from '../pages/admin/AdminLogin';
import AdminInvitationVerify from '../pages/admin/AdminInvitationVerify';
import AdminManagement from '../pages/admin/AdminManagement';
import AdminProducts from '../pages/admin/AdminProducts';
import AdminCategories from '../pages/admin/AdminCategories';
import AdminOrders from '../pages/admin/AdminOrders';
import AdminPrinting from '../pages/admin/AdminPrinting';
import AdminDeliveries from '../pages/admin/AdminDeliveries';

import { FullPageLoader } from '../components/common/Loader';

// Root redirect handler based on user role
const RootRedirect = () => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) return <FullPageLoader message="Loading Smart Stationery..." />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (user?.role === 'STUDENT') return <Navigate to="/student/home" replace />;
  if (user?.role === 'SHOP_OWNER') return <Navigate to="/shop-owner/dashboard" replace />;
  if (user?.role === 'DELIVERY_AGENT') return <Navigate to="/delivery-agent/deliveries" replace />;
  if (user?.role === 'ADMIN') return <Navigate to="/admin/dashboard" replace />;
  if (user?.role === 'PLATFORM_OWNER') return <Navigate to="/platform-owner/dashboard" replace />;

  return <Navigate to="/login" replace />;
};

// Direct /products/:productId and /shops/:shopId public shared link redirection helpers
const SharedProductRedirect = () => {
  const { productId } = useParams();
  return <Navigate to={`/student/products/${productId}`} replace />;
};

const SharedShopRedirect = () => {
  const { shopId } = useParams();
  return <Navigate to={`/student/shops/${shopId}`} replace />;
};

const AppRoutes = () => {
  return (
    <Routes>
      {/* Shared Public Direct Links (Reusing existing student product & shop pages) */}
      <Route path="/products/:productId" element={<SharedProductRedirect />} />
      <Route path="/shops/:shopId" element={<SharedShopRedirect />} />
      <Route path="/products" element={<Navigate to="/student/shops" replace />} />
      <Route path="/shops" element={<Navigate to="/student/shops" replace />} />

      {/* Public Authentication Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/platform-owner/login" element={<PlatformOwnerLogin />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/invitation/verify" element={<AdminInvitationVerify />} />
      <Route path="/owner/login" element={<Navigate to="/platform-owner/login" replace />} />
      <Route path="/owner/dashboard" element={<Navigate to="/platform-owner/dashboard" replace />} />
      <Route path="/owner/admin-management" element={<Navigate to="/platform-owner/admins" replace />} />
      <Route path="/owner/profile" element={<Navigate to="/platform-owner/profile" replace />} />

      {/* Root Route */}
      <Route path="/" element={<RootRedirect />} />

      {/* ============================================================ */}
      {/* STUDENT PORTAL (Mobile-first layout & STUDENT role) */}
      {/* ============================================================ */}
      <Route element={<ProtectedRoute />}>
        <Route element={<RoleRoute allowedRole="STUDENT" />}>
          <Route path="/student" element={<StudentLayout />}>
            <Route index element={<Navigate to="/student/home" replace />} />
            <Route path="home" element={<StudentHome />} />
            <Route path="shops" element={<StudentShops />} />
            <Route path="shops/:shopId" element={<ShopDetail />} />
            <Route path="products/:productId" element={<ProductDetail />} />
            <Route path="cart" element={<StudentCart />} />
            <Route path="checkout" element={<StudentCheckout />} />
            <Route path="orders" element={<StudentOrders />} />
            <Route path="orders/:orderId" element={<StudentOrderDetail />} />
            <Route path="printing" element={<StudentPrinting />} />
            <Route path="printing/orders" element={<StudentPrintOrders />} />
            <Route path="printing/orders/:id" element={<StudentPrintOrderDetail />} />
            <Route path="planner" element={<StudentPlanner />} />
            <Route path="bulk-orders" element={<StudentBulkOrders />} />
            <Route path="bulk-orders/:bulkOrderId" element={<StudentBulkOrderDetail />} />
            <Route path="addresses" element={<StudentAddresses />} />
            <Route path="wishlist" element={<StudentWishlist />} />
            <Route path="favorites" element={<StudentFavorites />} />
            <Route path="offers" element={<StudentOffers />} />
            <Route path="complaints" element={<StudentComplaints />} />
            <Route path="help" element={<StudentComplaints />} />
            <Route path="faq" element={<StudentComplaints />} />
            <Route path="notification-preferences" element={<StudentNotificationPreferences />} />
            <Route path="notifications" element={<StudentNotifications />} />
            <Route path="payments" element={<StudentPayments />} />
            <Route path="profile" element={<StudentProfile />} />
          </Route>
        </Route>
      </Route>

      {/* ============================================================ */}
      {/* SHOP OWNER PORTAL (Desktop SaaS layout & SHOP_OWNER role) */}
      {/* ============================================================ */}
      <Route element={<ProtectedRoute />}>
        <Route element={<RoleRoute allowedRole="SHOP_OWNER" />}>
          <Route path="/shop-owner" element={<ShopOwnerLayout />}>
            <Route index element={<Navigate to="/shop-owner/dashboard" replace />} />
            <Route path="dashboard" element={<ShopOwnerDashboard />} />
            <Route path="orders" element={<ShopOwnerOrders />} />
            <Route path="products" element={<ShopOwnerProducts />} />
            <Route path="inventory" element={<ShopOwnerInventory />} />
            <Route path="printing" element={<ShopOwnerPrintingQueue />} />
            <Route path="pickup-slots" element={<ShopOwnerPickupSlots />} />
            <Route path="delivery" element={<ShopOwnerDelivery />} />
            <Route path="customers" element={<ShopOwnerCustomers />} />
            <Route path="analytics" element={<ShopOwnerAnalytics />} />
            <Route path="payments" element={<ShopOwnerPayments />} />
            <Route path="sales" element={<ShopOwnerPayments />} />
            <Route path="demand-prediction" element={<ShopOwnerDemandPrediction />} />
            <Route path="purchase-advisor" element={<ShopOwnerPurchaseAdvisor />} />
            <Route path="bulk-pricing" element={<ShopOwnerBulkPricing />} />
            <Route path="reviews" element={<ShopOwnerReviews />} />
            <Route path="offers" element={<ShopOwnerOffers />} />
            <Route path="notifications" element={<ShopOwnerNotifications />} />
            <Route path="location" element={<ShopOwnerLocation />} />
            <Route path="profile" element={<ShopOwnerProfile />} />
            <Route path="settings" element={<ShopOwnerLocation />} />
          </Route>
        </Route>
      </Route>

      {/* ============================================================ */}
      {/* ADMIN PORTAL (Desktop layout & ADMIN role) */}
      {/* ============================================================ */}
      <Route element={<ProtectedRoute />}>
        <Route element={<RoleRoute allowedRole="ADMIN" />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="management" element={<AdminManagement />} />
            <Route path="admins" element={<AdminManagement />} />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="shop-owners" element={<AdminShopOwners />} />
            <Route path="shops" element={<AdminShopOwners />} />
            <Route path="products" element={<AdminProducts />} />
            <Route path="categories" element={<AdminCategories />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="printing" element={<AdminPrinting />} />
            <Route path="deliveries" element={<AdminDeliveries />} />
            <Route path="complaints" element={<AdminComplaintsManagement />} />
            <Route path="reviews" element={<AdminReviewsModeration />} />
            <Route path="offers" element={<AdminOffersManagement />} />
            <Route path="notifications" element={<AdminNotifications />} />
            <Route path="academic-calendar" element={<AdminAcademicCalendar />} />
            <Route path="recommendations" element={<AdminRecommendations />} />
            <Route path="demand-analytics" element={<AdminDemandAnalytics />} />
            <Route path="payments" element={<AdminPaymentsDashboard />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="profile" element={<AdminProfile />} />
          </Route>
        </Route>
      </Route>

      {/* ============================================================ */}
      {/* DELIVERY AGENT PORTAL (DELIVERY_AGENT role) */}
      {/* ============================================================ */}
      <Route element={<ProtectedRoute />}>
        <Route element={<RoleRoute allowedRole="DELIVERY_AGENT" />}>
          <Route path="/delivery-agent" element={<DeliveryAgentLayout />}>
            <Route index element={<Navigate to="/delivery-agent/deliveries" replace />} />
            <Route path="deliveries" element={<DeliveryAgentDashboard />} />
            <Route path="profile" element={<DeliveryAgentProfile />} />
          </Route>
        </Route>
      </Route>

      {/* ============================================================ */}
      {/* PLATFORM OWNER PORTAL (PLATFORM_OWNER role) */}
      {/* ============================================================ */}
      <Route element={<ProtectedRoute />}>
        <Route element={<RoleRoute allowedRole="PLATFORM_OWNER" />}>
          <Route path="/platform-owner" element={<PlatformOwnerLayout />}>
            <Route index element={<Navigate to="/platform-owner/dashboard" replace />} />
            <Route path="dashboard" element={<PlatformOwnerDashboard />} />
            <Route path="admins" element={<AdminManagement />} />
            <Route path="users" element={<PlatformOwnerUsers />} />
            <Route path="shop-owners" element={<PlatformOwnerShopOwners />} />
            <Route path="shops" element={<PlatformOwnerShops />} />
            <Route path="deliveries" element={<PlatformOwnerDeliveries />} />
            <Route path="orders" element={<PlatformOwnerOrders />} />
            <Route path="payments" element={<PlatformOwnerPayments />} />
            <Route path="inventory" element={<PlatformOwnerInventory />} />
            <Route path="predictions" element={<PlatformOwnerPredictions />} />
            <Route path="printing" element={<PlatformOwnerPrinting />} />
            <Route path="offers" element={<PlatformOwnerOffers />} />
            <Route path="locations" element={<PlatformOwnerLocations />} />
            <Route path="audit-logs" element={<PlatformOwnerAuditLogs />} />
            <Route path="notifications" element={<PlatformOwnerNotifications />} />
            <Route path="profile" element={<PlatformOwnerProfile />} />
          </Route>
        </Route>
      </Route>

      {/* Fallback 404 Route */}
      <Route
        path="*"
        element={
          <div style={{ textAlign: 'center', padding: '5rem 1rem' }}>
            <h1 style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--primary-600)' }}>404</h1>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.5rem 0 1rem' }}>Page Not Found</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>The page you are looking for does not exist.</p>
            <RootRedirect />
          </div>
        }
      />
    </Routes>
  );
};

export default AppRoutes;
