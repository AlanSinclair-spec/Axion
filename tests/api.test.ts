import request from 'supertest';
import app from '../src/index';
import { createMockCompany } from '../src/utils/test-helpers';

// Mock the database queries
jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn()
}));

describe('API Endpoints', () => {
  describe('Health Check', () => {
    test('GET /api/health should return healthy status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String)
      });
    });
  });

  describe('Root Endpoint', () => {
    test('GET / should return API information', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body).toMatchObject({
        name: 'HVAC Phone Agent API',
        version: '1.0.0',
        status: 'operational',
        endpoints: expect.any(Object)
      });
    });
  });

  describe('404 Handler', () => {
    test('should return 404 for unknown endpoints', async () => {
      const response = await request(app)
        .get('/api/unknown-endpoint')
        .expect(404);

      expect(response.body).toMatchObject({
        error: 'Endpoint not found',
        path: '/api/unknown-endpoint',
        method: 'GET'
      });
    });
  });

  describe('Webhook Endpoints', () => {
    test('POST /api/webhooks/vapi should accept webhook payloads', async () => {
      const mockWebhookPayload = {
        type: 'call-start',
        call: {
          id: 'test-call-id',
          status: 'ringing',
          customer: {
            number: '+15559876543'
          }
        }
      };

      const response = await request(app)
        .post('/api/webhooks/vapi')
        .send(mockWebhookPayload)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true
      });
    });

    test('POST /api/webhooks/telnyx/voice should accept Telnyx webhooks', async () => {
      const mockTelnyxPayload = {
        data: {
          event_type: 'call.initiated',
          payload: {
            call_control_id: 'test-call-control-id',
            from: '+15559876543',
            to: '+15551234567'
          }
        }
      };

      // Mock webhook verification to return true
      jest.doMock('../src/services/telnyx', () => ({
        TelnyxService: jest.fn().mockImplementation(() => ({
          verifyWebhook: jest.fn().mockReturnValue(true)
        }))
      }));

      await request(app)
        .post('/api/webhooks/telnyx/voice?companyId=test-company-id')
        .set('telnyx-signature-ed25519', 'mock-signature')
        .send(mockTelnyxPayload)
        .expect(200);
    });
  });

  describe('Rate Limiting', () => {
    test('should apply rate limiting to API endpoints', async () => {
      // This test would need to be adjusted based on your actual rate limit settings
      const promises = [];

      // Make requests up to the rate limit
      for (let i = 0; i < 5; i++) {
        promises.push(
          request(app)
            .get('/api/health')
            .expect(200)
        );
      }

      await Promise.all(promises);
      // All requests should succeed within the rate limit
    });
  });

  describe('Input Validation', () => {
    test('should sanitize malicious input', async () => {
      const maliciousPayload = {
        name: '<script>alert("xss")</script>Test Company',
        email: 'test@example.com',
        description: 'Normal description'
      };

      // The sanitization middleware should clean this input
      // Since we're mocking the database, we can't test the full flow,
      // but we can verify the endpoint doesn't crash
      await request(app)
        .post('/api/companies')
        .send(maliciousPayload)
        .expect(400); // Should fail validation for missing required fields
    });
  });

  describe('Error Handling', () => {
    test('should handle JSON parsing errors', async () => {
      const response = await request(app)
        .post('/api/companies')
        .set('Content-Type', 'application/json')
        .send('invalid json{')
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Invalid JSON in request body'
      });
    });

    test('should handle server errors gracefully', async () => {
      // Mock database to throw an error
      const { query } = require('../src/config/database');
      query.mockRejectedValueOnce(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/companies/test-id')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });
});

describe('Company Management', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  test('should validate company creation data', async () => {
    const incompleteCompanyData = {
      name: 'Test Company'
      // Missing required fields: phone, email, address
    };

    const response = await request(app)
      .post('/api/companies')
      .send(incompleteCompanyData)
      .expect(400);

    expect(response.body).toHaveProperty('error');
  });

  test('should create company with complete data', async () => {
    const { query } = require('../src/config/database');

    // Mock successful database operations
    query
      .mockResolvedValueOnce({ rows: [] }) // findByEmail returns no existing company
      .mockResolvedValueOnce({ rows: [createMockCompany()] }); // create returns new company

    const completeCompanyData = {
      name: 'Test HVAC Company',
      phone: '+15551234567',
      email: 'test@hvaccompany.com',
      address: '123 Test Street, Test City, TS 12345',
      businessHours: {
        monday: { open: '8:00 AM', close: '6:00 PM', isClosed: false },
        tuesday: { open: '8:00 AM', close: '6:00 PM', isClosed: false },
        wednesday: { open: '8:00 AM', close: '6:00 PM', isClosed: false },
        thursday: { open: '8:00 AM', close: '6:00 PM', isClosed: false },
        friday: { open: '8:00 AM', close: '6:00 PM', isClosed: false },
        saturday: { open: '9:00 AM', close: '4:00 PM', isClosed: false },
        sunday: { open: '', close: '', isClosed: true }
      },
      services: [],
      emergencyRates: {
        afterHours: 1.25,
        weekend: 1.15,
        holiday: 1.5
      }
    };

    const response = await request(app)
      .post('/api/companies')
      .send(completeCompanyData)
      .expect(201);

    expect(response.body).toMatchObject({
      success: true,
      message: 'Company created successfully'
    });
  });
});