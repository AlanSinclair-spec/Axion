import { Request, Response } from 'express';
import { VapiService } from '../services/vapi';
import { TelnyxService } from '../services/telnyx';
import { HVACIntelligenceService } from '../services/hvac-intelligence';
import { AppointmentService } from '../services/appointment';
import { LeadService } from '../services/lead';
import { CompanyModel } from '../models/Company';
import { query } from '../config/database';
import { CallType, Priority, AppointmentStatus } from '../types';
import { v4 as uuidv4 } from 'uuid';

const vapiService = new VapiService();
const telnyxService = new TelnyxService();
const hvacService = new HVACIntelligenceService();
const appointmentService = new AppointmentService();
const leadService = new LeadService();
const companyModel = new CompanyModel();

export class WebhookController {
  async handleTelnyxVoice(req: Request, res: Response) {
    try {
      const { data } = req.body;
      const companyId = req.query.companyId as string;

      // Verify webhook signature
      const signature = req.headers['telnyx-signature-ed25519'] as string;
      if (!telnyxService.verifyWebhook(req.body, signature)) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }

      const { event_type, payload } = data;

      console.log(`Incoming Telnyx event: ${event_type}, Call ID: ${payload?.call_control_id}`);

      switch (event_type) {
        case 'call.initiated':
          await this.handleCallInitiated(payload, companyId);
          break;
        case 'call.answered':
          await this.handleCallAnswered(payload, companyId);
          break;
        case 'call.hangup':
          await this.handleCallHangup(payload, companyId);
          break;
        default:
          console.log('Unhandled Telnyx event:', event_type);
      }

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Telnyx voice webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  private async handleCallInitiated(payload: any, companyId: string) {
    const callId = payload.call_control_id;
    const customerPhone = payload.from;

    await this.createCallRecord(callId, customerPhone, companyId, 'telnyx');

    // Answer the call and hand it off to Vapi
    await telnyxService.handleIncomingCall(callId);
  }

  private async handleCallAnswered(payload: any, companyId: string) {
    console.log(`Call answered: ${payload.call_control_id}`);
  }

  private async handleCallHangup(payload: any, companyId: string) {
    const callId = payload.call_control_id;
    const duration = payload.duration_secs || 0;

    await query(
      'UPDATE call_records SET duration = $1 WHERE telnyx_call_id = $2 AND company_id = $3',
      [duration, callId, companyId]
    );

    await this.handleCallCompletion(callId, companyId, 'telnyx');
  }

  async handleVapiWebhook(req: Request, res: Response) {
    try {
      const { type, call, message } = req.body;

      switch (type) {
        case 'call-start':
          await this.handleCallStart(call);
          break;

        case 'call-end':
          await this.handleCallEnd(call);
          break;

        case 'message':
          await this.handleMessage(call, message);
          break;

        case 'function-call':
          return await this.handleFunctionCall(req, res);

        default:
          console.log('Unknown Vapi webhook type:', type);
      }

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Vapi webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  private async handleCallStart(call: any) {
    const companyId = this.extractCompanyIdFromCall(call);
    if (!companyId) return;

    await query(
      'UPDATE call_records SET vapi_call_id = $1 WHERE twilio_call_sid = $2 AND company_id = $3',
      [call.id, call.metadata?.twilioCallSid, companyId]
    );
  }

  private async handleCallEnd(call: any) {
    const companyId = this.extractCompanyIdFromCall(call);
    if (!companyId) return;

    const transcript = this.extractTranscript(call);
    const summary = await this.generateCallSummary(transcript);

    await query(
      `UPDATE call_records SET
        transcript = $1,
        summary = $2,
        duration = $3
       WHERE vapi_call_id = $4 AND company_id = $5`,
      [transcript, summary, call.duration || 0, call.id, companyId]
    );

    await this.processCallIntelligence(call.id, transcript, companyId);
  }

  private async handleMessage(call: any, message: any) {
    if (message.role === 'user') {
      const companyId = this.extractCompanyIdFromCall(call);
      const transcript = message.content;

      const isEmergency = hvacService.detectEmergency(transcript);
      const callType = hvacService.classifyCallType(transcript);

      if (isEmergency) {
        await this.handleEmergencyDetection(call, transcript, companyId);
      }

      await query(
        'UPDATE call_records SET is_emergency = $1, call_type = $2 WHERE vapi_call_id = $3 AND company_id = $4',
        [isEmergency, callType, call.id, companyId]
      );
    }
  }

  private async handleFunctionCall(req: Request, res: Response) {
    const { functionCall, call } = req.body;
    const companyId = this.extractCompanyIdFromCall(call);

    switch (functionCall.name) {
      case 'book_appointment':
        return await this.handleAppointmentBooking(req, res);

      case 'get_pricing':
        return await this.handlePricingRequest(req, res);

      case 'check_availability':
        return await this.handleAvailabilityCheck(req, res);

      case 'escalate_to_human':
        return await this.handleHumanEscalation(req, res);

      default:
        res.status(400).json({ error: 'Unknown function call' });
    }
  }

  private async handleAppointmentBooking(req: Request, res: Response) {
    try {
      const { functionCall, call } = req.body;
      const companyId = this.extractCompanyIdFromCall(call);
      const params = functionCall.parameters;

      const company = await companyModel.findById(companyId);
      if (!company) {
        return res.json({
          result: "I'm sorry, there was an error accessing company information. Please try again."
        });
      }

      const isEmergency = params.isEmergency || hvacService.detectEmergency(params.serviceDescription || '');
      const priority = isEmergency ? Priority.EMERGENCY : Priority.MEDIUM;

      const nextAvailable = await appointmentService.getNextAvailableSlot(companyId, priority);

      const appointment = await appointmentService.createAppointment({
        companyId,
        customerName: params.customerName,
        customerPhone: params.customerPhone,
        customerEmail: params.customerEmail,
        address: params.address,
        serviceType: params.serviceType || 'General HVAC Service',
        scheduledDate: nextAvailable,
        estimatedDuration: isEmergency ? 120 : 60,
        notes: params.serviceDescription || '',
        priority
      });

      // Get company's Telnyx phone number for SMS
      const companyPhoneNumber = await this.getCompanyPhoneNumber(companyId);

      await telnyxService.sendAppointmentConfirmation(
        params.customerPhone,
        companyPhoneNumber,
        appointment
      );

      if (isEmergency) {
        await telnyxService.sendEmergencyAlert(
          params.customerPhone,
          companyPhoneNumber,
          company.name,
          '2 hours'
        );
      }

      const confirmationMessage = await appointmentService.generateAppointmentConfirmation(appointment);

      res.json({
        result: confirmationMessage + (isEmergency ? " This is treated as an emergency - we'll be there as soon as possible." : "")
      });
    } catch (error) {
      console.error('Appointment booking error:', error);
      res.json({
        result: "I apologize, but there was an error scheduling your appointment. Let me transfer you to our dispatcher who can help immediately."
      });
    }
  }

  private async handlePricingRequest(req: Request, res: Response) {
    try {
      const { functionCall, call } = req.body;
      const companyId = this.extractCompanyIdFromCall(call);
      const params = functionCall.parameters;

      const company = await companyModel.findById(companyId);
      if (!company) {
        return res.json({
          result: "I'm sorry, I can't access pricing information right now. Please call back later."
        });
      }

      const serviceTypes = hvacService.extractServiceType(params.serviceDescription);
      const isEmergency = hvacService.detectEmergency(params.serviceDescription);
      const isAfterHours = hvacService.isAfterHours(company.businessHours);

      const pricing = hvacService.estimateServicePrice(serviceTypes, isEmergency, isAfterHours);

      res.json({ result: pricing });
    } catch (error) {
      console.error('Pricing request error:', error);
      res.json({
        result: "I can provide general pricing, but specific quotes depend on the situation. Our service call fee starts at $75-125, which is waived if we perform the work. Would you like to schedule an appointment for an accurate estimate?"
      });
    }
  }

  private async handleAvailabilityCheck(req: Request, res: Response) {
    try {
      const { functionCall, call } = req.body;
      const companyId = this.extractCompanyIdFromCall(call);
      const params = functionCall.parameters;

      const company = await companyModel.findById(companyId);
      if (!company) {
        return res.json({
          result: "I'm sorry, I can't check availability right now. Please try calling back."
        });
      }

      const isEmergency = params.isEmergency || hvacService.detectEmergency(params.description || '');
      const availability = hvacService.generateAvailabilityMessage(company.businessHours, isEmergency);

      if (!isEmergency && params.preferredDate) {
        const preferredDate = new Date(params.preferredDate);
        const slots = await appointmentService.getAvailableSlots(companyId, preferredDate);

        if (slots.length > 0) {
          const timeOptions = slots.slice(0, 3).map(slot =>
            slot.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
          ).join(', ');

          return res.json({
            result: `Great! We have availability on ${preferredDate.toLocaleDateString()} at these times: ${timeOptions}. Which works best for you?`
          });
        } else {
          const alternatives = await appointmentService.suggestAlternativeSlots(companyId, preferredDate);
          const altDates = alternatives.map(date =>
            date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          ).join(', ');

          return res.json({
            result: `That date is fully booked, but I have openings on: ${altDates}. Would any of these work for you?`
          });
        }
      }

      res.json({ result: availability });
    } catch (error) {
      console.error('Availability check error:', error);
      res.json({
        result: "Let me check our schedule... We typically have same-day availability for emergencies and next-day service for regular appointments."
      });
    }
  }

  private async handleHumanEscalation(req: Request, res: Response) {
    try {
      const { call } = req.body;
      const companyId = this.extractCompanyIdFromCall(call);

      res.json({
        result: "I understand you'd like to speak with someone directly. I'm connecting you with our dispatch team now. Please hold for just a moment.",
        action: "transfer_to_human"
      });
    } catch (error) {
      console.error('Human escalation error:', error);
      res.json({
        result: "Let me get you connected with our team right away."
      });
    }
  }

  private async createCallRecord(callId: string, customerPhone: string, companyId: string, provider: 'telnyx' | 'vapi') {
    const id = uuidv4();
    const columnName = provider === 'telnyx' ? 'telnyx_call_id' : 'vapi_call_id';

    await query(
      `INSERT INTO call_records (
        id, company_id, customer_phone, call_type, ${columnName}
      ) VALUES ($1, $2, $3, $4, $5)`,
      [id, companyId, customerPhone, CallType.GENERAL_INQUIRY, callId]
    );
  }

  private async handleCallCompletion(callId: string, companyId: string, provider: 'telnyx' | 'vapi' = 'telnyx') {
    const columnName = provider === 'telnyx' ? 'telnyx_call_id' : 'vapi_call_id';
    const callRecord = await query(
      `SELECT * FROM call_records WHERE ${columnName} = $1 AND company_id = $2`,
      [callId, companyId]
    );

    if (callRecord.rows.length > 0) {
      const record = callRecord.rows[0];

      if (!record.appointment_id && record.call_type !== CallType.GENERAL_INQUIRY) {
        await leadService.createLead({
          companyId,
          customerName: record.customer_name || 'Unknown Customer',
          customerPhone: record.customer_phone,
          serviceInterest: hvacService.extractServiceType(record.summary || ''),
          notes: record.summary || 'Call completed - no appointment booked',
          callRecordId: record.id
        });
      }
    }
  }

  private async handleEmergencyDetection(call: any, transcript: string, companyId: string) {
    const company = await companyModel.findById(companyId);
    if (!company) return;

    const customerPhone = call.customer?.number;
    if (customerPhone) {
      const companyPhoneNumber = await this.getCompanyPhoneNumber(companyId);
      await telnyxService.sendEmergencyAlert(customerPhone, companyPhoneNumber, company.name, '2 hours');
    }

    console.log(`EMERGENCY DETECTED: Company ${company.name}, Call ${call.id}`);
  }

  private async processCallIntelligence(callId: string, transcript: string, companyId: string) {
    const serviceTypes = hvacService.extractServiceType(transcript);
    const callType = hvacService.classifyCallType(transcript);
    const isEmergency = hvacService.detectEmergency(transcript);

    await query(
      `UPDATE call_records SET
        call_type = $1,
        is_emergency = $2
       WHERE vapi_call_id = $3 AND company_id = $4`,
      [callType, isEmergency, callId, companyId]
    );
  }

  private extractCompanyIdFromCall(call: any): string | null {
    return call.metadata?.companyId || call.companyId || null;
  }

  private extractTranscript(call: any): string {
    if (call.messages && Array.isArray(call.messages)) {
      return call.messages
        .filter((msg: any) => msg.role === 'user' || msg.role === 'assistant')
        .map((msg: any) => `${msg.role}: ${msg.content}`)
        .join('\n');
    }
    return '';
  }

  private async generateCallSummary(transcript: string): Promise<string> {
    if (!transcript || transcript.length < 10) {
      return 'Call completed - no transcript available';
    }

    const keywords = ['emergency', 'appointment', 'price', 'cost', 'repair', 'install', 'maintenance'];
    const foundKeywords = keywords.filter(keyword =>
      transcript.toLowerCase().includes(keyword)
    );

    if (foundKeywords.length === 0) {
      return 'General inquiry call';
    }

    return `Call regarding: ${foundKeywords.join(', ')}`;
  }

  private async getCompanyPhoneNumber(companyId: string): Promise<string> {
    const result = await query(
      'SELECT telnyx_phone_number FROM companies WHERE id = $1',
      [companyId]
    );

    return result.rows[0]?.telnyx_phone_number || process.env.DEFAULT_TELNYX_PHONE_NUMBER || '';
  }
}