const jwt = require('jsonwebtoken');
const http = require('http');

const secret = '9ddf3462b64721b78a9cce8334518c091a144762ca33e2fe9602b562a2890397';
const token = jwt.sign({ id: 1, role: 'ADMIN', restaurant_id: 1 }, secret, { expiresIn: '1h' });

const options = {
  hostname: '127.0.0.1',
  port: 3333,
  path: '/api/items?tableId=7be9a7ac-ed16-4ce7-9186-e2532898fc36',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (c) => data += c);
  res.on('end', () => {
    const json = JSON.parse(data);
    const biryani = json.find(i => i.name === 'Chicken Biryani');
    console.log(biryani);
  });
});

req.on('error', console.error);
req.end();
