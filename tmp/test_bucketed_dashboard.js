const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function getDateRangeFilter(startDate, endDate) {
    let start, end;
    if (startDate && endDate) {
        start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
    } else {
        start = new Date();
        start.setHours(0, 0, 0, 0);
        end = new Date();
        end.setHours(23, 59, 59, 999);
    }
    return { gte: start, lte: end };
}

async function getIntradayActivity(organizationId, employeeId = null, teamId = null, startDate = null, endDate = null) {
    const dateFilter = getDateRangeFilter(startDate, endDate);

    const whereClause = { organizationId, timestamp: dateFilter };
    if (employeeId) whereClause.employeeId = employeeId;
    if (teamId) whereClause.employee = { teamId };

    const logs = await prisma.activityLog.findMany({ where: whereClause });
    
    const manualWhere = { organizationId, startTime: dateFilter };
    if (employeeId) manualWhere.employeeId = employeeId;
    if (teamId) manualWhere.employee = { teamId };
    
    const manualLogs = await prisma.manualTime.findMany({ where: manualWhere });

    // Group by hour
    const hourlyData = {};
    for (let i = 0; i < 24; i++) {
        hourlyData[i] = { active: 0, idle: 0, break: 0, manual: 0, productive: 0 };
    }

    logs.forEach(log => {
        const hour = new Date(log.timestamp).getHours();
        if (log.activityType === 'ACTIVE') hourlyData[hour].active += log.duration;
        else if (log.activityType === 'IDLE') hourlyData[hour].idle += log.duration;
        else if (log.activityType === 'BREAK') hourlyData[hour].break += log.duration;

        if (log.productivity === 'PRODUCTIVE') hourlyData[hour].productive += log.duration;
    });

    manualLogs.forEach(log => {
        const hour = new Date(log.startTime).getHours();
        hourlyData[hour].manual += log.duration;
        hourlyData[hour].productive += log.duration;
    });

    // Format for Recharts
    const result = [];
    for (let i = 8; i <= 20; i += 2) {
        let activeSeconds = 0;
        let idleSeconds = 0;
        let breakSeconds = 0;
        let manualSeconds = 0;
        let productiveSeconds = 0;

        const hoursInBucket = [i, i + 1];
        if (i === 8) {
            for (let h = 0; h < 8; h++) hoursInBucket.push(h);
        }
        if (i === 20) {
            for (let h = 21; h < 24; h++) hoursInBucket.push(h);
        }

        hoursInBucket.forEach(h => {
            if (hourlyData[h]) {
                activeSeconds += hourlyData[h].active;
                idleSeconds += hourlyData[h].idle;
                breakSeconds += hourlyData[h].break;
                manualSeconds += hourlyData[h].manual;
                productiveSeconds += hourlyData[h].productive;
            }
        });

        const workTimeSeconds = activeSeconds + manualSeconds + idleSeconds;
        const utilization = workTimeSeconds > 0 ? Math.round((productiveSeconds / workTimeSeconds) * 100) : 0;

        result.push({
            name: `${i.toString().padStart(2, '0')}:00`,
            active: Number((activeSeconds / 3600).toFixed(2)),
            idle: Number((idleSeconds / 3600).toFixed(2)),
            break: Number((breakSeconds / 3600).toFixed(2)),
            manual: Number((manualSeconds / 3600).toFixed(2)),
            utilization: utilization
        });
    }

    return result;
}

async function run() {
    const todayStr = new Date().toISOString().split('T')[0];
    const data = await getIntradayActivity('default-org-id', null, null, todayStr, todayStr);
    console.log("Bucketed chart data:", JSON.stringify(data, null, 2));
}
run().catch(console.error).finally(() => prisma.$disconnect());
