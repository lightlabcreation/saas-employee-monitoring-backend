const prisma = require('../../config/db');
const bcrypt = require('bcrypt');

/**
 * Super Admin Services
 */

// 1. Dashboard Summary
const getDashboardSummary = async () => {
  const totalCompanies = await prisma.organization.count();
  
  const activeEmployees = await prisma.employee.count({
    where: { 
      role: { in: ['EMPLOYEE', 'MANAGER'] },
      status: { not: 'DEACTIVATED' } 
    }
  });

  // Calculate online today (using fallback of ACTIVE/IDLE/BREAK statuses)
  const employeesOnlineToday = await prisma.employee.count({
    where: {
      role: { in: ['EMPLOYEE', 'MANAGER'] },
      status: { in: ['ACTIVE', 'IDLE', 'BREAK'] }
    }
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayAttendance = await prisma.attendance.count({
    where: {
      clockIn: { gte: today }
    }
  });

  // Average productivity calculation
  const logs = await prisma.activityLog.findMany({
    where: {
      timestamp: { gte: today }
    }
  });
  
  let totalDur = 0, prodDur = 0;
  logs.forEach(log => {
    const dur = log.duration || 0;
    totalDur += dur;
    if (log.productivity === 'PRODUCTIVE') {
      prodDur += dur;
    }
  });
  
  const averageProductivity = totalDur > 0 ? Math.round((prodDur / totalDur) * 100) : 78;

  // Monthly revenue
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const monthlyPayments = await prisma.saasPayment.findMany({
    where: {
      paymentDate: { gte: startOfMonth },
      status: 'PAID'
    }
  });
  const monthlyRevenue = monthlyPayments.reduce((sum, p) => sum + p.amount, 0);

  const activeAdmins = await prisma.user.count({
    where: {
      role: 'ADMIN',
      employee: { status: { not: 'DEACTIVATED' } }
    }
  });

  // Total Lifetime Revenue
  const allPayments = await prisma.saasPayment.findMany({
    where: { status: 'PAID' }
  });
  const totalRevenue = allPayments.reduce((sum, p) => sum + p.amount, 0);

  return {
    totalCompanies,
    activeEmployees,
    employeesOnlineToday,
    todayAttendance,
    averageProductivity,
    monthlyRevenue,
    activeAdmins,
    totalRevenue
  };
};

// 2. Upcoming Renewals
const getUpcomingRenewals = async (days = 7) => {
  const today = new Date();
  const targetDate = new Date();
  targetDate.setDate(today.getDate() + days);

  const subscriptions = await prisma.saasSubscription.findMany({
    where: {
      expiryDate: {
        gte: today,
        lte: targetDate
      },
      status: 'ACTIVE'
    }
  });

  const renewals = [];
  for (const sub of subscriptions) {
    const org = await prisma.organization.findUnique({
      where: { id: sub.organizationId }
    });

    const owner = await prisma.user.findFirst({
      where: {
        role: 'ADMIN',
        employee: { organizationId: sub.organizationId }
      },
      include: { employee: true }
    });

    const plan = await prisma.saasPlan.findUnique({
      where: { id: sub.planId }
    });

    renewals.push({
      id: sub.id,
      company: org ? org.legalName : 'Unknown Org',
      companyId: org ? org.id : null,
      owner: owner ? owner.name || owner.employee?.fullName || owner.email.split('@')[0] : 'Unknown Admin',
      ownerEmail: owner ? owner.email : 'Unknown Email',
      expiry: sub.expiryDate,
      plan: plan ? plan.name : 'Unknown Plan',
      planPrice: plan ? plan.price : 0
    });
  }

  return renewals;
};

// 3. Admins Management
const getAdmins = async () => {
  const adminUsers = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    include: {
      employee: {
        include: {
          organization: true
        }
      }
    }
  });

  const result = [];
  for (const user of adminUsers) {
    const orgId = user.employee?.organizationId;
    const orgName = user.employee?.organization?.legalName || 'N/A';

    // Count employees in organization
    const employeeCount = orgId ? await prisma.employee.count({
      where: { organizationId: orgId, role: 'EMPLOYEE' }
    }) : 0;

    // Get Subscription Plan
    let planName = 'Free Trial';
    if (orgId) {
      const sub = await prisma.saasSubscription.findUnique({
        where: { organizationId: orgId }
      });
      if (sub) {
        const plan = await prisma.saasPlan.findUnique({
          where: { id: sub.planId }
        });
        if (plan) planName = plan.name;
      }
    }

    // Get AdminProfile (for mobile)
    const profile = await prisma.adminProfile.findUnique({
      where: { userId: user.id }
    });

    result.push({
      id: user.id,
      name: user.name || user.employee?.fullName || 'N/A',
      company: orgName,
      companyId: orgId,
      email: user.email,
      mobile: profile?.mobile || 'N/A',
      employees: employeeCount,
      subscriptionPlan: planName,
      status: user.employee?.status === 'DEACTIVATED' ? 'Suspended' : 'Active',
      createdAt: user.createdAt
    });
  }

  return result;
};

const createAdmin = async (adminData) => {
  const { name, email, password, companyName, mobile, planId } = adminData;

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error('User already exists with this email');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  return await prisma.$transaction(async (tx) => {
    // 1. Create Organization
    const organization = await tx.organization.create({
      data: {
        legalName: companyName,
        timeZone: 'UTC+5:30 (IST)'
      }
    });

    // 2. Create Employee (ADMIN role)
    const employee = await tx.employee.create({
      data: {
        fullName: name,
        email,
        role: 'ADMIN',
        organizationId: organization.id,
        status: 'ACTIVE'
      }
    });

    // 3. Create User (ADMIN role)
    const user = await tx.user.create({
      data: {
        email,
        password: hashedPassword,
        role: 'ADMIN',
        employeeId: employee.id,
        name
      }
    });

    // 4. Create Admin Profile (with mobile)
    await tx.adminProfile.create({
      data: {
        userId: user.id,
        mobile: mobile || null
      }
    });

    // 5. Create Subscription (Default to professional or selected plan)
    let selectedPlan = planId;
    if (!selectedPlan) {
      const defaultPlan = await tx.saasPlan.findFirst({
        where: { name: 'Professional' }
      });
      selectedPlan = defaultPlan ? defaultPlan.id : null;
    }

    if (selectedPlan) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 30); // 30 days default

      await tx.saasSubscription.create({
        data: {
          organizationId: organization.id,
          planId: selectedPlan,
          status: 'ACTIVE',
          startDate: new Date(),
          expiryDate: expiry
        }
      });
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      companyName: organization.legalName
    };
  });
};

const updateAdmin = async (adminId, adminData) => {
  const { name, email, companyName, mobile } = adminData;

  const user = await prisma.user.findUnique({
    where: { id: adminId },
    include: { employee: true }
  });

  if (!user) throw new Error('Admin user not found');

  return await prisma.$transaction(async (tx) => {
    // 1. Update User name/email
    const updatedUser = await tx.user.update({
      where: { id: adminId },
      data: { name, email }
    });

    // 2. Update Employee fullName/email
    if (user.employeeId) {
      await tx.employee.update({
        where: { id: user.employeeId },
        data: { fullName: name, email }
      });

      // 3. Update Organization name
      if (user.employee?.organizationId && companyName) {
        await tx.organization.update({
          where: { id: user.employee.organizationId },
          data: { legalName: companyName }
        });
      }
    }

    // 4. Update Admin Profile
    if (mobile) {
      await tx.adminProfile.upsert({
        where: { userId: adminId },
        create: { userId: adminId, mobile },
        update: { mobile }
      });
    }

    return updatedUser;
  });
};

const toggleAdminStatus = async (adminId, action) => {
  const user = await prisma.user.findUnique({
    where: { id: adminId },
    include: { employee: true }
  });

  if (!user) throw new Error('Admin user not found');
  if (!user.employeeId) throw new Error('User does not have an employee profile');

  const newStatus = action === 'suspend' ? 'DEACTIVATED' : 'ACTIVE';

  await prisma.employee.update({
    where: { id: user.employeeId },
    data: { status: newStatus }
  });

  return { id: adminId, status: newStatus === 'DEACTIVATED' ? 'Suspended' : 'Active' };
};

// 4. Plans & Pricing
const getPlans = async () => {
  return await prisma.saasPlan.findMany({
    orderBy: { price: 'asc' }
  });
};

const createPlan = async (planData) => {
  const { name, price, duration, employeeLimit, screenshotLimit, activityTracking, productivityReports, attendanceModule, status } = planData;
  return await prisma.saasPlan.create({
    data: {
      name,
      price: parseFloat(price),
      duration: duration || 'Monthly',
      employeeLimit: parseInt(employeeLimit),
      screenshotLimit: parseInt(screenshotLimit),
      activityTracking: activityTracking === undefined ? true : activityTracking,
      productivityReports: productivityReports === undefined ? true : productivityReports,
      attendanceModule: attendanceModule === undefined ? true : attendanceModule,
      status: status || 'ACTIVE'
    }
  });
};

const updatePlan = async (planId, planData) => {
  const { name, price, duration, employeeLimit, screenshotLimit, activityTracking, productivityReports, attendanceModule, status } = planData;
  
  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (price !== undefined) updateData.price = parseFloat(price);
  if (duration !== undefined) updateData.duration = duration;
  if (employeeLimit !== undefined) updateData.employeeLimit = parseInt(employeeLimit);
  if (screenshotLimit !== undefined) updateData.screenshotLimit = parseInt(screenshotLimit);
  if (activityTracking !== undefined) updateData.activityTracking = activityTracking;
  if (productivityReports !== undefined) updateData.productivityReports = productivityReports;
  if (attendanceModule !== undefined) updateData.attendanceModule = attendanceModule;
  if (status !== undefined) updateData.status = status;

  return await prisma.saasPlan.update({
    where: { id: planId },
    data: updateData
  });
};

// 5. Payments
const getPayments = async () => {
  const payments = await prisma.saasPayment.findMany({
    orderBy: { paymentDate: 'desc' }
  });

  const result = [];
  for (const p of payments) {
    const org = await prisma.organization.findUnique({
      where: { id: p.organizationId }
    });

    const admin = await prisma.user.findUnique({
      where: { id: p.adminId }
    });

    const plan = await prisma.saasPlan.findUnique({
      where: { id: p.planId }
    });

    result.push({
      id: p.id,
      company: org ? org.legalName : 'N/A',
      admin: admin ? admin.name || admin.email.split('@')[0] : 'N/A',
      adminEmail: admin ? admin.email : 'N/A',
      plan: plan ? plan.name : 'N/A',
      amount: p.amount,
      paymentMethod: p.paymentMethod,
      invoiceId: p.invoiceId,
      paymentDate: p.paymentDate,
      expiryDate: p.expiryDate,
      status: p.status
    });
  }

  return result;
};

// 6. Settings
const getSettings = async () => {
  const settingsList = await prisma.superAdminSetting.findMany();
  const settingsObj = {};
  settingsList.forEach(s => {
    settingsObj[s.key] = s.value;
  });
  return settingsObj;
};

const updateSettings = async (settingsData) => {
  const keys = Object.keys(settingsData);
  for (const key of keys) {
    await prisma.superAdminSetting.upsert({
      where: { key },
      create: { key, value: String(settingsData[key]) },
      update: { value: String(settingsData[key]) }
    });
  }
  return getSettings();
};

// 7. Support Tickets
const getTickets = async () => {
  return await prisma.supportTicket.findMany({
    orderBy: { updatedAt: 'desc' }
  });
};

const getTicketById = async (id) => {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id }
  });
  if (!ticket) throw new Error('Ticket not found');
  return ticket;
};

const replyToTicket = async (id, replyData) => {
  const { sender, name, text } = replyData;
  const ticket = await prisma.supportTicket.findUnique({
    where: { id }
  });
  if (!ticket) throw new Error('Ticket not found');

  const messages = Array.isArray(ticket.messages) ? ticket.messages : [];
  const newMessage = {
    sender: sender || 'superadmin',
    name: name || 'Superadmin',
    text,
    timestamp: new Date().toISOString()
  };

  messages.push(newMessage);

  return await prisma.supportTicket.update({
    where: { id },
    data: {
      messages,
      status: sender === 'superadmin' ? 'REPLIED' : 'OPEN'
    }
  });
};

const updateTicketStatus = async (id, status) => {
  return await prisma.supportTicket.update({
    where: { id },
    data: { status }
  });
};

const createTicket = async (ticketData) => {
  const { title, category, priority, companyName, adminName, adminEmail, initialMessage, message } = ticketData;
  const ticketNumber = `TKT-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  const textMsg = initialMessage || message || '';
  const messages = textMsg ? [{
    sender: 'admin',
    name: adminName || 'Admin',
    text: textMsg,
    timestamp: new Date().toISOString()
  }] : [];

  return await prisma.supportTicket.create({
    data: {
      ticketNumber,
      title: title || 'Support Request',
      category: category || 'Technical',
      priority: priority || 'Medium',
      status: 'OPEN',
      companyName: companyName || 'Company',
      adminName: adminName || 'Admin',
      adminEmail: adminEmail || 'admin@example.com',
      messages
    }
  });
};

const deleteTicket = async (id) => {
  return await prisma.supportTicket.delete({ where: { id } });
};

const deleteMessage = async (id, messageIndex) => {
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) throw new Error('Ticket not found');

  const idx = parseInt(messageIndex, 10);
  const messages = Array.isArray(ticket.messages) ? [...ticket.messages] : [];

  if (isNaN(idx) || idx < 0 || idx >= messages.length) {
    throw new Error('Invalid message index');
  }

  messages.splice(idx, 1);

  return await prisma.supportTicket.update({
    where: { id },
    data: { messages }
  });
};

module.exports = {
  getDashboardSummary,
  getUpcomingRenewals,
  getAdmins,
  createAdmin,
  updateAdmin,
  toggleAdminStatus,
  getPlans,
  createPlan,
  updatePlan,
  getPayments,
  getSettings,
  updateSettings,
  getTickets,
  getTicketById,
  replyToTicket,
  updateTicketStatus,
  createTicket,
  deleteTicket,
  deleteMessage
};
