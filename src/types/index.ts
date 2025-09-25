export interface HVACCompany {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  businessHours: BusinessHours;
  services: HVACService[];
  emergencyRates: EmergencyRates;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessHours {
  monday: TimeSlot;
  tuesday: TimeSlot;
  wednesday: TimeSlot;
  thursday: TimeSlot;
  friday: TimeSlot;
  saturday: TimeSlot;
  sunday: TimeSlot;
}

export interface TimeSlot {
  open: string;
  close: string;
  isClosed: boolean;
}

export interface HVACService {
  id: string;
  name: string;
  basePrice: number;
  emergencyMultiplier: number;
  description: string;
}

export interface EmergencyRates {
  afterHours: number;
  weekend: number;
  holiday: number;
}

export interface CallRecord {
  id: string;
  companyId: string;
  customerPhone: string;
  customerName?: string;
  callType: CallType;
  isEmergency: boolean;
  summary: string;
  duration: number;
  recording?: string;
  appointment?: Appointment;
  lead?: Lead;
  createdAt: Date;
}

export enum CallType {
  EMERGENCY = 'emergency',
  SERVICE_REQUEST = 'service_request',
  APPOINTMENT_BOOKING = 'appointment_booking',
  GENERAL_INQUIRY = 'general_inquiry',
  PRICE_ESTIMATE = 'price_estimate'
}

export interface Appointment {
  id: string;
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
  status: AppointmentStatus;
  createdAt: Date;
}

export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  EMERGENCY = 'emergency'
}

export enum AppointmentStatus {
  SCHEDULED = 'scheduled',
  CONFIRMED = 'confirmed',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export interface Lead {
  id: string;
  companyId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  serviceInterest: string[];
  notes: string;
  source: 'phone_call';
  status: LeadStatus;
  createdAt: Date;
}

export enum LeadStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  QUALIFIED = 'qualified',
  CONVERTED = 'converted',
  LOST = 'lost'
}

export interface VapiCall {
  id: string;
  status: 'queued' | 'ringing' | 'in-progress' | 'forwarding' | 'ended';
  phoneNumber: string;
  customer: {
    number: string;
    name?: string;
  };
  assistant: {
    id: string;
    name: string;
  };
  startedAt?: Date;
  endedAt?: Date;
  cost?: number;
  messages?: VapiMessage[];
}

export interface VapiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface EmergencyKeywords {
  heating: string[];
  cooling: string[];
  plumbing: string[];
  electrical: string[];
  general: string[];
}

export interface WebhookPayload {
  event: string;
  data: any;
  timestamp: Date;
  companyId: string;
}