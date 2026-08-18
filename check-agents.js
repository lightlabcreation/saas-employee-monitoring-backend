const prisma = require('./src/config/db');
async function main() {
    const agents = await prisma.agent.findMany({
        include: {
            employee: {
                include: {
                    organization: true
                }
            }
        }
    });
    console.log("AGENT REGISTRATIONS:");
    for (const a of agents) {
        console.log(`- ID: ${a.id}, DeviceID: ${a.deviceId}, Employee: ${a.employee?.fullName} (${a.employee?.email}), Org: ${a.employee?.organizationId}, Org Recording Enabled: ${a.employee?.organization?.screenRecordingEnabled}, Status: ${a.status}, Last Heartbeat: ${a.lastHeartbeat}`);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
