const express = require('express');
const router = express.Router();
const ticketController = require('./tickets.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

router.use(authMiddleware);

router.post('/', ticketController.createTicket);
router.get('/', ticketController.getTickets);
router.get('/:id', ticketController.getTicketById);
router.post('/:id/reply', ticketController.replyTicket);
router.delete('/:id', ticketController.deleteTicket);
router.delete('/:id/messages/:messageIndex', ticketController.deleteMessage);

module.exports = router;
