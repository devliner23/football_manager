import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import Dashboard from './components/dashboard/Dashboard';
import './index.css';

// Floating orbs component
const BackgroundOrbs: React.FC = () => (
  <>
    <div className="floating-orb orb-1"></div>
    <div className="floating-orb orb-2"></div>
    <div className="floating-orb orb-3"></div>
  </>
);

// Protected Route component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="loading-screen">
        <BackgroundOrbs />
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

// Auth wrapper for login/register pages
const AuthPage: React.FC<{ 
  children: React.ReactNode;
}> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="loading-screen">
        <BackgroundOrbs />
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }
  
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return (
    <>
      <BackgroundOrbs />
      {children}
    </>
  );
};

// Main App Content
const AppContent: React.FC = () => {
  const [showRegister, setShowRegister] = useState<boolean>(false);

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      
      <Route path="/login" element={
        <AuthPage>
          <Login onSwitchToRegister={() => setShowRegister(true)} />
        </AuthPage>
      } />
      
      <Route path="/register" element={
        <AuthPage>
          <Register onSwitchToLogin={() => setShowRegister(false)} />
        </AuthPage>
      } />
      
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      } />
      
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;