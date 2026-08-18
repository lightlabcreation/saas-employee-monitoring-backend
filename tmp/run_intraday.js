const { getIntradayActivity } = require('../src/modules/dashboard/dashboard.service');
async function run() {
    const todayStr = new Date().toISOString().split('T')[0];
    const chart = await getIntradayActivity('default-org-id', null, null, todayStr, todayStr);
    console.log("Chart for today:", JSON.stringify(chart, null, 2));
}
run().catch(console.error);
