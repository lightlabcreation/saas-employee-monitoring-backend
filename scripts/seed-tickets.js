const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Support Tickets...');

  const tickets = [
    {
      ticketNumber: 'TKT-1786006334931-390',
      title: 'Payment',
      category: 'Technical',
      priority: 'Medium',
      status: 'REPLIED',
      companyName: 'anytime',
      adminName: 'anytime',
      adminEmail: 'anytimefitness@gmail.com',
      messages: [
        {
          sender: 'admin',
          name: 'anytime',
          text: 'this issee',
          timestamp: '2026-08-06T14:22:00Z'
        },
        {
          sender: 'superadmin',
          name: 'Superadmin',
          text: 'hyyy',
          timestamp: '2026-08-06T14:27:00Z'
        }
      ]
    },
    {
      ticketNumber: 'TKT-1786006334931-402',
      title: 'Employee Monitoring Agent Issue',
      category: 'Technical',
      priority: 'High',
      status: 'OPEN',
      companyName: 'Insightful Corp',
      adminName: 'Jane Admin',
      adminEmail: 'admin@example.com',
      messages: [
        {
          sender: 'admin',
          name: 'Jane Admin',
          text: 'We are unable to download the agent on Windows. It says connection timed out.',
          timestamp: '2026-08-06T15:00:00Z'
        }
      ]
    }
  ];

  for (const t of tickets) {
    const existing = await prisma.supportTicket.findUnique({
      where: { ticketNumber: t.ticketNumber }
    });

    if (!existing) {
      await prisma.supportTicket.create({ data: t });
      console.log(`Seeded ticket: ${t.ticketNumber}`);
    } else {
      console.log(`Ticket ${t.ticketNumber} already exists.`);
    }
  }

  console.log('Support tickets seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
