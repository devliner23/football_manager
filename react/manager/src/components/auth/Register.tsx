import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Auth.css';

interface RegisterProps {
  onSwitchToLogin: () => void;
}

const Register: React.FC<RegisterProps> = ({ onSwitchToLogin }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    username: '',
    full_name: '',
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  
  const { register, error: authError, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.id]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLocalError('');
    setSuccessMessage('');
    
    const { email, password, confirmPassword, username, full_name } = formData;
    
    if (!email || !password || !confirmPassword || !username) {
      setLocalError('Please fill in all required fields');
      return;
    }
    
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }
    
    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters');
      return;
    }
    
    setLoading(true);
    try {
      const result = await register({ 
        email, 
        password, 
        username,
        full_name: full_name || username 
      });
      
      if (result.success) {
        setSuccessMessage('Registration successful! Redirecting...');
        setTimeout(() => {
          navigate('/dashboard');
        }, 500);
      } else {
        const errorMsg = typeof result.error === 'string' 
          ? result.error 
          : 'Registration failed. Please try again.';
        setLocalError(errorMsg);
      }
    } catch (error: any) {
      const errorMsg = error?.response?.data?.error || 'Registration failed. Please try again.';
      setLocalError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Create Account</h2>
        <p className="auth-subtitle">Start your journey to basketball greatness</p>
        
        {successMessage && (
          <div className="success-message">{successMessage}</div>
        )}
        
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="username">Username *</label>
            <input
              id="username"
              type="text"
              value={formData.username}
              onChange={handleChange}
              placeholder="Choose a username"
              disabled={loading}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="full_name">Full Name</label>
            <input
              id="full_name"
              type="text"
              value={formData.full_name}
              onChange={handleChange}
              placeholder="Your full name (optional)"
              disabled={loading}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="email">Email *</label>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Enter your email"
              disabled={loading}
              required
              autoComplete="email"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password *</label>
            <input
              id="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Create a password (min 6 characters)"
              disabled={loading}
              required
              autoComplete="new-password"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password *</label>
            <input
              id="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Confirm your password"
              disabled={loading}
              required
              autoComplete="new-password"
            />
          </div>
          
          {(localError || authError) && (
            <div className="error-message">{localError || authError}</div>
          )}
          
          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>
        
        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <button 
              onClick={onSwitchToLogin} 
              className="auth-link-button"
              disabled={loading}
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;