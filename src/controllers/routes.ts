import express from 'express';
import { WebhookController } from './webhook';
import { DashboardController } from './dashboard';
import { CompanyController } from './company';

const router = express.Router();
const webhookController = new WebhookController();
const dashboardController = new DashboardController();
const companyController = new CompanyController();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Webhook routes
router.post('/webhooks/vapi', webhookController.handleVapiWebhook.bind(webhookController));
router.post('/webhooks/telnyx/voice', webhookController.handleTelnyxVoice.bind(webhookController));

// Dashboard routes
router.get('/dashboard/:companyId', dashboardController.getDashboard.bind(dashboardController));
router.get('/dashboard/:companyId/analytics', dashboardController.getCallAnalytics.bind(dashboardController));
router.get('/dashboard/:companyId/appointments', dashboardController.getAppointmentMetrics.bind(dashboardController));
router.get('/dashboard/:companyId/revenue', dashboardController.getRevenueInsights.bind(dashboardController));
router.get('/dashboard/:companyId/calls/live', dashboardController.getLiveCallStatus.bind(dashboardController));

// Company management routes
router.post('/companies', companyController.createCompany.bind(companyController));
router.get('/companies/:id', companyController.getCompany.bind(companyController));
router.put('/companies/:id', companyController.updateCompany.bind(companyController));
router.post('/companies/:id/setup', companyController.setupCompany.bind(companyController));

export default router;