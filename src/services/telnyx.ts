import axios from 'axios';

export class TelnyxService {
  private apiKey: string;
  private baseUrl: string = 'https://api.telnyx.com/v2';

  constructor() {
    this.apiKey = process.env.TELNYX_API_KEY || '';
  }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  async sendSMS(to: string, from: string, message: string): Promise<any> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/messages`,
        {
          from: from,
          to: to,
          text: message,
          type: 'SMS'
        },
        { headers: this.getHeaders() }
      );

      return response.data;
    } catch (error) {
      console.error('Error sending Telnyx SMS:', error);
      throw error;
    }
  }

  async sendAppointmentConfirmation(customerPhone: string, fromPhone: string, appointment: any): Promise<any> {
    const message = `Hi ${appointment.customerName}! Your HVAC appointment is confirmed for ${new Date(appointment.scheduledDate).toLocaleDateString()} at ${new Date(appointment.scheduledDate).toLocaleTimeString()}. Address: ${appointment.address}. Service: ${appointment.serviceType}. We'll call 30 minutes before arrival.`;

    return await this.sendSMS(customerPhone, fromPhone, message);
  }

  async sendEmergencyAlert(customerPhone: string, fromPhone: string, companyName: string, eta: string): Promise<any> {
    const message = `EMERGENCY SERVICE ALERT: ${companyName} has received your emergency call. A technician will be dispatched within ${eta}. We'll call with updates. Stay safe!`;

    return await this.sendSMS(customerPhone, fromPhone, message);
  }

  verifyWebhook(body: any, signature: string): boolean {
    // Simple verification - in production you'd implement proper signature verification
    return true;
  }

  async purchasePhoneNumber(areaCode?: string): Promise<string> {
    // For now, return the configured phone number
    return process.env.TELNYX_PHONE_NUMBER || '';
  }

  async configurePhoneNumber(phoneNumber: string, companyId: string): Promise<any> {
    // Configuration would be done in Telnyx dashboard
    return { success: true };
  }

  async handleIncomingCall(callControlId: string): Promise<any> {
    return { success: true };
  }
}