const prisma = require('./src/config/db');
async function main() {
    const videos = await prisma.videoRecording.findMany({
        where: {
            employeeId: 'a9f2e30e-9c72-4d0a-b0cd-85d56d39eac3'
        }
    });
    for (const v of videos) {
        console.log(`Video ID: ${v.id}`);
        console.log(`- createdAt (UTC): ${v.createdAt.toISOString()}`);
        console.log(`- createdAt (Local): ${v.createdAt.toString()}`);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
