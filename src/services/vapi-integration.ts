import axios from 'axios';

export class VapiIntegrationService {
  private apiKey: string;
  private baseUrl = 'https://api.vapi.ai';

  constructor() {
    this.apiKey = process.env.VAPI_API_KEY!;
  }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  // Create HVAC-specific assistant
  async createHVACAssistant(): Promise<any> {
    const assistantConfig = {
      name: 'HVAC Emergency Assistant',
      model: {
        provider: 'openai',
        model: 'gpt-4',
        messages: [{
          role: 'system',
          content: `You are an AI receptionist for an HVAC company. Your job is to:

1. EMERGENCY DETECTION: Immediately identify heating/cooling emergencies:
   - "No heat" (especially in winter)
   - "No AC" (especially in summer)
   - "Water leaking" from HVAC equipment
   - "Gas smell" or "electrical issues"
   - Any situation causing discomfort/danger

2. PROFESSIONAL GREETING: "Thank you for calling! I'm here to help with your heating and cooling needs. What's the situation?"

3. EMERGENCY RESPONSE: If emergency detected:
   - "I understand this is urgent. We'll dispatch a technician immediately."
   - "Can I get your name, phone number, and address?"
   - "We'll have someone there within 2 hours."

4. APPOINTMENT BOOKING: For non-emergencies:
   - "I can schedule a service appointment. What day works best?"
   - "We have availability tomorrow morning or afternoon."
   - Get: name, phone, address, preferred time

5. LEAD CAPTURE: Always collect:
   - Customer name and phone number
   - Service address
   - Nature of the problem
   - Urgency level

Be professional, empathetic, and focus on solving their HVAC problem quickly.`
        }]
      },
      voice: {
        provider: 'playht',
        voiceId: 'jennifer'
      },
      telephony: {
        provider: 'telnyx'
      },
      firstMessage: "Thank you for calling! I'm here to help with your heating and cooling needs. What's the situation?",
      endCallFunctionEnabled: false,
      recordingEnabled: true,
      silenceTimeoutSeconds: 30,
      maxDurationSeconds: 600,
      functions: [
        {
          name: 'book_emergency_service',
          description: 'Book emergency HVAC service',
          parameters: {
            type: 'object',
            properties: {
              customerName: { type: 'string' },
              customerPhone: { type: 'string' },
              address: { type: 'string' },
              problem: { type: 'string' },
              isEmergency: { type: 'boolean' }
            },
            required: ['customerName', 'customerPhone', 'address', 'problem']
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

  // Create inbound call to connect Telnyx to Vapi
  async createInboundCall(customerPhone: string, assistantId: string): Promise<any> {
    const callConfig = {
      type: 'inboundPhoneCall',
      assistant: {
        id: assistantId
      },
      customer: {
        number: customerPhone
      }
    };

    try {
      const response = await axios.post(
        `${this.baseUrl}/call`,
        callConfig,
        { headers: this.getHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Error creating Vapi call:', error);
      throw error;
    }
  }

  // Get or create assistant
  async getOrCreateAssistant(): Promise<string> {
    try {
      // Try to get existing assistants
      const response = await axios.get(
        `${this.baseUrl}/assistant`,
        { headers: this.getHeaders() }
      );

      // Look for existing HVAC assistant
      const existingAssistant = response.data.find((assistant: any) =>
        assistant.name?.includes('HVAC')
      );

      if (existingAssistant) {
        return existingAssistant.id;
      }

      // Create new assistant if none exists
      const newAssistant = await this.createHVACAssistant();
      return newAssistant.id;
    } catch (error) {
      console.error('Error getting/creating assistant:', error);
      throw error;
    }
  }
}