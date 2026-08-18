const { getAdminDashboard } = require('../src/modules/dashboard/dashboard.service');
async function run() {
    const todayStr = new Date().toISOString().split('T')[0];
    const data = await getAdminDashboard('default-org-id', todayStr, todayStr);
    console.log("Dashboard data:", JSON.stringify(data.intradayActivity, null, 2));
}
run().catch(console.error);
