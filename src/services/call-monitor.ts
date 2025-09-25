import { Server } from 'socket.io';
import { query } from '../config/database';
import { VapiService } from './vapi';
import { TelnyxService } from './telnyx';
import { HVACIntelligenceService } from './hvac-intelligence';
import { CompanyModel } from '../models/Company';

interface ActiveCall {
  id: string;
  companyId: string;
  customerPhone: string;
  status: 'ringing' | 'answered' | 'in-progress' | 'ending';
  startTime: Date;
  duration: number;
  isEmergency: boolean;
  transcript: string;
  sentiment: 'positive' | 'neutral' | 'negative';
}

export class CallMonitorService {
  private io: Server;
  private activeCalls: Map<string, ActiveCall> = new Map();
  private vapiService: VapiService;
  private telnyxService: TelnyxService;
  private hvacService: HVACIntelligenceService;
  private companyModel: CompanyModel;

  constructor(io: Server) {
    this.io = io;
    this.vapiService = new VapiService();
    this.telnyxService = new TelnyxService();
    this.hvacService = new HVACIntelligenceService();
    this.companyModel = new CompanyModel();

    this.setupSocketHandlers();
    this.startCallStatsUpdater();
  }

  private setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log('Client connected to call monitor:', socket.id);

      socket.on('join-company', (companyId: string) => {
        socket.join(`company-${companyId}`);
        this.sendInitialData(socket, companyId);
      });

      socket.on('leave-company', (companyId: string) => {
        socket.leave(`company-${companyId}`);
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected from call monitor:', socket.id);
      });
    });
  }

  async addActiveCall(callData: {
    id: string;
    companyId: string;
    customerPhone: string;
    vapiCallId?: string;
    telnyxCallId?: string;
  }) {
    const activeCall: ActiveCall = {
      id: callData.id,
      companyId: callData.companyId,
      customerPhone: callData.customerPhone,
      status: 'ringing',
      startTime: new Date(),
      duration: 0,
      isEmergency: false,
      transcript: '',
      sentiment: 'neutral'
    };

    this.activeCalls.set(callData.id, activeCall);

    // Notify connected clients
    this.io.to(`company-${callData.companyId}`).emit('call-started', {
      call: activeCall,
      timestamp: new Date()
    });

    // Update database
    await this.updateCallStatus(callData.id, 'ringing');
  }

  async updateCall(callId: string, updates: Partial<ActiveCall>) {
    const call = this.activeCalls.get(callId);
    if (!call) return;

    Object.assign(call, updates);
    call.duration = Math.floor((new Date().getTime() - call.startTime.getTime()) / 1000);

    this.activeCalls.set(callId, call);

    // Notify connected clients
    this.io.to(`company-${call.companyId}`).emit('call-updated', {
      call,
      updates,
      timestamp: new Date()
    });

    // Check for emergency detection
    if (updates.transcript && !call.isEmergency) {
      const isEmergency = this.hvacService.detectEmergency(updates.transcript);
      if (isEmergency) {
        call.isEmergency = true;
        await this.handleEmergencyDetection(call);
      }
    }
  }

  async endCall(callId: string, reason: 'completed' | 'hangup' | 'error' = 'completed') {
    const call = this.activeCalls.get(callId);
    if (!call) return;

    call.status = 'ending';
    call.duration = Math.floor((new Date().getTime() - call.startTime.getTime()) / 1000);

    // Notify connected clients
    this.io.to(`company-${call.companyId}`).emit('call-ended', {
      call,
      reason,
      timestamp: new Date()
    });

    // Final database update
    await query(
      `UPDATE call_records SET
        duration = $1,
        transcript = $2,
        is_emergency = $3
       WHERE id = $4`,
      [call.duration, call.transcript, call.isEmergency, callId]
    );

    this.activeCalls.delete(callId);
  }

  getActiveCalls(companyId?: string): ActiveCall[] {
    if (companyId) {
      return Array.from(this.activeCalls.values()).filter(call => call.companyId === companyId);
    }
    return Array.from(this.activeCalls.values());
  }

  async getCallStatistics(companyId: string, timeframe: 'today' | 'week' | 'month' = 'today') {
    const dateFilter = this.getDateFilter(timeframe);

    const result = await query(
      `SELECT
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE is_emergency = true) as emergency_calls,
        AVG(duration) as avg_duration,
        COUNT(*) FILTER (WHERE duration > 0) as answered_calls,
        COUNT(DISTINCT customer_phone) as unique_customers
      FROM call_records
      WHERE company_id = $1 AND created_at >= $2`,
      [companyId, dateFilter]
    );

    const stats = result.rows[0];
    const activeCalls = this.getActiveCalls(companyId);

    return {
      totalCalls: parseInt(stats.total_calls),
      emergencyCalls: parseInt(stats.emergency_calls),
      avgDuration: Math.round(parseFloat(stats.avg_duration) || 0),
      answeredCalls: parseInt(stats.answered_calls),
      uniqueCustomers: parseInt(stats.unique_customers),
      activeCallsCount: activeCalls.length,
      activeCalls: activeCalls,
      answerRate: stats.total_calls > 0 ?
        Math.round((stats.answered_calls / stats.total_calls) * 100) : 0
    };
  }

  async getLiveTranscript(callId: string): Promise<string> {
    const call = this.activeCalls.get(callId);
    return call?.transcript || '';
  }

  private async sendInitialData(socket: any, companyId: string) {
    const activeCalls = this.getActiveCalls(companyId);
    const stats = await this.getCallStatistics(companyId);

    socket.emit('initial-data', {
      activeCalls,
      stats,
      timestamp: new Date()
    });
  }

  private async handleEmergencyDetection(call: ActiveCall) {
    console.log(`EMERGENCY DETECTED: Call ${call.id}, Customer: ${call.customerPhone}`);

    // Immediately notify all connected clients
    this.io.to(`company-${call.companyId}`).emit('emergency-detected', {
      call,
      timestamp: new Date()
    });

    // Send emergency alert SMS
    const company = await this.companyModel.findById(call.companyId);
    if (company?.telnyx_phone_number) {
      await this.telnyxService.sendEmergencyAlert(
        call.customerPhone,
        company.telnyx_phone_number,
        company.name,
        '2 hours'
      );
    }

    // Update database
    await query(
      'UPDATE call_records SET is_emergency = true WHERE id = $1',
      [call.id]
    );
  }

  private async updateCallStatus(callId: string, status: string) {
    await query(
      'UPDATE call_records SET summary = $1 WHERE id = $2',
      [`Call ${status}`, callId]
    );
  }

  private startCallStatsUpdater() {
    setInterval(async () => {
      // Update duration for all active calls
      for (const [callId, call] of this.activeCalls.entries()) {
        if (call.status === 'in-progress' || call.status === 'answered') {
          call.duration = Math.floor((new Date().getTime() - call.startTime.getTime()) / 1000);

          // Send periodic updates to clients
          this.io.to(`company-${call.companyId}`).emit('call-duration-update', {
            callId,
            duration: call.duration
          });
        }
      }
    }, 5000); // Update every 5 seconds
  }

  private getDateFilter(timeframe: 'today' | 'week' | 'month'): Date {
    const now = new Date();
    switch (timeframe) {
      case 'today':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case 'week':
        const weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 7);
        return weekAgo;
      case 'month':
        const monthAgo = new Date(now);
        monthAgo.setMonth(now.getMonth() - 1);
        return monthAgo;
      default:
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
  }

  // Method to analyze call sentiment in real-time
  private analyzeSentiment(transcript: string): 'positive' | 'neutral' | 'negative' {
    const positiveWords = ['thank', 'great', 'excellent', 'perfect', 'satisfied', 'happy'];
    const negativeWords = ['angry', 'frustrated', 'terrible', 'awful', 'disappointed', 'upset'];

    const lowerTranscript = transcript.toLowerCase();

    const positiveScore = positiveWords.filter(word => lowerTranscript.includes(word)).length;
    const negativeScore = negativeWords.filter(word => lowerTranscript.includes(word)).length;

    if (positiveScore > negativeScore) return 'positive';
    if (negativeScore > positiveScore) return 'negative';
    return 'neutral';
  }

  // Integration point for Vapi webhook updates
  async handleVapiUpdate(vapiCallId: string, message: any) {
    // Find the call by Vapi ID
    const call = Array.from(this.activeCalls.values()).find(c => c.id.includes(vapiCallId));
    if (!call) return;

    if (message.role === 'user') {
      const newTranscript = call.transcript + `\nCustomer: ${message.content}`;
      const sentiment = this.analyzeSentiment(message.content);

      await this.updateCall(call.id, {
        transcript: newTranscript,
        sentiment
      });
    }
  }
}