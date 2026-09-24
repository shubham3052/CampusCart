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

  // If user role does not match allowed role, redirect to appropriate role portal
  if (user.role !== allowedRole) {
    if (user.role === 'PLATFORM_OWNER') {
      return <Navigate to="/platform-owner/dashboard" replace />;
    }
    if (user.role === 'STUDENT') {
      return <Navigate to="/student/home" replace />;
    }
    if (user.role === 'SHOP_OWNER') {
      return <Navigate to="/shop-owner/dashboard" replace />;
    }
    if (user.role === 'DELIVERY_AGENT') {
      return <Navigate to="/delivery-agent/deliveries" replace />;
    }
    if (user.role === 'ADMIN') {
      return <Navigate to="/admin/dashboard" replace />;
    }
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default RoleRoute;
