const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

p.employee.findFirst({ select: { deviceOwnership: true } })
    .then(r => console.log('deviceOwnership field OK:', JSON.stringify(r)))
    .catch(e => console.log('Error:', e.message))
    .finally(() => p.$disconnect());
