const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const organizationId = 'default-org-id';
    
    // Paste logic from activity.service.js
    const where = { organizationId };
    const logs = await prisma.activityLog.findMany({
        where,
        include: { employee: { select: { id: true, fullName: true, team: { select: { name: true } } } } }
    });
    
    const summaryMap = {};
    logs.forEach(log => {
        const date = log.timestamp ? log.timestamp.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const key = `${date}_${log.employeeId}`;
        
        if (!summaryMap[key]) {
            summaryMap[key] = {
                employeeId: log.employeeId,
                date: date,
                workHours: 0, activeHours: 0, idleHours: 0, breakHours: 0, manualHours: 0,
                productiveHours: 0, unproductiveHours: 0, neutralHours: 0
            };
        }
        
        const item = summaryMap[key];
        const durationHrs = log.duration / 3600;
        
        if (log.activityType === 'ACTIVE') item.activeHours += durationHrs;
        if (log.activityType === 'IDLE') item.idleHours += durationHrs;
        if (log.activityType === 'MANUAL') item.manualHours += durationHrs;
        if (log.activityType === 'BREAK') item.breakHours += durationHrs;
        
        if (log.productivity === 'PRODUCTIVE') item.productiveHours += durationHrs;
        if (log.productivity === 'UNPRODUCTIVE') item.unproductiveHours += durationHrs;
        if (log.productivity === 'NEUTRAL') item.neutralHours += durationHrs;
    });
    
    const result = Object.values(summaryMap).map(item => {
        item.workHours = item.activeHours + item.idleHours + item.manualHours;
        const productivityPct = item.activeHours > 0 ? Math.round((item.productiveHours / item.activeHours) * 100) : 0;
        const utilizationPct = item.workHours > 0 ? Math.round((item.activeHours / item.workHours) * 100) : 0;
        
        return {
            ...item,
            productivityPct,
            utilizationPct
        };
    });
    
    console.log(JSON.stringify(result, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
