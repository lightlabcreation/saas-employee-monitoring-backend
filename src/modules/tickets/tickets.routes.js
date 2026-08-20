const express = require('express');
const router = express.Router();
const ticketController = require('./tickets.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

router.use(authMiddleware);

router.post('/', upload.single('image'), ticketController.createTicket);
router.get('/', ticketController.getTickets);
router.get('/:id', ticketController.getTicketById);
router.post('/:id/reply', upload.single('image'), ticketController.replyTicket);
router.delete('/:id', ticketController.deleteTicket);
router.delete('/:id/messages/:messageIndex', ticketController.deleteMessage);

module.exports = router;
