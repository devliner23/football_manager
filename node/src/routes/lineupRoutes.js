// routes/lineupRoutes.js
const express = require('express');
const router = express.Router();
const lineupController = require('../controllers/lineupController');
const authMiddleware  = require('../middleware/auth'); 

router.use(authMiddleware);

router.get('/:savedGameId/:teamId', lineupController.getLineup);
router.put('/:savedGameId/:teamId', lineupController.setLineup);
router.post('/:savedGameId/:teamId/auto', lineupController.resetLineup);

module.exports = router;