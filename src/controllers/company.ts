import { Request, Response } from 'express';
import { CompanyModel } from '../models/Company';
import { VapiService } from '../services/vapi';
import { TelnyxService } from '../services/telnyx';
import { HVACCompany } from '../types';

const companyModel = new CompanyModel();
const vapiService = new VapiService();
const telnyxService = new TelnyxService();

export class CompanyController {
  async createCompany(req: Request, res: Response): Promise<void> {
    try {
      const companyData = req.body;

      // Validate required fields
      const requiredFields = ['name', 'phone', 'email', 'address'];
      for (const field of requiredFields) {
        if (!companyData[field]) {
          return res.status(400).json({ error: `${field} is required` });
        }
      }

      // Check if email already exists
      const existingCompany = await companyModel.findByEmail(companyData.email);
      if (existingCompany) {
        return res.status(409).json({ error: 'Company with this email already exists' });
      }

      // Create company
      const company = await companyModel.create(companyData);

      res.status(201).json({
        success: true,
        company,
        message: 'Company created successfully'
      });
    } catch (error) {
      console.error('Create company error:', error);
      res.status(500).json({ error: 'Failed to create company' });
    }
  }

  async getCompany(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const company = await companyModel.findById(id);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      const stats = await companyModel.getCompanyStats(id);

      res.json({
        company,
        stats
      });
    } catch (error) {
      console.error('Get company error:', error);
      res.status(500).json({ error: 'Failed to retrieve company' });
    }
  }

  async updateCompany(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const company = await companyModel.findById(id);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      const updatedCompany = await companyModel.update(id, updates);

      res.json({
        success: true,
        company: updatedCompany,
        message: 'Company updated successfully'
      });
    } catch (error) {
      console.error('Update company error:', error);
      res.status(500).json({ error: 'Failed to update company' });
    }
  }

  async setupCompany(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { areaCode } = req.body;

      const company = await companyModel.findById(id);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      // Step 1: Purchase Telnyx phone number
      console.log(`Setting up phone service for ${company.name}...`);
      const phoneNumber = await telnyxService.purchasePhoneNumber(areaCode);

      // Step 2: Configure phone number for this company
      await telnyxService.configurePhoneNumber(phoneNumber, id);

      // Step 3: Update company with phone number
      await companyModel.updateTelnyxPhone(id, phoneNumber);

      // Step 4: Create Vapi assistant
      const assistant = await vapiService.createHVACAssistant(id, company, phoneNumber);

      // Step 5: Update company with assistant ID
      await companyModel.updateVapiAssistant(id, assistant.id);

      console.log(`Company setup complete - Phone: ${phoneNumber}, Assistant: ${assistant.id}`);

      res.json({
        success: true,
        phoneNumber,
        assistantId: assistant.id,
        message: 'Company setup completed successfully'
      });
    } catch (error) {
      console.error('Setup company error:', error);
      res.status(500).json({
        error: 'Failed to setup company',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async listCompanies(req: Request, res: Response) {
    try {
      const companies = await companyModel.getActiveCompanies();
      res.json({ companies });
    } catch (error) {
      console.error('List companies error:', error);
      res.status(500).json({ error: 'Failed to list companies' });
    }
  }

  async deleteCompany(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const company = await companyModel.findById(id);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      await companyModel.delete(id);

      res.json({
        success: true,
        message: 'Company deleted successfully'
      });
    } catch (error) {
      console.error('Delete company error:', error);
      res.status(500).json({ error: 'Failed to delete company' });
    }
  }

  async testPhoneSystem(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { testPhoneNumber } = req.body;

      const company = await companyModel.findById(id);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      if (!company.telnyx_phone_number) {
        return res.status(400).json({ error: 'Company phone number not configured' });
      }

      // Initiate test call
      const call = await telnyxService.initiateCall(testPhoneNumber, company.telnyx_phone_number);

      res.json({
        success: true,
        callId: call.data.call_control_id,
        message: 'Test call initiated successfully'
      });
    } catch (error) {
      console.error('Test phone system error:', error);
      res.status(500).json({ error: 'Failed to test phone system' });
    }
  }

  async getCompanyMetrics(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { timeframe = '30' } = req.query;

      const company = await companyModel.findById(id);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      const stats = await companyModel.getCompanyStats(id, Number(timeframe));

      res.json({
        company: {
          id: company.id,
          name: company.name,
          phone: company.telnyx_phone_number
        },
        metrics: stats,
        timeframe: `${timeframe} days`
      });
    } catch (error) {
      console.error('Get company metrics error:', error);
      res.status(500).json({ error: 'Failed to get company metrics' });
    }
  }
}