import { Request, Response } from 'express';
import { CompanyModel } from '../models/Company';
import { AppointmentService } from '../services/appointment';
import { LeadService } from '../services/lead';
import { query } from '../config/database';

const companyModel = new CompanyModel();
const appointmentService = new AppointmentService();
const leadService = new LeadService();

export class DashboardController {
  async getDashboard(req: Request, res: Response) {
    try {
      const companyId = req.params.companyId;

      const [
        company,
        stats,
        todaysAppointments,
        recentCalls,
        leadPipeline,
        recentLeads
      ] = await Promise.all([
        companyModel.findById(companyId),
        companyModel.getCompanyStats(companyId),
        appointmentService.getTodaysAppointments(companyId),
        this.getRecentCalls(companyId),
        leadService.getLeadPipeline(companyId),
        leadService.getLeadsByCompany(companyId)
      ]);

      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      const dashboardData = {
        company,
        stats,
        todaysAppointments,
        recentCalls,
        leadPipeline,
        recentLeads: recentLeads.slice(0, 10),
        summary: {
          todaysCalls: recentCalls.filter(call =>
            new Date(call.created_at).toDateString() === new Date().toDateString()
          ).length,
          todaysEmergencies: recentCalls.filter(call =>
            call.is_emergency &&
            new Date(call.created_at).toDateString() === new Date().toDateString()
          ).length,
          pendingAppointments: todaysAppointments.filter(apt => apt.status === 'scheduled').length,
          hotLeads: recentLeads.filter(lead => lead.status === 'new').length
        }
      };

      res.json(dashboardData);
    } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).json({ error: 'Failed to load dashboard data' });
    }
  }

  async getCallAnalytics(req: Request, res: Response) {
    try {
      const companyId = req.params.companyId;
      const { days = 30 } = req.query;

      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - Number(days));

      const result = await query(
        `SELECT
          DATE(created_at) as date,
          call_type,
          COUNT(*) as count,
          AVG(duration) as avg_duration,
          COUNT(*) FILTER (WHERE is_emergency = true) as emergency_count
        FROM call_records
        WHERE company_id = $1 AND created_at >= $2
        GROUP BY DATE(created_at), call_type
        ORDER BY date DESC`,
        [companyId, dateLimit]
      );

      const analytics = this.processCallAnalytics(result.rows);

      res.json(analytics);
    } catch (error) {
      console.error('Call analytics error:', error);
      res.status(500).json({ error: 'Failed to load call analytics' });
    }
  }

  async getAppointmentMetrics(req: Request, res: Response) {
    try {
      const companyId = req.params.companyId;

      const [upcoming, completed, cancelled] = await Promise.all([
        appointmentService.getUpcomingAppointments(companyId),
        this.getCompletedAppointments(companyId),
        this.getCancelledAppointments(companyId)
      ]);

      const metrics = {
        upcoming: upcoming.length,
        completed: completed.length,
        cancelled: cancelled.length,
        completionRate: completed.length + cancelled.length > 0 ?
          (completed.length / (completed.length + cancelled.length)) * 100 : 0,
        averageResponseTime: await this.getAverageResponseTime(companyId),
        busyDays: this.calculateBusyDays(upcoming),
        serviceBreakdown: this.calculateServiceBreakdown([...upcoming, ...completed])
      };

      res.json(metrics);
    } catch (error) {
      console.error('Appointment metrics error:', error);
      res.status(500).json({ error: 'Failed to load appointment metrics' });
    }
  }

  async getRevenueInsights(req: Request, res: Response) {
    try {
      const companyId = req.params.companyId;
      const { days = 30 } = req.query;

      const insights = await this.calculateRevenueInsights(companyId, Number(days));

      res.json(insights);
    } catch (error) {
      console.error('Revenue insights error:', error);
      res.status(500).json({ error: 'Failed to load revenue insights' });
    }
  }

  async getLiveCallStatus(req: Request, res: Response) {
    try {
      const companyId = req.params.companyId;

      const activeCalls = await this.getActiveCalls(companyId);
      const queuedCalls = await this.getQueuedCalls(companyId);

      const status = {
        activeCalls,
        queuedCalls,
        systemStatus: 'operational',
        lastUpdate: new Date().toISOString()
      };

      res.json(status);
    } catch (error) {
      console.error('Live call status error:', error);
      res.status(500).json({ error: 'Failed to load call status' });
    }
  }

  private async getRecentCalls(companyId: string, limit: number = 20) {
    const result = await query(
      `SELECT * FROM call_records
       WHERE company_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [companyId, limit]
    );

    return result.rows;
  }

  private async getCompletedAppointments(companyId: string) {
    const result = await query(
      `SELECT * FROM appointments
       WHERE company_id = $1 AND status = 'completed'
       AND created_at >= NOW() - INTERVAL '30 days'`,
      [companyId]
    );

    return result.rows;
  }

  private async getCancelledAppointments(companyId: string) {
    const result = await query(
      `SELECT * FROM appointments
       WHERE company_id = $1 AND status = 'cancelled'
       AND created_at >= NOW() - INTERVAL '30 days'`,
      [companyId]
    );

    return result.rows;
  }

  private async getAverageResponseTime(companyId: string): Promise<number> {
    const result = await query(
      `SELECT AVG(EXTRACT(EPOCH FROM (a.created_at - cr.created_at))/60) as avg_response_minutes
       FROM call_records cr
       JOIN appointments a ON cr.id = a.call_record_id
       WHERE cr.company_id = $1
       AND cr.created_at >= NOW() - INTERVAL '30 days'`,
      [companyId]
    );

    return Math.round(result.rows[0]?.avg_response_minutes || 0);
  }

  private calculateBusyDays(appointments: any[]): string[] {
    const dayCounts: { [key: string]: number } = {};

    appointments.forEach(apt => {
      const day = new Date(apt.scheduled_date).toLocaleDateString();
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    });

    return Object.entries(dayCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([day]) => day);
  }

  private calculateServiceBreakdown(appointments: any[]): { [key: string]: number } {
    const breakdown: { [key: string]: number } = {};

    appointments.forEach(apt => {
      breakdown[apt.service_type] = (breakdown[apt.service_type] || 0) + 1;
    });

    return breakdown;
  }

  private processCallAnalytics(rows: any[]) {
    const daily = new Map();

    rows.forEach(row => {
      const date = row.date;
      if (!daily.has(date)) {
        daily.set(date, {
          date,
          totalCalls: 0,
          emergencies: 0,
          avgDuration: 0,
          callTypes: {}
        });
      }

      const dayData = daily.get(date);
      dayData.totalCalls += Number(row.count);
      dayData.emergencies += Number(row.emergency_count);
      dayData.callTypes[row.call_type] = Number(row.count);
      dayData.avgDuration = Math.round(Number(row.avg_duration) / 60);
    });

    return Array.from(daily.values()).sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  private async calculateRevenueInsights(companyId: string, days: number) {
    const result = await query(
      `SELECT
        COUNT(DISTINCT cr.id) * 2800 as missed_call_savings,
        COUNT(DISTINCT a.id) * 350 as avg_appointment_value,
        COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'converted') * 1200 as converted_lead_value
       FROM call_records cr
       LEFT JOIN appointments a ON cr.company_id = a.company_id
       LEFT JOIN leads l ON cr.company_id = l.company_id
       WHERE cr.company_id = $1
       AND cr.created_at >= NOW() - INTERVAL '${days} days'`,
      [companyId]
    );

    const data = result.rows[0];

    return {
      missedCallSavings: Number(data.missed_call_savings),
      appointmentRevenue: Number(data.avg_appointment_value),
      convertedLeadValue: Number(data.converted_lead_value),
      totalValue: Number(data.missed_call_savings) + Number(data.avg_appointment_value) + Number(data.converted_lead_value),
      monthlySavings: ((Number(data.missed_call_savings) + Number(data.avg_appointment_value)) * 30) / days - 497
    };
  }

  private async getActiveCalls(companyId: string) {
    return [];
  }

  private async getQueuedCalls(companyId: string) {
    return [];
  }
}