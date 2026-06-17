const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');

// Load environment variables
dotenv.config();

// Import app
const app = require('./src/app');

const PORT = process.env.PORT || 8000;

// Enable trust proxy for cookies in production
app.set('trust proxy', 1);

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Supabase URL: ${process.env.SUPABASE_URL ? 'Configured ✅' : 'Missing ❌'}`);
});