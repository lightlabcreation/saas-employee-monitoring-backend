const prisma = require('../../config/db');

const createTicket = async (user, data) => {
  const { title, category, priority, message } = data;
  const ticketNumber = `TKT-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  
  let dbUser = null;
  if (user.userId || user.id) {
    try {
      dbUser = await prisma.user.findUnique({
        where: { id: user.userId || user.id },
        include: { employee: { include: { organization: true } } }
      });
    } catch (e) {
      console.error('Error fetching dbUser in createTicket:', e.message);
    }
  }

  let org = dbUser?.employee?.organization;
  const orgId = user.organizationId || dbUser?.employee?.organizationId;
  if (!org && orgId) {
    try {
      org = await prisma.organization.findUnique({ where: { id: orgId } });
    } catch (e) {
      console.error('Error fetching org in createTicket:', e.message);
    }
  }

  const companyName = org?.legalName || org?.name || 'kiaan technology';
  const adminName = dbUser?.fullName || dbUser?.name || dbUser?.employee?.fullName || dbUser?.employee?.name || user.fullName || user.name || 'lalit';
  const adminEmail = dbUser?.email || user.email || 'admin@example.com';

  const messages = message ? [{
    sender: 'admin',
    name: adminName,
    text: message,
    timestamp: new Date().toISOString()
  }] : [];

  return await prisma.supportTicket.create({
    data: {
      ticketNumber,
      title: title || 'Support Request',
      category: category || 'Technical',
      priority: priority || 'Medium',
      status: 'OPEN',
      companyName,
      adminName,
      adminEmail,
      messages
    }
  });
};

const getTickets = async (user) => {
  const currentRole = user.role?.toUpperCase();

  // Superadmin sees all tickets
  if (currentRole === 'SUPERADMIN') {
    return await prisma.supportTicket.findMany({
      orderBy: { updatedAt: 'desc' }
    });
  }

  // Fetch dbUser to resolve email & org
  let dbUser = null;
  if (user.userId || user.id) {
    try {
      dbUser = await prisma.user.findUnique({
        where: { id: user.userId || user.id },
        include: { employee: { include: { organization: true } } }
      });
    } catch (e) {
      console.error('Error fetching dbUser in getTickets:', e.message);
    }
  }

  let org = dbUser?.employee?.organization;
  const orgId = user.organizationId || dbUser?.employee?.organizationId;
  if (!org && orgId) {
    try {
      org = await prisma.organization.findUnique({ where: { id: orgId } });
    } catch (e) {}
  }

  const userEmail = dbUser?.email || user.email;
  const companyName = org?.legalName || org?.name;

  const orConditions = [];
  if (userEmail) {
    orConditions.push({ adminEmail: userEmail });
  }
  if (companyName) {
    orConditions.push({ companyName });
  }
  orConditions.push({ adminEmail: 'admin@example.com' });

  return await prisma.supportTicket.findMany({
    where: {
      OR: orConditions
    },
    orderBy: { updatedAt: 'desc' }
  });
};

const getTicketById = async (id) => {
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) throw new Error('Ticket not found');
  return ticket;
};

const replyToTicket = async (id, user, data) => {
  const { text } = data;
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) throw new Error('Ticket not found');

  let dbUser = null;
  if (user.userId || user.id) {
    try {
      dbUser = await prisma.user.findUnique({ where: { id: user.userId || user.id }, include: { employee: true } });
    } catch (e) {}
  }

  const messages = Array.isArray(ticket.messages) ? ticket.messages : [];
  const isSuperAdmin = user.role?.toUpperCase() === 'SUPERADMIN';
  const sender = isSuperAdmin ? 'superadmin' : 'admin';
  const name = isSuperAdmin ? 'Superadmin' : (dbUser?.fullName || dbUser?.name || dbUser?.employee?.fullName || dbUser?.employee?.name || user.fullName || user.name || 'lalit');

  messages.push({
    sender,
    name,
    text,
    timestamp: new Date().toISOString()
  });

  return await prisma.supportTicket.update({
    where: { id },
    data: {
      messages,
      status: isSuperAdmin ? 'REPLIED' : 'OPEN'
    }
  });
};

const deleteTicket = async (id, user) => {
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) throw new Error('Ticket not found');

  const isSuperAdmin = user.role?.toUpperCase() === 'SUPERADMIN';
  if (!isSuperAdmin) {
    let dbUser = null;
    if (user.userId || user.id) {
      try {
        dbUser = await prisma.user.findUnique({
          where: { id: user.userId || user.id },
          include: { employee: { include: { organization: true } } }
        });
      } catch (e) {}
    }
    const userEmail = dbUser?.email || user.email;
    const orgName = dbUser?.employee?.organization?.legalName || dbUser?.employee?.organization?.name;

    const isOwner = (userEmail && ticket.adminEmail === userEmail) || 
                    (orgName && ticket.companyName === orgName) || 
                    ticket.adminEmail === 'admin@example.com';
    if (!isOwner) {
      throw new Error('Not authorized to delete this ticket');
    }
  }

  return await prisma.supportTicket.delete({ where: { id } });
};

const deleteMessage = async (id, messageIndex, user) => {
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) throw new Error('Ticket not found');

  const idx = parseInt(messageIndex, 10);
  const messages = Array.isArray(ticket.messages) ? [...ticket.messages] : [];

  if (isNaN(idx) || idx < 0 || idx >= messages.length) {
    throw new Error('Invalid message index');
  }

  const targetMsg = messages[idx];
  const isSuperAdmin = user.role?.toUpperCase() === 'SUPERADMIN';

  if (!isSuperAdmin && targetMsg.sender !== 'admin') {
    throw new Error('You can only delete your own messages!');
  }

  messages.splice(idx, 1);

  return await prisma.supportTicket.update({
    where: { id },
    data: { messages }
  });
};

module.exports = {
  createTicket,
  getTickets,
  getTicketById,
  replyToTicket,
  deleteTicket,
  deleteMessage
};
