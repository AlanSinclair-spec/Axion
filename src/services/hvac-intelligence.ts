import { CallType, EmergencyKeywords } from '../types';

export class HVACIntelligenceService {
  private emergencyKeywords: EmergencyKeywords = {
    heating: [
      'no heat', 'heat not working', 'furnace not working', 'boiler not working',
      'heat pump not working', 'cold house', 'freezing', 'furnace making noise',
      'gas smell', 'carbon monoxide', 'furnace won\'t start', 'pilot light out',
      'heater broken', 'no hot air', 'thermostat not working'
    ],
    cooling: [
      'no ac', 'air conditioning not working', 'ac not working', 'no cold air',
      'air conditioner broken', 'ac unit not working', 'hot house', 'overheating',
      'ac making noise', 'ac leaking water', 'compressor not working', 'fan not working',
      'ac won\'t start', 'condenser not working'
    ],
    plumbing: [
      'water leak', 'flooding', 'pipe burst', 'water damage', 'water everywhere',
      'basement flooding', 'pipe leaking', 'water heater leaking', 'sewage backup',
      'toilet overflowing', 'drain backing up'
    ],
    electrical: [
      'electrical smell', 'burning smell', 'sparks', 'electrical fire', 'power out',
      'breaker tripping', 'electrical emergency', 'wires sparking', 'outlet smoking',
      'electrical shock'
    ],
    general: [
      'emergency', 'urgent', 'asap', 'right now', 'immediately', 'help',
      'broken', 'not working', 'stopped working', 'emergency service'
    ]
  };

  detectEmergency(transcript: string): boolean {
    const lowerTranscript = transcript.toLowerCase();

    for (const category of Object.values(this.emergencyKeywords)) {
      for (const keyword of category) {
        if (lowerTranscript.includes(keyword)) {
          return true;
        }
      }
    }

    return false;
  }

  classifyCallType(transcript: string): CallType {
    const lowerTranscript = transcript.toLowerCase();

    if (this.detectEmergency(transcript)) {
      return CallType.EMERGENCY;
    }

    if (this.containsAppointmentKeywords(lowerTranscript)) {
      return CallType.APPOINTMENT_BOOKING;
    }

    if (this.containsPriceKeywords(lowerTranscript)) {
      return CallType.PRICE_ESTIMATE;
    }

    if (this.containsServiceKeywords(lowerTranscript)) {
      return CallType.SERVICE_REQUEST;
    }

    return CallType.GENERAL_INQUIRY;
  }

  private containsAppointmentKeywords(transcript: string): boolean {
    const appointmentKeywords = [
      'appointment', 'schedule', 'book', 'visit', 'come out',
      'service call', 'technician', 'when can you', 'available'
    ];

    return appointmentKeywords.some(keyword => transcript.includes(keyword));
  }

  private containsPriceKeywords(transcript: string): boolean {
    const priceKeywords = [
      'cost', 'price', 'estimate', 'quote', 'how much', 'fee',
      'charge', 'rate', 'pricing', 'affordable', 'cheap', 'expensive'
    ];

    return priceKeywords.some(keyword => transcript.includes(keyword));
  }

  private containsServiceKeywords(transcript: string): boolean {
    const serviceKeywords = [
      'repair', 'fix', 'maintenance', 'service', 'install', 'replace',
      'tune-up', 'cleaning', 'inspection', 'hvac', 'air conditioner',
      'furnace', 'heat pump', 'thermostat'
    ];

    return serviceKeywords.some(keyword => transcript.includes(keyword));
  }

  extractServiceType(transcript: string): string[] {
    const lowerTranscript = transcript.toLowerCase();
    const services = [];

    const serviceMap = {
      'heating': ['heat', 'furnace', 'boiler', 'heating', 'heater'],
      'cooling': ['ac', 'air conditioning', 'cooling', 'air conditioner', 'central air'],
      'heat_pump': ['heat pump'],
      'thermostat': ['thermostat'],
      'ductwork': ['duct', 'ductwork', 'vents'],
      'maintenance': ['tune-up', 'maintenance', 'cleaning', 'service'],
      'installation': ['install', 'new', 'replacement']
    };

    for (const [service, keywords] of Object.entries(serviceMap)) {
      if (keywords.some(keyword => lowerTranscript.includes(keyword))) {
        services.push(service);
      }
    }

    return services.length > 0 ? services : ['general_hvac'];
  }

  generateEmergencyResponse(serviceType: string[]): string {
    const responses = {
      heating: "I understand you're having a heating emergency. We'll dispatch a technician immediately - this is a priority call especially in cold weather.",
      cooling: "I see you're having an air conditioning emergency. We'll get someone out to you as soon as possible - comfort is essential.",
      plumbing: "This sounds like a water emergency. I'm prioritizing your call and we'll have someone there right away to prevent further damage.",
      electrical: "This appears to be an electrical emergency. For your safety, please turn off power at the main breaker if safe to do so. We're dispatching someone immediately."
    };

    const primaryService = serviceType[0] || 'general';
    return responses[primaryService as keyof typeof responses] ||
           "I understand this is an emergency situation. We're treating this as a priority call and will dispatch a technician immediately.";
  }

  estimateServicePrice(serviceType: string[], isEmergency: boolean, isAfterHours: boolean): string {
    const basePrices = {
      heating: { min: 150, max: 800 },
      cooling: { min: 125, max: 600 },
      thermostat: { min: 200, max: 400 },
      maintenance: { min: 125, max: 250 },
      installation: { min: 2000, max: 8000 },
      general_hvac: { min: 125, max: 500 }
    };

    const serviceName = serviceType[0] || 'general_hvac';
    const basePrice = basePrices[serviceName as keyof typeof basePrices] || basePrices.general_hvac;

    let multiplier = 1;
    if (isEmergency) multiplier *= 1.5;
    if (isAfterHours) multiplier *= 1.25;

    const estimatedMin = Math.round(basePrice.min * multiplier);
    const estimatedMax = Math.round(basePrice.max * multiplier);

    let priceText = `For ${serviceName.replace('_', ' ')} service, our typical range is $${estimatedMin}-$${estimatedMax}`;

    if (isEmergency) priceText += " (emergency service rates apply)";
    if (isAfterHours) priceText += " (after-hours rates apply)";

    priceText += ". The final price depends on the specific issue and parts needed. We provide upfront pricing before any work begins.";

    return priceText;
  }

  isAfterHours(businessHours: any): boolean {
    const now = new Date();
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
    const currentTime = now.getHours() * 100 + now.getMinutes();

    const todayHours = businessHours[dayOfWeek];
    if (todayHours.isClosed) return true;

    const openTime = this.parseTime(todayHours.open);
    const closeTime = this.parseTime(todayHours.close);

    return currentTime < openTime || currentTime > closeTime;
  }

  private parseTime(timeString: string): number {
    const [time, period] = timeString.split(' ');
    const [hours, minutes] = time.split(':').map(Number);
    let hour24 = hours;

    if (period === 'PM' && hours !== 12) hour24 += 12;
    if (period === 'AM' && hours === 12) hour24 = 0;

    return hour24 * 100 + minutes;
  }

  generateAvailabilityMessage(businessHours: any, isEmergency: boolean): string {
    if (isEmergency) {
      return "Since this is an emergency, we can dispatch a technician immediately. Emergency service is available 24/7.";
    }

    const now = new Date();
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
    const todayHours = businessHours[dayOfWeek];

    if (this.isAfterHours(businessHours)) {
      const nextBusinessDay = this.getNextBusinessDay(businessHours);
      return `We're currently closed. Our next available appointment is ${nextBusinessDay}. For emergencies, we do offer 24/7 emergency service.`;
    }

    return `We're currently open and have appointments available today. Our earliest slot is within the next 2-3 hours.`;
  }

  private getNextBusinessDay(businessHours: any): string {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const now = new Date();

    for (let i = 1; i <= 7; i++) {
      const checkDate = new Date(now);
      checkDate.setDate(now.getDate() + i);
      const dayName = days[checkDate.getDay()];

      if (!businessHours[dayName].isClosed) {
        return checkDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      }
    }

    return 'next week';
  }
}