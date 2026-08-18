const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const activityService = require('./src/modules/activity/activity.service');

async function test() {
    try {
        const emp = await prisma.employee.findFirst({
            where: { fullName: 'demo' }
        });
        if (!emp) {
            console.log('Employee demo not found');
            return;
        }
        console.log('Found employee:', emp.fullName, emp.id);
        const summary = await activityService.getEmployeeSummary(emp.id);
        console.log('Summary returned:', summary.length, 'days');
        if (summary.length > 0) {
            console.log('Sample summary item:', JSON.stringify(summary[0], null, 2));
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
test();
