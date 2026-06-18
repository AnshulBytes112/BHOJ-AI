const http = require('http');

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3333,
      path: '/api' + path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test',
        'x-role': 'ADMIN',
        'x-user-id': '1'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data || '{}') });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  try {
    console.log('--- STARTING TEST ---');
    // 1. Get a free table
    let res = await request('GET', '/tables');
    console.log('Tables from API:', res.data);
    const table = res.data.find(t => t.status === 'free');
    if (!table) { console.log('No free table found'); return; }
    console.log('Found free table:', table.table_number);

    // 2. Create order
    console.log('\n--- Creating Order ---');
    res = await request('POST', `/tables/${table.table_id}/orders`, {
      items: [{ id: 1, quantity: 2, gstRate: 5 }]
    });
    console.log('Order created status:', res.status, res.data.order_id ? 'OK' : 'FAIL', res.data);
    const orderId = res.data.order_id;

    if (!orderId) return;

    // 3. Send to kitchen
    console.log('\n--- Sending to Kitchen ---');
    res = await request('POST', `/orders/${orderId}/send-to-kitchen`);
    console.log('Sent to kitchen status:', res.status, res.data.message);
    // Get the section KOT items to retrieve section_kot_item_id
    console.log('Fetching section KOTs...');
    let kotsRes = await request('GET', '/kots/section/Starters');
    console.log('GET /kots/section/Starters response:', kotsRes.status, kotsRes.data);
    const activeSkot = Array.isArray(kotsRes.data) ? kotsRes.data.find(sk => sk.order_id === orderId) : null;
    if (!activeSkot) {
      console.log('Could not find active KOT for order:', orderId);
      return;
    }
    const skotItem = activeSkot.items[0];
    const itemId = skotItem.section_kot_item_id;

    // 4. Mark KOT Item Acknowledged
    console.log('\n--- Mark KOT Item Acknowledged ---');
    res = await request('POST', `/kots/items/${itemId}/status`, { status: 'acknowledged' });
    console.log('Ack status:', res.status, res.data.status);

    // 5. Generate Bill
    console.log('\n--- Generating Bill ---');
    res = await request('POST', '/bills', {
      cashier_id: 1,
      table_id: table.table_id,
      order_ids: [orderId],
      items: [{ itemId: 1, quantity: 2 }]
    });
    console.log('Bill generation status:', res.status, res.data.bill ? 'OK' : 'FAIL');
    const billId = res.data.bill.id;

    // 6. Pay Bill
    console.log('\n--- Paying Bill ---');
    res = await request('PATCH', `/bills/${billId}/payment`, { payment_status: 'paid' });
    console.log('Bill payment status:', res.status, res.data.message);

    // 7. Check Table Status
    res = await request('GET', `/tables/${table.table_id}`);
    console.log('\nTable status before KOT served:', res.data.status);

    // 8. Mark KOT Item Preparing and then Ready
    console.log('\n--- Mark KOT Item Preparing ---');
    res = await request('POST', `/kots/items/${itemId}/status`, { status: 'preparing' });
    console.log('Preparing status:', res.status, res.data.status);

    console.log('\n--- Mark KOT Item Ready ---');
    res = await request('POST', `/kots/items/${itemId}/status`, { status: 'ready' });
    console.log('Ready status:', res.status, res.data.status);

    // 9. Mark KOT Item Served
    console.log('\n--- Mark KOT Item Served ---');
    res = await request('POST', `/kots/items/${itemId}/status`, { status: 'served' });
    console.log('Served status:', res.status, res.data.status);

    // 10. Check Table Status
    res = await request('GET', `/tables/${table.table_id}`);
    console.log('\nTable status after KOT served:', res.data.status);

  } catch(e) {
    console.error(e);
  }
}
run();
