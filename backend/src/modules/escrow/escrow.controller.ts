import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
  Headers,
  RawBodyRequest,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EscrowService } from './escrow.service';
import { DisputeService } from './dispute.service';
import { StripeConnectService } from './stripe-connect.service';
import {
  FundMilestoneEscrowDto,
  SubmitDeliverablesDto,
  ApproveDeliverableDto,
  RequestChangesDto,
  CreateConnectAccountDto,
  RefundEscrowDto,
  AutoReleaseConfigDto,
} from './dto/escrow.dto';
import {
  OpenDisputeDto,
  RespondToDisputeDto,
  MediateDisputeDto,
  AcceptMediationDto,
  EscalateDisputeDto,
  WithdrawDisputeDto,
} from './dto/dispute.dto';

@ApiTags('escrow')
@ApiBearerAuth()
@Controller('escrow')
@UseGuards(JwtAuthGuard)
export class EscrowController {
  private stripe: any;

  constructor(
    private readonly escrowService: EscrowService,
    private readonly disputeService: DisputeService,
    private readonly stripeConnect: StripeConnectService,
    private readonly configService: ConfigService,
  ) {
    // Initialize Stripe for webhook verification
    const stripeSecretKey = this.configService.get('STRIPE_SECRET_KEY');
    if (stripeSecretKey) {
      this.stripe = new Stripe(stripeSecretKey, {
        apiVersion: '2025-09-30.clover' as any,
        typescript: true,
      });
    }
  }

  /**
   * ESCROW FUNDING & PAYMENT ENDPOINTS
   */

  @Post('fund-milestone')
  @ApiOperation({ summary: 'Fund milestone in escrow' })
  @ApiResponse({ status: 201, description: 'Milestone funded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async fundMilestone(@Req() req, @Body() dto: FundMilestoneEscrowDto) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.escrowService.fundMilestone(userId, dto);
      return {
        success: true,
        message: 'Milestone funded successfully in escrow',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fund milestone',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('submit-deliverables')
  @ApiOperation({ summary: 'Submit deliverables for review' })
  @ApiResponse({ status: 201, description: 'Deliverables submitted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async submitDeliverables(@Req() req, @Body() dto: SubmitDeliverablesDto) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.escrowService.submitDeliverables(userId, dto);
      return {
        success: true,
        message: 'Deliverables submitted for review',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to submit deliverables',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('approve')
  @ApiOperation({ summary: 'Approve deliverable and release payment' })
  @ApiResponse({ status: 200, description: 'Deliverable approved and payment released' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async approveDeliverable(@Req() req, @Body() dto: ApproveDeliverableDto) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.escrowService.approveDeliverable(userId, dto);
      return {
        success: true,
        message: 'Deliverable approved and payment released',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to approve deliverable',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('request-changes')
  @ApiOperation({ summary: 'Request changes to deliverable' })
  @ApiResponse({ status: 200, description: 'Change request submitted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async requestChanges(@Req() req, @Body() dto: RequestChangesDto) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.escrowService.requestChanges(userId, dto);
      return {
        success: true,
        message: 'Changes requested successfully',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to request changes',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('refund')
  @ApiOperation({ summary: 'Process refund from escrow' })
  @ApiResponse({ status: 200, description: 'Refund processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async refundEscrow(@Req() req, @Body() dto: RefundEscrowDto) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.escrowService.refundEscrow(userId, dto);
      return {
        success: true,
        message: 'Refund processed successfully',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to process refund',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * ESCROW STATUS & INFORMATION ENDPOINTS
   */

  @Get('milestone/:milestoneId/status')
  @ApiOperation({ summary: 'Get escrow status for milestone' })
  @ApiResponse({ status: 200, description: 'Escrow status retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Milestone not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMilestoneEscrowStatus(@Param('milestoneId') milestoneId: string, @Req() req) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const status = await this.escrowService.getMilestoneEscrowStatus(milestoneId, userId);
      return {
        success: true,
        data: status,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get escrow status',
        error.status || HttpStatus.NOT_FOUND,
      );
    }
  }

  @Get('timeline/:paymentId')
  @ApiOperation({ summary: 'Get timeline events for payment' })
  @ApiResponse({ status: 200, description: 'Timeline retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getTimeline(@Param('paymentId') paymentId: string, @Req() req) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const timeline = await this.escrowService.getPaymentTimeline(paymentId, userId);
      return {
        success: true,
        data: timeline,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get timeline',
        error.status || HttpStatus.NOT_FOUND,
      );
    }
  }

  @Get('project/:projectId/escrows')
  @ApiOperation({ summary: 'Get all escrow transactions for a project' })
  @ApiResponse({ status: 200, description: 'Escrow transactions retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProjectEscrows(@Param('projectId') projectId: string, @Req() req) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const escrows = await this.escrowService.getProjectEscrows(projectId, userId);
      return {
        success: true,
        data: escrows,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get project escrows',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Put('auto-release/config')
  @ApiOperation({ summary: 'Configure auto-release for milestone' })
  @ApiResponse({ status: 200, description: 'Auto-release configured successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async configureAutoRelease(@Req() req, @Body() dto: AutoReleaseConfigDto) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.escrowService.configureAutoRelease(userId, dto);
      return {
        success: true,
        message: 'Auto-release configured successfully',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to configure auto-release',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * DISPUTE MANAGEMENT ENDPOINTS
   */

  @Post('dispute')
  @ApiOperation({ summary: 'Open dispute for milestone' })
  @ApiResponse({ status: 201, description: 'Dispute opened successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async openDispute(@Req() req, @Body() dto: OpenDisputeDto) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.disputeService.openDispute(userId, dto);
      return {
        success: true,
        message: 'Dispute opened successfully',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to open dispute',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('dispute/:disputeId/respond')
  @ApiOperation({ summary: 'Respond to dispute' })
  @ApiResponse({ status: 200, description: 'Response submitted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
  async respondToDispute(
    @Param('disputeId') disputeId: string,
    @Req() req,
    @Body() dto: RespondToDisputeDto,
  ) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.disputeService.respondToDispute(disputeId, userId, dto);
      return {
        success: true,
        message: 'Response submitted successfully',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to respond to dispute',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('dispute/:disputeId/mediate')
  @ApiOperation({ summary: 'Mediate dispute (admin only)' })
  @ApiResponse({ status: 200, description: 'Mediation decision submitted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
  async mediateDispute(
    @Param('disputeId') disputeId: string,
    @Req() req,
    @Body() dto: MediateDisputeDto,
  ) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.disputeService.mediateDispute(disputeId, userId, dto);
      return {
        success: true,
        message: 'Mediation decision submitted successfully',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to mediate dispute',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('dispute/:disputeId/accept-mediation')
  @ApiOperation({ summary: 'Accept or reject mediation decision' })
  @ApiResponse({ status: 200, description: 'Mediation response recorded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
  async acceptMediation(
    @Param('disputeId') disputeId: string,
    @Req() req,
    @Body() dto: AcceptMediationDto,
  ) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.disputeService.acceptMediation(disputeId, userId, dto);
      return {
        success: true,
        message: 'Mediation response recorded successfully',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to record mediation response',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('dispute/:disputeId')
  @ApiOperation({ summary: 'Get dispute details' })
  @ApiResponse({ status: 200, description: 'Dispute details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getDispute(@Param('disputeId') disputeId: string, @Req() req) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const dispute = await this.disputeService.getDispute(disputeId, userId);
      return {
        success: true,
        data: dispute,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get dispute details',
        error.status || HttpStatus.NOT_FOUND,
      );
    }
  }

  @Get('milestone/:milestoneId/disputes')
  @ApiOperation({ summary: 'Get all disputes for a milestone' })
  @ApiResponse({ status: 200, description: 'Disputes retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMilestoneDisputes(@Param('milestoneId') milestoneId: string, @Req() req) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const disputes = await this.disputeService.getMilestoneDisputes(milestoneId, userId);
      return {
        success: true,
        data: disputes,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get milestone disputes',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('dispute/:disputeId/escalate')
  @ApiOperation({ summary: 'Escalate dispute to higher authority' })
  @ApiResponse({ status: 200, description: 'Dispute escalated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
  async escalateDispute(
    @Param('disputeId') disputeId: string,
    @Req() req,
    @Body() dto: EscalateDisputeDto,
  ) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.disputeService.escalateDispute(disputeId, userId, dto);
      return {
        success: true,
        message: 'Dispute escalated successfully',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to escalate dispute',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('dispute/:disputeId/withdraw')
  @ApiOperation({ summary: 'Withdraw dispute' })
  @ApiResponse({ status: 200, description: 'Dispute withdrawn successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
  async withdrawDispute(
    @Param('disputeId') disputeId: string,
    @Req() req,
    @Body() dto: WithdrawDisputeDto,
  ) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.disputeService.withdrawDispute(disputeId, userId, dto);
      return {
        success: true,
        message: 'Dispute withdrawn successfully',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to withdraw dispute',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * STRIPE CONNECT ENDPOINTS
   */

  @Post('connect/create-account')
  @ApiOperation({ summary: 'Create Stripe Connect account for developer' })
  @ApiResponse({ status: 201, description: 'Connect account created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createConnectAccount(@Req() req, @Body() dto: CreateConnectAccountDto) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.stripeConnect.createConnectAccount(userId, dto);
      return {
        success: true,
        message: 'Connect account created successfully',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to create connect account',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('connect/account-link')
  @ApiOperation({ summary: 'Get onboarding link for Stripe Connect' })
  @ApiResponse({ status: 200, description: 'Onboarding link generated successfully' })
  @ApiResponse({ status: 400, description: 'Connect account not found or already onboarded' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAccountLink(@Req() req) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.stripeConnect.getAccountLink(userId);
      return {
        success: true,
        message: 'Onboarding link generated successfully',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to generate account link',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('connect/status')
  @ApiOperation({ summary: 'Get Stripe Connect account status' })
  @ApiResponse({ status: 200, description: 'Account status retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Connect account not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getConnectStatus(@Req() req) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const status = await this.stripeConnect.getAccountStatus(userId);
      return {
        success: true,
        data: status,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get account status',
        error.status || HttpStatus.NOT_FOUND,
      );
    }
  }

  @Get('connect/dashboard-link')
  @ApiOperation({ summary: 'Get Stripe Express dashboard link for developer' })
  @ApiResponse({ status: 200, description: 'Dashboard link generated successfully' })
  @ApiResponse({ status: 400, description: 'Connect account not found or not onboarded' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getDashboardLink(@Req() req) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const result = await this.stripeConnect.getDashboardLink(userId);
      return {
        success: true,
        message: 'Dashboard link generated successfully',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to generate dashboard link',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('connect/balance')
  @ApiOperation({ summary: 'Get developer Stripe Connect balance' })
  @ApiResponse({ status: 200, description: 'Balance retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Connect account not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getConnectBalance(@Req() req) {
    try {
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
      }

      const balance = await this.stripeConnect.getBalance(userId);
      return {
        success: true,
        data: balance,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get balance',
        error.status || HttpStatus.NOT_FOUND,
      );
    }
  }
}

/**
 * Separate controller for Stripe Connect webhooks (no auth guard)
 */
@ApiTags('escrow-webhooks')
@Controller('escrow')
export class EscrowWebhookController {
  private stripe: any;

  constructor(
    private readonly stripeConnect: StripeConnectService,
    private readonly configService: ConfigService,
  ) {
    const stripeSecretKey = this.configService.get('STRIPE_SECRET_KEY');
    if (stripeSecretKey) {
      this.stripe = new Stripe(stripeSecretKey, {
        apiVersion: '2025-09-30.clover' as any,
        typescript: true,
      });
    }
  }

  @Post('connect/webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stripe Connect webhook handler for account updates' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid webhook signature' })
  async handleConnectWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) {
      throw new HttpException('Missing stripe-signature header', HttpStatus.BAD_REQUEST);
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new HttpException('Raw body required for webhook verification', HttpStatus.BAD_REQUEST);
    }

    const webhookSecret = this.configService.get('STRIPE_CONNECT_WEBHOOK_SECRET') ||
                          this.configService.get('STRIPE_WEBHOOK_SECRET');

    if (!webhookSecret) {
      console.error('[EscrowWebhook] No webhook secret configured');
      throw new HttpException('Webhook secret not configured', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    let event: any;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
    } catch (err) {
      console.error('[EscrowWebhook] Signature verification failed:', err.message);
      throw new HttpException(`Webhook signature verification failed: ${err.message}`, HttpStatus.BAD_REQUEST);
    }

    console.log(`[EscrowWebhook] Received event: ${event.type}`);

    // Process asynchronously
    setImmediate(() => {
      this.processConnectWebhookEvent(event).catch((error) => {
        console.error(`[EscrowWebhook] Error processing ${event.type}:`, error);
      });
    });

    return { received: true, eventType: event.type };
  }

  private async processConnectWebhookEvent(event: any): Promise<void> {
    switch (event.type) {
      case 'account.updated':
        const account = event.data.object as any;
        console.log(`[EscrowWebhook] Account updated: ${account.id}`);
        await this.stripeConnect.updateAccountFromWebhook(account.id);
        break;

      case 'account.application.authorized':
        console.log(`[EscrowWebhook] Account application authorized`);
        break;

      case 'account.application.deauthorized':
        console.log(`[EscrowWebhook] Account application deauthorized`);
        break;

      case 'capability.updated':
        console.log(`[EscrowWebhook] Capability updated`);
        // Account capabilities changed - update account status
        const capabilityData = event.data.object as any;
        if (capabilityData.account) {
          await this.stripeConnect.updateAccountFromWebhook(capabilityData.account);
        }
        break;

      default:
        console.log(`[EscrowWebhook] Unhandled event type: ${event.type}`);
    }
  }
}
