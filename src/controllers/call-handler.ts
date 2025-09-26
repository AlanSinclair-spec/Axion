import { Request, Response } from 'express';
import { VapiIntegrationService } from '../services/vapi-integration';

const vapiService = new VapiIntegrationService();

export class CallHandlerController {
  // Handle incoming Telnyx calls and route to Vapi
  async handleTelnyxCall(req: Request, res: Response): Promise<void> {
    try {
      console.log('🔥 INCOMING TELNYX CALL:', JSON.stringify(req.body, null, 2));

      const { data } = req.body;

      if (!data) {
        console.log('❌ No data in webhook');
        res.status(400).json({ error: 'No data provided' });
        return;
      }

      const { event_type, payload } = data;

      console.log(`📞 Event: ${event_type}`);

      switch (event_type) {
        case 'call.initiated':
          await this.handleCallInitiated(payload);
          break;
        case 'call.answered':
          await this.handleCallAnswered(payload);
          break;
        case 'call.hangup':
          await this.handleCallEnded(payload);
          break;
        default:
          console.log(`ℹ️ Unhandled event: ${event_type}`);
      }

      res.json({
        success: true,
        message: `Processed ${event_type}`,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ TELNYX WEBHOOK ERROR:', error);
      res.status(500).json({
        error: 'Webhook processing failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleCallInitiated(payload: any): Promise<void> {
    try {
      console.log('📞 CALL INITIATED:', {
        callControlId: payload.call_control_id,
        from: payload.from,
        to: payload.to,
        direction: payload.direction
      });

      // For inbound calls to our HVAC number
      if (payload.direction === 'inbound' && payload.to === process.env.TELNYX_PHONE_NUMBER) {
        console.log('🏠 HVAC CALL - Routing to Vapi AI...');

        // Get or create HVAC assistant
        const assistantId = await vapiService.getOrCreateAssistant();
        console.log(`🤖 Using Vapi Assistant: ${assistantId}`);

        // Create Vapi call to handle this
        const vapiCall = await vapiService.createInboundCall(payload.from, assistantId);
        console.log(`🔗 Vapi Call Created: ${vapiCall.id}`);

        // Log for monitoring
        console.log(`✅ HVAC CALL ROUTED: ${payload.from} → Vapi Assistant ${assistantId}`);
      }

    } catch (error) {
      console.error('❌ Error handling call initiation:', error);
    }
  }

  private async handleCallAnswered(payload: any): Promise<void> {
    console.log('✅ CALL ANSWERED:', {
      callControlId: payload.call_control_id,
      from: payload.from,
      to: payload.to
    });
  }

  private async handleCallEnded(payload: any): Promise<void> {
    console.log('📞 CALL ENDED:', {
      callControlId: payload.call_control_id,
      duration: payload.duration_secs,
      hangupSource: payload.hangup_source
    });
  }

  // Handle Vapi webhooks (call status, transcripts, etc.)
  async handleVapiWebhook(req: Request, res: Response): Promise<void> {
    try {
      console.log('🤖 VAPI WEBHOOK:', JSON.stringify(req.body, null, 2));

      const { type, call, message } = req.body;

      switch (type) {
        case 'call-start':
          console.log('🚀 Vapi call started:', call.id);
          break;
        case 'call-end':
          console.log('🏁 Vapi call ended:', call.id);
          break;
        case 'transcript':
          console.log('📝 Transcript:', message.content);
          break;
        case 'function-call':
          await this.handleVapiFunctionCall(req.body);
          break;
        default:
          console.log(`ℹ️ Unhandled Vapi event: ${type}`);
      }

      res.json({
        success: true,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ VAPI WEBHOOK ERROR:', error);
      res.status(500).json({ error: 'Vapi webhook processing failed' });
    }
  }

  private async handleVapiFunctionCall(data: any): Promise<void> {
    const { functionCall } = data;

    if (functionCall.name === 'book_emergency_service') {
      const params = functionCall.parameters;
      console.log('🚨 EMERGENCY SERVICE BOOKED:', {
        customer: params.customerName,
        phone: params.customerPhone,
        address: params.address,
        problem: params.problem,
        isEmergency: params.isEmergency
      });

      // Here you would:
      // 1. Save to database
      // 2. Send SMS confirmation
      // 3. Alert dispatch team
      // 4. Create follow-up task
    }
  }

  // Test endpoint to verify system is working
  async testCall(req: Request, res: Response): Promise<void> {
    try {
      console.log('🧪 TEST CALL INITIATED');

      const assistantId = await vapiService.getOrCreateAssistant();
      console.log(`🤖 Assistant ID: ${assistantId}`);

      res.json({
        success: true,
        message: 'System operational',
        assistantId,
        phoneNumber: process.env.TELNYX_PHONE_NUMBER,
        webhookUrl: `${process.env.WEBHOOK_BASE_URL || 'https://axion-25vn.onrender.com'}/api/webhooks/telnyx/voice`,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ TEST ERROR:', error);
      res.status(500).json({
        error: 'Test failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}