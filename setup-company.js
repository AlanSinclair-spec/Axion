#!/usr/bin/env node

/**
 * Quick setup script for your 3 test HVAC companies
 * Usage: node setup-company.js
 */

const axios = require('axios');

const API_BASE = process.env.API_BASE || 'http://localhost:3000/api';

// Your 3 test HVAC companies
const testCompanies = [
  {
    name: "Elite HVAC Solutions",
    phone: "+1-555-ELITE-1",
    email: "info@elitehvac.com",
    address: "123 Industrial Blvd, Los Angeles, CA 90210",
    businessHours: {
      monday: { open: "7:00 AM", close: "7:00 PM", isClosed: false },
      tuesday: { open: "7:00 AM", close: "7:00 PM", isClosed: false },
      wednesday: { open: "7:00 AM", close: "7:00 PM", isClosed: false },
      thursday: { open: "7:00 AM", close: "7:00 PM", isClosed: false },
      friday: { open: "7:00 AM", close: "7:00 PM", isClosed: false },
      saturday: { open: "8:00 AM", close: "5:00 PM", isClosed: false },
      sunday: { open: "", close: "", isClosed: true }
    },
    services: [
      { id: "1", name: "Emergency HVAC Repair", basePrice: 200, emergencyMultiplier: 1.5, description: "24/7 emergency heating and cooling repairs" },
      { id: "2", name: "AC Installation", basePrice: 3500, emergencyMultiplier: 1.0, description: "New air conditioning system installation" },
      { id: "3", name: "Heating Maintenance", basePrice: 150, emergencyMultiplier: 1.2, description: "Furnace tune-ups and maintenance" }
    ],
    emergencyRates: { afterHours: 1.5, weekend: 1.25, holiday: 2.0 }
  },
  {
    name: "Comfort Pro HVAC",
    phone: "+1-555-COMFORT",
    email: "service@comfortpro.com",
    address: "456 Comfort Way, Beverly Hills, CA 90212",
    businessHours: {
      monday: { open: "8:00 AM", close: "6:00 PM", isClosed: false },
      tuesday: { open: "8:00 AM", close: "6:00 PM", isClosed: false },
      wednesday: { open: "8:00 AM", close: "6:00 PM", isClosed: false },
      thursday: { open: "8:00 AM", close: "6:00 PM", isClosed: false },
      friday: { open: "8:00 AM", close: "6:00 PM", isClosed: false },
      saturday: { open: "9:00 AM", close: "4:00 PM", isClosed: false },
      sunday: { open: "", close: "", isClosed: true }
    },
    services: [
      { id: "1", name: "Residential AC Repair", basePrice: 175, emergencyMultiplier: 1.4, description: "Home air conditioning repairs" },
      { id: "2", name: "Heat Pump Service", basePrice: 225, emergencyMultiplier: 1.3, description: "Heat pump installation and repair" },
      { id: "3", name: "Duct Cleaning", basePrice: 300, emergencyMultiplier: 1.0, description: "Professional ductwork cleaning" }
    ],
    emergencyRates: { afterHours: 1.3, weekend: 1.15, holiday: 1.8 }
  },
  {
    name: "Rapid Response HVAC",
    phone: "+1-555-RAPID-911",
    email: "emergency@rapidhvac.com",
    address: "789 Emergency Lane, Santa Monica, CA 90401",
    businessHours: {
      monday: { open: "6:00 AM", close: "10:00 PM", isClosed: false },
      tuesday: { open: "6:00 AM", close: "10:00 PM", isClosed: false },
      wednesday: { open: "6:00 AM", close: "10:00 PM", isClosed: false },
      thursday: { open: "6:00 AM", close: "10:00 PM", isClosed: false },
      friday: { open: "6:00 AM", close: "10:00 PM", isClosed: false },
      saturday: { open: "6:00 AM", close: "10:00 PM", isClosed: false },
      sunday: { open: "8:00 AM", close: "8:00 PM", isClosed: false }
    },
    services: [
      { id: "1", name: "24/7 Emergency Service", basePrice: 250, emergencyMultiplier: 1.2, description: "Round-the-clock emergency HVAC service" },
      { id: "2", name: "Commercial HVAC", basePrice: 400, emergencyMultiplier: 1.3, description: "Commercial heating and cooling systems" },
      { id: "3", name: "Same-Day Repair", basePrice: 180, emergencyMultiplier: 1.1, description: "Guaranteed same-day HVAC repairs" }
    ],
    emergencyRates: { afterHours: 1.2, weekend: 1.1, holiday: 1.5 }
  }
];

async function setupCompany(companyData) {
  try {
    console.log(`\n🏢 Setting up ${companyData.name}...`);

    // 1. Create company
    const companyResponse = await axios.post(`${API_BASE}/companies`, companyData);
    const company = companyResponse.data.company;
    console.log(`✅ Company created with ID: ${company.id}`);

    // 2. Set up phone system with Telnyx + Vapi
    console.log(`📞 Setting up phone system...`);
    const setupResponse = await axios.post(`${API_BASE}/companies/${company.id}/setup`, {
      // Using your existing Telnyx number
      phoneNumber: process.env.TELNYX_PHONE_NUMBER
    });

    if (setupResponse.data.success) {
      console.log(`✅ Phone system configured`);
      console.log(`📞 Phone: ${process.env.TELNYX_PHONE_NUMBER}`);
      console.log(`🤖 Vapi Assistant: ${setupResponse.data.assistantId}`);
    }

    return {
      ...company,
      phoneNumber: process.env.TELNYX_PHONE_NUMBER,
      assistantId: setupResponse.data.assistantId
    };

  } catch (error) {
    console.error(`❌ Failed to setup ${companyData.name}:`, error.response?.data || error.message);
    return null;
  }
}

async function main() {
  console.log(`
🚀 HVAC Phone Agent - Company Setup
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Setting up your 3 test companies...
  `);

  const setupCompanies = [];

  for (const companyData of testCompanies) {
    const result = await setupCompany(companyData);
    if (result) {
      setupCompanies.push(result);
    }

    // Brief pause between setups
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 Setup Complete!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ ${setupCompanies.length}/3 companies configured successfully
📞 All companies using: ${process.env.TELNYX_PHONE_NUMBER}
🤖 Vapi.ai assistants created and configured
🗄️  Database populated with company data

🔥 READY FOR TESTING!

Test by calling: ${process.env.TELNYX_PHONE_NUMBER}

The AI will ask which company you're calling, then handle:
• Emergency detection
• Appointment booking
• Price estimates
• Lead capture
• SMS confirmations

Next Steps:
1. Configure Telnyx webhooks in dashboard
2. Test emergency scenarios
3. Monitor real-time call dashboard
4. Start taking real customer calls!

$2,800 per missed call × 30% miss rate = 🚀 MASSIVE ROI!
  `);
}

if (require.main === module) {
  main().catch(console.error);
}