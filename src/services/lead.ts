import { query } from '../config/database';
import { Lead, LeadStatus, CallRecord } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class LeadService {
  async createLead(leadData: {
    companyId: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    serviceInterest: string[];
    notes: string;
    callRecordId?: string;
  }): Promise<Lead> {
    const id = uuidv4();

    const result = await query(
      `INSERT INTO leads (
        id, company_id, customer_name, customer_phone, customer_email,
        service_interest, notes, source, status, call_record_id, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING *`,
      [
        id,
        leadData.companyId,
        leadData.customerName,
        leadData.customerPhone,
        leadData.customerEmail,
        JSON.stringify(leadData.serviceInterest),
        leadData.notes,
        'phone_call',
        LeadStatus.NEW,
        leadData.callRecordId
      ]
    );

    return this.mapRowToLead(result.rows[0]);
  }

  async updateLeadStatus(leadId: string, status: LeadStatus, notes?: string): Promise<void> {
    const updateQuery = notes
      ? 'UPDATE leads SET status = $1, notes = CONCAT(notes, $2), updated_at = NOW() WHERE id = $3'
      : 'UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2';

    const params = notes ? [status, ` - ${notes}`, leadId] : [status, leadId];

    await query(updateQuery, params);
  }

  async getLeadsByCompany(companyId: string, status?: LeadStatus): Promise<Lead[]> {
    const baseQuery = `
      SELECT l.*, cr.summary as call_summary, cr.duration as call_duration
      FROM leads l
      LEFT JOIN call_records cr ON l.call_record_id = cr.id
      WHERE l.company_id = $1
    `;

    const params = [companyId];
    let whereClause = '';

    if (status) {
      whereClause = ' AND l.status = $2';
      params.push(status);
    }

    const orderClause = ' ORDER BY l.created_at DESC';

    const result = await query(baseQuery + whereClause + orderClause, params);

    return result.rows.map(row => this.mapRowToLead(row));
  }

  async getLeadStats(companyId: string, days: number = 30): Promise<{
    totalLeads: number;
    newLeads: number;
    qualifiedLeads: number;
    convertedLeads: number;
    conversionRate: number;
    recentLeads: Lead[];
  }> {
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);

    const statsResult = await query(
      `SELECT
        COUNT(*) as total_leads,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_leads,
        SUM(CASE WHEN status = 'qualified' THEN 1 ELSE 0 END) as qualified_leads,
        SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) as converted_leads
      FROM leads
      WHERE company_id = $1 AND created_at >= $2`,
      [companyId, dateLimit]
    );

    const recentLeadsResult = await query(
      `SELECT l.*, cr.summary as call_summary
       FROM leads l
       LEFT JOIN call_records cr ON l.call_record_id = cr.id
       WHERE l.company_id = $1 AND l.created_at >= $2
       ORDER BY l.created_at DESC
       LIMIT 10`,
      [companyId, dateLimit]
    );

    const stats = statsResult.rows[0];
    const totalLeads = parseInt(stats.total_leads);
    const convertedLeads = parseInt(stats.converted_leads);

    return {
      totalLeads,
      newLeads: parseInt(stats.new_leads),
      qualifiedLeads: parseInt(stats.qualified_leads),
      convertedLeads,
      conversionRate: totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0,
      recentLeads: recentLeadsResult.rows.map(row => this.mapRowToLead(row))
    };
  }

  async qualifyLead(leadId: string, qualificationNotes: string): Promise<void> {
    await query(
      `UPDATE leads
       SET status = $1,
           notes = CONCAT(notes, $2),
           updated_at = NOW()
       WHERE id = $3`,
      [LeadStatus.QUALIFIED, ` - QUALIFIED: ${qualificationNotes}`, leadId]
    );
  }

  async convertLead(leadId: string, conversionDetails: {
    appointmentId?: string;
    contractValue?: number;
    notes: string;
  }): Promise<void> {
    const conversionNote = `CONVERTED: ${conversionDetails.notes}`;
    if (conversionDetails.contractValue) {
      conversionNote.concat(` - Value: $${conversionDetails.contractValue}`);
    }

    await query(
      `UPDATE leads
       SET status = $1,
           notes = CONCAT(notes, $2),
           appointment_id = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [LeadStatus.CONVERTED, ` - ${conversionNote}`, conversionDetails.appointmentId, leadId]
    );
  }

  async findDuplicateLeads(companyId: string, customerPhone: string): Promise<Lead[]> {
    const result = await query(
      `SELECT * FROM leads
       WHERE company_id = $1
       AND customer_phone = $2
       ORDER BY created_at DESC`,
      [companyId, customerPhone]
    );

    return result.rows.map(row => this.mapRowToLead(row));
  }

  async enrichLeadFromCallData(leadId: string, callRecord: CallRecord): Promise<void> {
    const enrichmentNotes = this.generateEnrichmentNotes(callRecord);

    await query(
      `UPDATE leads
       SET notes = CONCAT(notes, $1),
           call_record_id = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [` - CALL DATA: ${enrichmentNotes}`, callRecord.id, leadId]
    );
  }

  private generateEnrichmentNotes(callRecord: CallRecord): string {
    const notes = [];

    if (callRecord.isEmergency) {
      notes.push('EMERGENCY CALL');
    }

    notes.push(`Call Type: ${callRecord.callType}`);
    notes.push(`Duration: ${Math.round(callRecord.duration / 60)}m`);

    if (callRecord.summary) {
      notes.push(`Summary: ${callRecord.summary}`);
    }

    return notes.join(' | ');
  }

  async getLeadPipeline(companyId: string): Promise<{
    [key in LeadStatus]: {
      count: number;
      leads: Lead[];
      totalValue?: number;
    }
  }> {
    const pipeline = {} as any;

    for (const status of Object.values(LeadStatus)) {
      const leads = await this.getLeadsByCompany(companyId, status);
      pipeline[status] = {
        count: leads.length,
        leads: leads,
        totalValue: leads.reduce((sum, lead) => {
          return sum + (this.estimateLeadValue(lead) || 0);
        }, 0)
      };
    }

    return pipeline;
  }

  private estimateLeadValue(lead: Lead): number {
    const serviceValues: { [key: string]: number } = {
      'heating': 800,
      'cooling': 600,
      'installation': 5000,
      'maintenance': 200,
      'emergency': 400,
      'general_hvac': 300
    };

    let estimatedValue = 0;

    for (const service of lead.serviceInterest) {
      estimatedValue += serviceValues[service] || serviceValues['general_hvac'];
    }

    if (lead.notes.toLowerCase().includes('emergency')) {
      estimatedValue *= 1.5;
    }

    return Math.round(estimatedValue);
  }

  async scheduleFollowUp(leadId: string, followUpDate: Date, method: 'call' | 'email' | 'text'): Promise<void> {
    await query(
      `UPDATE leads
       SET notes = CONCAT(notes, $1),
           updated_at = NOW()
       WHERE id = $2`,
      [` - FOLLOW-UP SCHEDULED: ${method} on ${followUpDate.toLocaleDateString()}`, leadId]
    );
  }

  async generateLeadReport(companyId: string, startDate: Date, endDate: Date): Promise<{
    summary: {
      totalLeads: number;
      conversionRate: number;
      averageLeadValue: number;
    };
    breakdown: {
      [key: string]: number;
    };
    topServices: Array<{ service: string; count: number; value: number }>;
  }> {
    const result = await query(
      `SELECT
        status,
        service_interest,
        notes,
        created_at
       FROM leads
       WHERE company_id = $1
       AND created_at BETWEEN $2 AND $3`,
      [companyId, startDate, endDate]
    );

    const leads = result.rows.map(row => this.mapRowToLead(row));
    const totalLeads = leads.length;
    const convertedLeads = leads.filter(lead => lead.status === LeadStatus.CONVERTED).length;

    const serviceCount: { [key: string]: { count: number; value: number } } = {};

    leads.forEach(lead => {
      lead.serviceInterest.forEach(service => {
        if (!serviceCount[service]) {
          serviceCount[service] = { count: 0, value: 0 };
        }
        serviceCount[service].count++;
        serviceCount[service].value += this.estimateLeadValue(lead);
      });
    });

    const topServices = Object.entries(serviceCount)
      .map(([service, data]) => ({
        service,
        count: data.count,
        value: data.value
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const breakdown: { [key: string]: number } = {};
    Object.values(LeadStatus).forEach(status => {
      breakdown[status] = leads.filter(lead => lead.status === status).length;
    });

    return {
      summary: {
        totalLeads,
        conversionRate: totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0,
        averageLeadValue: totalLeads > 0 ? leads.reduce((sum, lead) => sum + this.estimateLeadValue(lead), 0) / totalLeads : 0
      },
      breakdown,
      topServices
    };
  }

  private mapRowToLead(row: any): Lead {
    return {
      id: row.id,
      companyId: row.company_id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      customerEmail: row.customer_email,
      serviceInterest: typeof row.service_interest === 'string'
        ? JSON.parse(row.service_interest)
        : row.service_interest,
      notes: row.notes,
      source: row.source,
      status: row.status as LeadStatus,
      createdAt: new Date(row.created_at)
    };
  }
}