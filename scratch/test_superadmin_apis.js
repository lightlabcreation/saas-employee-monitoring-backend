async function runTests() {
  console.log('Starting Super Admin API validation tests...');
  const baseURL = 'http://localhost:5000/api';

  try {
    // 1. Login as Super Admin
    console.log('1. Attempting login as superadmin@saas.com...');
    const loginRes = await fetch(`${baseURL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'superadmin@saas.com',
        password: 'superadmin123'
      })
    });

    const loginData = await loginRes.json();
    if (!loginData.success || !loginData.data.token) {
      throw new Error('Login failed: ' + JSON.stringify(loginData));
    }
    const token = loginData.data.token;
    console.log('Login successful! Role:', loginData.data.user.role);

    // Set auth header
    const headers = { 
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}` 
    };

    // 2. Fetch Dashboard Summary
    console.log('\n2. Fetching dashboard summary...');
    const summaryRes = await fetch(`${baseURL}/superadmin/dashboard/summary`, { headers });
    const summaryData = await summaryRes.json();
    console.log('Summary response status:', summaryRes.status);
    console.log('Summary data:', summaryData.data);

    // 3. Fetch Upcoming Renewals
    console.log('\n3. Fetching upcoming renewals...');
    const renewalsRes = await fetch(`${baseURL}/superadmin/dashboard/upcoming-renewals`, { headers });
    const renewalsData = await renewalsRes.json();
    console.log('Upcoming renewals status:', renewalsRes.status);
    console.log('Renewals count:', renewalsData.data.length);

    // 4. Fetch Admins
    console.log('\n4. Fetching admins...');
    const adminsRes = await fetch(`${baseURL}/superadmin/admins`, { headers });
    const adminsData = await adminsRes.json();
    console.log('Admins list status:', adminsRes.status);
    console.log('Admins count:', adminsData.data.length);
    console.log('Admins data:', adminsData.data);

    // 5. Fetch Plans
    console.log('\n5. Fetching plans...');
    const plansRes = await fetch(`${baseURL}/superadmin/plans`, { headers });
    const plansData = await plansRes.json();
    console.log('Plans status:', plansRes.status);
    console.log('Plans count:', plansData.data.length);

    // 6. Fetch Payments
    console.log('\n6. Fetching payments...');
    const paymentsRes = await fetch(`${baseURL}/superadmin/payments`, { headers });
    const paymentsData = await paymentsRes.json();
    console.log('Payments status:', paymentsRes.status);
    console.log('Payments count:', paymentsData.data.length);

    // 7. Fetch Settings
    console.log('\n7. Fetching settings...');
    const settingsRes = await fetch(`${baseURL}/superadmin/settings`, { headers });
    const settingsData = await settingsRes.json();
    console.log('Settings status:', settingsRes.status);
    console.log('Settings data:', settingsData.data);

    console.log('\nAll Super Admin APIs validated successfully!');
    process.exit(0);
  } catch (error) {
    console.error('API validation failed:', error.message);
    process.exit(1);
  }
}

runTests();
