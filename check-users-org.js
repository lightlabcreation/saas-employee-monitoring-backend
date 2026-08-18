const prisma = require('./src/config/db');
async function main() {
    const users = await prisma.user.findMany({
        include: {
            employee: true
        }
    });
    console.log("USERS AND EMPLOYEES RELATIONSHIPS:");
    for (const u of users) {
        console.log(`- User ID: ${u.id}, Email: ${u.email}, Role: ${u.role}, EmployeeID: ${u.employeeId}, Employee OrgID: ${u.employee?.organizationId}`);
    }

    const orgs = await prisma.organization.findMany();
    console.log("\nORGANIZATIONS:");
    for (const org of orgs) {
        console.log(`- Org ID: ${org.id}, Name: ${org.name}, screenRecordingEnabled: ${org.screenRecordingEnabled}`);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
