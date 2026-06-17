const errorHandler = (err, req, res, next) => {
  console.error('Error:', err.stack);
  
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  
  // Always return a flat error object for the frontend
  res.status(status).json({
    success: false,
    error: message,  // Send just the error message as a string
    // Only include stack in development
    ...(process.env.NODE_ENV === 'development' && { 
      details: err.stack 
    })
  });
};

module.exports = errorHandler;