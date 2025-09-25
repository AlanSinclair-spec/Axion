import { twilioClient, TWILIO_PHONE_NUMBER } from '../config/twilio';
import { CallRecord, CallType } from '../types';

export class TwilioService {
  async handleIncomingCall(callSid: string, from: string, to: string) {
    try {
      const twiml = this.generateTwiMLForHandoff();

      await this.logIncomingCall(callSid, from, to);

      return twiml;
    } catch (error) {
      console.error('Error handling incoming call:', error);
      throw error;
    }
  }

  async forwardToVapi(callSid: string, vapiPhoneNumber: string) {
    try {
      const call = await twilioClient.calls(callSid)
        .update({
          method: 'POST',
          url: `${process.env.WEBHOOK_BASE_URL}/api/webhooks/vapi-handoff`,
        });

      return call;
    } catch (error) {
      console.error('Error forwarding to Vapi:', error);
      throw error;
    }
  }

  async sendSMS(to: string, message: string) {
    try {
      const sms = await twilioClient.messages.create({
        body: message,
        from: TWILIO_PHONE_NUMBER,
        to: to
      });

      return sms;
    } catch (error) {
      console.error('Error sending SMS:', error);
      throw error;
    }
  }

  async sendAppointmentConfirmation(customerPhone: string, appointment: any) {
    const message = `Hi ${appointment.customerName}! Your HVAC appointment is confirmed for ${new Date(appointment.scheduledDate).toLocaleDateString()} at ${new Date(appointment.scheduledDate).toLocaleTimeString()}. Address: ${appointment.address}. Service: ${appointment.serviceType}. We'll call 30 minutes before arrival.`;

    return await this.sendSMS(customerPhone, message);
  }

  async sendEmergencyAlert(customerPhone: string, companyName: string, eta: string) {
    const message = `EMERGENCY SERVICE ALERT: ${companyName} has received your emergency call. A technician will be dispatched within ${eta}. We'll call with updates. Stay safe!`;

    return await this.sendSMS(customerPhone, message);
  }

  async getCallDetails(callSid: string) {
    try {
      const call = await twilioClient.calls(callSid).fetch();
      return call;
    } catch (error) {
      console.error('Error getting call details:', error);
      throw error;
    }
  }

  async getCallRecording(callSid: string) {
    try {
      const recordings = await twilioClient.recordings.list({ callSid: callSid });
      return recordings.length > 0 ? recordings[0] : null;
    } catch (error) {
      console.error('Error getting call recording:', error);
      throw error;
    }
  }

  private generateTwiMLForHandoff(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">Please hold while I connect you to our AI assistant.</Say>
    <Pause length="1"/>
    <Dial>
        <Number url="${process.env.WEBHOOK_BASE_URL}/api/webhooks/vapi-connect">${TWILIO_PHONE_NUMBER}</Number>
    </Dial>
</Response>`;
  }

  private async logIncomingCall(callSid: string, from: string, to: string) {
    console.log(`Incoming call - SID: ${callSid}, From: ${from}, To: ${to}, Time: ${new Date().toISOString()}`);
  }

  async purchasePhoneNumber(areaCode?: string): Promise<string> {
    try {
      const availableNumbers = await twilioClient.availablePhoneNumbers('US')
        .local
        .list({
          areaCode: areaCode,
          limit: 1
        });

      if (availableNumbers.length === 0) {
        throw new Error('No available phone numbers found');
      }

      const purchasedNumber = await twilioClient.incomingPhoneNumbers
        .create({
          phoneNumber: availableNumbers[0].phoneNumber,
          voiceUrl: `${process.env.WEBHOOK_BASE_URL}/api/webhooks/twilio/voice`,
          voiceMethod: 'POST',
          statusCallback: `${process.env.WEBHOOK_BASE_URL}/api/webhooks/twilio/status`,
          statusCallbackMethod: 'POST'
        });

      return purchasedNumber.phoneNumber;
    } catch (error) {
      console.error('Error purchasing phone number:', error);
      throw error;
    }
  }

  async configurePhoneNumber(phoneNumber: string, companyId: string) {
    try {
      const numbers = await twilioClient.incomingPhoneNumbers.list({
        phoneNumber: phoneNumber
      });

      if (numbers.length === 0) {
        throw new Error('Phone number not found');
      }

      await twilioClient.incomingPhoneNumbers(numbers[0].sid)
        .update({
          voiceUrl: `${process.env.WEBHOOK_BASE_URL}/api/webhooks/twilio/voice?companyId=${companyId}`,
          voiceMethod: 'POST',
          statusCallback: `${process.env.WEBHOOK_BASE_URL}/api/webhooks/twilio/status?companyId=${companyId}`,
          statusCallbackMethod: 'POST'
        });

      return numbers[0];
    } catch (error) {
      console.error('Error configuring phone number:', error);
      throw error;
    }
  }
}