const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Super Admin data...');

  // 1. Create SUPERADMIN user if it doesn't exist
  const superadminEmail = 'superadmin@saas.com';
  let superadminUser = await prisma.user.findUnique({
    where: { email: superadminEmail }
  });

  if (!superadminUser) {
    const hashedPassword = await bcrypt.hash('superadmin123', 10);
    superadminUser = await prisma.user.create({
      data: {
        email: superadminEmail,
        password: hashedPassword,
        role: 'SUPERADMIN',
        name: 'Super Admin'
      }
    });
    console.log('Super Admin user created:', superadminEmail);
  } else {
    console.log('Super Admin user already exists:', superadminEmail);
  }

  // 2. Seed Default plans
  const plans = [
    {
      name: '7 Days Free Trial',
      price: 0,
      duration: '7 Days',
      employeeLimit: 5,
      screenshotLimit: 5,
      activityTracking: true,
      productivityReports: false,
      attendanceModule: true,
      videoRecording: false,
      status: 'ACTIVE'
    },
    {
      name: 'Starter',
      price: 999,
      duration: 'Monthly',
      employeeLimit: 15,
      screenshotLimit: 10,
      activityTracking: true,
      productivityReports: true,
      attendanceModule: true,
      videoRecording: false,
      status: 'ACTIVE'
    },
    {
      name: 'Growth',
      price: 1299,
      duration: 'Monthly',
      employeeLimit: 25,
      screenshotLimit: 25,
      activityTracking: true,
      productivityReports: true,
      attendanceModule: true,
      videoRecording: false,
      status: 'ACTIVE'
    },
    {
      name: 'Pro',
      price: 1499,
      duration: 'Monthly',
      employeeLimit: 40,
      screenshotLimit: 50,
      activityTracking: true,
      productivityReports: true,
      attendanceModule: true,
      videoRecording: true,
      status: 'ACTIVE'
    },
    {
      name: 'Custom Plan',
      price: 0,
      duration: 'Custom',
      employeeLimit: 9999,
      screenshotLimit: 1000,
      activityTracking: true,
      productivityReports: true,
      attendanceModule: true,
      videoRecording: true,
      status: 'ACTIVE'
    }
  ];

  const seededPlans = [];
  for (const planData of plans) {
    let plan = await prisma.saasPlan.findFirst({
      where: { name: planData.name }
    });

    if (!plan) {
      plan = await prisma.saasPlan.create({ data: planData });
      console.log(`Plan '${planData.name}' created.`);
    } else {
      plan = await prisma.saasPlan.update({
        where: { id: plan.id },
        data: planData
      });
      console.log(`Plan '${planData.name}' updated.`);
    }
    seededPlans.push(plan);
  }

  // Find default Organization (Insightful Corp)
  const defaultOrg = await prisma.organization.findFirst();
  if (defaultOrg) {
    console.log('Found default organization:', defaultOrg.legalName);

    // 3. Create Subscription for the organization
    const profPlan = seededPlans.find(p => p.name === 'Professional');
    if (profPlan) {
      const existingSub = await prisma.saasSubscription.findUnique({
        where: { organizationId: defaultOrg.id }
      });

      if (!existingSub) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30); // 30 days from now

        await prisma.saasSubscription.create({
          data: {
            organizationId: defaultOrg.id,
            planId: profPlan.id,
            status: 'ACTIVE',
            startDate: new Date(),
            expiryDate: expiry
          }
        });
        console.log(`Subscription created for ${defaultOrg.legalName} with Professional plan.`);
      } else {
        console.log(`Subscription already exists for ${defaultOrg.legalName}.`);
      }

      // 4. Create Mock Payments
      const existingPayments = await prisma.saasPayment.findMany({
        where: { organizationId: defaultOrg.id }
      });

      if (existingPayments.length === 0) {
        const adminUser = await prisma.user.findFirst({
          where: { role: 'ADMIN' }
        });

        const paymentDate = new Date();
        paymentDate.setDate(paymentDate.getDate() - 5); // 5 days ago
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 25); // 25 days left

        await prisma.saasPayment.create({
          data: {
            organizationId: defaultOrg.id,
            adminId: adminUser ? adminUser.id : superadminUser.id,
            planId: profPlan.id,
            amount: profPlan.price,
            paymentMethod: 'Credit Card',
            invoiceId: 'INV-123456',
            paymentDate,
            expiryDate,
            status: 'PAID'
          }
        });
        console.log(`Mock payment seeded for ${defaultOrg.legalName}.`);
      }
    }
  }

  // 5. Seed Admin Profile (Mobile number) for existing ADMIN user
  const adminUser = await prisma.user.findFirst({
    where: { role: 'ADMIN' }
  });
  if (adminUser) {
    const existingProfile = await prisma.adminProfile.findUnique({
      where: { userId: adminUser.id }
    });

    if (!existingProfile) {
      await prisma.adminProfile.create({
        data: {
          userId: adminUser.id,
          mobile: '+91 98765 43210'
        }
      });
      console.log(`Admin profile created for ${adminUser.email}`);
    }
  }

  // 6. Seed Default Super Admin settings
  const settings = [
    { key: 'platformName', value: 'Employee Tracker Pro' },
    { key: 'themeColor', value: '#001B6D' },
    { key: 'logoUrl', value: '/logo.png' }
  ];

  for (const setItem of settings) {
    const existingSet = await prisma.superAdminSetting.findUnique({
      where: { key: setItem.key }
    });

    if (!existingSet) {
      await prisma.superAdminSetting.create({ data: setItem });
      console.log(`Setting '${setItem.key}' seeded.`);
    }
  }

  console.log('Super Admin data seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
