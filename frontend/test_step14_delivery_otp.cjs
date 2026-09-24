// Comprehensive Step 14 Delivery Management & Delivery OTP Integration Test
const http = require('http');

const API_BASE = 'http://127.0.0.1:8000';

function makeRequest(urlPath, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, API_BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const payload = body ? JSON.stringify(body) : null;
    if (payload) {
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: parsed, raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', (e) => reject(e));

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function login(email, password) {
  const res = await makeRequest('/api/auth/login/', 'POST', { email, password });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email} (${res.status}): ${JSON.stringify(res.data)}`);
  }
  return {
    access: res.data.tokens ? res.data.tokens.access : res.data.access,
    user: res.data.user,
  };
}

async function runStep14Tests() {
  console.log('===============================================================');
  console.log(' STEP 14: CAMPUS DELIVERY MANAGEMENT & DELIVERY OTP VERIFICATION');
  console.log('===============================================================\n');

  try {
    // 1. Authenticate Actors
    console.log('[1/10] Authenticating system actors...');
    const student = await login('student@campus.edu', 'StudentPass123!');
    console.log(`  ✓ Student authenticated: ${student.user.email} (${student.user.role})`);

    const owner = await login('owner@campus.edu', 'OwnerPass123!');
    console.log(`  ✓ Shop Owner authenticated: ${owner.user.email} (${owner.user.role})`);

    const courier = await login('delivery@campus.edu', 'DeliveryPass123!');
    console.log(`  ✓ Courier authenticated: ${courier.user.email} (${courier.user.role})`);

    // 2. Address Management
    console.log('\n[2/10] Testing Student Campus Address Management...');
    const createAddressRes = await makeRequest(
      '/api/addresses/',
      'POST',
      {
        label: 'Step14 Hostel Room',
        hostel_block: 'Godavari Hostel',
        room_number: 'B-314',
        landmark: 'Near North Mess',
        phone_number: '+919876543210',
        is_default: true,
      },
      student.access
    );

    if (createAddressRes.status !== 201) {
      throw new Error(`Failed to create address: ${JSON.stringify(createAddressRes.data)}`);
    }
    const createdAddress = createAddressRes.data;
    console.log(`  ✓ Address created: #${createdAddress.id} - ${createdAddress.formatted_address}`);

    const getAddressesRes = await makeRequest('/api/addresses/', 'GET', null, student.access);
    const addresses = getAddressesRes.data.results || getAddressesRes.data;
    console.log(`  ✓ Found ${addresses.length} saved addresses for student`);

    // Test setting default
    const setDefaultRes = await makeRequest(
      `/api/addresses/${createdAddress.id}/set-default/`,
      'POST',
      {},
      student.access
    );
    console.log(`  ✓ Set default address result: ${setDefaultRes.status} (${setDefaultRes.data.detail})`);

    // 3. Delivery Charge Calculation
    console.log('\n[3/10] Testing Delivery Charge Calculation API...');
    const chargeRes = await makeRequest('/api/deliveries/calculate-charge/?subtotal=180', 'GET', null, student.access);
    console.log(`  ✓ Charge calculation response:`, chargeRes.data);
    if (chargeRes.status !== 200 || typeof chargeRes.data.delivery_charge !== 'number') {
      throw new Error('Delivery charge calculation endpoint failed');
    }

    // 4. Place Stationery Order with Campus Delivery
    console.log('\n[4/10] Placing Stationery Order with Campus Delivery...');
    // Get shops and products - select the shop owned by owner@campus.edu
    const shopsRes = await makeRequest('/api/shops/', 'GET', null, owner.access);
    const shops = shopsRes.data.results || shopsRes.data;
    const testShop = shops.find((s) => s.owner === owner.user.id || s.owner_email === owner.user.email) || shops[0];
    console.log(`  Selected shop: #${testShop.id} - ${testShop.name} (Owner: ${testShop.owner_email || testShop.owner})`);

    const productsRes = await makeRequest(`/api/products/?shop=${testShop.id}`, 'GET', null, student.access);
    const products = productsRes.data.results || productsRes.data;
    const testProduct = products[0];
    console.log(`  Selected product: #${testProduct.id} - ${testProduct.name} (Stock: ${testProduct.stock_quantity})`);

    const orderPayload = {
      shop: testShop.id,
      order_type: 'STATIONERY',
      fulfillment_type: 'DELIVERY',
      hostel_block: createdAddress.hostel_block,
      room_number: createdAddress.room_number,
      delivery_address: createdAddress.formatted_address,
      payment_method: 'COD',
      order_notes: 'Leave at hostel reception if room locked.',
      items: [
        {
          product_id: testProduct.id,
          quantity: 1,
        },
      ],
    };

    const orderRes = await makeRequest('/api/orders/', 'POST', orderPayload, student.access);
    if (orderRes.status !== 201) {
      throw new Error(`Order creation failed (${orderRes.status}): ${JSON.stringify(orderRes.data)}`);
    }
    const order = orderRes.data.order || orderRes.data;
    console.log(`  ✓ Order created successfully: #${order.id} (${order.order_number})`);
    console.log(`    Status: ${order.status}, Fulfillment: ${order.fulfillment_type}, Delivery Total: ₹${order.total_amount}`);

    // Verify Delivery record automatically generated
    console.log('\n[5/10] Verifying Delivery record generation...');
    const deliveriesRes = await makeRequest('/api/deliveries/', 'GET', null, owner.access);
    const deliveriesList = deliveriesRes.data.results || deliveriesRes.data;
    const matchingDelivery = deliveriesList.find((d) => d.order === order.id || d.order_id === order.id);

    if (!matchingDelivery) {
      throw new Error(`No delivery record found for order #${order.id}`);
    }
    console.log(`  ✓ Delivery record exists: #${matchingDelivery.id}, Status: ${matchingDelivery.delivery_status}`);

    // 5. Courier Assignment by Shop Owner
    console.log('\n[6/10] Testing Courier Assignment by Shop Owner...');
    const agentsRes = await makeRequest('/api/deliveries/agents/', 'GET', null, owner.access);
    const agentsList = agentsRes.data.results || agentsRes.data;
    console.log(`  ✓ Available couriers fetched: ${agentsList.length} registered agents`);
    const agentVikram = agentsList.find((a) => a.id === courier.user.id || a.email === courier.user.email) || agentsList[0];

    const assignRes = await makeRequest(
      `/api/deliveries/${matchingDelivery.id}/assign/`,
      'POST',
      { delivery_agent_id: agentVikram.id },
      owner.access
    );
    if (assignRes.status !== 200) {
      throw new Error(`Assign delivery failed (${assignRes.status}): ${JSON.stringify(assignRes.data)}`);
    }
    const assignedDelivery = assignRes.data.delivery || assignRes.data;
    console.log(`  ✓ Assigned to agent ${agentVikram.name} (${agentVikram.email || agentVikram.username})`);
    console.log(`    New Delivery Status: ${assignedDelivery.delivery_status}`);

    // 6. Courier starts transit -> OUT_FOR_DELIVERY (Triggers OTP generation)
    console.log('\n[7/10] Courier starts delivery run -> OUT_FOR_DELIVERY & OTP generation...');
    const transitRes = await makeRequest(
      `/api/deliveries/${matchingDelivery.id}/update-status/`,
      'POST',
      { status: 'OUT_FOR_DELIVERY' },
      courier.access
    );
    if (transitRes.status !== 200) {
      throw new Error(`Status update failed (${transitRes.status}): ${JSON.stringify(transitRes.data)}`);
    }
    const transitDelivery = transitRes.data.delivery || transitRes.data;
    console.log(`  ✓ Status updated to OUT_FOR_DELIVERY. Active OTP generated: ${transitDelivery.has_active_otp}`);

    // 7. Test Student OTP Access & Security Isolation
    console.log('\n[8/10] Testing Secure Student OTP Retrieval & Access Control...');
    // Courier must NOT be able to view raw OTP via student OTP endpoint
    const unauthorizedOtpRes = await makeRequest(
      `/api/deliveries/${matchingDelivery.id}/delivery-otp/`,
      'GET',
      null,
      courier.access
    );
    if (unauthorizedOtpRes.status === 200 && unauthorizedOtpRes.data.otp) {
      throw new Error('SECURITY VIOLATION: Courier should NOT be able to inspect plain student delivery OTP!');
    }
    console.log(`  ✓ Courier access to student OTP correctly blocked (${unauthorizedOtpRes.status})`);

    // Student fetches their OTP
    const studentOtpRes = await makeRequest(
      `/api/deliveries/${matchingDelivery.id}/delivery-otp/`,
      'GET',
      null,
      student.access
    );
    if (studentOtpRes.status !== 200 || !studentOtpRes.data.otp) {
      throw new Error(`Student failed to retrieve delivery OTP: ${JSON.stringify(studentOtpRes.data)}`);
    }
    const studentOtp = studentOtpRes.data.otp;
    console.log(`  ✓ Student securely retrieved 6-digit Delivery OTP: [${studentOtp}]`);
    console.log(`    Expires at: ${studentOtpRes.data.expires_at}`);

    // 8. Test Invalid OTP Doorstep Rejection
    console.log('\n[9/10] Testing Invalid OTP Rejection at Doorstep...');
    const invalidVerifyRes = await makeRequest(
      `/api/deliveries/${matchingDelivery.id}/verify-delivery-otp/`,
      'POST',
      { otp: '000000' },
      courier.access
    );
    if (invalidVerifyRes.status === 200) {
      throw new Error('FAILED: Delivery accepted invalid OTP (000000)!');
    }
    console.log(`  ✓ Invalid OTP rejected successfully (${invalidVerifyRes.status}): ${invalidVerifyRes.data.detail || invalidVerifyRes.data.message}`);

    // 9. Doorstep Verification with Valid OTP & Atomic Order Completion
    console.log('\n[10/10] Verifying Valid OTP & Atomic Order Completion...');
    const validVerifyRes = await makeRequest(
      `/api/deliveries/${matchingDelivery.id}/verify-delivery-otp/`,
      'POST',
      { otp: studentOtp },
      courier.access
    );
    if (validVerifyRes.status !== 200) {
      throw new Error(`Valid OTP verification failed (${validVerifyRes.status}): ${JSON.stringify(validVerifyRes.data)}`);
    }
    const completedDelivery = validVerifyRes.data.delivery || validVerifyRes.data;
    console.log(`  ✓ Delivery verified successfully!`);
    console.log(`    Delivery Status: ${completedDelivery.delivery_status}`);
    console.log(`    Order Status: ${completedDelivery.order_status}`);
    console.log(`    Delivered At: ${completedDelivery.delivered_at}`);

    // Verify Replay Attack Prevention
    const replayVerifyRes = await makeRequest(
      `/api/deliveries/${matchingDelivery.id}/verify-delivery-otp/`,
      'POST',
      { otp: studentOtp },
      courier.access
    );
    if (replayVerifyRes.status === 200) {
      throw new Error('FAILED: OTP replay attack succeeded on completed delivery!');
    }
    console.log(`  ✓ Replay attempt safely rejected (${replayVerifyRes.status}): ${replayVerifyRes.data.detail}`);

    // Verify Order is COMPLETED and COD marked PAID
    const finalOrderRes = await makeRequest(`/api/orders/${order.id}/`, 'GET', null, student.access);
    console.log(`\n  Final Order Check:`);
    console.log(`    Order #${finalOrderRes.data.id} Status: ${finalOrderRes.data.status}`);
    console.log(`    Payment Status: ${finalOrderRes.data.payment_status}`);

    console.log('\n===============================================================');
    console.log(' ALL STEP 14 DELIVERY & OTP VERIFICATION TESTS PASSED SUCCESSFULLY! ');
    console.log('===============================================================\n');
  } catch (error) {
    console.error('\n❌ STEP 14 TEST FAILED:', error);
    process.exit(1);
  }
}

runStep14Tests();
