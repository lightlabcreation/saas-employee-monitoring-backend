const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const admin = await prisma.employee.findUnique({ where: { id: '48285691-ec0c-4c20-bbae-7007670ca096' } });
    console.log("admin@example.com org:", admin.organizationId);
}
main().catch(console.error).finally(() => prisma.$disconnect());
