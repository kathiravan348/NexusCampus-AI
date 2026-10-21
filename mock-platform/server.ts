// Standalone HTTP Mock API Server for NexusCampus AI
import http from 'http';
import { getModuleMockData, MODULE_MOCK_REGISTRY } from './core/registry';
import { MOCK_STUDENTS, MOCK_STAFF, MOCK_COURSES, MOCK_INVOICES } from './core/relational';

const PORT = process.env.PORT || 4000;

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url || '/';

  // Routes
  if (url === '/api/v1/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), modulesCount: Object.keys(MODULE_MOCK_REGISTRY).length }));
    return;
  }

  if (url === '/api/v1/modules') {
    res.writeHead(200);
    res.end(JSON.stringify(Object.values(MODULE_MOCK_REGISTRY)));
    return;
  }

  if (url.startsWith('/api/v1/modules/')) {
    const moduleId = url.split('/').pop()?.toUpperCase() || 'M01';
    const data = getModuleMockData(moduleId);
    res.writeHead(200);
    res.end(JSON.stringify(data));
    return;
  }

  if (url === '/api/v1/students') {
    res.writeHead(200);
    res.end(JSON.stringify(MOCK_STUDENTS));
    return;
  }

  if (url === '/api/v1/staff') {
    res.writeHead(200);
    res.end(JSON.stringify(MOCK_STAFF));
    return;
  }

  if (url === '/api/v1/courses') {
    res.writeHead(200);
    res.end(JSON.stringify(MOCK_COURSES));
    return;
  }

  if (url === '/api/v1/invoices') {
    res.writeHead(200);
    res.end(JSON.stringify(MOCK_INVOICES));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Endpoint not found', availableEndpoints: ['/api/v1/health', '/api/v1/modules', '/api/v1/modules/:id', '/api/v1/students', '/api/v1/staff', '/api/v1/courses', '/api/v1/invoices'] }));
});

server.listen(PORT, () => {
  console.log(`[Mock Platform API] Running at http://localhost:${PORT}`);
});
