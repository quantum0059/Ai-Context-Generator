const http = require('http');

const data = JSON.stringify({
  category: "styling",
  draft: {
    projectName: "Test",
    description: "A simple e-commerce website with a shopping cart and checkout process.",
    platform: "web",
    features: ["Shopping Cart", "Checkout"],
    constraints: { budget: undefined, avoid: [] },
    projectType: "UI_APPLICATION",
    classificationReason: "Standard web app"
  }
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/contextforge/suggest',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  res.on('end', () => {
    console.log(`BODY: ${body}`);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
