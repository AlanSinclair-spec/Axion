import { HVACIntelligenceService } from '../src/services/hvac-intelligence';
import { CallType } from '../src/types';
import { createMockCompany, emergencyTranscripts, normalTranscripts } from '../src/utils/test-helpers';

describe('HVACIntelligenceService', () => {
  let hvacService: HVACIntelligenceService;
  let mockCompany: any;

  beforeEach(() => {
    hvacService = new HVACIntelligenceService();
    mockCompany = createMockCompany();
  });

  describe('Emergency Detection', () => {
    test('should detect heating emergencies', () => {
      const emergencyTexts = [
        'My furnace is not working and it\'s freezing',
        'No heat in the house',
        'Heating system broke down',
        'Furnace making loud noises'
      ];

      emergencyTexts.forEach(text => {
        expect(hvacService.detectEmergency(text)).toBe(true);
      });
    });

    test('should detect cooling emergencies', () => {
      const emergencyTexts = [
        'AC not working in this heat',
        'Air conditioning completely broken',
        'No cold air coming out',
        'AC unit stopped working'
      ];

      emergencyTexts.forEach(text => {
        expect(hvacService.detectEmergency(text)).toBe(true);
      });
    });

    test('should detect plumbing emergencies', () => {
      const emergencyTexts = [
        'Water leak in basement',
        'Pipe burst and flooding',
        'Water everywhere from HVAC',
        'Water heater leaking'
      ];

      emergencyTexts.forEach(text => {
        expect(hvacService.detectEmergency(text)).toBe(true);
      });
    });

    test('should not flag normal requests as emergencies', () => {
      normalTranscripts.forEach(text => {
        expect(hvacService.detectEmergency(text)).toBe(false);
      });
    });
  });

  describe('Call Type Classification', () => {
    test('should classify emergency calls correctly', () => {
      emergencyTranscripts.forEach(text => {
        expect(hvacService.classifyCallType(text)).toBe(CallType.EMERGENCY);
      });
    });

    test('should classify appointment booking calls', () => {
      const appointmentTexts = [
        'I want to schedule an appointment',
        'Can you book a service call?',
        'When can a technician visit?'
      ];

      appointmentTexts.forEach(text => {
        expect(hvacService.classifyCallType(text)).toBe(CallType.APPOINTMENT_BOOKING);
      });
    });

    test('should classify pricing inquiries', () => {
      const pricingTexts = [
        'How much does AC repair cost?',
        'What are your rates?',
        'Can you give me a price estimate?'
      ];

      pricingTexts.forEach(text => {
        expect(hvacService.classifyCallType(text)).toBe(CallType.PRICE_ESTIMATE);
      });
    });

    test('should classify service requests', () => {
      const serviceTexts = [
        'I need my furnace repaired',
        'Can you install a new thermostat?',
        'My HVAC needs maintenance'
      ];

      serviceTexts.forEach(text => {
        expect(hvacService.classifyCallType(text)).toBe(CallType.SERVICE_REQUEST);
      });
    });

    test('should classify general inquiries', () => {
      const generalTexts = [
        'What services do you offer?',
        'Are you open today?',
        'How long have you been in business?'
      ];

      generalTexts.forEach(text => {
        expect(hvacService.classifyCallType(text)).toBe(CallType.GENERAL_INQUIRY);
      });
    });
  });

  describe('Service Type Extraction', () => {
    test('should extract heating services', () => {
      const heatingTexts = [
        'My furnace needs repair',
        'Heating system maintenance',
        'Boiler not working'
      ];

      heatingTexts.forEach(text => {
        const services = hvacService.extractServiceType(text);
        expect(services).toContain('heating');
      });
    });

    test('should extract cooling services', () => {
      const coolingTexts = [
        'Air conditioning repair needed',
        'AC unit servicing',
        'Central air maintenance'
      ];

      coolingTexts.forEach(text => {
        const services = hvacService.extractServiceType(text);
        expect(services).toContain('cooling');
      });
    });

    test('should extract multiple service types', () => {
      const text = 'I need both heating and air conditioning repair plus thermostat installation';
      const services = hvacService.extractServiceType(text);

      expect(services).toContain('heating');
      expect(services).toContain('cooling');
      expect(services).toContain('thermostat');
      expect(services).toContain('installation');
    });

    test('should default to general HVAC for unclear requests', () => {
      const text = 'I have some issues with my system';
      const services = hvacService.extractServiceType(text);

      expect(services).toEqual(['general_hvac']);
    });
  });

  describe('Price Estimation', () => {
    test('should provide basic pricing for heating services', () => {
      const pricing = hvacService.estimateServicePrice(['heating'], false, false);

      expect(pricing).toContain('$');
      expect(pricing).toContain('heating');
      expect(pricing).toContain('150');
      expect(pricing).toContain('800');
    });

    test('should apply emergency multiplier', () => {
      const normalPricing = hvacService.estimateServicePrice(['heating'], false, false);
      const emergencyPricing = hvacService.estimateServicePrice(['heating'], true, false);

      expect(emergencyPricing).toContain('emergency service rates apply');
    });

    test('should apply after-hours multiplier', () => {
      const normalPricing = hvacService.estimateServicePrice(['heating'], false, false);
      const afterHoursPricing = hvacService.estimateServicePrice(['heating'], false, true);

      expect(afterHoursPricing).toContain('after-hours rates apply');
    });

    test('should apply both emergency and after-hours multipliers', () => {
      const pricing = hvacService.estimateServicePrice(['heating'], true, true);

      expect(pricing).toContain('emergency service rates apply');
      expect(pricing).toContain('after-hours rates apply');
    });
  });

  describe('Business Hours Detection', () => {
    test('should detect after hours correctly', () => {
      // Mock current time to be outside business hours
      const mockDate = new Date();
      mockDate.setHours(22, 0, 0, 0); // 10 PM
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const isAfterHours = hvacService.isAfterHours(mockCompany.businessHours);
      expect(isAfterHours).toBe(true);

      (global.Date as any).mockRestore();
    });

    test('should detect business hours correctly', () => {
      // Mock current time to be during business hours
      const mockDate = new Date();
      mockDate.setHours(10, 0, 0, 0); // 10 AM on a weekday
      mockDate.setDay(2); // Tuesday
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const isAfterHours = hvacService.isAfterHours(mockCompany.businessHours);
      expect(isAfterHours).toBe(false);

      (global.Date as any).mockRestore();
    });
  });

  describe('Emergency Response Generation', () => {
    test('should generate appropriate heating emergency response', () => {
      const response = hvacService.generateEmergencyResponse(['heating']);

      expect(response).toContain('heating emergency');
      expect(response).toContain('dispatch');
      expect(response).toContain('priority');
    });

    test('should generate appropriate cooling emergency response', () => {
      const response = hvacService.generateEmergencyResponse(['cooling']);

      expect(response).toContain('air conditioning emergency');
      expect(response).toContain('comfort');
    });

    test('should generate appropriate plumbing emergency response', () => {
      const response = hvacService.generateEmergencyResponse(['plumbing']);

      expect(response).toContain('water emergency');
      expect(response).toContain('prevent further damage');
    });

    test('should generate generic emergency response for unknown service', () => {
      const response = hvacService.generateEmergencyResponse(['unknown']);

      expect(response).toContain('emergency situation');
      expect(response).toContain('priority call');
    });
  });

  describe('Availability Message Generation', () => {
    test('should prioritize emergency calls', () => {
      const message = hvacService.generateAvailabilityMessage(mockCompany.businessHours, true);

      expect(message).toContain('emergency');
      expect(message).toContain('immediately');
      expect(message).toContain('24/7');
    });

    test('should provide next business day for after hours', () => {
      // Mock to be after hours
      const mockDate = new Date();
      mockDate.setHours(22, 0, 0, 0);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const message = hvacService.generateAvailabilityMessage(mockCompany.businessHours, false);

      expect(message).toContain('currently closed');
      expect(message).toContain('next available appointment');

      (global.Date as any).mockRestore();
    });

    test('should offer same-day service during business hours', () => {
      // Mock to be during business hours
      const mockDate = new Date();
      mockDate.setHours(10, 0, 0, 0);
      mockDate.setDay(2); // Tuesday
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const message = hvacService.generateAvailabilityMessage(mockCompany.businessHours, false);

      expect(message).toContain('currently open');
      expect(message).toContain('today');

      (global.Date as any).mockRestore();
    });
  });
});