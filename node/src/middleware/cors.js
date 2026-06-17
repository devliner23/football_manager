// Complete CORS middleware - allows all origins
const corsMiddleware = (req, res, next) => {
  // Allow all origins
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'false');
  res.header('Access-Control-Max-Age', '86400');
  
  // Handle preflight - send 200 and return
  if (req.method === 'OPTIONS') {
    console.log('🔄 Preflight request handled for:', req.url);
    return res.sendStatus(200);
  }
  
  next();
};

module.exports = corsMiddleware;