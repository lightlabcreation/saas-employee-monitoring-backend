const express = require('express');
const router = express.Router();
const invitationsController = require('./invitations.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');

// Onboarding layer invitation actions
router.post('/invite', authMiddleware, roleMiddleware(['ADMIN', 'MANAGER']), invitationsController.inviteEmployee);
router.get('/validate-activation/:token', invitationsController.validateToken);
router.post('/activate', invitationsController.activateEmployee);

module.exports = router;
