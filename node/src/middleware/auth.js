const { supabase } = require('../config/supabase');
const jwt = require('jsonwebtoken');

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please provide a valid token'
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          error: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
      }
      return res.status(401).json({ 
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }
    
    // Verify user exists in Supabase
    const { data: user, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', decoded.id)
      .single();
    
    if (error || !user) {
      return res.status(401).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // Attach user to request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      username: decoded.username || user.username,
      ...user
    };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ 
      error: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
};

module.exports = authMiddleware;