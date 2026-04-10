/**
 * Gig/Service Package Type Definitions
 * Team@Once Platform - Fiverr/Upwork style service offerings
 */

export type GigStatus = 'draft' | 'pending_review' | 'active' | 'paused' | 'rejected';
export type DeliveryTime = '1_day' | '2_days' | '3_days' | '5_days' | '7_days' | '14_days' | '21_days' | '30_days' | '45_days' | '60_days' | '90_days';
export type RevisionCount = '0' | '1' | '2' | '3' | '5' | 'unlimited';

export interface GigPackage {
  id: string;
  name: 'basic' | 'standard' | 'premium';
  title: string;
  description: string;
  price: number;
  deliveryTime: DeliveryTime;
  revisions: RevisionCount;
  features: string[];
}

export interface GigFAQ {
  id: string;
  question: string;
  answer: string;
  order: number;
}

export interface GigRequirement {
  id: string;
  question: string;
  type: 'text' | 'multiple_choice' | 'file';
  required: boolean;
  options?: string[]; // For multiple choice
  order: number;
}

export interface GigImage {
  id: string;
  url: string;
  thumbnailUrl?: string;
  isPrimary: boolean;
  order: number;
}

export interface GigVideo {
  id: string;
  url: string;
  thumbnailUrl?: string;
}

export interface Gig {
  id: string;
  freelancerId: string;

  // Basic Info
  title: string;
  description: string;
  categoryId: string;
  subcategoryId: string;
  tags: string[];

  // Pricing Packages
  packages: GigPackage[];

  // Media
  images: GigImage[];
  video?: GigVideo;

  // Requirements
  requirements: GigRequirement[];

  // FAQs
  faqs: GigFAQ[];

  // Status & Stats
  status: GigStatus;
  impressions: number;
  clicks: number;
  orders: number;
  rating: number;
  reviewCount: number;

  // Timestamps
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;

  // Freelancer details (populated on fetch)
  freelancer?: {
    id: string;
    name: string;
    avatar?: string;
    title: string;
    rating: number;
    reviewCount: number;
    location: string;
    memberSince: string;
    responseTime: string;
    languages: string[];
  };
}

export interface GigOrder {
  id: string;
  gigId: string;
  packageId: string;
  buyerId: string;
  freelancerId: string;

  // Order Details
  packageName: 'basic' | 'standard' | 'premium';
  price: number;
  serviceFee: number;
  totalAmount: number;

  // Requirements Responses
  requirementResponses: {
    requirementId: string;
    question: string;
    answer: string;
    files?: string[];
  }[];

  // Status
  status: 'pending' | 'in_progress' | 'delivered' | 'revision' | 'completed' | 'cancelled' | 'disputed';

  // Delivery
  deliveryDate: string;
  deliveredAt?: string;
  deliveryFiles?: {
    id: string;
    name: string;
    url: string;
    size: number;
  }[];
  deliveryMessage?: string;

  // Revision
  revisionCount: number;
  revisionsUsed: number;
  revisionRequests?: {
    id: string;
    message: string;
    requestedAt: string;
  }[];

  // Timestamps
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface GigReview {
  id: string;
  gigId: string;
  orderId: string;
  buyerId: string;
  freelancerId: string;

  // Review Content
  rating: number;
  communication: number;
  serviceAsDescribed: number;
  wouldRecommend: boolean;
  comment: string;

  // Response
  freelancerResponse?: string;
  respondedAt?: string;

  // Buyer Info (populated)
  buyer?: {
    id: string;
    name: string;
    avatar?: string;
    location: string;
  };

  createdAt: string;
}

// DTOs for API calls
export interface CreateGigDto {
  title: string;
  description: string;
  categoryId: string;
  subcategoryId: string;
  tags: string[];
  packages: Omit<GigPackage, 'id'>[];
  requirements?: Omit<GigRequirement, 'id'>[];
  faqs?: Omit<GigFAQ, 'id'>[];
}

export interface UpdateGigDto {
  title?: string;
  description?: string;
  categoryId?: string;
  subcategoryId?: string;
  tags?: string[];
  packages?: Omit<GigPackage, 'id'>[];
  requirements?: Omit<GigRequirement, 'id'>[];
  faqs?: Omit<GigFAQ, 'id'>[];
  status?: GigStatus;
}

export interface GigSearchParams {
  query?: string;
  categoryId?: string;
  subcategoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  deliveryTime?: DeliveryTime;
  sellerLevel?: 'new' | 'level_1' | 'level_2' | 'top_rated';
  minRating?: number;
  sortBy?: 'relevance' | 'best_selling' | 'newest' | 'price_low' | 'price_high';
  page?: number;
  limit?: number;
}

export interface GigSearchResult {
  gigs: Gig[];
  total: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
}

export interface GigStats {
  totalGigs: number;
  activeGigs: number;
  totalOrders: number;
  completedOrders: number;
  pendingOrders: number;
  totalEarnings: number;
  averageRating: number;
  impressions: number;
  clicks: number;
  conversionRate: number;
}

// Helper constants
export const DELIVERY_TIME_LABELS: Record<DeliveryTime, string> = {
  '1_day': '1 Day',
  '2_days': '2 Days',
  '3_days': '3 Days',
  '5_days': '5 Days',
  '7_days': '1 Week',
  '14_days': '2 Weeks',
  '21_days': '3 Weeks',
  '30_days': '1 Month',
  '45_days': '45 Days',
  '60_days': '2 Months',
  '90_days': '3 Months',
};

export const REVISION_LABELS: Record<RevisionCount, string> = {
  '0': 'No Revisions',
  '1': '1 Revision',
  '2': '2 Revisions',
  '3': '3 Revisions',
  '5': '5 Revisions',
  'unlimited': 'Unlimited Revisions',
};

export const DEFAULT_PACKAGES: Omit<GigPackage, 'id'>[] = [
  {
    name: 'basic',
    title: 'Basic',
    description: '',
    price: 5,
    deliveryTime: '3_days',
    revisions: '1',
    features: [],
  },
  {
    name: 'standard',
    title: 'Standard',
    description: '',
    price: 25,
    deliveryTime: '5_days',
    revisions: '2',
    features: [],
  },
  {
    name: 'premium',
    title: 'Premium',
    description: '',
    price: 50,
    deliveryTime: '7_days',
    revisions: '3',
    features: [],
  },
];
