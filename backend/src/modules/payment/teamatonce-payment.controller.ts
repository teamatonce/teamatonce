import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StripeService } from './stripe.service';
import {
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  CancelSubscriptionDto,
  AddPaymentMethodDto,
  CreateCheckoutSessionDto,
} from './dto/payment.dto';

/**
 * Team@Once Payment Controller
 *
 * Wrapper controller that exposes Stripe payment functionality under /teamatonce prefix
 * to match frontend expectations
 *
 * Frontend expects: /teamatonce/subscription/*, /teamatonce/payment-method/*
 * This controller provides these endpoints by wrapping StripeService methods
 */
@ApiTags('Team@Once Payment Management')
@Controller('teamatonce')
export class TeamAtOncePaymentController {
  constructor(private readonly stripeService: StripeService) {}

  // ============================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================

  /**
   * Create a new subscription
   * Frontend: POST /teamatonce/subscription/create
   */
  @Post('subscription/create')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new subscription (Team@Once endpoint)' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Subscription created successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Failed to create subscription',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        priceId: { type: 'string', example: 'price_1234567890' },
        paymentMethodId: { type: 'string', example: 'pm_1234567890' },
      },
      required: ['priceId', 'paymentMethodId'],
    },
  })
  async createSubscription(
    @Request() req: any,
    @Body() dto: { priceId: string; paymentMethodId: string; email?: string; metadata?: Record<string, string> },
  ) {
    const userId = req.user.sub || req.user.userId;

    // Create or get customer first
    const customer = await this.stripeService.createOrGetCustomer(
      dto.email || req.user.email,
      userId,
      dto.metadata,
    );

    return this.stripeService.createSubscription(
      customer.id,
      dto.priceId,
      dto.paymentMethodId,
      dto.metadata,
    );
  }

  /**
   * Get current user's subscription
   * Frontend: GET /teamatonce/subscription
   */
  @Get('subscription')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user subscription (Team@Once endpoint)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Subscription retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'No active subscription found',
  })
  async getUserSubscription(@Request() req: any) {
    const userId = req.user.sub || req.user.userId;

    // Get customer first
    const customer = await this.stripeService.createOrGetCustomer(
      req.user.email,
      userId,
    );

    // Get all subscriptions for the customer
    const subscriptions = await this.stripeService.listCustomerSubscriptions(customer.id);

    if (subscriptions.length === 0) {
      return { subscription: null, message: 'No active subscription found' };
    }

    // Return the most recent active subscription
    const activeSubscription = subscriptions.find(sub => sub.status === 'active') || subscriptions[0];
    return activeSubscription;
  }

  /**
   * Get subscription by ID
   * Frontend: GET /teamatonce/subscription/:subscriptionId
   */
  @Get('subscription/:subscriptionId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get subscription details by ID (Team@Once endpoint)' })
  @ApiParam({ name: 'subscriptionId', description: 'Stripe subscription ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Subscription retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Subscription not found',
  })
  async getSubscription(@Param('subscriptionId') subscriptionId: string) {
    return this.stripeService.getSubscription(subscriptionId);
  }

  /**
   * Upgrade/downgrade subscription
   * Frontend: PUT /teamatonce/subscription/upgrade
   */
  @Put('subscription/upgrade')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upgrade/downgrade subscription (Team@Once endpoint)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Subscription updated successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Failed to update subscription',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        newPriceId: { type: 'string', example: 'price_1234567890' },
        prorate: { type: 'boolean', example: true, default: true },
      },
      required: ['newPriceId'],
    },
  })
  async upgradeSubscription(
    @Request() req: any,
    @Body() dto: { newPriceId: string; prorate?: boolean },
  ) {
    const userId = req.user.sub || req.user.userId;

    // Get customer first
    const customer = await this.stripeService.createOrGetCustomer(
      req.user.email,
      userId,
    );

    // Get active subscription
    const subscriptions = await this.stripeService.listCustomerSubscriptions(customer.id);
    const activeSubscription = subscriptions.find(sub => sub.status === 'active');

    if (!activeSubscription) {
      throw new BadRequestException('No active subscription found to upgrade');
    }

    return this.stripeService.updateSubscription(
      activeSubscription.id,
      dto.newPriceId,
      dto.prorate ?? true,
    );
  }

  /**
   * Cancel subscription
   * Frontend: DELETE /teamatonce/subscription/cancel
   */
  @Delete('subscription/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel subscription at period end (Team@Once endpoint)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Subscription cancelled successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'No active subscription found',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        immediate: { type: 'boolean', example: false, default: false },
      },
    },
    required: false,
  })
  async cancelSubscription(
    @Request() req: any,
    @Body() dto?: { immediate?: boolean },
  ) {
    const userId = req.user.sub || req.user.userId;

    // Get customer first
    const customer = await this.stripeService.createOrGetCustomer(
      req.user.email,
      userId,
    );

    // Get active subscription
    const subscriptions = await this.stripeService.listCustomerSubscriptions(customer.id);
    const activeSubscription = subscriptions.find(sub => sub.status === 'active');

    if (!activeSubscription) {
      throw new BadRequestException('No active subscription found to cancel');
    }

    return this.stripeService.cancelSubscription(
      activeSubscription.id,
      dto?.immediate ?? false,
    );
  }

  /**
   * Resume cancelled subscription
   * Frontend: POST /teamatonce/subscription/resume
   */
  @Post('subscription/resume')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resume a cancelled subscription (Team@Once endpoint)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Subscription resumed successfully',
  })
  async resumeSubscription(@Request() req: any) {
    const userId = req.user.sub || req.user.userId;

    // Get customer first
    const customer = await this.stripeService.createOrGetCustomer(
      req.user.email,
      userId,
    );

    // Get subscription that is set to cancel at period end
    const subscriptions = await this.stripeService.listCustomerSubscriptions(customer.id);
    const subscriptionToResume = subscriptions.find(
      sub => sub.status === 'active' && sub.cancel_at_period_end,
    );

    if (!subscriptionToResume) {
      throw new BadRequestException('No subscription scheduled for cancellation found');
    }

    return this.stripeService.resumeSubscription(subscriptionToResume.id);
  }

  /**
   * Create checkout session for subscription
   * Frontend: POST /teamatonce/subscription/checkout
   */
  @Post('subscription/checkout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create Stripe checkout session (Team@Once endpoint)' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Checkout session created successfully',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        priceId: { type: 'string', example: 'price_1234567890' },
        successUrl: { type: 'string', example: 'https://example.com/success' },
        cancelUrl: { type: 'string', example: 'https://example.com/cancel' },
      },
      required: ['priceId', 'successUrl', 'cancelUrl'],
    },
  })
  async createCheckoutSession(
    @Request() req: any,
    @Body() dto: { priceId: string; successUrl: string; cancelUrl: string; metadata?: Record<string, string> },
  ) {
    const userId = req.user.sub || req.user.userId;

    // Get or create customer
    let customerId: string | undefined;
    if (req.user.email) {
      const customer = await this.stripeService.createOrGetCustomer(
        req.user.email,
        userId,
        dto.metadata,
      );
      customerId = customer.id;
    }

    const session = await this.stripeService.createCheckoutSession(
      dto.priceId,
      customerId,
      req.user.email,
      dto.successUrl,
      dto.cancelUrl,
      dto.metadata,
    );

    return {
      sessionId: session.id,
      url: session.url,
    };
  }

  /**
   * Get available subscription plans
   * Frontend: GET /teamatonce/subscription/plans
   */
  @Get('subscription/plans')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get available subscription plans (Team@Once endpoint)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Plans retrieved successfully',
  })
  @ApiQuery({
    name: 'productId',
    required: false,
    type: String,
    description: 'Filter by Stripe product ID',
  })
  async getPlans(@Query('productId') productId?: string) {
    return this.stripeService.listPrices(productId);
  }

  // ============================================
  // PAYMENT METHOD MANAGEMENT
  // ============================================

  /**
   * Add a new payment method
   * Frontend: POST /teamatonce/payment-method/add
   */
  @Post('payment-method/add')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add payment method (Team@Once endpoint)' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Payment method added successfully',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        paymentMethodId: { type: 'string', example: 'pm_1234567890' },
        setAsDefault: { type: 'boolean', example: true, default: false },
      },
      required: ['paymentMethodId'],
    },
  })
  async addPaymentMethod(
    @Request() req: any,
    @Body() dto: { paymentMethodId: string; setAsDefault?: boolean },
  ) {
    const userId = req.user.sub || req.user.userId;

    // Get or create customer
    const customer = await this.stripeService.createOrGetCustomer(
      req.user.email,
      userId,
    );

    const paymentMethod = await this.stripeService.attachPaymentMethod(
      dto.paymentMethodId,
      customer.id,
    );

    // Set as default if requested
    if (dto.setAsDefault) {
      await this.stripeService.setDefaultPaymentMethod(
        customer.id,
        dto.paymentMethodId,
      );
    }

    return paymentMethod;
  }

  /**
   * Get all payment methods
   * Frontend: GET /teamatonce/payment-method/list
   */
  @Get('payment-method/list')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List payment methods (Team@Once endpoint)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment methods retrieved successfully',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['card'],
    description: 'Payment method type',
  })
  async getPaymentMethods(
    @Request() req: any,
    @Query('type') type: 'card' = 'card',
  ) {
    const userId = req.user.sub || req.user.userId;

    // Get customer
    const customer = await this.stripeService.createOrGetCustomer(
      req.user.email,
      userId,
    );

    return this.stripeService.listPaymentMethods(customer.id, type);
  }

  /**
   * Remove a payment method
   * Frontend: DELETE /teamatonce/payment-method/:paymentMethodId
   */
  @Delete('payment-method/:paymentMethodId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove payment method (Team@Once endpoint)' })
  @ApiParam({
    name: 'paymentMethodId',
    description: 'Stripe payment method ID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment method removed successfully',
  })
  async removePaymentMethod(@Param('paymentMethodId') paymentMethodId: string) {
    return this.stripeService.detachPaymentMethod(paymentMethodId);
  }

  /**
   * Set default payment method
   * Frontend: PUT /teamatonce/payment-method/default
   */
  @Put('payment-method/default')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set default payment method (Team@Once endpoint)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Default payment method set successfully',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        paymentMethodId: {
          type: 'string',
          example: 'pm_1234567890',
        },
      },
      required: ['paymentMethodId'],
    },
  })
  async setDefaultPaymentMethod(
    @Request() req: any,
    @Body('paymentMethodId') paymentMethodId: string,
  ) {
    const userId = req.user.sub || req.user.userId;

    // Get customer
    const customer = await this.stripeService.createOrGetCustomer(
      req.user.email,
      userId,
    );

    return this.stripeService.setDefaultPaymentMethod(
      customer.id,
      paymentMethodId,
    );
  }

  // ============================================
  // BILLING & INVOICES
  // ============================================

  /**
   * Get all invoices for current user
   * Frontend: GET /teamatonce/billing/invoices
   */
  @Get('billing/invoices')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List invoices for current user (Team@Once endpoint)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Invoices retrieved successfully',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of invoices to retrieve',
    example: 10,
  })
  async getInvoices(
    @Request() req: any,
    @Query('limit') limit: number = 10,
  ) {
    const userId = req.user.sub || req.user.userId;

    // Get customer
    const customer = await this.stripeService.createOrGetCustomer(
      req.user.email,
      userId,
    );

    return this.stripeService.listInvoices(customer.id, Number(limit));
  }

  /**
   * Get a specific invoice
   * Frontend: GET /teamatonce/billing/invoice/:invoiceId
   */
  @Get('billing/invoice/:invoiceId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get invoice details (Team@Once endpoint)' })
  @ApiParam({ name: 'invoiceId', description: 'Stripe invoice ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Invoice retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Invoice not found',
  })
  async getInvoice(@Param('invoiceId') invoiceId: string) {
    return this.stripeService.getInvoice(invoiceId);
  }

  /**
   * Get upcoming invoice
   * Frontend: GET /teamatonce/billing/upcoming
   */
  @Get('billing/upcoming')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get upcoming invoice (Team@Once endpoint)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Upcoming invoice retrieved successfully',
  })
  async getUpcomingInvoice(@Request() req: any) {
    const userId = req.user.sub || req.user.userId;

    // Get customer
    const customer = await this.stripeService.createOrGetCustomer(
      req.user.email,
      userId,
    );

    return this.stripeService.getUpcomingInvoice(customer.id);
  }

  // ============================================
  // CUSTOMER MANAGEMENT
  // ============================================

  /**
   * Get current user's Stripe customer
   * Frontend: GET /teamatonce/customer
   */
  @Get('customer')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user Stripe customer (Team@Once endpoint)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Customer retrieved successfully',
  })
  async getCustomer(@Request() req: any) {
    const userId = req.user.sub || req.user.userId;

    return this.stripeService.createOrGetCustomer(
      req.user.email,
      userId,
    );
  }

  /**
   * Update current user's customer details
   * Frontend: PUT /teamatonce/customer
   */
  @Put('customer')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update customer details (Team@Once endpoint)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Customer updated successfully',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'John Doe' },
        phone: { type: 'string', example: '+1234567890' },
        metadata: { type: 'object' },
      },
    },
  })
  async updateCustomer(
    @Request() req: any,
    @Body() updateData: any,
  ) {
    const userId = req.user.sub || req.user.userId;

    // Get customer first
    const customer = await this.stripeService.createOrGetCustomer(
      req.user.email,
      userId,
    );

    return this.stripeService.updateCustomer(customer.id, updateData);
  }
}
