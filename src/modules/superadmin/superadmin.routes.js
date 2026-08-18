const express = require('express');
const router = express.Router();
const superAdminController = require('./superadmin.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
const roleMiddleware = require('../../middlewares/role.middleware');

// Protect all routes under this module so only SUPERADMIN is allowed
router.use(authMiddleware);
router.use(roleMiddleware(['SUPERADMIN']));

// 1. Dashboard Routes
router.get('/dashboard/summary', superAdminController.getSummary);
router.get('/dashboard/upcoming-renewals', superAdminController.getUpcomingRenewals);

// 2. Admins Routes
router.get('/admins', superAdminController.getAdmins);
router.post('/admins', superAdminController.createAdmin);
router.put('/admins/:id', superAdminController.updateAdmin);
router.post('/admins/:id/toggle', superAdminController.toggleAdmin);

// 3. Plans Routes
router.get('/plans', superAdminController.getPlans);
router.post('/plans', superAdminController.createPlan);
router.put('/plans/:id', superAdminController.updatePlan);

// 4. Payments Routes
router.get('/payments', superAdminController.getPayments);

// 5. Settings Routes
router.get('/settings', superAdminController.getSettings);
router.put('/settings', superAdminController.updateSettings);

// 6. Support Tickets Routes
router.get('/tickets', superAdminController.getTickets);
router.get('/tickets/:id', superAdminController.getTicket);
router.post('/tickets/:id/reply', superAdminController.replyTicket);
router.put('/tickets/:id/status', superAdminController.updateTicket);
router.delete('/tickets/:id', superAdminController.deleteTicket);
router.delete('/tickets/:id/messages/:messageIndex', superAdminController.deleteMessage);

module.exports = router;
