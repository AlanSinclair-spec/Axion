import { telnyxClient } from '../config/telnyx';
import { CallRecord, CallType } from '../types';

export class TelnyxService {
  async purchasePhoneNumber(areaCode?: string): Promise<string> {
    try {
      const searchResponse = await telnyxClient.phoneNumbers.listAvailablePhoneNumbers({
        filter: {
          country_code: 'US',
          phone_number_type: 'local',
          ...(areaCode && { area_code: areaCode })
        },
        page: {
          size: 1
        }
      });

      if (!searchResponse.data.length) {
        throw new Error('No available phone numbers found');
      }

      const phoneNumber = searchResponse.data[0].phone_number;

      const purchaseResponse = await telnyxClient.phoneNumbers.createPhoneNumberOrder({
        phone_numbers: [{ phone_number: phoneNumber }]
      });

      return phoneNumber;
    } catch (error) {
      console.error('Error purchasing Telnyx phone number:', error);
      throw error;
    }
  }

  async configurePhoneNumber(phoneNumber: string, companyId: string): Promise<any> {
    try {
      const webhookUrl = `${process.env.WEBHOOK_BASE_URL}/api/webhooks/telnyx/voice?companyId=${companyId}`;

      const response = await telnyxClient.phoneNumbers.updatePhoneNumber(phoneNumber, {
        voice_settings: {
          usage_payment_method: 'pay-per-minute'
        },
        messaging_settings: {
          usage_payment_method: 'pay-per-message'
        }
      });

      await telnyxClient.webhooks.create({
        webhook_url: webhookUrl,
        webhook_event_types: ['call.initiated', 'call.answered', 'call.hangup', 'call.machine.detection.ended'],
        filter: 'voice'
      });

      return response;
    } catch (error) {
      console.error('Error configuring Telnyx phone number:', error);
      throw error;
    }
  }

  async sendSMS(to: string, from: string, message: string): Promise<any> {
    try {
      const response = await telnyxClient.messages.create({
        from: from,
        to: to,
        text: message
      });

      return response;
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

  async initiateCall(to: string, from: string): Promise<any> {
    try {
      const response = await telnyxClient.calls.create({
        to: to,
        from: from,
        connection_id: process.env.TELNYX_CONNECTION_ID
      });

      return response;
    } catch (error) {
      console.error('Error initiating Telnyx call:', error);
      throw error;
    }
  }

  async handleIncomingCall(callControlId: string): Promise<any> {
    try {
      const response = await telnyxClient.calls.answer({
        call_control_id: callControlId
      });

      return response;
    } catch (error) {
      console.error('Error answering Telnyx call:', error);
      throw error;
    }
  }

  async transferCall(callControlId: string, to: string): Promise<any> {
    try {
      const response = await telnyxClient.calls.transfer({
        call_control_id: callControlId,
        to: to
      });

      return response;
    } catch (error) {
      console.error('Error transferring Telnyx call:', error);
      throw error;
    }
  }

  async hangupCall(callControlId: string): Promise<any> {
    try {
      const response = await telnyxClient.calls.hangup({
        call_control_id: callControlId
      });

      return response;
    } catch (error) {
      console.error('Error hanging up Telnyx call:', error);
      throw error;
    }
  }

  async getCallDetails(callId: string): Promise<any> {
    try {
      const response = await telnyxClient.calls.retrieve(callId);
      return response;
    } catch (error) {
      console.error('Error getting Telnyx call details:', error);
      throw error;
    }
  }

  async listPhoneNumbers(): Promise<any[]> {
    try {
      const response = await telnyxClient.phoneNumbers.list();
      return response.data;
    } catch (error) {
      console.error('Error listing Telnyx phone numbers:', error);
      throw error;
    }
  }

  async getPhoneNumberUsage(phoneNumber: string, startDate?: Date, endDate?: Date): Promise<any> {
    try {
      const response = await telnyxClient.phoneNumbers.retrievePhoneNumber(phoneNumber);
      return response;
    } catch (error) {
      console.error('Error getting Telnyx phone number usage:', error);
      throw error;
    }
  }

  verifyWebhook(body: any, signature: string): boolean {
    try {
      return telnyxClient.webhooks.constructEvent(
        JSON.stringify(body),
        signature,
        process.env.TELNYX_WEBHOOK_SIGNING_SECRET || ''
      );
    } catch (error) {
      console.error('Telnyx webhook verification failed:', error);
      return false;
    }
  }

  private async logCall(callId: string, direction: 'inbound' | 'outbound', customerPhone: string, companyId: string): Promise<void> {
    console.log(`Telnyx ${direction} call - ID: ${callId}, Customer: ${customerPhone}, Company: ${companyId}, Time: ${new Date().toISOString()}`);
  }
}