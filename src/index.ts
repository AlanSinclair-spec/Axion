import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Health check route
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Root route
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'HVAC Phone Agent API',
    version: '1.0.0',
    status: 'operational',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health',
      webhooks: {
        vapi: '/api/webhooks/vapi',
        telnyx: '/api/webhooks/telnyx/voice'
      }
    }
  });
});

// Basic webhook endpoints
app.post('/api/webhooks/vapi', (req: Request, res: Response) => {
  console.log('Vapi webhook received:', req.body);
  res.json({ success: true });
});

app.post('/api/webhooks/telnyx/voice', (req: Request, res: Response) => {
  console.log('Telnyx webhook received:', req.body);
  res.json({ success: true });
});

// 404 handler
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
🚀 HVAC Phone Agent API Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Server running on port ${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'development'}
🔗 Health check: http://localhost:${PORT}/api/health
🪝 Webhooks ready:
   • Vapi: http://localhost:${PORT}/api/webhooks/vapi
   • Telnyx: http://localhost:${PORT}/api/webhooks/telnyx/voice
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Ready to receive calls on: ${process.env.TELNYX_PHONE_NUMBER}
  `);
});

export default app;