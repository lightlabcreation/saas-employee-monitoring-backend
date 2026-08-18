const ticketService = require('./tickets.service');
const { successResponse, errorResponse } = require('../../utils/response');

const createTicket = async (req, res) => {
  try {
    const ticket = await ticketService.createTicket(req.user, req.body);
    return successResponse(res, ticket, 'Ticket created successfully', 201);
  } catch (error) {
    console.error('Error creating ticket:', error);
    return errorResponse(res, error.message || 'Failed to create ticket', 500);
  }
};

const getTickets = async (req, res) => {
  try {
    const tickets = await ticketService.getTickets(req.user);
    return successResponse(res, tickets, 'Tickets fetched successfully');
  } catch (error) {
    console.error('Error fetching tickets:', error);
    return errorResponse(res, error.message || 'Failed to fetch tickets', 500);
  }
};

const getTicketById = async (req, res) => {
  try {
    const ticket = await ticketService.getTicketById(req.params.id);
    return successResponse(res, ticket, 'Ticket retrieved successfully');
  } catch (error) {
    console.error('Error fetching ticket:', error);
    return errorResponse(res, error.message || 'Failed to fetch ticket', 404);
  }
};

const replyTicket = async (req, res) => {
  try {
    const ticket = await ticketService.replyToTicket(req.params.id, req.user, req.body);
    return successResponse(res, ticket, 'Reply sent successfully');
  } catch (error) {
    console.error('Error replying to ticket:', error);
    return errorResponse(res, error.message || 'Failed to send reply', 500);
  }
};

const deleteTicket = async (req, res) => {
  try {
    await ticketService.deleteTicket(req.params.id, req.user);
    return successResponse(res, null, 'Ticket deleted successfully');
  } catch (error) {
    console.error('Error deleting ticket:', error);
    return errorResponse(res, error.message || 'Failed to delete ticket', 400);
  }
};

const deleteMessage = async (req, res) => {
  try {
    const updated = await ticketService.deleteMessage(req.params.id, req.params.messageIndex, req.user);
    return successResponse(res, updated, 'Message deleted successfully');
  } catch (error) {
    console.error('Error deleting message:', error);
    return errorResponse(res, error.message || 'Failed to delete message', 400);
  }
};

module.exports = {
  createTicket,
  getTickets,
  getTicketById,
  replyTicket,
  deleteTicket,
  deleteMessage
};
