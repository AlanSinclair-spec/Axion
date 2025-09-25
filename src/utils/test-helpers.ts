import { HVACCompany, BusinessHours, HVACService, EmergencyRates, TimeSlot } from '../types';

export const createMockCompany = (): HVACCompany => {
  const businessHours: BusinessHours = {
    monday: { open: '8:00 AM', close: '6:00 PM', isClosed: false },
    tuesday: { open: '8:00 AM', close: '6:00 PM', isClosed: false },
    wednesday: { open: '8:00 AM', close: '6:00 PM', isClosed: false },
    thursday: { open: '8:00 AM', close: '6:00 PM', isClosed: false },
    friday: { open: '8:00 AM', close: '6:00 PM', isClosed: false },
    saturday: { open: '9:00 AM', close: '4:00 PM', isClosed: false },
    sunday: { open: '', close: '', isClosed: true }
  };

  const services: HVACService[] = [
    {
      id: '1',
      name: 'Heating Repair',
      basePrice: 150,
      emergencyMultiplier: 1.5,
      description: 'Furnace and heating system repairs'
    },
    {
      id: '2',
      name: 'AC Repair',
      basePrice: 125,
      emergencyMultiplier: 1.5,
      description: 'Air conditioning repairs and service'
    }
  ];

  const emergencyRates: EmergencyRates = {
    afterHours: 1.25,
    weekend: 1.15,
    holiday: 1.5
  };

  return {
    id: 'test-company-id',
    name: 'Test HVAC Company',
    phone: '+15551234567',
    email: 'test@hvaccompany.com',
    address: '123 Test Street, Test City, TS 12345',
    businessHours,
    services,
    emergencyRates,
    createdAt: new Date(),
    updatedAt: new Date()
  };
};

export const createMockCallRecord = () => ({
  id: 'test-call-id',
  companyId: 'test-company-id',
  customerPhone: '+15559876543',
  customerName: 'Test Customer',
  callType: 'emergency' as const,
  isEmergency: true,
  summary: 'Customer reports no heat in winter',
  duration: 180,
  createdAt: new Date()
});

export const createMockAppointment = () => ({
  id: 'test-appointment-id',
  companyId: 'test-company-id',
  customerName: 'Test Customer',
  customerPhone: '+15559876543',
  address: '456 Customer Street, Test City, TS 12345',
  serviceType: 'Heating Repair',
  scheduledDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
  estimatedDuration: 120,
  notes: 'Furnace not heating properly',
  priority: 'high' as const,
  status: 'scheduled' as const,
  createdAt: new Date()
});

export const emergencyTranscripts = [
  'My furnace is not working and it\'s freezing in here',
  'The heat pump stopped working overnight',
  'There\'s no heat in the house and it\'s 20 degrees outside',
  'The air conditioning is completely broken in this heat wave',
  'I smell gas coming from the furnace'
];

export const normalTranscripts = [
  'I\'d like to schedule a maintenance appointment',
  'Can you give me a quote for a new thermostat?',
  'What are your rates for AC tune-up?',
  'I want to book a routine inspection'
];

export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const mockVapiResponse = {
  id: 'vapi-assistant-id',
  name: 'Test HVAC Assistant',
  model: {
    provider: 'openai',
    model: 'gpt-4'
  },
  voice: {
    provider: 'elevenlabs',
    voiceId: 'rachel'
  },
  created: new Date().toISOString()
};

export const mockTelnyxCall = {
  data: {
    call_control_id: 'telnyx-call-id',
    call_leg_id: 'call-leg-id',
    call_session_id: 'call-session-id',
    is_alive: true,
    from: '+15559876543',
    to: '+15551234567'
  }
};