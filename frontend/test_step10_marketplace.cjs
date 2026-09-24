// Comprehensive Step 10 Marketplace Integration Verification Script
const http = require('http');

async function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

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
    req.end();
  });
}

async function runMarketplaceTests() {
  console.log('====================================================');
  console.log('STARTING STEP 10 REAL MARKETPLACE API INTEGRATION TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Fetch Categories
  let categories = [];
  try {
    const res = await request('http://127.0.0.1:8000/api/categories/');
    if (res.status === 200 && Array.isArray(res.data) && res.data.length >= 4) {
      categories = res.data;
      console.log(`✅ Test 1: Categories API (GET /api/categories/) returned ${categories.length} active categories.`);
      passed++;
    } else {
      console.error('❌ Test 1 Failed:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 1 Failed with error:', err.message);
    failed++;
  }

  // Test 2: Fetch Active Shops
  let shops = [];
  try {
    const res = await request('http://127.0.0.1:8000/api/shops/?is_active=true');
    if (res.status === 200 && Array.isArray(res.data) && res.data.length >= 3) {
      shops = res.data;
      console.log(`✅ Test 2: Shops API (GET /api/shops/?is_active=true) returned ${shops.length} active campus merchants.`);
      passed++;
    } else {
      console.error('❌ Test 2 Failed:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 2 Failed with error:', err.message);
    failed++;
  }

  // Test 3: Shop Type Filtering (PRINTING_XEROX)
  try {
    const res = await request('http://127.0.0.1:8000/api/shops/?shop_type=PRINTING_XEROX');
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0 && res.data[0].shop_type === 'PRINTING_XEROX') {
      console.log(`✅ Test 3: Shop Type Filter (GET /api/shops/?shop_type=PRINTING_XEROX) successfully filtered printing shops (${res.data[0].name}).`);
      passed++;
    } else {
      console.error('❌ Test 3 Failed:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 3 Failed with error:', err.message);
    failed++;
  }

  // Test 4: Shop Search Filtering
  try {
    const res = await request('http://127.0.0.1:8000/api/shops/?search=Bookstore');
    if (res.status === 200 && Array.isArray(res.data) && res.data.some(s => s.name.includes('Bookstore'))) {
      console.log(`✅ Test 4: Shop Search (GET /api/shops/?search=Bookstore) correctly matched bookstore.`);
      passed++;
    } else {
      console.error('❌ Test 4 Failed:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 4 Failed with error:', err.message);
    failed++;
  }

  // Test 5: Single Shop Details (GET /api/shops/:id/)
  const sampleShop = shops[0] || { id: 1 };
  try {
    const res = await request(`http://127.0.0.1:8000/api/shops/${sampleShop.id}/`);
    if (res.status === 200 && res.data.id === sampleShop.id && (res.data.campus_location !== undefined || res.data.address)) {
      console.log(`✅ Test 5: Shop Details API (GET /api/shops/${sampleShop.id}/) returned "${res.data.name}" (Address: ${res.data.address || res.data.campus_location}).`);
      passed++;
    } else {
      console.error('❌ Test 5 Failed:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 5 Failed with error:', err.message);
    failed++;
  }

  // Test 6: Shop-Specific Products Filtering (GET /api/products/?shop=:id)
  let shopProducts = [];
  try {
    const res = await request(`http://127.0.0.1:8000/api/products/?shop=${sampleShop.id}`);
    if (res.status === 200 && Array.isArray(res.data)) {
      shopProducts = res.data;
      console.log(`✅ Test 6: Shop Products (GET /api/products/?shop=${sampleShop.id}) returned ${shopProducts.length} items for "${sampleShop.name}".`);
      passed++;
    } else {
      console.error('❌ Test 6 Failed:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 6 Failed with error:', err.message);
    failed++;
  }

  // Test 7: Product Category Filtering (GET /api/products/?category=:id)
  const sampleCat = categories[0] || { id: 1 };
  try {
    const res = await request(`http://127.0.0.1:8000/api/products/?category=${sampleCat.id}`);
    if (res.status === 200 && Array.isArray(res.data)) {
      console.log(`✅ Test 7: Product Category Filter (GET /api/products/?category=${sampleCat.id}) returned ${res.data.length} items in "${sampleCat.name}".`);
      passed++;
    } else {
      console.error('❌ Test 7 Failed:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 7 Failed with error:', err.message);
    failed++;
  }

  // Test 8: Product Keyword Search (GET /api/products/?search=Pen)
  try {
    const res = await request('http://127.0.0.1:8000/api/products/?search=Pen');
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      console.log(`✅ Test 8: Product Search (GET /api/products/?search=Pen) found ${res.data.length} matching products.`);
      passed++;
    } else {
      console.error('❌ Test 8 Failed:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 8 Failed with error:', err.message);
    failed++;
  }

  // Test 9: Product Price Sorting (Low -> High)
  try {
    const res = await request('http://127.0.0.1:8000/api/products/?ordering=price');
    if (res.status === 200 && Array.isArray(res.data) && res.data.length >= 2) {
      const p1 = parseFloat(res.data[0].price);
      const p2 = parseFloat(res.data[res.data.length - 1].price);
      if (p1 <= p2) {
        console.log(`✅ Test 9: Price Sorting Low->High (GET /api/products/?ordering=price) verified (Lowest: ₹${p1}, Highest: ₹${p2}).`);
        passed++;
      } else {
        console.error('❌ Test 9 Sorting incorrect:', p1, p2);
        failed++;
      }
    } else {
      console.error('❌ Test 9 Failed:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 9 Failed with error:', err.message);
    failed++;
  }

  // Test 10: Product Price Sorting (High -> Low)
  try {
    const res = await request('http://127.0.0.1:8000/api/products/?ordering=-price');
    if (res.status === 200 && Array.isArray(res.data) && res.data.length >= 2) {
      const p1 = parseFloat(res.data[0].price);
      const p2 = parseFloat(res.data[res.data.length - 1].price);
      if (p1 >= p2) {
        console.log(`✅ Test 10: Price Sorting High->Low (GET /api/products/?ordering=-price) verified (Highest: ₹${p1}, Lowest: ₹${p2}).`);
        passed++;
      } else {
        console.error('❌ Test 10 Sorting incorrect:', p1, p2);
        failed++;
      }
    } else {
      console.error('❌ Test 10 Failed:', res.data);
      failed++;
    }
  } catch (err) {
    console.error('❌ Test 10 Failed with error:', err.message);
    failed++;
  }

  // Test 11: Single Product Detail (GET /api/products/:id/) with Stock Info
  try {
    const allProds = await request('http://127.0.0.1:8000/api/products/');
    if (allProds.status === 200 && allProds.data.length > 0) {
      const sampleProd = allProds.data[0];
      const res = await request(`http://127.0.0.1:8000/api/products/${sampleProd.id}/`);
      if (res.status === 200 && res.data.id === sampleProd.id && 'current_stock' in res.data && 'is_in_stock' in res.data) {
        console.log(`✅ Test 11: Product Detail API (GET /api/products/${sampleProd.id}/) verified with live stock: ${res.data.current_stock} units (${res.data.is_in_stock ? 'In Stock' : 'Out of Stock'}).`);
        passed++;
      } else {
        console.error('❌ Test 11 Failed:', res.data);
        failed++;
      }
    }
  } catch (err) {
    console.error('❌ Test 11 Failed with error:', err.message);
    failed++;
  }

  // Test 12: In-Stock Only Filtering
  try {
    const res = await request('http://127.0.0.1:8000/api/products/?in_stock=true');
    if (res.status === 200 && Array.isArray(res.data)) {
      const allInStock = res.data.every(p => p.current_stock > 0);
      if (allInStock && res.data.length > 0) {
        console.log(`✅ Test 12: In-Stock Filter (GET /api/products/?in_stock=true) verified (${res.data.length} items, all stock > 0).`);
        passed++;
      } else {
        console.error('❌ Test 12 Failed: Items with zero stock found in in_stock=true filter');
        failed++;
      }
    }
  } catch (err) {
    console.error('❌ Test 12 Failed with error:', err.message);
    failed++;
  }

  // Test 13: Out-of-Stock Demo Product Verification
  try {
    const res = await request('http://127.0.0.1:8000/api/products/?search=Triangular+Drafting+Scale');
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      const item = res.data[0];
      if (item.current_stock === 0 && item.is_in_stock === false) {
        console.log(`✅ Test 13: Out-of-Stock Demo Item "${item.name}" verified (current_stock: 0, is_in_stock: false).`);
        passed++;
      } else {
        console.error('❌ Test 13 Unexpected stock:', item.current_stock);
        failed++;
      }
    }
  } catch (err) {
    console.error('❌ Test 13 Failed with error:', err.message);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`STEP 10 MARKETPLACE INTEGRATION TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');
}

runMarketplaceTests();
