const prisma = require('./src/config/db');
async function main() {
    const screenshots = await prisma.screenshot.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
            employee: true
        }
    });
    console.log("RECENT SCREENSHOTS:");
    for (const s of screenshots) {
        console.log(`- ID: ${s.id}, Employee: ${s.employee?.fullName} (${s.employee?.email}), Org ID: ${s.organizationId}, CreatedAt: ${s.createdAt}`);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
