const prisma = require('../../config/db');
const { uploadImageBuffer } = require('../../utils/imageStorage');
const { sendMail } = require('../../utils/email.service');

const createTicket = async (user, data, file) => {
  const { title, category, priority, message } = data;
  const ticketNumber = `TKT-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

  let imageUrl = null;
  if (file) {
    try {
      const uploadResult = await uploadImageBuffer(file.buffer, {
        format: 'webp',
        quality: 80,
        folder: 'insightful/tickets',
        fileNamePrefix: 'ticket'
      });
      imageUrl = uploadResult.imageUrl;
    } catch (err) {
      console.error('Error uploading ticket image:', err.message);
    }
  }
  
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
    imageUrl: imageUrl || null,
    timestamp: new Date().toISOString()
  }] : [];

  const newTicket = await prisma.supportTicket.create({
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

  // ── Email Notifications via support@kiaantechnology.com ─────────────────────
  const supportEmail = process.env.SUPPORT_EMAIL || 'support@kiaantechnology.com';

  const userSubject = `[Support Ticket #${ticketNumber}] Ticket Received: ${title || 'Support Request'}`;
  const userHtml = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b;">
      <h2 style="color: #2563eb;">Support Ticket Confirmation</h2>
      <p>Hello <strong>${adminName}</strong>,</p>
      <p>Your support ticket has been successfully raised. Our support team is reviewing your request.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 500px; margin: 15px 0;">
        <tr><td style="padding: 8px; font-weight: bold;">Ticket #:</td><td style="padding: 8px;">${ticketNumber}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Category:</td><td style="padding: 8px;">${category || 'Technical'}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Priority:</td><td style="padding: 8px;">${priority || 'Medium'}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Status:</td><td style="padding: 8px; color: #16a34a; font-weight: bold;">OPEN</td></tr>
      </table>
    </div>
  `;

  const supportAlertSubject = `[New Support Ticket] #${ticketNumber} — ${companyName} (${priority || 'Medium'})`;
  const supportAlertHtml = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b;">
      <h2 style="color: #dc2626;">New Support Ticket Raised</h2>
      <p>A new support ticket has been submitted by <strong>${adminName}</strong> (${companyName}).</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 500px; margin: 15px 0;">
        <tr><td style="padding: 8px; font-weight: bold;">Ticket #:</td><td style="padding: 8px;">${ticketNumber}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Admin Email:</td><td style="padding: 8px;">${adminEmail}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Category:</td><td style="padding: 8px;">${category || 'Technical'}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Priority:</td><td style="padding: 8px;">${priority || 'Medium'}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Message:</td><td style="padding: 8px;">${message || 'N/A'}</td></tr>
      </table>
    </div>
  `;

  Promise.all([
    sendMail({ to: adminEmail, subject: userSubject, html: userHtml }),
    sendMail({ to: supportEmail, subject: supportAlertSubject, html: supportAlertHtml })
  ]).catch(err => console.error('[SupportTicket] Email notification error:', err.message));

  return newTicket;
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

const replyToTicket = async (id, user, data, file) => {
  const { text } = data;
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) throw new Error('Ticket not found');

  let imageUrl = null;
  if (file) {
    try {
      const uploadResult = await uploadImageBuffer(file.buffer, {
        format: 'webp',
        quality: 80,
        folder: 'insightful/tickets',
        fileNamePrefix: 'reply'
      });
      imageUrl = uploadResult.imageUrl;
    } catch (err) {
      console.error('Error uploading reply image:', err.message);
    }
  }

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
    imageUrl: imageUrl || null,
    timestamp: new Date().toISOString()
  });

  const updatedTicket = await prisma.supportTicket.update({
    where: { id },
    data: {
      messages,
      status: isSuperAdmin ? 'REPLIED' : 'OPEN'
    }
  });

  // ── Send Email Reply Notification ───────────────────────────────────────────
  const supportEmail = process.env.SUPPORT_EMAIL || 'support@kiaantechnology.com';
  const recipientEmail = isSuperAdmin ? ticket.adminEmail : supportEmail;
  const replySubject = `[Support Ticket #${ticket.ticketNumber}] New Reply from ${isSuperAdmin ? 'Support Team' : name}`;
  const replyHtml = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b;">
      <h3 style="color: #2563eb;">Update on Ticket #${ticket.ticketNumber}</h3>
      <p><strong>${name}</strong> (${isSuperAdmin ? 'Support Team' : 'Admin'}) added a reply:</p>
      <blockquote style="border-left: 3px solid #2563eb; padding-left: 12px; margin: 15px 0; color: #475569; background: #f8fafc; padding-top: 8px; padding-bottom: 8px;">
        ${text || 'Attachment uploaded'}
      </blockquote>
    </div>
  `;

  sendMail({ to: recipientEmail, subject: replySubject, html: replyHtml }).catch(err => console.error('[SupportTicket] Reply email error:', err.message));

  return updatedTicket;
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
