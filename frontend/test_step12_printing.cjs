// Step 12 Comprehensive Verification Script: Complete Document Printing Workflow
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
  console.log('STARTING STEP 12 COMPLETE DOCUMENT PRINTING WORKFLOW TESTS');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  try {
    // 1. Authenticate Actors
    const studentToken = await login('student@campus.edu', 'StudentPass123!');
    const studentHeaders = { Authorization: `Bearer ${studentToken}` };

    const student2Token = await login('student2@campus.edu', 'StudentPass123!');
    const student2Headers = { Authorization: `Bearer ${student2Token}` };

    const xeroxOwnerToken = await login('owner@campus.edu', 'OwnerPass123!');
    const xeroxOwnerHeaders = { Authorization: `Bearer ${xeroxOwnerToken}` };

    const bookstoreOwnerToken = await login('sharma@stationery.com', 'ShopOwnerPass123!');
    const bookstoreOwnerHeaders = { Authorization: `Bearer ${bookstoreOwnerToken}` };

    console.log('✅ Test 1: Authentication successful for Student A, Student B, Xerox Owner & Bookstore Owner.');
    passed++;

    // 2. Fetch Active Printing Shops
    const shopsRes = await fetch(`${BASE_URL}/printing/shops/`, { headers: studentHeaders });
    const printingShops = await shopsRes.json();
    const xeroxShop = printingShops.find((s) => s.shop_name.includes('Xerox'));
    if (shopsRes.status === 200 && printingShops.length >= 2 && xeroxShop) {
      console.log(`✅ Test 2: GET /api/printing/shops/ returned ${printingShops.length} active print centers with live rate cards.`);
      passed++;
    } else {
      console.error(`❌ Test 2 Failed: Expected active printing shops, got ${shopsRes.status}`);
      failed++;
    }

    // 3. Document File Inspection (pypdf server-side verification)
    const pdfBytes = fs.readFileSync('sample_assignment.pdf');
    const inspectForm = new FormData();
    inspectForm.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'sample_assignment.pdf');

    const inspectRes = await fetch(`${BASE_URL}/printing/inspect-file/`, {
      method: 'POST',
      headers: studentHeaders,
      body: inspectForm,
    });
    const inspectData = await inspectRes.json();
    if (inspectRes.status === 200 && inspectData.success && inspectData.page_count === 3) {
      console.log(`✅ Test 3: POST /api/printing/inspect-file/ successfully inspected PDF using pypdf (Pages: ${inspectData.page_count}, Size: ${inspectData.file_size_formatted}).`);
      passed++;
    } else {
      console.error(`❌ Test 3 Failed: Inspection mismatch ${JSON.stringify(inspectData)}`);
      failed++;
    }

    // 4. Invalid & Corrupted File Rejection
    const invalidForm = new FormData();
    invalidForm.append('file', new Blob(['fake binary string'], { type: 'text/plain' }), 'script.exe');

    const invalidRes = await fetch(`${BASE_URL}/printing/inspect-file/`, {
      method: 'POST',
      headers: studentHeaders,
      body: invalidForm,
    });
    const invalidData = await invalidRes.json();
    if (invalidRes.status === 400 && invalidData.message.includes('PDF')) {
      console.log(`✅ Test 4: Invalid/non-PDF upload safely rejected with 400 Bad Request: "${invalidData.message}".`);
      passed++;
    } else {
      console.error(`❌ Test 4 Failed: Expected 400 rejection, got ${invalidRes.status}`);
      failed++;
    }

    // 5. Authoritative Live Price Calculation
    // B/W rate is ₹1.50/pg, Color is ₹6.00/pg, Spiral binding is ₹30.00
    // Calculate for: 3 pages * 2 copies = 6 pages @ ₹1.50 = ₹9.00 + Spiral (₹30 * 2 = ₹60) = ₹69.00
    const calcRes = await fetch(`${BASE_URL}/printing/calculate-price/`, {
      method: 'POST',
      headers: { ...studentHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop: xeroxShop.shop,
        total_pages: 3,
        copies: 2,
        color_mode: 'BW',
        paper_size: 'A4',
        print_sides: 'DOUBLE_SIDED',
        binding_type: 'SPIRAL',
        fulfillment_type: 'PICKUP',
      }),
    });
    const calcData = await calcRes.json();
    if (calcRes.status === 200 && parseFloat(calcData.subtotal) === 69.0 && parseFloat(calcData.total_amount) === 69.0) {
      console.log(`✅ Test 5: POST /api/printing/calculate-price/ verified authoritative server calculation (Subtotal: ₹${calcData.subtotal}, Total: ₹${calcData.total_amount}, Prep Time: ~${calcData.estimated_prep_time_mins} mins).`);
      passed++;
    } else {
      console.error(`❌ Test 5 Failed: Pricing mismatch ${JSON.stringify(calcData)}`);
      failed++;
    }

    // 6. Print Order Placement (Store Counter Pickup)
    // Find available pickup slot for Xerox Shop
    const slotsRes = await fetch(`${BASE_URL}/pickup-slots/?shop=${xeroxShop.shop}&available=true`, { headers: studentHeaders });
    const slotsJson = await slotsRes.json();
    const slots = slotsJson.results || slotsJson;
    const availableSlot = slots.find((s) => s.is_available) || slots[0];
    const initialBooked = availableSlot.booked_count;

    const pickupOrderForm = new FormData();
    pickupOrderForm.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'Assignment_Term_Paper.pdf');
    pickupOrderForm.append('shop', xeroxShop.shop);
    pickupOrderForm.append('fulfillment_type', 'PICKUP');
    pickupOrderForm.append('pickup_slot', availableSlot.id);
    pickupOrderForm.append('payment_method', 'COD');
    pickupOrderForm.append('color_mode', 'BW');
    pickupOrderForm.append('paper_size', 'A4');
    pickupOrderForm.append('print_sides', 'DOUBLE_SIDED');
    pickupOrderForm.append('binding_type', 'SPIRAL');
    pickupOrderForm.append('page_selection_type', 'ALL');
    pickupOrderForm.append('copies', 2);
    pickupOrderForm.append('special_instructions', 'Please bind with transparent plastic cover.');

    const orderRes1 = await fetch(`${BASE_URL}/printing/`, {
      method: 'POST',
      headers: studentHeaders,
      body: pickupOrderForm,
    });
    const orderData1 = await orderRes1.json();
    let printOrder1 = null;

    if (orderRes1.status === 201 && orderData1.success) {
      printOrder1 = orderData1.order;
      console.log(`✅ Test 6: Counter Pickup Print Order placed successfully (ID: #${printOrder1.id}, Core Order: #${printOrder1.order_number.slice(0, 8)}, Status: ${printOrder1.status}, Total: ₹${printOrder1.total_amount}).`);
      passed++;
    } else {
      console.error(`❌ Test 6 Failed: ${JSON.stringify(orderData1)}`);
      failed++;
    }

    // Verify slot capacity incremented safely
    const slotCheck = await (await fetch(`${BASE_URL}/pickup-slots/${availableSlot.id}/`, { headers: studentHeaders })).json();
    if (slotCheck.booked_count === initialBooked + 1) {
      console.log(`✅ Test 7: Pickup slot booked_count incremented safely (${initialBooked} -> ${slotCheck.booked_count}/${slotCheck.capacity}).`);
      passed++;
    } else {
      console.error(`❌ Test 7 Failed: Slot booked_count expected ${initialBooked + 1}, got ${slotCheck.booked_count}`);
      failed++;
    }

    // 7. Print Order Placement (Campus Hostel Delivery with Custom Range)
    // 3 page document, custom range "1-2" -> 2 pages
    // Color mode: 2 pages * 1 copy @ ₹6.00 = ₹12.00 + Corner Staple (₹5.00) = ₹17.00 + Delivery Fee (₹15.00) = ₹32.00
    const deliveryOrderForm = new FormData();
    deliveryOrderForm.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'Lab_Manual_Exams.pdf');
    deliveryOrderForm.append('shop', xeroxShop.shop);
    deliveryOrderForm.append('fulfillment_type', 'DELIVERY');
    deliveryOrderForm.append('delivery_address', 'Hostel Block B, Room 204, Ganga Hostel');
    deliveryOrderForm.append('payment_method', 'COD');
    deliveryOrderForm.append('color_mode', 'COLOR');
    deliveryOrderForm.append('paper_size', 'A4');
    deliveryOrderForm.append('print_sides', 'SINGLE_SIDED');
    deliveryOrderForm.append('binding_type', 'CORNER_STAPLE');
    deliveryOrderForm.append('page_selection_type', 'CUSTOM');
    deliveryOrderForm.append('custom_page_range', '1-2');
    deliveryOrderForm.append('copies', 1);

    const orderRes2 = await fetch(`${BASE_URL}/printing/`, {
      method: 'POST',
      headers: studentHeaders,
      body: deliveryOrderForm,
    });
    const orderData2 = await orderRes2.json();
    let printOrder2 = null;

    if (orderRes2.status === 201 && orderData2.success) {
      printOrder2 = orderData2.order;
      if (printOrder2.total_pages === 2 && parseFloat(printOrder2.delivery_fee) === 15.0 && parseFloat(printOrder2.total_amount) === 32.0) {
        console.log(`✅ Test 8: Custom Page Range & Campus Delivery Order created (ID: #${printOrder2.id}, Pages: ${printOrder2.total_pages}, Fee: ₹${printOrder2.delivery_fee}, Total: ₹${printOrder2.total_amount}).`);
        passed++;
      } else {
        console.error(`❌ Test 8 Failed: Details mismatch ${JSON.stringify(printOrder2)}`);
        failed++;
      }
    } else {
      console.error(`❌ Test 8 Failed: ${JSON.stringify(orderData2)}`);
      failed++;
    }

    // 8. Custom Page Range Bounds Validation (Reject out-of-bounds pages)
    const badRangeForm = new FormData();
    badRangeForm.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'Test_Doc.pdf');
    badRangeForm.append('shop', xeroxShop.shop);
    badRangeForm.append('fulfillment_type', 'PICKUP');
    badRangeForm.append('pickup_slot', availableSlot.id);
    badRangeForm.append('page_selection_type', 'CUSTOM');
    badRangeForm.append('custom_page_range', '1-10'); // Document only has 3 pages!

    const badRangeRes = await fetch(`${BASE_URL}/printing/`, {
      method: 'POST',
      headers: studentHeaders,
      body: badRangeForm,
    });
    if (badRangeRes.status === 400) {
      console.log('✅ Test 9: Out-of-bounds custom page range ("1-10" on 3-page PDF) rejected with 400 Bad Request.');
      passed++;
    } else {
      console.error(`❌ Test 9 Failed: Expected 400 rejection, got ${badRangeRes.status}`);
      failed++;
    }

    // 9. Shop Owner Printing Queue & Isolation
    // Shop Owner A (Xerox Center) views queue
    const queueResA = await fetch(`${BASE_URL}/printing/`, { headers: xeroxOwnerHeaders });
    const queueAJson = await queueResA.json();
    const queueA = queueAJson.results || queueAJson;
    const hasOrder1InQueueA = queueA.some((j) => j.id === printOrder1.id);

    // Shop Owner B (Central Bookstore) views queue
    const queueResB = await fetch(`${BASE_URL}/printing/`, { headers: bookstoreOwnerHeaders });
    const queueBJson = await queueResB.json();
    const queueB = queueBJson.results || queueBJson;
    const hasOrder1InQueueB = queueB.some((j) => j.id === printOrder1.id);

    if (hasOrder1InQueueA && !hasOrder1InQueueB) {
      console.log('✅ Test 10: Shop Owner Queue & Isolation verified! Order is present in Xerox Center queue, and isolated from Bookstore queue.');
      passed++;
    } else {
      console.error(`❌ Test 10 Failed: Isolation failed (A: ${hasOrder1InQueueA}, B: ${hasOrder1InQueueB})`);
      failed++;
    }

    // 10. Shop Owner Queue Status Transitions & Core Order Synchronization
    // WAITING -> PRINTING
    const transition1 = await fetch(`${BASE_URL}/printing/${printOrder1.id}/update-status/`, {
      method: 'PATCH',
      headers: { ...xeroxOwnerHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'PRINTING' }),
    });
    const t1Data = await transition1.json();

    // PRINTING -> READY
    const transition2 = await fetch(`${BASE_URL}/printing/${printOrder1.id}/update-status/`, {
      method: 'PATCH',
      headers: { ...xeroxOwnerHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'READY' }),
    });
    const t2Data = await transition2.json();

    // READY -> COMPLETED
    const transition3 = await fetch(`${BASE_URL}/printing/${printOrder1.id}/update-status/`, {
      method: 'PATCH',
      headers: { ...xeroxOwnerHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED' }),
    });
    const t3Data = await transition3.json();

    if (t1Data.success && t2Data.success && t3Data.success && t3Data.order.status === 'COMPLETED' && t3Data.order.completed_at) {
      console.log('✅ Test 11: Validated State Transitions (WAITING -> PRINTING -> READY -> COMPLETED) verified with timestamped completion.');
      passed++;
    } else {
      console.error(`❌ Test 11 Failed: Status transition failed ${JSON.stringify(t3Data)}`);
      failed++;
    }

    // Test Invalid Transition: COMPLETED cannot transition to WAITING
    const invalidTrans = await fetch(`${BASE_URL}/printing/${printOrder1.id}/update-status/`, {
      method: 'PATCH',
      headers: { ...xeroxOwnerHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'WAITING' }),
    });
    if (invalidTrans.status === 400) {
      console.log('✅ Test 12: Invalid status transition rejected with 400 Bad Request.');
      passed++;
    } else {
      console.error(`❌ Test 12 Failed: Expected 400, got ${invalidTrans.status}`);
      failed++;
    }

    // 11. Customer Document Security & Cross-User Download Access
    const docId = printOrder1.documents[0].id;

    // Student A (Owner of Document) downloads -> 200 OK
    const dlStudentA = await fetch(`${BASE_URL}/printing/${printOrder1.id}/documents/${docId}/download/`, { headers: studentHeaders });

    // Student B (Different user) attempts download -> 403 / 404 Forbidden!
    const dlStudentB = await fetch(`${BASE_URL}/printing/${printOrder1.id}/documents/${docId}/download/`, { headers: student2Headers });

    // Shop Owner A (Fulfilling shop) downloads -> 200 OK
    const dlOwnerA = await fetch(`${BASE_URL}/printing/${printOrder1.id}/documents/${docId}/download/`, { headers: xeroxOwnerHeaders });

    // Shop Owner B (Unrelated shop) attempts download -> 403 / 404 Forbidden!
    const dlOwnerB = await fetch(`${BASE_URL}/printing/${printOrder1.id}/documents/${docId}/download/`, { headers: bookstoreOwnerHeaders });

    const studentBDenied = dlStudentB.status === 403 || dlStudentB.status === 404;
    const ownerBDenied = dlOwnerB.status === 403 || dlOwnerB.status === 404;
    if (dlStudentA.status === 200 && studentBDenied && dlOwnerA.status === 200 && ownerBDenied) {
      console.log('✅ Test 13: Customer Document Security passed! Student A & Fulfilling Merchant have access; Student B & Unrelated Merchant are strictly denied (403/404).');
      passed++;
    } else {
      console.error(`❌ Test 13 Failed: Access statuses -> Student A: ${dlStudentA.status}, Student B: ${dlStudentB.status}, Owner A: ${dlOwnerA.status}, Owner B: ${dlOwnerB.status}`);
      failed++;
    }

    // 12. Student Print Order Detail & List Verification
    const myJobsRes = await fetch(`${BASE_URL}/printing/`, { headers: studentHeaders });
    const myJobsJson = await myJobsRes.json();
    const myJobs = myJobsJson.results || myJobsJson;
    if (myJobs.some((j) => j.id === printOrder1.id) && myJobs.some((j) => j.id === printOrder2.id)) {
      console.log(`✅ Test 14: Student Print Orders list endpoint verified! Returned ${myJobs.length} active print orders for student.`);
      passed++;
    } else {
      console.error('❌ Test 14 Failed: Student print orders list incomplete');
      failed++;
    }
  } catch (err) {
    console.error('Unhandled Exception in Test Suite:', err);
    failed++;
  }

  console.log('\n================================================================');
  console.log(`STEP 12 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
