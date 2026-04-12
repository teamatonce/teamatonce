import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';
import { SubmitW8BENDto } from './dto/invoicing.dto';

@Injectable()
export class InvoicingService {
  private readonly logger = new Logger(InvoicingService.name);
  private readonly encryptionKey: Buffer;
  private readonly encryptionAlgorithm = 'aes-256-cbc';

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {
    // Derive a 32-byte key from the configured secret (or fallback)
    const secret = this.config.get<string>('INVOICE_ENCRYPTION_KEY') ||
                   this.config.get<string>('JWT_SECRET') ||
                   'default-invoice-encryption-key-32';
    this.encryptionKey = crypto.scryptSync(secret, 'salt', 32);
    this.logger.log('InvoicingService initialized');
  }

  // ============================================
  // INVOICE GENERATION
  // ============================================

  /**
   * Auto-generate an invoice when an escrow milestone is released.
   * Pulls data from project, milestone, payment, client, and contractor.
   */
  async generateInvoice(paymentId: string, milestoneId: string): Promise<any> {
    this.logger.log(`Generating invoice for payment ${paymentId}, milestone ${milestoneId}`);

    // Fetch payment
    const payment = await this.db.findOne('payments', { id: paymentId });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Fetch milestone
    const milestone = await this.db.findOne('project_milestones', { id: milestoneId });
    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }

    // Fetch project
    const project = await this.db.findOne('projects', { id: payment.project_id });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Determine contractor (payee) from payment metadata or project
    const paymentMetadata = this.safeJsonParse(payment.metadata);
    let contractorId = paymentMetadata?.developer_id || project.team_lead_id;

    // Fallback: find from assigned company
    if (!contractorId && project.assigned_company_id) {
      const member = await this.db.findOne('company_team_members', {
        company_id: project.assigned_company_id,
        role: 'owner',
        status: 'active',
      });
      contractorId = member?.user_id;
    }

    if (!contractorId) {
      contractorId = 'unknown';
    }

    const clientId = payment.client_id;

    // Generate sequential invoice number
    const invoiceNumber = await this.generateInvoiceNumber();

    const now = new Date().toISOString();

    // Build line items
    const lineItems = [
      {
        description: `${milestone.name || 'Milestone'} - ${project.name || 'Project'}`,
        quantity: 1,
        unit_price: parseFloat(payment.amount) || 0,
        amount: parseFloat(payment.amount) || 0,
      },
    ];

    // Build client/contractor details snapshots
    const clientDetails = {
      user_id: clientId,
      project_name: project.name,
    };

    const contractorDetails = {
      user_id: contractorId,
    };

    const invoice = await this.db.insert('invoices', {
      invoice_number: invoiceNumber,
      project_id: payment.project_id,
      milestone_id: milestoneId,
      payment_id: paymentId,
      client_id: clientId,
      contractor_id: contractorId,
      amount: payment.amount,
      currency: payment.currency || 'USD',
      tax_amount: 0,
      tax_withholding_percent: 0,
      issue_date: now,
      due_date: now,
      paid_at: now,
      status: 'paid',
      line_items: JSON.stringify(lineItems),
      client_details: JSON.stringify(clientDetails),
      contractor_details: JSON.stringify(contractorDetails),
      payment_method: payment.payment_method || 'stripe',
      payment_reference: payment.stripe_charge_id || payment.stripe_payment_intent_id || null,
      notes: `Auto-generated invoice for milestone "${milestone.name}" release`,
      created_at: now,
      updated_at: now,
    });

    this.logger.log(`Invoice ${invoiceNumber} generated successfully`);
    return this.parseInvoice(invoice);
  }

  // ============================================
  // INVOICE PDF / HTML
  // ============================================

  /**
   * Generate an HTML invoice document.
   * Only accessible by the client or contractor on the invoice.
   */
  async getInvoicePdf(invoiceId: string, userId: string): Promise<string> {
    const invoice = await this.db.findOne('invoices', { id: invoiceId });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.client_id !== userId && invoice.contractor_id !== userId) {
      throw new ForbiddenException('You do not have access to this invoice');
    }

    const lineItems = this.safeJsonParse(invoice.line_items) || [];
    const clientDetails = this.safeJsonParse(invoice.client_details) || {};
    const contractorDetails = this.safeJsonParse(invoice.contractor_details) || {};

    const lineItemsHtml = lineItems.map((item: any) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${this.escapeHtml(item.description || '')}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity || 1}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${(item.unit_price || 0).toFixed(2)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">$${(item.amount || 0).toFixed(2)}</td>
      </tr>
    `).join('');

    const amount = parseFloat(invoice.amount) || 0;
    const taxAmount = parseFloat(invoice.tax_amount) || 0;
    const total = amount + taxAmount;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice ${this.escapeHtml(invoice.invoice_number)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 40px; color: #333; }
    .invoice-container { max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    .logo { font-size: 28px; font-weight: bold; color: #2563eb; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { margin: 0; color: #2563eb; font-size: 32px; }
    .invoice-meta { margin-top: 8px; color: #666; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .party { width: 45%; }
    .party h3 { color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    .party p { margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th { background: #f8fafc; padding: 12px 10px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; border-bottom: 2px solid #e2e8f0; }
    .totals { text-align: right; }
    .totals .row { display: flex; justify-content: flex-end; padding: 6px 0; }
    .totals .label { width: 150px; text-align: right; padding-right: 20px; color: #666; }
    .totals .value { width: 120px; text-align: right; }
    .totals .total-row { font-size: 18px; font-weight: bold; border-top: 2px solid #333; padding-top: 10px; margin-top: 6px; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    .status-paid { background: #dcfce7; color: #166534; }
    .status-draft { background: #f3f4f6; color: #374151; }
    .status-cancelled { background: #fef2f2; color: #991b1b; }
    .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="header">
      <div class="logo">Team@Once</div>
      <div class="invoice-title">
        <h1>INVOICE</h1>
        <div class="invoice-meta">
          <p><strong>${this.escapeHtml(invoice.invoice_number)}</strong></p>
          <p>Issued: ${new Date(invoice.issue_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <p><span class="status-badge status-${invoice.status}">${invoice.status}</span></p>
        </div>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <h3>Bill From (Contractor)</h3>
        <p><strong>User ID:</strong> ${this.escapeHtml(contractorDetails.user_id || invoice.contractor_id)}</p>
      </div>
      <div class="party">
        <h3>Bill To (Client)</h3>
        <p><strong>User ID:</strong> ${this.escapeHtml(clientDetails.user_id || invoice.client_id)}</p>
        <p><strong>Project:</strong> ${this.escapeHtml(clientDetails.project_name || '')}</p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align: center;">Qty</th>
          <th style="text-align: right;">Unit Price</th>
          <th style="text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHtml}
      </tbody>
    </table>

    <div class="totals">
      <div class="row">
        <span class="label">Subtotal:</span>
        <span class="value">$${amount.toFixed(2)}</span>
      </div>
      <div class="row">
        <span class="label">Tax:</span>
        <span class="value">$${taxAmount.toFixed(2)}</span>
      </div>
      <div class="row total-row">
        <span class="label">Total (${this.escapeHtml(invoice.currency || 'USD')}):</span>
        <span class="value">$${total.toFixed(2)}</span>
      </div>
    </div>

    ${invoice.payment_reference ? `<p style="margin-top: 20px; color: #666;"><strong>Payment Reference:</strong> ${this.escapeHtml(invoice.payment_reference)}</p>` : ''}
    ${invoice.notes ? `<p style="color: #666;"><strong>Notes:</strong> ${this.escapeHtml(invoice.notes)}</p>` : ''}

    <div class="footer">
      <p>This invoice was auto-generated by Team@Once. For questions, contact support@teamatonce.com</p>
    </div>
  </div>
</body>
</html>`;
  }

  // ============================================
  // LIST & STATS
  // ============================================

  /**
   * List invoices for a user (as payer or payee) with filters.
   */
  async listInvoices(userId: string, filters: {
    projectId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Promise<{ invoices: any[]; total: number; page: number; limit: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    // Build WHERE clause: user must be client OR contractor
    let whereConditions = [`(client_id = $1 OR contractor_id = $1)`];
    const params: any[] = [userId];
    let paramIndex = 2;

    if (filters.projectId) {
      whereConditions.push(`project_id = $${paramIndex}`);
      params.push(filters.projectId);
      paramIndex++;
    }

    if (filters.status) {
      whereConditions.push(`status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.startDate) {
      whereConditions.push(`issue_date >= $${paramIndex}`);
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters.endDate) {
      whereConditions.push(`issue_date <= $${paramIndex}`);
      params.push(filters.endDate);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Count query
    const countResult = await this.db.query(
      `SELECT COUNT(*) as count FROM invoices WHERE ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    // Data query
    const dataParams = [...params, limit, offset];
    const result = await this.db.query(
      `SELECT * FROM invoices WHERE ${whereClause} ORDER BY issue_date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      dataParams,
    );

    return {
      invoices: (result.rows || []).map((inv: any) => this.parseInvoice(inv)),
      total,
      page,
      limit,
    };
  }

  /**
   * Get a single invoice by ID (with access check).
   */
  async getInvoice(invoiceId: string, userId: string): Promise<any> {
    const invoice = await this.db.findOne('invoices', { id: invoiceId });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.client_id !== userId && invoice.contractor_id !== userId) {
      throw new ForbiddenException('You do not have access to this invoice');
    }

    return this.parseInvoice(invoice);
  }

  /**
   * Summary stats: total invoiced, total paid, this month, this year.
   */
  async getInvoiceStats(userId: string): Promise<any> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString();

    // Total invoiced (as contractor - money earned)
    const totalResult = await this.db.query(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM invoices WHERE (client_id = $1 OR contractor_id = $1)`,
      [userId],
    );

    // Total paid
    const paidResult = await this.db.query(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM invoices WHERE (client_id = $1 OR contractor_id = $1) AND status = 'paid'`,
      [userId],
    );

    // This month
    const monthResult = await this.db.query(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM invoices WHERE (client_id = $1 OR contractor_id = $1) AND issue_date >= $2`,
      [userId, startOfMonth],
    );

    // This year
    const yearResult = await this.db.query(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM invoices WHERE (client_id = $1 OR contractor_id = $1) AND issue_date >= $2`,
      [userId, startOfYear],
    );

    return {
      total_invoiced: parseFloat(totalResult.rows[0]?.total) || 0,
      total_invoiced_count: parseInt(totalResult.rows[0]?.count) || 0,
      total_paid: parseFloat(paidResult.rows[0]?.total) || 0,
      total_paid_count: parseInt(paidResult.rows[0]?.count) || 0,
      this_month: parseFloat(monthResult.rows[0]?.total) || 0,
      this_month_count: parseInt(monthResult.rows[0]?.count) || 0,
      this_year: parseFloat(yearResult.rows[0]?.total) || 0,
      this_year_count: parseInt(yearResult.rows[0]?.count) || 0,
    };
  }

  // ============================================
  // TAX DOCUMENT STUBS
  // ============================================

  /**
   * For US clients, summarize all payments to contractors in a given tax year.
   * Groups by contractor and flags those who earned >$600 (1099-NEC threshold).
   */
  async generate1099Summary(clientId: string, year: string): Promise<any> {
    const startDate = `${year}-01-01T00:00:00.000Z`;
    const endDate = `${year}-12-31T23:59:59.999Z`;

    const result = await this.db.query(
      `SELECT contractor_id,
              SUM(amount) as total_paid,
              COUNT(*) as invoice_count,
              MIN(issue_date) as first_payment,
              MAX(issue_date) as last_payment
       FROM invoices
       WHERE client_id = $1
         AND status = 'paid'
         AND issue_date >= $2
         AND issue_date <= $3
       GROUP BY contractor_id
       ORDER BY total_paid DESC`,
      [clientId, startDate, endDate],
    );

    const contractors = (result.rows || []).map((row: any) => ({
      contractor_id: row.contractor_id,
      total_paid: parseFloat(row.total_paid) || 0,
      invoice_count: parseInt(row.invoice_count) || 0,
      first_payment: row.first_payment,
      last_payment: row.last_payment,
      requires_1099: (parseFloat(row.total_paid) || 0) >= 600,
    }));

    const totalPaid = contractors.reduce((sum: number, c: any) => sum + c.total_paid, 0);
    const contractorsRequiring1099 = contractors.filter((c: any) => c.requires_1099);

    return {
      client_id: clientId,
      tax_year: year,
      total_paid_to_contractors: totalPaid,
      total_contractors: contractors.length,
      contractors_requiring_1099: contractorsRequiring1099.length,
      threshold: 600,
      contractors,
      generated_at: new Date().toISOString(),
      disclaimer: 'This is a summary for informational purposes. Consult a tax professional for actual 1099-NEC filing requirements.',
    };
  }

  /**
   * Store W-8BEN information for international contractors.
   * Sensitive fields (tax ID) are encrypted.
   */
  async collectW8BEN(contractorId: string, dto: SubmitW8BENDto): Promise<any> {
    const now = new Date().toISOString();

    // Encrypt the tax ID
    const encryptedTaxId = this.encrypt(dto.taxId);

    // Check if existing record
    const existing = await this.db.findOne('contractor_tax_info', { user_id: contractorId });

    if (existing) {
      // Update existing record
      const updated = await this.db.update('contractor_tax_info', existing.id, {
        legal_name: dto.legalName,
        country: dto.countryOfResidence,
        tax_id_encrypted: encryptedTaxId,
        form_type: 'W-8BEN',
        submitted_at: dto.signatureDate || now,
        verified: false,
        updated_at: now,
      });
      return this.sanitizeTaxInfo(updated);
    }

    // Insert new
    const taxInfo = await this.db.insert('contractor_tax_info', {
      user_id: contractorId,
      legal_name: dto.legalName,
      country: dto.countryOfResidence,
      tax_id_encrypted: encryptedTaxId,
      form_type: 'W-8BEN',
      submitted_at: dto.signatureDate || now,
      verified: false,
      created_at: now,
      updated_at: now,
    });

    return this.sanitizeTaxInfo(taxInfo);
  }

  /**
   * Get W-8BEN status for a contractor (without exposing encrypted tax ID).
   */
  async getW8BENStatus(contractorId: string): Promise<any> {
    const taxInfo = await this.db.findOne('contractor_tax_info', { user_id: contractorId });
    if (!taxInfo) {
      return {
        submitted: false,
        message: 'No W-8BEN information on file',
      };
    }

    return {
      submitted: true,
      ...this.sanitizeTaxInfo(taxInfo),
    };
  }

  // ============================================
  // HELPERS
  // ============================================

  private async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;

    // Get the latest invoice number for this year
    const result = await this.db.query(
      `SELECT invoice_number FROM invoices WHERE invoice_number LIKE $1 ORDER BY invoice_number DESC LIMIT 1`,
      [`${prefix}%`],
    );

    let sequence = 1;
    if (result.rows && result.rows.length > 0) {
      const lastNumber = result.rows[0].invoice_number;
      const lastSequence = parseInt(lastNumber.replace(prefix, ''), 10);
      if (!isNaN(lastSequence)) {
        sequence = lastSequence + 1;
      }
    }

    return `${prefix}${String(sequence).padStart(5, '0')}`;
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.encryptionAlgorithm, this.encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(this.encryptionAlgorithm, this.encryptionKey, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  private sanitizeTaxInfo(taxInfo: any): any {
    return {
      id: taxInfo.id,
      user_id: taxInfo.user_id,
      legal_name: taxInfo.legal_name,
      country: taxInfo.country,
      form_type: taxInfo.form_type,
      submitted_at: taxInfo.submitted_at,
      verified: taxInfo.verified,
      has_tax_id: !!taxInfo.tax_id_encrypted,
      created_at: taxInfo.created_at,
      updated_at: taxInfo.updated_at,
    };
  }

  private parseInvoice(invoice: any): any {
    return {
      ...invoice,
      line_items: this.safeJsonParse(invoice.line_items),
      client_details: this.safeJsonParse(invoice.client_details),
      contractor_details: this.safeJsonParse(invoice.contractor_details),
      amount: parseFloat(invoice.amount) || 0,
      tax_amount: parseFloat(invoice.tax_amount) || 0,
      tax_withholding_percent: parseFloat(invoice.tax_withholding_percent) || 0,
    };
  }

  private safeJsonParse(value: any): any {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private escapeHtml(str: string): string {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
