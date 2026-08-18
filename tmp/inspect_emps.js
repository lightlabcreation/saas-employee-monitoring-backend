const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const emps = await prisma.employee.findMany();
    emps.forEach(e => {
        console.log(JSON.stringify({id: e.id, name: e.fullName, role: e.role, orgId: e.organizationId}));
    });
}
main().catch(console.error).finally(() => prisma.$disconnect());
