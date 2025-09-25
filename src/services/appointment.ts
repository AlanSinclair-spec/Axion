import { query } from '../config/database';
import { Appointment, AppointmentStatus, Priority } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class AppointmentService {
  async createAppointment(appointmentData: {
    companyId: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    address: string;
    serviceType: string;
    scheduledDate: Date;
    estimatedDuration: number;
    notes: string;
    priority: Priority;
  }): Promise<Appointment> {
    const id = uuidv4();

    const result = await query(
      `INSERT INTO appointments (
        id, company_id, customer_name, customer_phone, customer_email,
        address, service_type, scheduled_date, estimated_duration,
        notes, priority, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING *`,
      [
        id,
        appointmentData.companyId,
        appointmentData.customerName,
        appointmentData.customerPhone,
        appointmentData.customerEmail,
        appointmentData.address,
        appointmentData.serviceType,
        appointmentData.scheduledDate,
        appointmentData.estimatedDuration,
        appointmentData.notes,
        appointmentData.priority,
        AppointmentStatus.SCHEDULED
      ]
    );

    return this.mapRowToAppointment(result.rows[0]);
  }

  async getAvailableSlots(companyId: string, date: Date, duration: number = 60): Promise<Date[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(8, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(17, 0, 0, 0);

    const existingAppointments = await query(
      `SELECT scheduled_date, estimated_duration
       FROM appointments
       WHERE company_id = $1
       AND DATE(scheduled_date) = DATE($2)
       AND status NOT IN ('cancelled', 'completed')
       ORDER BY scheduled_date`,
      [companyId, date]
    );

    const slots: Date[] = [];
    const slotInterval = 30;

    for (let time = new Date(startOfDay); time < endOfDay; time.setMinutes(time.getMinutes() + slotInterval)) {
      const slotEnd = new Date(time.getTime() + duration * 60000);

      const hasConflict = existingAppointments.rows.some(appt => {
        const apptStart = new Date(appt.scheduled_date);
        const apptEnd = new Date(apptStart.getTime() + appt.estimated_duration * 60000);

        return (time >= apptStart && time < apptEnd) ||
               (slotEnd > apptStart && slotEnd <= apptEnd) ||
               (time <= apptStart && slotEnd >= apptEnd);
      });

      if (!hasConflict) {
        slots.push(new Date(time));
      }
    }

    return slots;
  }

  async getNextAvailableSlot(companyId: string, priority: Priority = Priority.MEDIUM): Promise<Date> {
    let searchDate = new Date();

    if (priority === Priority.EMERGENCY) {
      const emergencySlot = await this.findEmergencySlot(companyId);
      if (emergencySlot) return emergencySlot;
    }

    for (let daysAhead = 0; daysAhead < 14; daysAhead++) {
      const checkDate = new Date();
      checkDate.setDate(checkDate.getDate() + daysAhead);

      if (checkDate.getDay() === 0) continue;

      const availableSlots = await this.getAvailableSlots(companyId, checkDate);

      if (availableSlots.length > 0) {
        return availableSlots[0];
      }
    }

    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 14);
    fallback.setHours(9, 0, 0, 0);
    return fallback;
  }

  private async findEmergencySlot(companyId: string): Promise<Date | null> {
    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const emergencySlots = await this.getAvailableSlots(companyId, now, 120);

    const nextHour = new Date(now);
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);

    const suitableSlots = emergencySlots.filter(slot => slot >= nextHour);

    return suitableSlots.length > 0 ? suitableSlots[0] : null;
  }

  async updateAppointmentStatus(appointmentId: string, status: AppointmentStatus): Promise<void> {
    await query(
      'UPDATE appointments SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, appointmentId]
    );
  }

  async getAppointmentsByCompany(companyId: string, limit: number = 50): Promise<Appointment[]> {
    const result = await query(
      `SELECT * FROM appointments
       WHERE company_id = $1
       ORDER BY scheduled_date ASC
       LIMIT $2`,
      [companyId, limit]
    );

    return result.rows.map(row => this.mapRowToAppointment(row));
  }

  async getUpcomingAppointments(companyId: string): Promise<Appointment[]> {
    const result = await query(
      `SELECT * FROM appointments
       WHERE company_id = $1
       AND scheduled_date >= NOW()
       AND status IN ('scheduled', 'confirmed')
       ORDER BY scheduled_date ASC`,
      [companyId]
    );

    return result.rows.map(row => this.mapRowToAppointment(row));
  }

  async getTodaysAppointments(companyId: string): Promise<Appointment[]> {
    const result = await query(
      `SELECT * FROM appointments
       WHERE company_id = $1
       AND DATE(scheduled_date) = CURRENT_DATE
       AND status NOT IN ('cancelled', 'completed')
       ORDER BY scheduled_date ASC`,
      [companyId]
    );

    return result.rows.map(row => this.mapRowToAppointment(row));
  }

  async findAppointmentConflicts(companyId: string, scheduledDate: Date, duration: number): Promise<Appointment[]> {
    const endTime = new Date(scheduledDate.getTime() + duration * 60000);

    const result = await query(
      `SELECT * FROM appointments
       WHERE company_id = $1
       AND status NOT IN ('cancelled', 'completed')
       AND (
         (scheduled_date <= $2 AND scheduled_date + INTERVAL '1 minute' * estimated_duration > $2) OR
         (scheduled_date < $3 AND scheduled_date + INTERVAL '1 minute' * estimated_duration >= $3) OR
         (scheduled_date >= $2 AND scheduled_date < $3)
       )`,
      [companyId, scheduledDate, endTime]
    );

    return result.rows.map(row => this.mapRowToAppointment(row));
  }

  async suggestAlternativeSlots(companyId: string, preferredDate: Date, count: number = 3): Promise<Date[]> {
    const alternatives: Date[] = [];
    let searchDate = new Date(preferredDate);

    for (let i = 0; i < 7 && alternatives.length < count; i++) {
      searchDate.setDate(searchDate.getDate() + 1);

      if (searchDate.getDay() === 0) continue;

      const slots = await this.getAvailableSlots(companyId, searchDate);

      if (slots.length > 0) {
        alternatives.push(slots[0]);
      }
    }

    return alternatives;
  }

  async generateAppointmentConfirmation(appointment: Appointment): Promise<string> {
    const date = appointment.scheduledDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const time = appointment.scheduledDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    return `Appointment Confirmed!

Customer: ${appointment.customerName}
Phone: ${appointment.customerPhone}
Service: ${appointment.serviceType}
Date & Time: ${date} at ${time}
Address: ${appointment.address}
Duration: ${appointment.estimatedDuration} minutes
Priority: ${appointment.priority.toUpperCase()}

${appointment.notes ? `Notes: ${appointment.notes}` : ''}

We'll call 30 minutes before arrival.`;
  }

  private mapRowToAppointment(row: any): Appointment {
    return {
      id: row.id,
      companyId: row.company_id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      customerEmail: row.customer_email,
      address: row.address,
      serviceType: row.service_type,
      scheduledDate: new Date(row.scheduled_date),
      estimatedDuration: row.estimated_duration,
      notes: row.notes,
      priority: row.priority as Priority,
      status: row.status as AppointmentStatus,
      createdAt: new Date(row.created_at)
    };
  }

  async rescheduleAppointment(appointmentId: string, newDate: Date): Promise<void> {
    await query(
      'UPDATE appointments SET scheduled_date = $1, updated_at = NOW() WHERE id = $2',
      [newDate, appointmentId]
    );
  }

  async cancelAppointment(appointmentId: string, reason?: string): Promise<void> {
    await query(
      'UPDATE appointments SET status = $1, notes = CONCAT(notes, $2), updated_at = NOW() WHERE id = $3',
      [AppointmentStatus.CANCELLED, reason ? ` - CANCELLED: ${reason}` : ' - CANCELLED', appointmentId]
    );
  }
}