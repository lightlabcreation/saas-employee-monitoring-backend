const superAdminService = require('./superadmin.service');
const { successResponse, errorResponse } = require('../../utils/response');

// 1. Dashboard
const getSummary = async (req, res) => {
  try {
    const summary = await superAdminService.getDashboardSummary();
    return successResponse(res, summary, 'Super Admin summary retrieved successfully');
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    return errorResponse(res, error.message || 'Failed to fetch dashboard summary', 500);
  }
};

const getUpcomingRenewals = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const renewals = await superAdminService.getUpcomingRenewals(days);
    return successResponse(res, renewals, 'Upcoming renewals retrieved successfully');
  } catch (error) {
    console.error('Error fetching upcoming renewals:', error);
    return errorResponse(res, error.message || 'Failed to fetch upcoming renewals', 500);
  }
};

// 2. Admins
const getAdmins = async (req, res) => {
  try {
    const admins = await superAdminService.getAdmins();
    return successResponse(res, admins, 'Admins retrieved successfully');
  } catch (error) {
    console.error('Error fetching admins:', error);
    return errorResponse(res, error.message || 'Failed to fetch admins', 500);
  }
};

const createAdmin = async (req, res) => {
  try {
    const admin = await superAdminService.createAdmin(req.body);
    return successResponse(res, admin, 'Admin created successfully', 201);
  } catch (error) {
    console.error('Error creating admin:', error);
    return errorResponse(res, error.message || 'Failed to create admin', 400);
  }
};

const updateAdmin = async (req, res) => {
  try {
    const admin = await superAdminService.updateAdmin(req.params.id, req.body);
    return successResponse(res, admin, 'Admin updated successfully');
  } catch (error) {
    console.error('Error updating admin:', error);
    return errorResponse(res, error.message || 'Failed to update admin', 400);
  }
};

const toggleAdmin = async (req, res) => {
  try {
    const { action } = req.body; // 'suspend' or 'activate'
    if (!['suspend', 'activate'].includes(action)) {
      return errorResponse(res, 'Invalid action. Use "suspend" or "activate"', 400);
    }
    const result = await superAdminService.toggleAdminStatus(req.params.id, action);
    return successResponse(res, result, `Admin ${action === 'suspend' ? 'suspended' : 'activated'} successfully`);
  } catch (error) {
    console.error('Error toggling admin status:', error);
    return errorResponse(res, error.message || 'Failed to change admin status', 400);
  }
};

const deleteAdmin = async (req, res) => {
  try {
    await superAdminService.deleteAdmin(req.params.id);
    return successResponse(res, null, 'Admin deleted successfully');
  } catch (error) {
    console.error('Error deleting admin:', error);
    return errorResponse(res, error.message || 'Failed to delete admin', 400);
  }
};

// 3. Plans
const getPlans = async (req, res) => {
  try {
    const plans = await superAdminService.getPlans();
    return successResponse(res, plans, 'Plans retrieved successfully');
  } catch (error) {
    console.error('Error fetching plans:', error);
    return errorResponse(res, error.message || 'Failed to fetch plans', 500);
  }
};

const createPlan = async (req, res) => {
  try {
    const plan = await superAdminService.createPlan(req.body);
    return successResponse(res, plan, 'Plan created successfully', 201);
  } catch (error) {
    console.error('Error creating plan:', error);
    return errorResponse(res, error.message || 'Failed to create plan', 400);
  }
};

const updatePlan = async (req, res) => {
  try {
    const plan = await superAdminService.updatePlan(req.params.id, req.body);
    return successResponse(res, plan, 'Plan updated successfully');
  } catch (error) {
    console.error('Error updating plan:', error);
    return errorResponse(res, error.message || 'Failed to update plan', 400);
  }
};

// 4. Payments
const getPayments = async (req, res) => {
  try {
    const payments = await superAdminService.getPayments();
    return successResponse(res, payments, 'Payments retrieved successfully');
  } catch (error) {
    console.error('Error fetching payments:', error);
    return errorResponse(res, error.message || 'Failed to fetch payments', 500);
  }
};

// 5. Settings
const getSettings = async (req, res) => {
  try {
    const settings = await superAdminService.getSettings();
    return successResponse(res, settings, 'Settings retrieved successfully');
  } catch (error) {
    console.error('Error fetching settings:', error);
    return errorResponse(res, error.message || 'Failed to fetch settings', 500);
  }
};

const updateSettings = async (req, res) => {
  try {
    const settings = await superAdminService.updateSettings(req.body);
    return successResponse(res, settings, 'Settings updated successfully');
  } catch (error) {
    console.error('Error updating settings:', error);
    return errorResponse(res, error.message || 'Failed to update settings', 400);
  }
};

// Support Tickets
const getTickets = async (req, res) => {
  try {
    const tickets = await superAdminService.getTickets();
    return successResponse(res, tickets, 'Support tickets retrieved successfully');
  } catch (error) {
    console.error('Error fetching tickets:', error);
    return errorResponse(res, error.message || 'Failed to fetch support tickets', 500);
  }
};

const getTicket = async (req, res) => {
  try {
    const ticket = await superAdminService.getTicketById(req.params.id);
    return successResponse(res, ticket, 'Ticket retrieved successfully');
  } catch (error) {
    console.error('Error fetching ticket:', error);
    return errorResponse(res, error.message || 'Failed to fetch ticket', 404);
  }
};

const replyTicket = async (req, res) => {
  try {
    const ticket = await superAdminService.replyToTicket(req.params.id, req.body, req.file);
    return successResponse(res, ticket, 'Reply sent successfully');
  } catch (error) {
    console.error('Error replying to ticket:', error);
    return errorResponse(res, error.message || 'Failed to send reply', 400);
  }
};

const updateTicket = async (req, res) => {
  try {
    const { status } = req.body;
    const ticket = await superAdminService.updateTicketStatus(req.params.id, status);
    return successResponse(res, ticket, 'Ticket status updated successfully');
  } catch (error) {
    console.error('Error updating ticket:', error);
    return errorResponse(res, error.message || 'Failed to update ticket status', 400);
  }
};

const deleteTicket = async (req, res) => {
  try {
    await superAdminService.deleteTicket(req.params.id);
    return successResponse(res, null, 'Ticket deleted successfully');
  } catch (error) {
    console.error('Error deleting ticket:', error);
    return errorResponse(res, error.message || 'Failed to delete ticket', 400);
  }
};

const deleteMessage = async (req, res) => {
  try {
    const updated = await superAdminService.deleteMessage(req.params.id, req.params.messageIndex);
    return successResponse(res, updated, 'Message deleted successfully');
  } catch (error) {
    console.error('Error deleting message:', error);
    return errorResponse(res, error.message || 'Failed to delete message', 400);
  }
};

module.exports = {
  getSummary,
  getUpcomingRenewals,
  getAdmins,
  createAdmin,
  updateAdmin,
  toggleAdmin,
  deleteAdmin,
  getPlans,
  createPlan,
  updatePlan,
  getPayments,
  getSettings,
  updateSettings,
  getTickets,
  getTicket,
  replyTicket,
  updateTicket,
  deleteTicket,
  deleteMessage
};
