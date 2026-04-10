/**
 * Payment and Contract Management Type Definitions
 * Team@Once Platform
 */

export type MilestoneStatus = 'pending' | 'in-progress' | 'review' | 'completed' | 'paid' | 'disputed';
export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
export type ContractStatus = 'draft' | 'pending' | 'active' | 'completed' | 'terminated';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
export type Currency = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'AUD' | 'CAD';

export interface Milestone {
  id: string;
  projectId: string;
  title: string;
  description: string;
  amount: number;
  currency: Currency;
  status: MilestoneStatus;
  dueDate: Date;
  completedDate?: Date;
  deliverables: Deliverable[];
  approvedBy?: string;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Deliverable {
  id: string;
  milestoneId: string;
  title: string;
  description: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  uploadedAt?: Date;
  uploadedBy?: string;
}

export interface Payment {
  id: string;
  projectId: string;
  milestoneId?: string;
  amount: number;
  currency: Currency;
  status: PaymentStatus;
  method: 'card' | 'bank_transfer' | 'escrow' | 'paypal';
  transactionId?: string;
  paidBy: string;
  paidTo: string;
  paidAt?: Date;
  invoice?: Invoice;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  projectId: string;
  paymentId?: string;
  issueDate: Date;
  dueDate: Date;
  paidDate?: Date;
  from: InvoiceParty;
  to: InvoiceParty;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  taxRate: number;
  total: number;
  currency: Currency;
  status: InvoiceStatus;
  notes?: string;
  createdAt: Date;
}

export interface InvoiceParty {
  name: string;
  company?: string;
  email: string;
  address: string;
  city: string;
  state?: string;
  country: string;
  postalCode: string;
  taxId?: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface ContractParty {
  id: string;
  name: string;
  email: string;
  company?: string;
  address?: string;
  phone?: string;
}

export interface Contract {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: ContractStatus;
  clientId: string;
  developerId: string;
  client?: ContractParty;
  developer?: ContractParty;
  startDate: Date;
  endDate: Date;
  totalAmount: number;
  currency: Currency;
  milestones: Milestone[];
  terms: ContractTerm[];
  signatures: Signature[];
  amendments: Amendment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ContractTerm {
  id: string;
  category: 'payment' | 'delivery' | 'ip_rights' | 'confidentiality' | 'termination' | 'other';
  title: string;
  description: string;
  order: number;
}

export interface Signature {
  id: string;
  contractId: string;
  signedBy: string;
  signedByName: string;
  signedByRole: 'client' | 'developer' | 'witness';
  signatureData: string;
  signedAt: Date;
  ipAddress: string;
}

export interface Amendment {
  id: string;
  contractId: string;
  title: string;
  description: string;
  requestedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: Date;
  resolvedAt?: Date;
}

export interface PaymentMethod {
  id: string;
  userId: string;
  type: 'card' | 'bank_account';
  isDefault: boolean;
  card?: {
    brand: string;
    last4: string;
    expiryMonth: number;
    expiryYear: number;
  };
  bankAccount?: {
    accountName: string;
    last4: string;
    bankName: string;
  };
  createdAt: Date;
}

export interface PaymentStats {
  totalEarned: number;
  totalPaid: number;
  inEscrow: number;
  pendingPayments: number;
  completedPayments: number;
  currency: Currency;
}

export interface Comment {
  id: string;
  milestoneId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  createdAt: Date;
}

export interface Dispute {
  id: string;
  milestoneId: string;
  raisedBy: string;
  reason: string;
  description: string;
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  resolution?: string;
  createdAt: Date;
  resolvedAt?: Date;
}
