// middleware/corsMiddleware.js
const corsMiddleware = (req, res, next) => {
  // Get the origin from the request header
  const origin = req.headers.origin;
  
  // List of allowed origins (add your production domains here)
  const allowedOrigins = ['http://localhost:3000', 'http://localhost:8000'];
  
  // Set the origin if it's allowed, otherwise fallback to localhost:3000
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    // For development, you can also echo the origin back (but be careful in production)
    res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');  // <-- important
  res.header('Access-Control-Max-Age', '86400');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    console.log('🔄 Preflight request handled for:', req.url);
    return res.sendStatus(200);
  }
  
  next();
};

module.exports = corsMiddleware;