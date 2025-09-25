import { Request, Response, NextFunction } from 'express';

export const validateCompanyData = (req: Request, res: Response, next: NextFunction) => {
  const { name, phone, email, address } = req.body;

  const errors = [];

  if (!name || name.trim().length < 2) {
    errors.push('Company name must be at least 2 characters long');
  }

  if (!phone || !/^\+?[\d\s\-\(\)]+$/.test(phone)) {
    errors.push('Valid phone number is required');
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Valid email address is required');
  }

  if (!address || address.trim().length < 10) {
    errors.push('Complete address is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

export const validateAppointmentData = (req: Request, res: Response, next: NextFunction) => {
  const { customerName, customerPhone, address, serviceType, scheduledDate } = req.body;

  const errors = [];

  if (!customerName || customerName.trim().length < 2) {
    errors.push('Customer name is required');
  }

  if (!customerPhone || !/^\+?[\d\s\-\(\)]+$/.test(customerPhone)) {
    errors.push('Valid customer phone number is required');
  }

  if (!address || address.trim().length < 10) {
    errors.push('Service address is required');
  }

  if (!serviceType) {
    errors.push('Service type is required');
  }

  if (!scheduledDate || isNaN(Date.parse(scheduledDate))) {
    errors.push('Valid scheduled date is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

export const validatePhoneNumber = (req: Request, res: Response, next: NextFunction) => {
  const phoneNumber = req.body.phoneNumber || req.params.phoneNumber;

  if (!phoneNumber) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  // Basic phone number validation
  const cleaned = phoneNumber.replace(/[\s\-\(\)]/g, '');
  if (!/^\+?1?[2-9]\d{9}$/.test(cleaned)) {
    return res.status(400).json({ error: 'Invalid phone number format' });
  }

  next();
};

export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  const sanitize = (obj: any): any => {
    if (typeof obj === 'string') {
      return obj.trim().replace(/[<>]/g, '');
    }
    if (typeof obj === 'object' && obj !== null) {
      const sanitized: any = Array.isArray(obj) ? [] : {};
      for (const key in obj) {
        sanitized[key] = sanitize(obj[key]);
      }
      return sanitized;
    }
    return obj;
  };

  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  next();
};