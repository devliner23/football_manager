import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AuthProps } from '../../types';
import './Auth.css';

const Login: React.FC<AuthProps> = ({ onSwitchToRegister }) => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  
  const { login, error: authError, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLocalError('');
    setSuccessMessage('');
    
    if (!email || !password) {
      setLocalError('Please fill in all fields');
      return;
    }
    
    setLoading(true);
    try {
      const result = await login({ email, password });
      
      if (result.success) {
        setSuccessMessage('Login successful! Redirecting...');
        // Navigate to dashboard after a short delay
        setTimeout(() => {
          navigate('/dashboard');
        }, 500);
      } else {
        setLocalError(result.error || 'Login failed');
      }
    } catch (error: any) {
      setLocalError(error.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Welcome Back</h2>
        <p className="auth-subtitle">Sign in to continue your basketball career</p>
        
        {successMessage && (
          <div className="success-message">{successMessage}</div>
        )}
        
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              disabled={loading}
              autoComplete="email"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={loading}
              autoComplete="current-password"
            />
          </div>
          
          {(localError || authError) && (
            <div className="error-message">{localError || authError}</div>
          )}
          
          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        
        <div className="auth-footer">
          <p>
            Don't have an account?{' '}
            <button 
              onClick={onSwitchToRegister} 
              className="auth-link-button"
              disabled={loading}
            >
              Create one
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;