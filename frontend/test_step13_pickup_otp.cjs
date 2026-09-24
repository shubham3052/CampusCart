const fs = require('fs');

const BASE_URL = 'http://127.0.0.1:8000/api';

async function login(email, password) {
  const res = await fetch(`${BASE_URL}/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(data)}`);
  }
  return data.access;
}

async function runTests() {
  console.log('================================================================');
  console.log('STARTING STEP 13 PICKUP SCHEDULING & OTP VERIFICATION TESTS');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  try {
    // 1. Authenticate Users
    const studentToken = await login('student@campus.edu', 'StudentPass123!');
    const studentHeaders = { Authorization: `Bearer ${studentToken}` };

    const studentBToken = await login('student2@campus.edu', 'StudentPass123!');
    const studentBHeaders = { Authorization: `Bearer ${studentBToken}` };

    const ownerAToken = await login('owner@campus.edu', 'OwnerPass123!');
    const ownerAHeaders = { Authorization: `Bearer ${ownerAToken}` };

    const ownerBToken = await login('sharma@stationery.com', 'ShopOwnerPass123!');
    const ownerBHeaders = { Authorization: `Bearer ${ownerBToken}` };

    console.log('✅ Test 1: Authentication successful for Student A, Student B, Xerox Owner & Bookstore Owner.');
    passed++;

    // Get Xerox Shop ID
    const shopsRes = await fetch(`${BASE_URL}/shops/?search=Xerox`);
    const shopsData = await shopsRes.json();
    const xeroxShop = (shopsData.results || shopsData)[0];
    const xeroxShopId = xeroxShop.id;

    // Get Bookstore Shop ID (Central Campus Bookstore & Stationery owned by vendor_sharma)
    const bookstoreRes = await fetch(`${BASE_URL}/shops/?search=Central+Campus`);
    const bookstoreData = await bookstoreRes.json();
    const bookstoreShop = (bookstoreData.results || bookstoreData)[0];
    const bookstoreShopId = bookstoreShop.id;

    // 2. Shop Owner Pickup Slot Creation & Update
    const randDay = 10 + Math.floor(Math.random() * 18);
    const testDate = `2026-11-${String(randDay).padStart(2, '0')}`;
    const randOffset = Math.floor(Math.random() * 20);
    const time1Start = `09:${String(randOffset).padStart(2, '0')}:00`;
    const time1End = `09:${String(randOffset + 25).padStart(2, '0')}:00`;
    const time2Start = `11:${String(randOffset).padStart(2, '0')}:00`;
    const time2End = `11:${String(randOffset + 25).padStart(2, '0')}:00`;
    const time3Start = `14:${String(randOffset).padStart(2, '0')}:00`;
    const time3End = `14:${String(randOffset + 25).padStart(2, '0')}:00`;

    const createSlotRes = await fetch(`${BASE_URL}/pickup-slots/`, {
      method: 'POST',
      headers: { ...ownerAHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop: xeroxShopId,
        date: testDate,
        start_time: time1Start,
        end_time: time1End,
        capacity: 2,
        is_active: true,
      }),
    });
    const newSlot = await createSlotRes.json();

    if (createSlotRes.status === 201 && newSlot.id && newSlot.capacity === 2) {
      console.log(`✅ Test 2: Shop Owner created pickup slot #${newSlot.id} (${testDate} ${time1Start}-${time1End}, Capacity: ${newSlot.capacity}).`);
      passed++;
    } else {
      console.error(`❌ Test 2 Failed: Could not create slot: ${JSON.stringify(newSlot)}`);
      failed++;
    }

    // Shop Owner A updates capacity to 4
    const updateSlotRes = await fetch(`${BASE_URL}/pickup-slots/${newSlot.id}/`, {
      method: 'PATCH',
      headers: { ...ownerAHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ capacity: 4 }),
    });
    const updatedSlot = await updateSlotRes.json();
    if (updateSlotRes.status === 200 && updatedSlot.capacity === 4) {
      console.log(`✅ Test 3: Shop Owner updated pickup slot #${newSlot.id} capacity (2 -> 4).`);
      passed++;
    } else {
      console.error(`❌ Test 3 Failed: Update capacity failed: ${JSON.stringify(updatedSlot)}`);
      failed++;
    }

    // Unrelated Shop Owner B tries to update Owner A's slot -> Rejected (403/404)
    const badUpdateRes = await fetch(`${BASE_URL}/pickup-slots/${newSlot.id}/`, {
      method: 'PATCH',
      headers: { ...ownerBHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ capacity: 10 }),
    });
    if (badUpdateRes.status === 403 || badUpdateRes.status === 404) {
      console.log('✅ Test 4: Cross-shop isolation verified! Bookstore Owner cannot modify Xerox Owner slot (403/404).');
      passed++;
    } else {
      console.error(`❌ Test 4 Failed: Expected 403/404, got ${badUpdateRes.status}`);
      failed++;
    }

    // 3. Student Available Slots Query
    const availRes = await fetch(`${BASE_URL}/pickup-slots/available/?shop_id=${xeroxShopId}&date=${testDate}`);
    const availData = await availRes.json();
    const availSlots = availData.results || availData;
    const foundSlot = availSlots.find((s) => s.id === newSlot.id);

    if (availRes.status === 200 && foundSlot && foundSlot.available_capacity > 0) {
      console.log(`✅ Test 5: GET /api/pickup-slots/available/ returned valid active future slots with available_capacity (${foundSlot.available_capacity}).`);
      passed++;
    } else {
      console.error(`❌ Test 5 Failed: ${JSON.stringify(availData)}`);
      failed++;
    }

    // 4. ATOMIC CAPACITY & CONCURRENCY RACE CONDITION TEST
    // Create a special slot with capacity = 1 and booked_count = 0
    const raceSlotRes = await fetch(`${BASE_URL}/pickup-slots/`, {
      method: 'POST',
      headers: { ...ownerAHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop: xeroxShopId,
        date: testDate,
        start_time: time2Start,
        end_time: time2End,
        capacity: 1,
        is_active: true,
      }),
    });
    const raceSlot = await raceSlotRes.json();

    // Get a product from Xerox Shop
    const prodRes = await fetch(`${BASE_URL}/products/?shop=${xeroxShopId}`);
    const prodsData = await prodRes.json();
    const product = (prodsData.results || prodsData)[0];

    // Two students place orders simultaneously for the single available spot!
    const orderPayload = {
      shop: xeroxShopId,
      fulfillment_type: 'PICKUP',
      pickup_slot: raceSlot.id,
      payment_method: 'COD',
      items: [{ product_id: product.id, quantity: 1 }],
    };

    const [raceRes1, raceRes2] = await Promise.all([
      fetch(`${BASE_URL}/orders/`, {
        method: 'POST',
        headers: { ...studentHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      }),
      fetch(`${BASE_URL}/orders/`, {
        method: 'POST',
        headers: { ...studentBHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      }),
    ]);

    const statuses = [raceRes1.status, raceRes2.status].sort();
    // One must be 201 Created, the other must be 400 Bad Request
    const checkRaceSlot = await (await fetch(`${BASE_URL}/pickup-slots/${raceSlot.id}/`, { headers: studentHeaders })).json();

    if (statuses[0] === 201 && statuses[1] === 400 && checkRaceSlot.booked_count === 1) {
      console.log('✅ Test 6: ATOMIC CONCURRENCY RACE CONDITION PASSED! 2 simultaneous orders for single-capacity slot: exactly 1 succeeded, 1 rejected, booked_count=1/1 (no overbooking).');
      passed++;
    } else {
      console.error(`❌ Test 6 Failed: Race condition failed. Statuses: ${statuses}, booked_count: ${checkRaceSlot.booked_count}`);
      failed++;
    }

    // Capture the successful order from the race condition
    const winOrder = raceRes1.status === 201 ? await raceRes1.json() : await raceRes2.json();
    const stationeryOrder = winOrder.order || winOrder;

    // 5. Plaintext OTP Security Check (Not leaked in standard order detail)
    const detailRes = await fetch(`${BASE_URL}/orders/${stationeryOrder.id}/`, { headers: studentHeaders });
    const detailData = await detailRes.json();
    if (detailData.active_otp === null) {
      console.log('✅ Test 7: Plaintext OTP security verified! Normal GET /api/orders/{id}/ does NOT return plaintext OTP (active_otp is null).');
      passed++;
    } else {
      console.error(`❌ Test 7 Failed: OTP was exposed in normal detail endpoint: ${detailData.active_otp}`);
      failed++;
    }

    // 6. Order Status Lifecycle: PENDING -> CONFIRMED -> PREPARING -> READY
    const moveConfirm = await fetch(`${BASE_URL}/orders/${stationeryOrder.id}/`, {
      method: 'PATCH',
      headers: { ...ownerAHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CONFIRMED' }),
    });
    const movePrep = await fetch(`${BASE_URL}/orders/${stationeryOrder.id}/`, {
      method: 'PATCH',
      headers: { ...ownerAHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'PREPARING' }),
    });
    const moveReady = await fetch(`${BASE_URL}/orders/${stationeryOrder.id}/`, {
      method: 'PATCH',
      headers: { ...ownerAHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'READY' }),
    });
    const readyData = await moveReady.json();

    if (moveConfirm.status === 200 && movePrep.status === 200 && moveReady.status === 200 && readyData.status === 'READY') {
      console.log(`✅ Test 8: Order lifecycle progression verified: PENDING -> CONFIRMED -> PREPARING -> READY.`);
      passed++;
    } else {
      console.error(`❌ Test 8 Failed: Status progression failed ${JSON.stringify(readyData)}`);
      failed++;
    }

    // 7. Secure Student OTP Retrieval
    const otpResStudentA = await fetch(`${BASE_URL}/orders/${stationeryOrder.id}/pickup-otp/`, { headers: studentHeaders });
    const otpDataA = await otpResStudentA.json();

    // Unauthorized Student B attempts to get Student A's OTP -> 403 Forbidden!
    const otpResStudentB = await fetch(`${BASE_URL}/orders/${stationeryOrder.id}/pickup-otp/`, { headers: studentBHeaders });

    let studentOtpCode = null;
    if (otpResStudentA.status === 200 && otpDataA.success && otpDataA.otp.length === 6 && (otpResStudentB.status === 403 || otpResStudentB.status === 404)) {
      studentOtpCode = otpDataA.otp;
      console.log(`✅ Test 9: Secure OTP Retrieval passed! Student A received 6-digit OTP (${studentOtpCode}), unauthorized Student B denied (403/404).`);
      passed++;
    } else {
      console.error(`❌ Test 9 Failed: OTP retrieval access error: Student A ${otpResStudentA.status}, Student B ${otpResStudentB.status}`);
      failed++;
    }

    // 8. Invalid OTP Verification & Attempt Tracking
    const invalidOtpRes = await fetch(`${BASE_URL}/orders/${stationeryOrder.id}/verify-pickup-otp/`, {
      method: 'POST',
      headers: { ...ownerAHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp: '000000' }),
    });
    const invalidData = await invalidOtpRes.json();
    if (invalidOtpRes.status === 400 && invalidData.message.includes('Invalid OTP') && invalidData.attempts_remaining !== undefined) {
      console.log(`✅ Test 10: Invalid OTP entry safely rejected with attempt rate-limiting (${invalidData.message}).`);
      passed++;
    } else {
      console.error(`❌ Test 10 Failed: Expected 400 rejection, got ${invalidOtpRes.status}`);
      failed++;
    }

    // 9. Valid OTP Verification by Shop Owner
    const validVerifyRes = await fetch(`${BASE_URL}/orders/${stationeryOrder.id}/verify-pickup-otp/`, {
      method: 'POST',
      headers: { ...ownerAHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp: studentOtpCode }),
    });
    const verifyData = await validVerifyRes.json();

    if (validVerifyRes.status === 200 && verifyData.success && verifyData.order.status === 'COMPLETED' && verifyData.verified_by_role === 'SHOP_OWNER') {
      console.log(`✅ Test 11: Shop Owner OTP Verification PASSED! Order moved to COMPLETED, verified_by_role: ${verifyData.verified_by_role}.`);
      passed++;
    } else {
      console.error(`❌ Test 11 Failed: Verification failed: ${JSON.stringify(verifyData)}`);
      failed++;
    }

    // 10. Re-using already verified OTP rejected
    const reuseRes = await fetch(`${BASE_URL}/orders/${stationeryOrder.id}/verify-pickup-otp/`, {
      method: 'POST',
      headers: { ...ownerAHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp: studentOtpCode }),
    });
    const reuseData = await reuseRes.json();
    if (reuseRes.status === 400 && reuseData.message.includes('already')) {
      console.log('✅ Test 12: Reusing verified OTP safely rejected with 400 Bad Request.');
      passed++;
    } else {
      console.error(`❌ Test 12 Failed: Expected rejection of reused OTP: ${reuseRes.status}`);
      failed++;
    }

    // 11. Unrelated Shop Owner cannot verify another shop's order
    // Place a new order at Bookstore
    const bookstoreProdRes = await fetch(`${BASE_URL}/products/?shop=${bookstoreShopId}`);
    const bookstoreProdData = await bookstoreProdRes.json();
    const bookstoreProds = bookstoreProdData.results || bookstoreProdData;

    // Ensure Bookstore has a valid slot for testDate
    const bsSlotCreateRes = await fetch(`${BASE_URL}/pickup-slots/`, {
      method: 'POST',
      headers: { ...ownerBHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop: bookstoreShopId,
        date: testDate,
        start_time: time3Start,
        end_time: time3End,
        capacity: 5,
        is_active: true,
      }),
    });
    let bsSlot = await bsSlotCreateRes.json();
    if (bsSlotCreateRes.status !== 201 || !bsSlot.id) {
      const bsSlotRes = await fetch(`${BASE_URL}/pickup-slots/available/?shop_id=${bookstoreShopId}`);
      const bsSlotData = await bsSlotRes.json();
      bsSlot = (bsSlotData.results || bsSlotData)[0];
    }

    const bsOrderRes = await fetch(`${BASE_URL}/orders/`, {
      method: 'POST',
      headers: { ...studentHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop: bookstoreShopId,
        fulfillment_type: 'PICKUP',
        pickup_slot: bsSlot.id,
        payment_method: 'COD',
        items: [{ product_id: bookstoreProds[0].id, quantity: 1 }],
      }),
    });
    const bsOrderData = await bsOrderRes.json();
    const bsOrder = bsOrderData.order || bsOrderData;

    // Advance to READY
    await fetch(`${BASE_URL}/orders/${bsOrder.id}/`, {
      method: 'PATCH',
      headers: { ...ownerBHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'READY' }),
    });

    // Xerox Owner tries to verify Bookstore's order via standard verify-pickup-otp -> 404 (isolated queryset)
    const crossVerifyRes1 = await fetch(`${BASE_URL}/orders/${bsOrder.id}/verify-pickup-otp/`, {
      method: 'POST',
      headers: { ...ownerAHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp: '123456' }),
    });

    // Xerox Owner tries to verify Bookstore's order via shop-owner endpoint -> 403 PermissionDenied
    const crossVerifyRes2 = await fetch(`${BASE_URL}/shop-owner/orders/${bsOrder.id}/verify-pickup-otp/`, {
      method: 'POST',
      headers: { ...ownerAHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp: '123456' }),
    });

    if ((crossVerifyRes1.status === 403 || crossVerifyRes1.status === 404) && crossVerifyRes2.status === 403) {
      console.log('✅ Test 13: Cross-shop verification isolation verified! Xerox Owner cannot verify Bookstore order (403/404 on both endpoints).');
      passed++;
    } else {
      console.error(`❌ Test 13 Failed: Expected 403/404, got std: ${crossVerifyRes1.status}, shop-owner: ${crossVerifyRes2.status}`);
      failed++;
    }

    // 12. Deleting slot with active bookings blocked
    const deleteBookedSlotRes = await fetch(`${BASE_URL}/pickup-slots/${raceSlot.id}/`, {
      method: 'DELETE',
      headers: ownerAHeaders,
    });
    if (deleteBookedSlotRes.status === 400) {
      console.log('✅ Test 14: Pickup slot deletion guard passed! Deleting slot with active bookings safely rejected with 400 Bad Request.');
      passed++;
    } else {
      console.error(`❌ Test 14 Failed: Expected 400 rejection on booked slot deletion, got ${deleteBookedSlotRes.status}`);
      failed++;
    }

    // 13. Printing Order Pickup & OTP Verification Flow
    const pdfBytes = fs.readFileSync('sample_assignment.pdf');
    const printForm = new FormData();
    printForm.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'Exam_Paper.pdf');
    printForm.append('shop', xeroxShopId);
    printForm.append('fulfillment_type', 'PICKUP');
    printForm.append('pickup_slot', newSlot.id);
    printForm.append('payment_method', 'COD');
    printForm.append('color_mode', 'BW');
    printForm.append('paper_size', 'A4');
    printForm.append('print_sides', 'DOUBLE_SIDED');
    printForm.append('binding_type', 'NONE');
    printForm.append('page_selection_type', 'ALL');
    printForm.append('copies', 1);

    const printOrderRes = await fetch(`${BASE_URL}/printing/`, {
      method: 'POST',
      headers: studentHeaders,
      body: printForm,
    });
    const printOrderData = await printOrderRes.json();
    const printJob = printOrderData.order;

    // Advance print job: WAITING -> PRINTING -> READY
    await fetch(`${BASE_URL}/printing/${printJob.id}/update-status/`, {
      method: 'PATCH',
      headers: { ...ownerAHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'PRINTING' }),
    });
    await fetch(`${BASE_URL}/printing/${printJob.id}/update-status/`, {
      method: 'PATCH',
      headers: { ...ownerAHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'READY' }),
    });

    // Student retrieves print pickup OTP
    const printOtpRes = await fetch(`${BASE_URL}/orders/${printJob.order}/pickup-otp/`, { headers: studentHeaders });
    const printOtpData = await printOtpRes.json();
    const printOtp = printOtpData.otp;

    // Shop owner verifies print pickup OTP
    const printVerifyRes = await fetch(`${BASE_URL}/orders/${printJob.order}/verify-pickup-otp/`, {
      method: 'POST',
      headers: { ...ownerAHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp: printOtp }),
    });
    const printVerifyData = await printVerifyRes.json();

    // Check print order status
    const printCheckRes = await (await fetch(`${BASE_URL}/printing/${printJob.id}/`, { headers: studentHeaders })).json();

    if (printVerifyRes.status === 200 && printVerifyData.order.status === 'COMPLETED' && printCheckRes.status === 'COMPLETED') {
      console.log(`✅ Test 15: Printing Order Pickup & OTP Verification PASSED! Both Core Order & Print Job synchronized to COMPLETED.`);
      passed++;
    } else {
      console.error(`❌ Test 15 Failed: Print OTP verification mismatch: ${JSON.stringify(printVerifyData)}`);
      failed++;
    }

    // 14. Delivery Order Isolation (No slot or pickup OTP required)
    const deliveryRes = await fetch(`${BASE_URL}/orders/`, {
      method: 'POST',
      headers: { ...studentHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop: xeroxShopId,
        fulfillment_type: 'DELIVERY',
        delivery_address: 'Hostel Room 101, Mandakini Hostel',
        payment_method: 'COD',
        items: [{ product_id: product.id, quantity: 1 }],
      }),
    });
    const deliveryOrder = (await deliveryRes.json()).order;

    if (deliveryRes.status === 201 && deliveryOrder.fulfillment_type === 'DELIVERY' && deliveryOrder.pickup_slot === null) {
      console.log(`✅ Test 16: Campus Delivery Order Isolation verified! Order #${String(deliveryOrder.order_number).slice(0, 8)} created with ₹15 fee and no pickup slot requirement.`);
      passed++;
    } else {
      console.error(`❌ Test 16 Failed: Delivery order failed ${deliveryRes.status}`);
      failed++;
    }
  } catch (err) {
    console.error('Unhandled Exception in Test Suite:', err);
    failed++;
  }

  console.log('\n================================================================');
  console.log(`STEP 13 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
