// Step 11 Comprehensive Verification Script: Real Checkout and Stationery Order Workflow
async function request(url, options = {}, postData = null) {
  const fetchOptions = {
    method: options.method || 'GET',
    headers: {
      'Connection': 'close',
      ...(options.headers || {}),
    },
  };

  if (postData) {
    fetchOptions.headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(postData);
  }

  const response = await fetch(url, fetchOptions);
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return {
    status: response.status,
    headers: response.headers,
    data,
    raw: text,
  };
}

async function login(email, password) {
  const res = await request('http://127.0.0.1:8000/api/auth/login/', { method: 'POST' }, { email, password });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(res.data)}`);
  }
  return res.data.access;
}

async function runTests() {
  console.log('================================================================');
  console.log('STARTING STEP 11 REAL CHECKOUT & ORDER WORKFLOW TESTS');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  try {
    // 1. Backend Health Check
    const health = await request('http://127.0.0.1:8000/api/health/');
    if (health.status === 200 && health.data.status === 'ok') {
      console.log('✅ Test 1: Backend Health Check OK (/api/health/)');
      passed++;
    } else {
      console.error('❌ Test 1: Backend Health Check Failed');
      failed++;
    }

    // 2. Student Authentication
    const studentToken = await login('student@campus.edu', 'StudentPass123!');
    const studentHeaders = { Authorization: `Bearer ${studentToken}` };
    console.log('✅ Test 2: Student JWT Authentication successful');
    passed++;

    // 3. Shop & Product Inspection
    const shopsRes = await request('http://127.0.0.1:8000/api/shops/', { headers: studentHeaders });
    const shops = shopsRes.data.results || shopsRes.data;
    const bookstore = shops.find((s) => s.slug === 'central-campus-bookstore') || shops[0];
    console.log(`ℹ️ Testing against shop: ${bookstore.name} (ID: ${bookstore.id})`);

    const productsRes = await request(`http://127.0.0.1:8000/api/products/?shop=${bookstore.id}`, { headers: studentHeaders });
    const products = productsRes.data.results || productsRes.data;
    const testProduct = products.find((p) => p.current_stock > 5) || products[0];
    const initialStock = testProduct.current_stock;
    console.log(`ℹ️ Selected Product: ${testProduct.name} (ID: ${testProduct.id}, Stock: ${initialStock}, Price: ₹${testProduct.price})`);

    // 4. Pickup Slots Inspection
    const slotsRes = await request(`http://127.0.0.1:8000/api/pickup-slots/?shop=${bookstore.id}&available=true`, { headers: studentHeaders });
    const slots = slotsRes.data.results || slotsRes.data;
    const availableSlot = slots.find((s) => s.is_available);
    if (!availableSlot) {
      throw new Error('No available pickup slot found for testing');
    }
    const slotInitialBooked = availableSlot.booked_count;
    console.log(`ℹ️ Available Slot: ID ${availableSlot.id} (${availableSlot.date} ${availableSlot.start_time}-${availableSlot.end_time}, booked: ${slotInitialBooked}/${availableSlot.capacity})`);

    // 5. Test Counter Pickup Order Creation
    const pickupPayload = {
      shop: bookstore.id,
      order_type: 'STATIONERY',
      fulfillment_type: 'PICKUP',
      pickup_slot: availableSlot.id,
      payment_method: 'COD',
      order_notes: 'Automated Step 11 Pickup Test',
      items: [{ product_id: testProduct.id, quantity: 2 }],
    };

    const order1Res = await request('http://127.0.0.1:8000/api/orders/', { method: 'POST', headers: studentHeaders }, pickupPayload);
    let order1 = null;
    if (order1Res.status === 201 && order1Res.data.success) {
      order1 = order1Res.data.order;
      const expectedSubtotal = parseFloat(testProduct.price) * 2;
      const actualSubtotal = parseFloat(order1.subtotal);
      const deliveryFee = parseFloat(order1.delivery_fee);
      const totalAmount = parseFloat(order1.total_amount);

      if (actualSubtotal === expectedSubtotal && deliveryFee === 0 && totalAmount === expectedSubtotal) {
        console.log(`✅ Test 3: Pickup Order created successfully (ID: ${order1.id}, Subtotal: ₹${actualSubtotal}, Fee: ₹${deliveryFee}, Total: ₹${totalAmount})`);
        passed++;
      } else {
        console.error(`❌ Test 3 Failed: Pricing mismatch (Expected ₹${expectedSubtotal}, got ₹${totalAmount})`);
        failed++;
      }
    } else {
      console.error(`❌ Test 3 Failed: ${JSON.stringify(order1Res.data)}`);
      failed++;
    }

    // Verify stock deduction and slot booked_count increment
    const verifyProdRes = await request(`http://127.0.0.1:8000/api/products/${testProduct.id}/`, { headers: studentHeaders });
    const updatedStock = verifyProdRes.data.current_stock;
    if (updatedStock === initialStock - 2) {
      console.log(`✅ Test 4: Inventory safely decremented by 2 (Was: ${initialStock}, Now: ${updatedStock})`);
      passed++;
    } else {
      console.error(`❌ Test 4 Failed: Stock expected ${initialStock - 2}, got ${updatedStock}`);
      failed++;
    }

    const verifySlotRes = await request(`http://127.0.0.1:8000/api/pickup-slots/${availableSlot.id}/`, { headers: studentHeaders });
    if (verifySlotRes.data.booked_count === slotInitialBooked + 1) {
      console.log(`✅ Test 5: Pickup slot booked_count incremented safely (Now: ${verifySlotRes.data.booked_count}/${verifySlotRes.data.capacity})`);
      passed++;
    } else {
      console.error(`❌ Test 5 Failed: Slot booked_count expected ${slotInitialBooked + 1}, got ${verifySlotRes.data.booked_count}`);
      failed++;
    }

    // 6. Test Campus Delivery Order Creation
    const deliveryPayload = {
      shop: bookstore.id,
      order_type: 'STATIONERY',
      fulfillment_type: 'DELIVERY',
      delivery_address: 'Name: Alex Kumar, Hostel: Ganga Hostel Block B, Room: 304, Phone: +919876543210',
      payment_method: 'COD',
      order_notes: 'Please leave with security if unavailable',
      items: [{ product_id: testProduct.id, quantity: 1 }],
    };

    const order2Res = await request('http://127.0.0.1:8000/api/orders/', { method: 'POST', headers: studentHeaders }, deliveryPayload);
    let order2 = null;
    if (order2Res.status === 201 && order2Res.data.success) {
      order2 = order2Res.data.order;
      const expectedItemPrice = parseFloat(testProduct.price);
      const deliveryFee = parseFloat(order2.delivery_fee);
      const totalAmount = parseFloat(order2.total_amount);

      if (deliveryFee === 15.0 && totalAmount === expectedItemPrice + 15.0) {
        console.log(`✅ Test 6: Campus Delivery Order created successfully (ID: ${order2.id}, Subtotal: ₹${expectedItemPrice}, Fee: ₹${deliveryFee}, Total: ₹${totalAmount})`);
        passed++;
      } else {
        console.error(`❌ Test 6 Failed: Delivery fee expected ₹15.00, got ₹${deliveryFee}, total: ₹${totalAmount}`);
        failed++;
      }
    } else {
      console.error(`❌ Test 6 Failed: ${JSON.stringify(order2Res.data)}`);
      failed++;
    }

    // 7. Stock Overselling Protection (Available < Requested)
    const stockAfterOrders = (await request(`http://127.0.0.1:8000/api/products/${testProduct.id}/`, { headers: studentHeaders })).data.current_stock;
    const excessivePayload = {
      shop: bookstore.id,
      fulfillment_type: 'PICKUP',
      pickup_slot: availableSlot.id,
      payment_method: 'COD',
      items: [{ product_id: testProduct.id, quantity: stockAfterOrders + 50 }],
    };

    const oversellRes = await request('http://127.0.0.1:8000/api/orders/', { method: 'POST', headers: studentHeaders }, excessivePayload);
    if (oversellRes.status === 400 && JSON.stringify(oversellRes.data).includes('Insufficient stock')) {
      // Check stock stayed identical
      const postStock = (await request(`http://127.0.0.1:8000/api/products/${testProduct.id}/`, { headers: studentHeaders })).data.current_stock;
      if (postStock === stockAfterOrders) {
        console.log(`✅ Test 7: Stock protection passed! Overselling rejected with 400 Bad Request and stock maintained intact (${postStock})`);
        passed++;
      } else {
        console.error(`❌ Test 7 Failed: Stock modified after failed order`);
        failed++;
      }
    } else {
      console.error(`❌ Test 7 Failed: Expected 400 Insufficient Stock, got ${oversellRes.status} ${JSON.stringify(oversellRes.data)}`);
      failed++;
    }

    // 8. Pickup Capacity Protection (Attempt to book a slot that is full)
    const allSlotsRes = await request(`http://127.0.0.1:8000/api/pickup-slots/?shop=${bookstore.id}`, { headers: studentHeaders });
    const allSlots = allSlotsRes.data.results || allSlotsRes.data;
    const fullSlot = allSlots.find((s) => s.booked_count >= s.capacity);

    if (fullSlot) {
      const fullSlotPayload = {
        shop: bookstore.id,
        fulfillment_type: 'PICKUP',
        pickup_slot: fullSlot.id,
        payment_method: 'COD',
        items: [{ product_id: testProduct.id, quantity: 1 }],
      };
      const capacityRes = await request('http://127.0.0.1:8000/api/orders/', { method: 'POST', headers: studentHeaders }, fullSlotPayload);
      if (capacityRes.status === 400 && (JSON.stringify(capacityRes.data).includes('capacity') || JSON.stringify(capacityRes.data).includes('slot'))) {
        console.log(`✅ Test 8: Pickup slot capacity protection passed! Rejected full slot (${fullSlot.booked_count}/${fullSlot.capacity}) with 400 Bad Request`);
        passed++;
      } else {
        console.error(`❌ Test 8 Failed: Expected 400 capacity rejection, got ${capacityRes.status} ${JSON.stringify(capacityRes.data)}`);
        failed++;
      }
    } else {
      console.log('⚠️ Test 8 Skipped: No fully booked slot found to test');
    }

    // 9. Order Security & Isolation (Student A vs Student B)
    let student2Token;
    try {
      student2Token = await login('student2@campus.edu', 'StudentPass123!');
    } catch {
      // Register student 2
      const regRes = await request('http://127.0.0.1:8000/api/auth/register/', { method: 'POST' }, {
        email: 'student2@campus.edu',
        name: 'Priya Sharma',
        password: 'StudentPass123!',
        password_confirm: 'StudentPass123!',
        role: 'STUDENT',
      });
      if (regRes.status === 200 || regRes.status === 201) {
        student2Token = regRes.data.access || regRes.data.tokens?.access;
      } else {
        throw new Error(`Could not register student2 for isolation testing: ${JSON.stringify(regRes.data)}`);
      }
    }

    const student2Headers = { Authorization: `Bearer ${student2Token}` };
    const accessRes = await request(`http://127.0.0.1:8000/api/orders/${order1.id}/`, { headers: student2Headers });
    if (accessRes.status === 404 || accessRes.status === 403) {
      console.log(`✅ Test 9: Student Order Security passed! Student B cannot view Student A's order (Received ${accessRes.status})`);
      passed++;
    } else {
      console.error(`❌ Test 9 Failed: Student B was able to access Student A order! Status ${accessRes.status}`);
      failed++;
    }

    // 10. Shop Owner Isolation
    const xeroxOwnerToken = await login('owner@campus.edu', 'OwnerPass123!');
    const bookstoreOwnerToken = await login('sharma@stationery.com', 'ShopOwnerPass123!');

    // Xerox owner queries Order 1 (Central Bookstore order)
    const xeroxOrderRes = await request(`http://127.0.0.1:8000/api/orders/${order1.id}/`, { headers: { Authorization: `Bearer ${xeroxOwnerToken}` } });
    if (xeroxOrderRes.status === 404 || xeroxOrderRes.status === 403) {
      console.log(`✅ Test 10: Shop Owner Isolation passed! Unrelated shop owner cannot access another shop's order (Received ${xeroxOrderRes.status})`);
      passed++;
    } else {
      console.error(`❌ Test 10 Failed: Unrelated shop owner could access order! Status ${xeroxOrderRes.status}`);
      failed++;
    }

    // Bookstore owner queries Order 1
    const bookstoreOrderRes = await request(`http://127.0.0.1:8000/api/orders/${order1.id}/`, { headers: { Authorization: `Bearer ${bookstoreOwnerToken}` } });
    if (bookstoreOrderRes.status === 200 && bookstoreOrderRes.data.id === order1.id) {
      console.log(`✅ Test 11: Shop Owner Compatibility passed! Target shop owner can view the order.`);
      passed++;
    } else {
      console.error(`❌ Test 11 Failed: Target shop owner could not view their order! Status ${bookstoreOrderRes.status}`);
      failed++;
    }

    // 11. Order Cancellation & Stock Restoration
    const stockBeforeCancel = (await request(`http://127.0.0.1:8000/api/products/${testProduct.id}/`, { headers: studentHeaders })).data.current_stock;
    const cancelRes = await request(`http://127.0.0.1:8000/api/orders/${order1.id}/cancel/`, { method: 'POST', headers: studentHeaders });

    if (cancelRes.status === 200 && cancelRes.data.order.status === 'CANCELLED') {
      const stockAfterCancel = (await request(`http://127.0.0.1:8000/api/products/${testProduct.id}/`, { headers: studentHeaders })).data.current_stock;
      if (stockAfterCancel === stockBeforeCancel + 2) {
        console.log(`✅ Test 12: Order Cancellation & Atomic Stock Restoration passed! Status is CANCELLED and stock restored (+2) from ${stockBeforeCancel} to ${stockAfterCancel}`);
        passed++;
      } else {
        console.error(`❌ Test 12 Failed: Stock not restored properly (Expected ${stockBeforeCancel + 2}, got ${stockAfterCancel})`);
        failed++;
      }
    } else {
      console.error(`❌ Test 12 Failed: Cancellation request failed ${cancelRes.status} ${JSON.stringify(cancelRes.data)}`);
      failed++;
    }

    // 12. Retrieve Order Details by UUID order_number
    const uuidRes = await request(`http://127.0.0.1:8000/api/orders/${order2.order_number}/`, { headers: studentHeaders });
    if (uuidRes.status === 200 && uuidRes.data.id === order2.id) {
      console.log(`✅ Test 13: Order Detail retrieval by UUID order_number passed!`);
      passed++;
    } else {
      console.error(`❌ Test 13 Failed: Retrieval by UUID failed ${uuidRes.status}`);
      failed++;
    }

    // 13. My Orders List verification
    const myOrdersRes = await request('http://127.0.0.1:8000/api/orders/', { headers: studentHeaders });
    const myOrders = myOrdersRes.data.results || myOrdersRes.data;
    if (myOrders.length >= 2 && myOrders.some((o) => o.id === order2.id)) {
      console.log(`✅ Test 14: My Orders List endpoint verified! Returned ${myOrders.length} orders for student.`);
      passed++;
    } else {
      console.error(`❌ Test 14 Failed: My Orders list incomplete`);
      failed++;
    }
  } catch (err) {
    console.error('Unhandled Exception in Test Suite:', err);
    failed++;
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
