const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Public auth routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/refresh-token', authController.refreshToken);
router.get('/verify', authController.verifyToken);

module.exports = router;