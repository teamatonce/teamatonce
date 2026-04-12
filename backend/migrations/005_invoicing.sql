-- Migration: 005_invoicing
-- Description: Add invoicing and tax document tables for Team@Once
-- Created: 2026-04-11

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  project_id UUID NOT NULL REFERENCES projects(id),
  milestone_id UUID,
  payment_id UUID,
  client_id VARCHAR(255) NOT NULL,
  contractor_id VARCHAR(255) NOT NULL,
  amount NUMERIC NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  tax_amount NUMERIC DEFAULT 0,
  tax_withholding_percent NUMERIC DEFAULT 0,
  issue_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_date TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'paid',
  line_items JSONB DEFAULT '[]',
  client_details JSONB DEFAULT '{}',
  contractor_details JSONB DEFAULT '{}',
  payment_method VARCHAR(50),
  payment_reference VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_project_id ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_contractor_id ON invoices(contractor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_milestone_id ON invoices(milestone_id);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_id ON invoices(payment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON invoices(issue_date);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);

-- Contractor tax info table
CREATE TABLE IF NOT EXISTS contractor_tax_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  legal_name VARCHAR(255) NOT NULL,
  country VARCHAR(100) NOT NULL,
  tax_id_encrypted TEXT,
  form_type VARCHAR(20) NOT NULL DEFAULT 'W-8BEN',
  submitted_at TIMESTAMPTZ DEFAULT now(),
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contractor_tax_info_user_id ON contractor_tax_info(user_id);
CREATE INDEX IF NOT EXISTS idx_contractor_tax_info_form_type ON contractor_tax_info(form_type);
