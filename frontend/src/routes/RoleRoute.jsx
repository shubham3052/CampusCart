import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FullPageLoader } from '../components/common/Loader';

const RoleRoute = ({ allowedRole }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <FullPageLoader message="Verifying user permissions..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If user active role does not match allowed role, redirect to appropriate role portal
  const currentRole = user.active_role || user.role;
  if (currentRole !== allowedRole) {
    if (currentRole === 'PLATFORM_OWNER') {
      return <Navigate to="/platform-owner/dashboard" replace />;
    }
    if (currentRole === 'STUDENT') {
      return <Navigate to="/student/home" replace />;
    }
    if (currentRole === 'SHOP_OWNER') {
      return <Navigate to="/shop-owner/dashboard" replace />;
    }
    if (currentRole === 'DELIVERY_AGENT') {
      return <Navigate to="/delivery-agent/deliveries" replace />;
    }
    if (currentRole === 'ADMIN') {
      return <Navigate to="/admin/dashboard" replace />;
    }
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default RoleRoute;
