import { query } from '../config/database';
import { HVACCompany, BusinessHours, HVACService, EmergencyRates } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class CompanyModel {
  async create(companyData: {
    name: string;
    phone: string;
    email: string;
    address: string;
    businessHours: BusinessHours;
    services: HVACService[];
    emergencyRates: EmergencyRates;
  }): Promise<HVACCompany> {
    const id = uuidv4();

    const result = await query(
      `INSERT INTO companies (
        id, name, phone, email, address, business_hours, services, emergency_rates
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        id,
        companyData.name,
        companyData.phone,
        companyData.email,
        companyData.address,
        JSON.stringify(companyData.businessHours),
        JSON.stringify(companyData.services),
        JSON.stringify(companyData.emergencyRates)
      ]
    );

    return this.mapRowToCompany(result.rows[0]);
  }

  async findById(id: string): Promise<HVACCompany | null> {
    const result = await query('SELECT * FROM companies WHERE id = $1', [id]);
    return result.rows.length > 0 ? this.mapRowToCompany(result.rows[0]) : null;
  }

  async findByEmail(email: string): Promise<HVACCompany | null> {
    const result = await query('SELECT * FROM companies WHERE email = $1', [email]);
    return result.rows.length > 0 ? this.mapRowToCompany(result.rows[0]) : null;
  }

  async findByPhone(phone: string): Promise<HVACCompany | null> {
    const result = await query('SELECT * FROM companies WHERE telnyx_phone_number = $1', [phone]);
    return result.rows.length > 0 ? this.mapRowToCompany(result.rows[0]) : null;
  }

  async findAll(): Promise<HVACCompany[]> {
    const result = await query('SELECT * FROM companies ORDER BY name ASC');
    return result.rows.map(row => this.mapRowToCompany(row));
  }

  async update(id: string, updates: Partial<HVACCompany>): Promise<HVACCompany> {
    const setClause = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        const dbKey = this.camelToSnake(key);
        if (typeof value === 'object' && value !== null) {
          setClause.push(`${dbKey} = $${paramCount}`);
          values.push(JSON.stringify(value));
        } else {
          setClause.push(`${dbKey} = $${paramCount}`);
          values.push(value);
        }
        paramCount++;
      }
    }

    values.push(id);

    const result = await query(
      `UPDATE companies SET ${setClause.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`,
      values
    );

    return this.mapRowToCompany(result.rows[0]);
  }

  async updateVapiAssistant(id: string, assistantId: string): Promise<void> {
    await query(
      'UPDATE companies SET vapi_assistant_id = $1, updated_at = NOW() WHERE id = $2',
      [assistantId, id]
    );
  }

  async updateTelnyxPhone(id: string, phoneNumber: string): Promise<void> {
    await query(
      'UPDATE companies SET telnyx_phone_number = $1, updated_at = NOW() WHERE id = $2',
      [phoneNumber, id]
    );
  }

  async delete(id: string): Promise<void> {
    await query('DELETE FROM companies WHERE id = $1', [id]);
  }

  async getCompanyStats(id: string, days: number = 30): Promise<{
    totalCalls: number;
    emergencyCalls: number;
    appointmentsBooked: number;
    leadsGenerated: number;
    conversionRate: number;
  }> {
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);

    const result = await query(
      `SELECT
        COUNT(DISTINCT cr.id) as total_calls,
        COUNT(DISTINCT cr.id) FILTER (WHERE cr.is_emergency = true) as emergency_calls,
        COUNT(DISTINCT a.id) as appointments_booked,
        COUNT(DISTINCT l.id) as leads_generated,
        COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'converted') as converted_leads
      FROM companies c
      LEFT JOIN call_records cr ON c.id = cr.company_id AND cr.created_at >= $2
      LEFT JOIN appointments a ON c.id = a.company_id AND a.created_at >= $2
      LEFT JOIN leads l ON c.id = l.company_id AND l.created_at >= $2
      WHERE c.id = $1`,
      [id, dateLimit]
    );

    const stats = result.rows[0];
    const totalLeads = parseInt(stats.leads_generated);
    const convertedLeads = parseInt(stats.converted_leads);

    return {
      totalCalls: parseInt(stats.total_calls),
      emergencyCalls: parseInt(stats.emergency_calls),
      appointmentsBooked: parseInt(stats.appointments_booked),
      leadsGenerated: totalLeads,
      conversionRate: totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0
    };
  }

  async getActiveCompanies(): Promise<HVACCompany[]> {
    const result = await query(
      'SELECT * FROM companies WHERE subscription_status = $1 ORDER BY name ASC',
      ['active']
    );
    return result.rows.map(row => this.mapRowToCompany(row));
  }

  private mapRowToCompany(row: any): HVACCompany {
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      businessHours: typeof row.business_hours === 'string'
        ? JSON.parse(row.business_hours)
        : row.business_hours,
      services: typeof row.services === 'string'
        ? JSON.parse(row.services)
        : row.services,
      emergencyRates: typeof row.emergency_rates === 'string'
        ? JSON.parse(row.emergency_rates)
        : row.emergency_rates,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
}