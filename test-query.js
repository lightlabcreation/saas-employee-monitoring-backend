const prisma = require('./src/config/db');
async function main() {
    const date = '2026-08-13';
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);
    
    console.log("Simulating query range:");
    console.log("- startDate:", startDate.toISOString(), "Local:", startDate.toString());
    console.log("- endDate:", endDate.toISOString(), "Local:", endDate.toString());

    const where = {
        organizationId: 'default-org-id',
        createdAt: {
            gte: startDate,
            lte: endDate
        }
    };

    const videos = await prisma.videoRecording.findMany({
        where,
        include: {
            employee: { select: { id: true, fullName: true } }
        }
    });

    console.log(`\nQuery returned ${videos.length} videos:`);
    for (const v of videos) {
        console.log(`- ID: ${v.id}, Employee: ${v.employee?.fullName}, CreatedAt: ${v.createdAt.toISOString()}`);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
