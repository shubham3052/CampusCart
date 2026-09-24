// Comprehensive API and Frontend Integration Verification Script
const http = require('http');

async function request(url, options = {}, postData = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    if (postData) {
      reqOptions.headers['Content-Type'] = 'application/json';
      reqOptions.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(postData));
    }

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });

    req.on('error', reject);
    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('STARTING STEP 9 COMPREHENSIVE INTEGRATION TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Frontend Dev Server
  const frontendPort = process.env.FRONTEND_PORT || '5174';
  try {
    const res = await request(`http://localhost:${frontendPort}/`);
    if (res.status === 200 && (res.raw?.includes('id="root"') || res.raw?.includes('Smart Stationery') || res.raw?.includes('CampusCart') || res.raw?.includes('vite'))) {
      console.log(`✅ Test 1: Frontend Dev Server (http://localhost:${frontendPort}/) is serving React successfully.`);
      passed++;
    } else {
      console.error('❌ Test 1 Failed: Status', res.status);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 1 Failed with error:', err.message);
    failed++;
  }

  // Test 2: Django Backend Health Endpoint
  try {
    const res = await request('http://127.0.0.1:8000/api/health/');
    if (res.status === 200 && res.data?.status === 'ok') {
      console.log('✅ Test 2: Django Backend Health (GET /api/health/) returned status: ok');
      passed++;
    } else {
      console.error('❌ Test 2 Failed:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 2 Failed with error:', err.message);
    failed++;
  }

  // Test 3: Student Login & JWT Token Retrieval
  let studentTokens = null;
  try {
    const res = await request('http://127.0.0.1:8000/api/auth/login/', { method: 'POST' }, {
      email: 'student@campus.edu',
      password: 'StudentPass123!',
    });
    if (res.status === 200 && (res.data?.tokens?.access || res.data?.access)) {
      studentTokens = res.data.tokens || { access: res.data.access, refresh: res.data.refresh };
      const role = res.data.user?.role;
      console.log(`✅ Test 3: Student Login (POST /api/auth/login/) succeeded. Role: ${role}, JWT access token generated.`);
      passed++;
    } else {
      console.error('❌ Test 3 Failed:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 3 Failed with error:', err.message);
    failed++;
  }

  // Test 4: Current Authenticated User (/api/auth/me/)
  try {
    if (studentTokens?.access) {
      const res = await request('http://127.0.0.1:8000/api/auth/me/', {
        method: 'GET',
        headers: { Authorization: `Bearer ${studentTokens.access}` },
      });
      if (res.status === 200 && res.data?.email === 'student@campus.edu' && res.data?.role === 'STUDENT') {
        console.log(`✅ Test 4: Current User Profile (GET /api/auth/me/) retrieved authenticated student: ${res.data.name || res.data.username} (${res.data.role}).`);
        passed++;
      } else {
        console.error('❌ Test 4 Failed:', res.data);
        failed++;
      }
    }
  } catch (err) {
    console.error('❌ Test 4 Failed with error:', err.message);
    failed++;
  }

  // Test 5: Shop Owner Login & Role Verification
  let shopOwnerTokens = null;
  try {
    const res = await request('http://127.0.0.1:8000/api/auth/login/', { method: 'POST' }, {
      email: 'owner@campus.edu',
      password: 'OwnerPass123!',
    });
    if (res.status === 200 && (res.data?.tokens?.access || res.data?.access)) {
      shopOwnerTokens = res.data.tokens || { access: res.data.access, refresh: res.data.refresh };
      const role = res.data.user?.role;
      if (role === 'SHOP_OWNER') {
        console.log(`✅ Test 5: Shop Owner Login (POST /api/auth/login/) succeeded. Role: ${role} correctly identified for merchant dashboard.`);
        passed++;
      } else {
        console.error('❌ Test 5 Failed: Wrong role', role);
        failed++;
      }
    } else {
      console.error('❌ Test 5 Failed:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 5 Failed with error:', err.message);
    failed++;
  }

  // Test 6: Admin Login & Role Verification
  let adminTokens = null;
  try {
    const res = await request('http://127.0.0.1:8000/api/auth/login/', { method: 'POST' }, {
      email: 'admin@campus.edu',
      password: 'AdminPass123!',
    });
    if (res.status === 200 && (res.data?.tokens?.access || res.data?.access)) {
      adminTokens = res.data.tokens || { access: res.data.access, refresh: res.data.refresh };
      const role = res.data.user?.role;
      if (role === 'ADMIN') {
        console.log(`✅ Test 6: Admin Login (POST /api/auth/login/) succeeded. Role: ${role} correctly identified for SuperAdmin dashboard.`);
        passed++;
      } else {
        console.error('❌ Test 6 Failed: Wrong role', role);
        failed++;
      }
    } else {
      console.error('❌ Test 6 Failed:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 6 Failed with error:', err.message);
    failed++;
  }

  // Test 7: JWT Token Refresh Endpoint
  try {
    if (studentTokens?.refresh) {
      const res = await request('http://127.0.0.1:8000/api/auth/token/refresh/', { method: 'POST' }, {
        refresh: studentTokens.refresh,
      });
      if (res.status === 200 && res.data?.access) {
        console.log('✅ Test 7: JWT Token Refresh (POST /api/auth/token/refresh/) succeeded. New access token issued.');
        passed++;
      } else {
        console.error('❌ Test 7 Failed:', res.data);
        failed++;
      }
    }
  } catch (err) {
    console.error('❌ Test 7 Failed with error:', err.message);
    failed++;
  }

  // Test 8: Student Registration
  const testStudentEmail = `test_student_${Date.now()}@campus.edu`;
  const dynamicPhone = `+91998877${Math.floor(1000 + Math.random() * 9000)}`;
  try {
    const res = await request('http://127.0.0.1:8000/api/auth/register/', { method: 'POST' }, {
      name: 'Aditya Verma',
      email: testStudentEmail,
      password: 'TestStudentPass123!',
      phone: dynamicPhone,
      role: 'STUDENT',
      college_id: 'COL-2026-90',
      hostel_block: 'Block A',
      room_number: '304',
    });
    if (res.status === 201 || res.status === 200) {
      console.log(`✅ Test 8: Student Registration (POST /api/auth/register/) created user: ${testStudentEmail} with role STUDENT.`);
      passed++;
    } else {
      console.error('❌ Test 8 Failed:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 8 Failed with error:', err.message);
    failed++;
  }

  // Test 9: JWT Token Logout & Blacklisting
  try {
    if (shopOwnerTokens?.refresh) {
      const res = await request('http://127.0.0.1:8000/api/auth/logout/', {
        method: 'POST',
        headers: { Authorization: `Bearer ${shopOwnerTokens.access}` },
      }, {
        refresh: shopOwnerTokens.refresh,
      });
      if (res.status === 200 || res.status === 205) {
        console.log('✅ Test 9: User Logout & Refresh Token Blacklisting (POST /api/auth/logout/) completed successfully.');
        passed++;
      } else {
        console.error('❌ Test 9 Failed:', res.data);
        failed++;
      }
    }
  } catch (err) {
    console.error('❌ Test 9 Failed with error:', err.message);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`INTEGRATION TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');
}

runTests();
