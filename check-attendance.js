const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const att = await prisma.attendance.findMany({
        where: { employeeId: 'a21c87f1-dc9c-4917-a6fe-674fdf847c78' },
        orderBy: { clockIn: 'desc' },
        take: 5
    });
    console.log(JSON.stringify(att, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
