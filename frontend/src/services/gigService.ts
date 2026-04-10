/**
 * Gig Service
 * Handles all gig/service package related API calls for Team@Once platform
 */

import { apiClient } from '@/lib/api-client';
import {
  Gig,
  GigOrder,
  GigReview,
  GigStats,
  CreateGigDto,
  UpdateGigDto,
  GigSearchParams,
  GigSearchResult,
  GigStatus,
} from '@/types/gig';

class GigService {
  // ============================================
  // Freelancer Gig Management
  // ============================================

  /**
   * Get all gigs for the current freelancer
   */
  async getMyGigs(status?: GigStatus): Promise<Gig[]> {
    const response = await apiClient.get('/gigs/my-gigs', {
      params: { status },
    });
    return response.data;
  }

  /**
   * Get a single gig by ID
   */
  async getGigById(gigId: string): Promise<Gig> {
    const response = await apiClient.get(`/gigs/${gigId}`);
    return response.data;
  }

  /**
   * Create a new gig
   */
  async createGig(data: CreateGigDto): Promise<Gig> {
    const response = await apiClient.post('/gigs', data);
    return response.data;
  }

  /**
   * Update an existing gig
   */
  async updateGig(gigId: string, data: UpdateGigDto): Promise<Gig> {
    const response = await apiClient.put(`/gigs/${gigId}`, data);
    return response.data;
  }

  /**
   * Delete a gig (soft delete)
   */
  async deleteGig(gigId: string): Promise<void> {
    await apiClient.delete(`/gigs/${gigId}`);
  }

  /**
   * Publish a draft gig
   */
  async publishGig(gigId: string): Promise<Gig> {
    const response = await apiClient.post(`/gigs/${gigId}/publish`);
    return response.data;
  }

  /**
   * Pause an active gig
   */
  async pauseGig(gigId: string): Promise<Gig> {
    const response = await apiClient.post(`/gigs/${gigId}/pause`);
    return response.data;
  }

  /**
   * Resume a paused gig
   */
  async resumeGig(gigId: string): Promise<Gig> {
    const response = await apiClient.post(`/gigs/${gigId}/resume`);
    return response.data;
  }

  /**
   * Upload gig images
   */
  async uploadGigImages(gigId: string, files: File[]): Promise<Gig> {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('images', file);
    });
    const response = await apiClient.post(`/gigs/${gigId}/images`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  /**
   * Delete a gig image
   */
  async deleteGigImage(gigId: string, imageId: string): Promise<Gig> {
    const response = await apiClient.delete(`/gigs/${gigId}/images/${imageId}`);
    return response.data;
  }

  /**
   * Upload gig video
   */
  async uploadGigVideo(gigId: string, file: File): Promise<Gig> {
    const formData = new FormData();
    formData.append('video', file);
    const response = await apiClient.post(`/gigs/${gigId}/video`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  /**
   * Get gig statistics
   */
  async getGigStats(): Promise<GigStats> {
    const response = await apiClient.get('/gigs/stats');
    return response.data;
  }

  // ============================================
  // Public Gig Browsing (for buyers/clients)
  // ============================================

  /**
   * Search and browse gigs
   */
  async searchGigs(params: GigSearchParams): Promise<GigSearchResult> {
    const response = await apiClient.get('/gigs/search', { params });
    return response.data;
  }

  /**
   * Get gigs by category
   */
  async getGigsByCategory(categoryId: string, subcategoryId?: string, page = 1, limit = 20): Promise<GigSearchResult> {
    const response = await apiClient.get('/gigs/browse', {
      params: { categoryId, subcategoryId, page, limit },
    });
    return response.data;
  }

  /**
   * Get featured/recommended gigs
   */
  async getFeaturedGigs(limit = 10): Promise<Gig[]> {
    const response = await apiClient.get('/gigs/featured', {
      params: { limit },
    });
    return response.data;
  }

  /**
   * Get trending gigs
   */
  async getTrendingGigs(limit = 10): Promise<Gig[]> {
    const response = await apiClient.get('/gigs/trending', {
      params: { limit },
    });
    return response.data;
  }

  /**
   * Get gigs by a specific freelancer
   */
  async getFreelancerGigs(freelancerId: string): Promise<Gig[]> {
    const response = await apiClient.get(`/gigs/freelancer/${freelancerId}`);
    return response.data;
  }

  // ============================================
  // Orders
  // ============================================

  /**
   * Create a new order for a gig
   */
  async createOrder(
    gigId: string,
    packageName: 'basic' | 'standard' | 'premium',
    requirementResponses: { requirementId: string; answer: string; files?: File[] }[]
  ): Promise<GigOrder> {
    const formData = new FormData();
    formData.append('packageName', packageName);
    formData.append('requirementResponses', JSON.stringify(
      requirementResponses.map(r => ({ requirementId: r.requirementId, answer: r.answer }))
    ));

    // Attach files
    requirementResponses.forEach((response) => {
      response.files?.forEach((file) => {
        formData.append(`files_${response.requirementId}`, file);
      });
    });

    const apiResponse = await apiClient.post(`/gigs/${gigId}/orders`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return apiResponse.data;
  }

  /**
   * Get orders for a gig (freelancer view)
   */
  async getGigOrders(gigId: string, status?: GigOrder['status']): Promise<GigOrder[]> {
    const response = await apiClient.get(`/gigs/${gigId}/orders`, {
      params: { status },
    });
    return response.data;
  }

  /**
   * Get all orders for the current user (freelancer or buyer)
   */
  async getMyOrders(role: 'freelancer' | 'buyer', status?: GigOrder['status']): Promise<GigOrder[]> {
    const response = await apiClient.get('/gigs/orders/my-orders', {
      params: { role, status },
    });
    return response.data;
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId: string): Promise<GigOrder> {
    const response = await apiClient.get(`/gigs/orders/${orderId}`);
    return response.data;
  }

  /**
   * Start working on an order (freelancer)
   */
  async startOrder(orderId: string): Promise<GigOrder> {
    const response = await apiClient.post(`/gigs/orders/${orderId}/start`);
    return response.data;
  }

  /**
   * Deliver order (freelancer)
   */
  async deliverOrder(orderId: string, message: string, files: File[]): Promise<GigOrder> {
    const formData = new FormData();
    formData.append('message', message);
    files.forEach((file) => {
      formData.append('files', file);
    });
    const response = await apiClient.post(`/gigs/orders/${orderId}/deliver`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  /**
   * Request revision (buyer)
   */
  async requestRevision(orderId: string, message: string): Promise<GigOrder> {
    const response = await apiClient.post(`/gigs/orders/${orderId}/revision`, { message });
    return response.data;
  }

  /**
   * Accept delivery and complete order (buyer)
   */
  async acceptDelivery(orderId: string): Promise<GigOrder> {
    const response = await apiClient.post(`/gigs/orders/${orderId}/accept`);
    return response.data;
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId: string, reason: string): Promise<GigOrder> {
    const response = await apiClient.post(`/gigs/orders/${orderId}/cancel`, { reason });
    return response.data;
  }

  // ============================================
  // Reviews
  // ============================================

  /**
   * Get reviews for a gig
   */
  async getGigReviews(gigId: string, page = 1, limit = 10): Promise<{ reviews: GigReview[]; total: number }> {
    const response = await apiClient.get(`/gigs/${gigId}/reviews`, {
      params: { page, limit },
    });
    return response.data;
  }

  /**
   * Create a review for a completed order
   */
  async createReview(
    orderId: string,
    rating: number,
    communication: number,
    serviceAsDescribed: number,
    wouldRecommend: boolean,
    comment: string
  ): Promise<GigReview> {
    const response = await apiClient.post(`/gigs/orders/${orderId}/review`, {
      rating,
      communication,
      serviceAsDescribed,
      wouldRecommend,
      comment,
    });
    return response.data;
  }

  /**
   * Respond to a review (freelancer)
   */
  async respondToReview(reviewId: string, response: string): Promise<GigReview> {
    const apiResponse = await apiClient.post(`/gigs/reviews/${reviewId}/respond`, { response });
    return apiResponse.data;
  }
}

export const gigService = new GigService();
export default gigService;
