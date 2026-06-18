// middleware/auth.js
const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('../config/supabase'); // if using Supabase

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.log('No Authorization header');
      return res.status(401).json({ error: 'No token provided' });
    }
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      console.log('Invalid Authorization format');
      return res.status(401).json({ error: 'Invalid token format' });
    }
    const token = parts[1];
    console.log('Token received:', token.substring(0, 20) + '...');

    // Option 1: If using custom JWT
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded; // attach user info
      console.log('Token verified, user:', decoded.id);
      next();
    } catch (jwtError) {
      console.error('JWT verification failed:', jwtError.message);
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Option 2: If using Supabase
    // const { data: user, error } = await supabaseAdmin.auth.api.getUser(token);
    // if (error) {
    //   console.error('Supabase token verification error:', error);
    //   return res.status(401).json({ error: 'Invalid token' });
    // }
    // req.user = user;
    // next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = authMiddleware;