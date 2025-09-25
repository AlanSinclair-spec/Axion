import axios from 'axios';
import { VapiCall, VapiMessage } from '../types';

export class VapiService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.VAPI_API_KEY!;
    this.baseUrl = process.env.VAPI_API_URL || 'https://api.vapi.ai';
  }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  async createHVACAssistant(companyId: string, companyInfo: any, telnyxPhoneNumber: string) {
    const assistantConfig = {
      model: {
        provider: 'openai',
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: this.generateHVACSystemPrompt(companyInfo)
          }
        ]
      },
      voice: {
        provider: 'elevenlabs',
        voiceId: 'rachel'
      },
      telephony: {
        provider: 'telnyx',
        phoneNumber: telnyxPhoneNumber
      },
      firstMessage: `Hello! Thank you for calling ${companyInfo.name}. I'm your AI assistant. How can I help you today?`,
      endCallFunctionEnabled: true,
      recordingEnabled: true,
      silenceTimeoutSeconds: 30,
      maxDurationSeconds: 1800,
      backgroundSound: 'office',
      functions: [
        {
          name: 'book_appointment',
          description: 'Book an appointment for HVAC service',
          parameters: {
            type: 'object',
            properties: {
              customerName: { type: 'string', description: 'Customer full name' },
              customerPhone: { type: 'string', description: 'Customer phone number' },
              customerEmail: { type: 'string', description: 'Customer email (optional)' },
              address: { type: 'string', description: 'Service address' },
              serviceType: { type: 'string', description: 'Type of HVAC service needed' },
              serviceDescription: { type: 'string', description: 'Description of the problem' },
              preferredDate: { type: 'string', description: 'Preferred appointment date' },
              isEmergency: { type: 'boolean', description: 'Is this an emergency service call' }
            },
            required: ['customerName', 'customerPhone', 'address', 'serviceType']
          }
        },
        {
          name: 'get_pricing',
          description: 'Get pricing estimate for HVAC services',
          parameters: {
            type: 'object',
            properties: {
              serviceDescription: { type: 'string', description: 'Description of service needed' },
              isEmergency: { type: 'boolean', description: 'Is this emergency service' }
            },
            required: ['serviceDescription']
          }
        },
        {
          name: 'check_availability',
          description: 'Check appointment availability',
          parameters: {
            type: 'object',
            properties: {
              preferredDate: { type: 'string', description: 'Preferred date for service' },
              isEmergency: { type: 'boolean', description: 'Is this emergency service' },
              description: { type: 'string', description: 'Service description' }
            }
          }
        },
        {
          name: 'escalate_to_human',
          description: 'Transfer call to human dispatcher',
          parameters: {
            type: 'object',
            properties: {
              reason: { type: 'string', description: 'Reason for human escalation' }
            }
          }
        }
      ]
    };

    try {
      const response = await axios.post(
        `${this.baseUrl}/assistant`,
        assistantConfig,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error creating Vapi assistant:', error);
      throw error;
    }
  }

  async createPhoneCall(phoneNumber: string, assistantId: string) {
    const callConfig = {
      assistant: assistantId,
      phoneNumber: phoneNumber,
      customerNumber: phoneNumber
    };

    try {
      const response = await axios.post(
        `${this.baseUrl}/call/phone`,
        callConfig,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error creating Vapi phone call:', error);
      throw error;
    }
  }

  async getCall(callId: string): Promise<VapiCall> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/call/${callId}`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error getting Vapi call:', error);
      throw error;
    }
  }

  async endCall(callId: string) {
    try {
      const response = await axios.delete(
        `${this.baseUrl}/call/${callId}`,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error ending Vapi call:', error);
      throw error;
    }
  }

  private generateHVACSystemPrompt(companyInfo: any): string {
    return `You are an AI phone assistant for ${companyInfo.name}, a professional HVAC company.

COMPANY INFORMATION:
- Company: ${companyInfo.name}
- Phone: ${companyInfo.phone}
- Address: ${companyInfo.address}
- Business Hours: ${this.formatBusinessHours(companyInfo.businessHours)}

CORE RESPONSIBILITIES:
1. EMERGENCY DETECTION - Immediately identify heating/cooling emergencies
2. APPOINTMENT BOOKING - Schedule service calls efficiently
3. LEAD CAPTURE - Collect customer information for follow-up
4. PRICE ESTIMATES - Provide ballpark pricing for common services

EMERGENCY INDICATORS:
- "No heat" or "heat not working" (especially in winter)
- "No AC" or "air conditioning not working" (especially in summer)
- "Water leaking" or "flooding"
- "Gas smell" or "gas leak"
- "Electrical issues" with HVAC equipment
- "Furnace making loud noises"
- Temperature extreme situations (too hot/cold)

CONVERSATION FLOW:
1. Greet professionally and ask how you can help
2. Listen for emergency keywords - if detected, prioritize immediate dispatch
3. For non-emergencies, determine service type needed
4. Collect customer information: name, phone, address, description
5. Check availability and schedule appointment
6. Provide estimated pricing if requested
7. Confirm all details and provide next steps

APPOINTMENT BOOKING:
- Available time slots: ${this.formatAvailableSlots(companyInfo.businessHours)}
- Emergency calls: Same day or next available
- Regular maintenance: Within 3-5 business days
- Always confirm: date, time, address, contact info

PRICING GUIDELINES:
- Service call fee: $75-125 (waived if work performed)
- HVAC tune-up: $125-200
- Emergency after-hours: +50% surcharge
- Weekend/holiday: +25% surcharge
- Always mention "prices may vary based on specific situation"

COMMUNICATION STYLE:
- Professional, friendly, and reassuring
- Use simple language, avoid technical jargon
- Show empathy for customer's situation
- Be confident but not pushy about booking
- Always end with clear next steps

If you cannot handle a request, say you'll have a technician call back within 1 hour during business hours.

Remember: You represent a professional HVAC company. Every interaction should build trust and demonstrate expertise.`;
  }

  private formatBusinessHours(hours: any): string {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    return days.map(day => {
      const dayHours = hours[day];
      if (dayHours.isClosed) return `${day}: Closed`;
      return `${day}: ${dayHours.open} - ${dayHours.close}`;
    }).join(', ');
  }

  private formatAvailableSlots(hours: any): string {
    const today = new Date().getDay();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayHours = hours[days[today]];

    if (todayHours.isClosed) return 'Next business day';
    return `Today: ${todayHours.open} - ${todayHours.close}`;
  }
}