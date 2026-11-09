const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const selfsigned = require('selfsigned');
require('dotenv').config();

const prisma = require('./src/config/prisma');
const apiRoutes = require('./src/routes/api');
const { helmetMiddleware, corsMiddleware, apiLimiter } = require('./src/middlewares/security');
const { errorHandler } = require('./src/middlewares/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// Security Middlewares
app.use(helmetMiddleware);
app.use(corsMiddleware);

// Body Parser with payload limit
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Storage Directory for generated barcodes
const barcodeDir = path.join(__dirname, 'barcode');
if (!fs.existsSync(barcodeDir)) {
  fs.mkdirSync(barcodeDir, { recursive: true });
}
app.use('/barcode', express.static(barcodeDir));

// Serve Frontend Static Files from public directory (HTML, CSS, JS, Images)
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Root route redirect to login
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'login.html'));
});

// Backward compatibility routes for direct file requests
app.get('/login.html', (req, res) => res.sendFile(path.join(publicDir, 'login.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.get('/manifest.json', (req, res) => res.sendFile(path.join(publicDir, 'manifest.json')));
app.get('/app.js', (req, res) => res.sendFile(path.join(publicDir, 'js', 'app.js')));

// Mount API routes with rate limiter
app.use('/api', apiLimiter, apiRoutes);

// Centralized Error Handling Middleware
app.use(errorHandler);

// Database Health Check & Server Boot
async function startServer() {
  try {
    // Test Prisma Connection
    await prisma.$connect();
    console.log('[Database] Connected to PostgreSQL successfully via Prisma ORM.');

    // Seed default admin if user table empty
    try {
      const userCount = await prisma.user.count();
      if (userCount === 0) {
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash('admin123', 10);
        await prisma.user.create({
          data: {
            username: 'admin',
            password: hash,
            name: 'Administrator'
          }
        });
        console.log('[Database] Akun admin default dibuat: username="admin", password="admin123"');
      }
    } catch (e) {
      // Abaikan jika tabel belum siap
    }

    // Setup SSL certificates for HTTPS (Required for mobile camera access via LAN)
    let sslOptions = null;
    const keyPath = path.join(__dirname, 'key.pem');
    const certPath = path.join(__dirname, 'cert.pem');

    try {
      let key, cert;
      if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        key = fs.readFileSync(keyPath);
        cert = fs.readFileSync(certPath);
      } else {
        console.log('[SSL] Generating self-signed SSL certificate for HTTPS...');
        const pems = await selfsigned.generate([{ name: 'commonName', value: 'iconnet.local' }], { days: 365 });
        key = pems.private;
        cert = pems.cert;
        fs.writeFileSync(keyPath, key);
        fs.writeFileSync(certPath, cert);
      }
      sslOptions = { key, cert };
    } catch (sslErr) {
      console.warn('[SSL] Could not initialize SSL certificates:', sslErr.message);
    }

    // Start HTTP Server
    const httpServer = http.createServer(app);
    httpServer.listen(PORT, () => {
      console.log(`[HTTP Server] Iconnet Inventory System running on port ${PORT}`);
      console.log(`[HTTP URL] http://localhost:${PORT}`);
    });

    httpServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n[Server Error] Port ${PORT} sedang digunakan oleh proses lain.`);
        console.error(`Solusi: Ubah PORT di file .env (misal PORT=3005) atau hentikan proses yang memakai port tersebut:`);
        console.error(`  PowerShell: Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force\n`);
      } else {
        console.error('[Server Error]', err.message);
      }
      process.exit(1);
    });

    // Start HTTPS Server if certificates available
    let httpsServer = null;
    if (sslOptions) {
      try {
        httpsServer = https.createServer(sslOptions, app);
        httpsServer.listen(HTTPS_PORT, () => {
          console.log(`[HTTPS Server] Secure server running on port ${HTTPS_PORT} (Live Camera Ready)`);
          console.log(`[HTTPS URL] https://localhost:${HTTPS_PORT}`);
        });

        httpsServer.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            console.warn(`[HTTPS Warning] Port ${HTTPS_PORT} is already in use.`);
          } else {
            console.warn('[HTTPS Warning]', err.message);
          }
        });
      } catch (err) {
        console.warn('[HTTPS Warning] Failed to start HTTPS server:', err.message);
      }
    }

    // Graceful Shutdown
    const shutdown = async (signal) => {
      console.log(`[Server] Received ${signal}, closing server gracefully...`);
      if (httpsServer) {
        try { httpsServer.close(); } catch(e) {}
      }
      httpServer.close(async () => {
        await prisma.$disconnect();
        console.log('[Database] Disconnected from PostgreSQL.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

  } catch (err) {
    console.error('[Startup Error] Failed to connect to PostgreSQL database:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
