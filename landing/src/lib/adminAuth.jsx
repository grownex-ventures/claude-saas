import { createContext, useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { adminApi, adminTokenStore } from "@/lib/adminApi";

const AdminAuthContext = createContext({
  admin: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {}
});

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const data = await adminApi.getMe();
      if (data?.admin) {
        setAdmin(data.admin);
      } else {
        setAdmin(null);
      }
    } catch {
      setAdmin(null);
      adminTokenStore.clear();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const logout = async () => {
    await adminApi.logout();
    setAdmin(null);
  };

  return (
    <AdminAuthContext.Provider value={{ admin, loading, refresh, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminSession() {
  return useContext(AdminAuthContext);
}

export function RequireAdmin({ children }) {
  const { admin, loading } = useAdminSession();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <span className="text-sm font-medium">Validating Super Admin session...</span>
        </div>
      </div>
    );
  }

  if (!admin) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  return children;
}

export function AdminGuestOnly({ children }) {
  const { admin, loading } = useAdminSession();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (admin) {
    return <Navigate to="/admin" replace />;
  }

  return children;
}

