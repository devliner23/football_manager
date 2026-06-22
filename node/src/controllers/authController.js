const { supabase, supabaseAdmin } = require('../config/supabase');
const jwt = require('jsonwebtoken');

const authController = {
  // Register a new user
  async register(req, res, next) {
    try {
      console.log('📝 Registration attempt:', req.body.email);
      
      const { email, password, username, full_name } = req.body;

      // Validate input
      if (!email || !password || !username) {
        console.log('❌ Missing fields:', { email: !!email, password: !!password, username: !!username });
        return res.status(400).json({ 
          success: false,
          error: 'Email, password, and username are required' 
        });
      }

      // Register user with Supabase Auth - auto-confirm for development
      console.log('📡 Registering with Supabase Auth...');
      
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username,
            full_name: full_name || username
          },
          // For development, you can auto-confirm
          emailRedirectTo: undefined
        }
      });

      if (authError) {
        console.error('❌ Auth error:', authError);
        return res.status(400).json({
          success: false,
          error: authError.message || 'Registration failed'
        });
      }

      if (!authData.user) {
        console.error('❌ No user data returned');
        return res.status(500).json({
          success: false,
          error: 'Registration failed - no user data'
        });
      }

      console.log('✅ User created in Auth:', authData.user.id);

      // If email confirmation is required, we can auto-confirm with admin API
      if (authData.user.confirmed_at === null) {
        console.log('📧 User email not confirmed, auto-confirming for development...');
        try {
          // Auto-confirm the user using admin API
          await supabaseAdmin.auth.admin.updateUserById(authData.user.id, {
            email_confirm: true
          });
          console.log('✅ User auto-confirmed');
        } catch (confirmError) {
          console.error('⚠️ Auto-confirm failed:', confirmError);
          // Continue anyway - user can still login if email confirmation is disabled
        }
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          id: authData.user.id,
          email: email,
          username: username
        },
        process.env.JWT_SECRET || 'fallback-secret-key-for-development',
        { expiresIn: '7d' }
      );

      console.log('✅ Registration successful for:', email);

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        user: {
          id: authData.user.id,
          email: email,
          username: username,
          full_name: full_name || null,
          avatar_url: null,
          preferred_team_id: null
        },
        token
      });

    } catch (error) {
      console.error('❌ Registration error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    }
  },
  
  // Login user
  async login(req, res, next) {
    try {
        console.log('🔐 Login attempt:', req.body.email);
        const { email, password } = req.body;

        if (!email || !password) {
        return res.status(400).json({
            success: false,
            error: 'Email and password are required'
        });
        }

        // 1. Authenticate with Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
        });

        // 2. Handle authentication errors
        if (authError) {
        console.error('❌ Auth error:', authError);

        // Optionally handle email confirmation (you can keep or remove this)
        if (authError.code === 'email_not_confirmed') {
            return res.status(401).json({
            success: false,
            error: 'Please confirm your email before logging in.'
            });
        }

        return res.status(401).json({
            success: false,
            error: 'Invalid email or password'
        });
        }

        // 3. Extract user data from auth response
        const user = authData.user;
        const metadata = user.user_metadata || {};

        // 4. Generate your own JWT (or use Supabase access token)
        const token = jwt.sign(
        {
            id: user.id,
            email: user.email,
            username: metadata.username || user.email.split('@')[0],
            full_name: metadata.full_name || null
        },
        process.env.JWT_SECRET || 'fallback-secret-key-for-development',
        { expiresIn: '7d' }
        );

        // 5. (Optional) Update last_login – you can skip this or use a separate table
        // but we'll leave it out since we're profile‑less.

        console.log('✅ Login successful for:', email);

        return res.json({
        success: true,
        message: 'Login successful',
        user: {
            id: user.id,
            email: user.email,
            username: metadata.username || user.email.split('@')[0],
            full_name: metadata.full_name || null,
            avatar_url: metadata.avatar_url || null
            // Add any other fields you might have stored in metadata
        },
        token
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({
        success: false,
        error: error.message || 'Internal server error'
        });
    }
  },

  // Verify token
  async verifyToken(req, res, next) {
    try {
      const token = req.headers.authorization?.split(' ')[1];

      if (!token) {
        return res.status(401).json({ 
          success: false,
          error: 'No token provided' 
        });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key-for-development');

      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', decoded.id)
        .single();

      if (profileError || !profile) {
        return res.status(401).json({ 
          success: false,
          error: 'User not found' 
        });
      }

      res.json({
        success: true,
        user: {
          id: profile.id,
          email: profile.email,
          username: profile.username,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          preferred_team_id: profile.preferred_team_id
        }
      });

    } catch (error) {
      console.error('❌ Token verification error:', error);
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ 
          success: false,
          error: 'Invalid token' 
        });
      }
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          success: false,
          error: 'Token expired' 
        });
      }
      res.status(500).json({
        success: false,
        error: 'Token verification failed'
      });
    }
  },

  // Logout
  async logout(req, res, next) {
    try {
      await supabase.auth.signOut();
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      console.error('❌ Logout error:', error);
      res.status(500).json({
        success: false,
        error: 'Logout failed'
      });
    }
  },

  // Refresh token
  async refreshToken(req, res, next) {
    try {
      const { refresh_token } = req.body;

      if (!refresh_token) {
        return res.status(400).json({ 
          success: false,
          error: 'Refresh token required' 
        });
      }

      const { data, error } = await supabase.auth.refreshSession({
        refresh_token
      });

      if (error) {
        console.error('❌ Refresh token error:', error);
        return res.status(401).json({
          success: false,
          error: 'Invalid refresh token'
        });
      }

      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      const token = jwt.sign(
        { 
          id: data.user.id,
          email: profile?.email || data.user.email,
          username: profile?.username || data.user.email
        },
        process.env.JWT_SECRET || 'fallback-secret-key-for-development',
        { expiresIn: '7d' }
      );

      res.json({
        success: true,
        token,
        refresh_token: data.session.refresh_token
      });

    } catch (error) {
      console.error('❌ Refresh token error:', error);
      res.status(500).json({
        success: false,
        error: 'Token refresh failed'
      });
    }
  }
};

// Helper function for login
async function performLogin(email, password, profile, res) {
  try {
    console.log('✅ Profile found for email:', email);

    // Sign in with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      console.error('❌ Login auth error:', authError);
      
      // If email not confirmed, try to auto-confirm and retry
      if (authError.code === 'email_not_confirmed') {
        console.log('📧 Email not confirmed, attempting auto-confirm...');
        try {
          // Auto-confirm the user
          const { data: userData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            profile.id,
            { email_confirm: true }
          );
          
          if (!updateError) {
            console.log('✅ User auto-confirmed, retrying login...');
            // Retry login
            const { data: retryAuth, error: retryError } = await supabase.auth.signInWithPassword({
              email,
              password
            });
            
            if (!retryError && retryAuth.user) {
              // Login successful after auto-confirm
              const token = jwt.sign(
                { 
                  id: retryAuth.user.id,
                  email: profile.email,
                  username: profile.username
                },
                process.env.JWT_SECRET || 'fallback-secret-key-for-development',
                { expiresIn: '7d' }
              );

              // Update last_login
              await supabaseAdmin
                .from('profiles')
                .update({ 
                  last_login: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                })
                .eq('id', retryAuth.user.id);

              console.log('✅ Login successful after auto-confirm for:', email);

              return res.json({
                success: true,
                message: 'Login successful',
                user: {
                  id: retryAuth.user.id,
                  email: profile.email,
                  username: profile.username,
                  full_name: profile.full_name || null,
                  avatar_url: profile.avatar_url || null,
                  preferred_team_id: profile.preferred_team_id || null
                },
                token
              });
            }
          }
        } catch (confirmError) {
          console.error('❌ Auto-confirm failed:', confirmError);
        }
        
        return res.status(401).json({ 
          success: false,
          error: 'Email not confirmed. Please check your email or contact support.' 
        });
      }
      
      return res.status(401).json({ 
        success: false,
        error: 'Invalid email or password' 
      });
    }

    // Update last_login
    try {
      await supabaseAdmin
        .from('profiles')
        .update({ 
          last_login: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', authData.user.id);
      
      console.log('✅ Updated last_login for user:', authData.user.id);
    } catch (updateError) {
      console.error('⚠️ Failed to update last_login:', updateError);
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: authData.user.id,
        email: profile.email,
        username: profile.username
      },
      process.env.JWT_SECRET || 'fallback-secret-key-for-development',
      { expiresIn: '7d' }
    );

    console.log('✅ Login successful for:', email);

    return res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: authData.user.id,
        email: profile.email,
        username: profile.username,
        full_name: profile.full_name || null,
        avatar_url: profile.avatar_url || null,
        preferred_team_id: profile.preferred_team_id || null
      },
      token
    });

  } catch (error) {
    console.error('❌ Login helper error:', error);
    throw error;
  }
}

module.exports = authController;