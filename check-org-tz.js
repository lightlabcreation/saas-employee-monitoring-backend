const prisma = require('./src/config/db');
async function main() {
    const org = await prisma.organization.findUnique({
        where: { id: 'default-org-id' }
    });
    console.log("Organization timezone:", org?.timeZone);
}
main().catch(console.error).finally(() => prisma.$disconnect());
