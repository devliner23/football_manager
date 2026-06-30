const express = require('express');
const corsMiddleware = require('./middleware/cors'); 
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const gameRoutes = require('./routes/gameRoutes');
const teamRoutes = require('./routes/teamRoutes');
const leagueRoutes = require('./routes/leagueRoutes');
const lineupRoutes = require("./routes/lineupRoutes");

const app = express();

app.use(corsMiddleware);

const errorHandler = require('./middleware/errorHandler');

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));

// Public routes (no authentication required)
app.use('/api/auth', authRoutes);

// Protected routes (authentication required)
app.use('/api/users', userRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/league', leagueRoutes);
app.use('/api/lineup', lineupRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    message: 'Basketball GM API is running'
  });
});

// Error handling middleware (should be last)
app.use(errorHandler);

module.exports = app;