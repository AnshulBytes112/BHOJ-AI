import express from 'express'; // Trigger rebuild
import cors from 'cors';
import * as path from 'path';
import dotenv from 'dotenv';
import { initializeDatabase } from './db';
import { requireAdminRole } from './middleware/admin-auth';
import { itemsRouter } from './items/items.routes';
import { categoriesRouter } from './categories/categories.routes';
import { billsRouter } from './bills/bills.routes';
import { gstRouter } from './gst/gst.routes';
import { receiptRouter } from './receipt/receipt.routes';
import { tablesRouter } from './tables/tables.routes';
import { ordersRouter } from './orders/orders.routes';
import { kotsRouter } from './kots/kots.routes';
import { sessionsRouter } from './sessions/sessions.routes';
import { publicRouter } from './public/public.routes';
import { extraChargesRouter } from './gst/extra-charges.routes';
import { initializeWebSocket } from './websocket';

dotenv.config();

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4200",
  "http://127.0.0.1:4200",
  "https://resto-maneger-smd1.vercel.app",
  "https://anshul-bhoj-ai.vercel.app"
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or server-to-server)
    if (!origin) {
      callback(null, true);
      return;
    }
    
    const isAllowed = allowedOrigins.includes(origin) || 
                      origin.endsWith('.vercel.app') ||
                      /^http:\/\/localhost:\d+$/.test(origin) ||
                      /^http:\/\/127\.0\.0\.1:\d+$/.test(origin);
                      
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Redirect root to /api
app.get('/', (req, res) => {
  res.redirect('/api');
});

// Health check (Public)
app.get('/api/health', (req, res) => {
  console.log('Health check ping received');
  res.send({
    message: 'API is healthy',
    status: 'ok',
    version: 'v2',
    timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })
  });
});

app.use('/api/public', publicRouter);

// Basic Root Route (Public)
app.get('/api', (req, res) => {
  res.send({ message: 'Welcome to the Hotel Management API' });
});

app.use('/api', requireAdminRole);

app.use('/api/items', itemsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/bills', billsRouter);
app.use('/api/gst-config', gstRouter);
app.use('/api/extra-charges', extraChargesRouter);
app.use('/api/receipt-layout', receiptRouter);
app.use('/api/tables', tablesRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/kots', kotsRouter);
app.use('/api/sessions', sessionsRouter);




const port = process.env.PORT || 3333;
initializeDatabase()
  .then(() => {
    const server = app.listen(port, () => {
      console.log(`Listening at http://localhost:${port}/api`);
    });
    initializeWebSocket(server);
    server.on('error', console.error);
  })
  .catch((error) => {
    console.error('Failed to initialize database schema:', error);
    process.exit(1);
  });

