const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const prisma = require('./src/config/prisma');
const apiRoutes = require('./src/routes/api');
const { helmetMiddleware, corsMiddleware, apiLimiter } = require('./src/middlewares/security');
const { errorHandler } = require('./src/middlewares/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

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
            name: 'Administrator',
            role: 'admin'
          }
        });
        console.log('[Database] Akun admin default dibuat: username="admin", password="admin123"');
      }
    } catch (e) {
      // Abaikan jika tabel belum siap
    }

    const server = app.listen(PORT, () => {
      console.log(`[Server] Iconnet Inventory System running on port ${PORT}`);
      console.log(`[URL] http://localhost:${PORT}`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n[Server Error] Port ${PORT} sedang digunakan oleh proses lain.`);
        console.error(`Solusi: Ubah PORT di file .env (misal PORT=3005) atau hentikan proses yang memakai port tersebut:`);
        console.error(`  PowerShell: Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force\n`);
      } else {
        console.error('[Server Error]', err.message);
      }
      process.exit(1);
    });

    // Graceful Shutdown
    const shutdown = async (signal) => {
      console.log(`[Server] Received ${signal}, closing server gracefully...`);
      server.close(async () => {
        await prisma.$disconnect();
        console.log('[Database] Disconnected from MySQL.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

  } catch (err) {
    console.error('[Startup Error] Failed to connect to MySQL database:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
