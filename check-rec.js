const prisma = require('./src/config/db');
async function main() {
    const orgs = await prisma.organization.findMany();
    console.log("ORGANIZATIONS:");
    for (const org of orgs) {
        console.log(`- ID: ${org.id}, Name: ${org.name}, screenRecordingEnabled: ${org.screenRecordingEnabled}`);
    }

    const employees = await prisma.employee.findMany();
    console.log("\nEMPLOYEES:");
    for (const emp of employees) {
        console.log(`- ID: ${emp.id}, Name: ${emp.fullName}, Email: ${emp.email}, Status: ${emp.status}, deviceOwnership: ${emp.deviceOwnership}`);
    }

    const videos = await prisma.videoRecording.findMany();
    console.log(`\nVIDEO RECORDINGS IN DATABASE: ${videos.length}`);
    for (const video of videos) {
        console.log(`- ID: ${video.id}, Employee: ${video.employeeId}, URL: ${video.fileUrl}, Duration: ${video.duration}, Status: ${video.status}, CreatedAt: ${video.createdAt}`);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
