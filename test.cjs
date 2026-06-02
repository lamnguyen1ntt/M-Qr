const http = require('http');

const data = JSON.stringify({
  name: "Test",
  url: "https://www.facebook.com/dreamstealer.lam/"
});

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/qr',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, res => {
  let str = '';
  res.on('data', chunk => str += chunk);
  res.on('end', () => console.log('Response:', res.statusCode, str));
});

req.on('error', error => console.error(error));
req.write(data);
req.end();
