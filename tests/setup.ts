import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Mock external services for testing
jest.mock('../src/services/vapi', () => ({
  VapiService: jest.fn().mockImplementation(() => ({
    createHVACAssistant: jest.fn().mockResolvedValue({ id: 'mock-assistant-id' }),
    createPhoneCall: jest.fn().mockResolvedValue({ id: 'mock-call-id' }),
    getCall: jest.fn().mockResolvedValue({ id: 'mock-call-id', status: 'completed' }),
    endCall: jest.fn().mockResolvedValue({ success: true })
  }))
}));

jest.mock('../src/services/telnyx', () => ({
  TelnyxService: jest.fn().mockImplementation(() => ({
    purchasePhoneNumber: jest.fn().mockResolvedValue('+15551234567'),
    configurePhoneNumber: jest.fn().mockResolvedValue({ success: true }),
    sendSMS: jest.fn().mockResolvedValue({ id: 'mock-sms-id' }),
    sendAppointmentConfirmation: jest.fn().mockResolvedValue({ id: 'mock-sms-id' }),
    sendEmergencyAlert: jest.fn().mockResolvedValue({ id: 'mock-sms-id' }),
    verifyWebhook: jest.fn().mockReturnValue(true),
    handleIncomingCall: jest.fn().mockResolvedValue({ success: true })
  }))
}));

// Global test timeout
jest.setTimeout(30000);

// Suppress console.error during tests unless needed
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (args[0] && args[0].includes && !args[0].includes('TEST_ERROR')) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});