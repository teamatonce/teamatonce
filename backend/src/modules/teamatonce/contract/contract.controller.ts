import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ContractService } from './contract.service';
import { SupportService } from './support.service';
import { PaymentService } from './payment.service';
import {
  CreateContractDto,
  UpdateContractDto,
  SignatureDto,
  ContractResponseDto,
} from './dto/contract.dto';
import {
  CreatePaymentDto,
  UpdatePaymentDto,
  ProcessPaymentDto,
  CreateMilestonePaymentDto,
  PaymentResponseDto,
} from './dto/payment.dto';
import {
  CreateSupportPackageDto,
  UpdateSupportPackageDto,
  CreateProjectSupportDto,
  UpdateProjectSupportDto,
  CreateEnhancementProposalDto,
  UpdateEnhancementProposalDto,
  CreateReportDto,
  UpdateReportDto,
  SupportPackageResponseDto,
  EnhancementProposalResponseDto,
  ReportResponseDto,
} from './dto/support.dto';

@ApiTags('Contract & Payment Management')
@Controller('teamatonce/contract')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ContractController {
  constructor(
    private readonly contractService: ContractService,
    private readonly paymentService: PaymentService,
    private readonly supportService: SupportService,
  ) {}

  // ============================================
  // CONTRACT ENDPOINTS
  // ============================================

  @Get('project/:projectId')
  @ApiOperation({ summary: 'Get contract for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Contract retrieved successfully',
    type: ContractResponseDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Contract not found' })
  async getProjectContract(@Param('projectId') projectId: string) {
    return this.contractService.getProjectContract(projectId);
  }

  @Post('project/:projectId')
  @ApiOperation({ summary: 'Create a new contract for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Contract created successfully',
    type: ContractResponseDto,
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Contract already exists' })
  async createContract(
    @Param('projectId') projectId: string,
    @Body() dto: CreateContractDto,
    @Request() req: any,
  ) {
    const userId = req.user.sub || req.user.userId;
    return this.contractService.createContract(projectId, userId, dto);
  }

  @Put(':contractId')
  @ApiOperation({ summary: 'Update contract details' })
  @ApiParam({ name: 'contractId', description: 'Contract ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Contract updated successfully',
    type: ContractResponseDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Contract not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Cannot update signed contract' })
  async updateContract(@Param('contractId') contractId: string, @Body() dto: UpdateContractDto) {
    return this.contractService.updateContract(contractId, dto);
  }

  @Post(':contractId/sign/client')
  @ApiOperation({ summary: 'Client signs the contract (digital signature)' })
  @ApiParam({ name: 'contractId', description: 'Contract ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Contract signed by client successfully',
    type: ContractResponseDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Contract not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Contract already signed' })
  async signContractByClient(
    @Param('contractId') contractId: string,
    @Body() signatureDto: SignatureDto,
    @Request() req: any,
  ) {
    const userId = req.user.sub || req.user.userId;
    return this.contractService.signContractByClient(contractId, userId, signatureDto);
  }

  @Post(':contractId/sign/company')
  @ApiOperation({ summary: 'Company signs the contract (digital signature)' })
  @ApiParam({ name: 'contractId', description: 'Contract ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Contract signed by company successfully',
    type: ContractResponseDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Contract not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Contract already signed' })
  async signContractByCompany(
    @Param('contractId') contractId: string,
    @Body() signatureDto: SignatureDto,
    @Request() req: any,
  ) {
    const userId = req.user.sub || req.user.userId;
    return this.contractService.signContractByCompany(contractId, userId, signatureDto);
  }

  @Put(':contractId/cancel')
  @ApiOperation({ summary: 'Cancel/Terminate a contract' })
  @ApiParam({ name: 'contractId', description: 'Contract ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Contract cancelled successfully',
    type: ContractResponseDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Contract not found' })
  async cancelContract(
    @Param('contractId') contractId: string,
    @Body('reason') reason?: string,
  ) {
    return this.contractService.cancelContract(contractId, reason);
  }

  @Put(':contractId/complete')
  @ApiOperation({ summary: 'Mark contract as completed' })
  @ApiParam({ name: 'contractId', description: 'Contract ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Contract marked as completed',
    type: ContractResponseDto,
  })
  async completeContract(@Param('contractId') contractId: string) {
    return this.contractService.completeContract(contractId);
  }

  @Get('project/:projectId/history')
  @ApiOperation({ summary: 'Get contract history for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Contract history retrieved successfully',
    type: [ContractResponseDto],
  })
  async getContractHistory(@Param('projectId') projectId: string) {
    return this.contractService.getContractHistory(projectId);
  }

  @Get('details/:contractId')
  @ApiOperation({ summary: 'Get contract details by ID' })
  @ApiParam({ name: 'contractId', description: 'Contract ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Contract details retrieved',
    type: ContractResponseDto,
  })
  async getContractById(@Param('contractId') contractId: string) {
    return this.contractService.getContractById(contractId);
  }

  // ============================================
  // PAYMENT ENDPOINTS
  // ============================================

  @Get('payment/project/:projectId')
  @ApiOperation({ summary: 'Get all payments for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payments retrieved successfully',
    type: [PaymentResponseDto],
  })
  async getProjectPayments(@Param('projectId') projectId: string) {
    return this.paymentService.getProjectPayments(projectId);
  }

  @Get('payment/:paymentId')
  @ApiOperation({ summary: 'Get payment details by ID' })
  @ApiParam({ name: 'paymentId', description: 'Payment ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment retrieved successfully',
    type: PaymentResponseDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Payment not found' })
  async getPaymentById(@Param('paymentId') paymentId: string) {
    return this.paymentService.getPaymentById(paymentId);
  }

  @Post('payment/project/:projectId')
  @ApiOperation({ summary: 'Create a new payment' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Payment created successfully',
    type: PaymentResponseDto,
  })
  async createPayment(
    @Param('projectId') projectId: string,
    @Body() dto: CreatePaymentDto,
    @Request() req: any,
  ) {
    const userId = req.user.sub || req.user.userId;
    return this.paymentService.createPayment(projectId, userId, dto);
  }

  @Put('payment/:paymentId')
  @ApiOperation({ summary: 'Update payment details' })
  @ApiParam({ name: 'paymentId', description: 'Payment ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment updated successfully',
    type: PaymentResponseDto,
  })
  async updatePayment(@Param('paymentId') paymentId: string, @Body() dto: UpdatePaymentDto) {
    return this.paymentService.updatePayment(paymentId, dto);
  }

  @Post('payment/:paymentId/process')
  @ApiOperation({ summary: 'Process a payment (mark as completed with transaction details)' })
  @ApiParam({ name: 'paymentId', description: 'Payment ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment processed successfully',
    type: PaymentResponseDto,
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Payment already processed' })
  async processPayment(@Param('paymentId') paymentId: string, @Body() dto: ProcessPaymentDto) {
    return this.paymentService.processPayment(paymentId, dto);
  }

  @Put('payment/:paymentId/fail')
  @ApiOperation({ summary: 'Mark payment as failed' })
  @ApiParam({ name: 'paymentId', description: 'Payment ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment marked as failed',
    type: PaymentResponseDto,
  })
  async markPaymentFailed(@Param('paymentId') paymentId: string, @Body('reason') reason?: string) {
    return this.paymentService.markPaymentFailed(paymentId, reason);
  }

  // Milestone Payment Endpoints
  @Get('payment/milestone/:milestoneId')
  @ApiOperation({ summary: 'Get payment for a specific milestone' })
  @ApiParam({ name: 'milestoneId', description: 'Milestone ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Milestone payment retrieved',
    type: PaymentResponseDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Payment not found' })
  async getMilestonePayment(@Param('milestoneId') milestoneId: string) {
    return this.paymentService.getMilestonePayment(milestoneId);
  }

  @Post('payment/milestone/:milestoneId/project/:projectId')
  @ApiOperation({ summary: 'Create payment for a milestone' })
  @ApiParam({ name: 'milestoneId', description: 'Milestone ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Milestone payment created',
    type: PaymentResponseDto,
  })
  async createMilestonePayment(
    @Param('projectId') projectId: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: CreateMilestonePaymentDto,
    @Request() req: any,
  ) {
    const userId = req.user.sub || req.user.userId;
    return this.paymentService.createMilestonePayment(projectId, milestoneId, userId, dto);
  }

  @Post('payment/milestone/:milestoneId/release')
  @ApiOperation({ summary: 'Release milestone payment after approval' })
  @ApiParam({ name: 'milestoneId', description: 'Milestone ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Milestone payment released',
    type: PaymentResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Milestone must be approved or payment already released',
  })
  async releaseMilestonePayment(@Param('milestoneId') milestoneId: string) {
    return this.paymentService.releaseMilestonePayment(milestoneId);
  }

  @Get('payment/project/:projectId/stats')
  @ApiOperation({ summary: 'Get payment statistics for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment statistics retrieved',
  })
  async getProjectPaymentStats(@Param('projectId') projectId: string) {
    return this.paymentService.getProjectPaymentStats(projectId);
  }

  // ============================================
  // SUPPORT PACKAGE ENDPOINTS
  // ============================================

  @Get('support/packages')
  @ApiOperation({ summary: 'Get all available support packages (templates)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Support packages retrieved',
    type: [SupportPackageResponseDto],
  })
  async getSupportPackages() {
    return this.supportService.getSupportPackages();
  }

  @Get('support/package/:packageId')
  @ApiOperation({ summary: 'Get support package details' })
  @ApiParam({ name: 'packageId', description: 'Support package ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Support package retrieved',
    type: SupportPackageResponseDto,
  })
  async getSupportPackageById(@Param('packageId') packageId: string) {
    return this.supportService.getSupportPackageById(packageId);
  }

  @Post('support/package/project/:projectId')
  @ApiOperation({ summary: 'Create a support package (admin only)' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Support package created',
    type: SupportPackageResponseDto,
  })
  async createSupportPackage(
    @Param('projectId') projectId: string,
    @Body() dto: CreateSupportPackageDto,
    @Request() req: any,
  ) {
    const userId = req.user.sub || req.user.userId;
    return this.supportService.createSupportPackage(projectId, userId, dto);
  }

  @Put('support/package/:packageId')
  @ApiOperation({ summary: 'Update support package' })
  @ApiParam({ name: 'packageId', description: 'Support package ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Support package updated',
    type: SupportPackageResponseDto,
  })
  async updateSupportPackage(
    @Param('packageId') packageId: string,
    @Body() dto: UpdateSupportPackageDto,
  ) {
    return this.supportService.updateSupportPackage(packageId, dto);
  }

  @Delete('support/package/:packageId')
  @ApiOperation({ summary: 'Delete support package' })
  @ApiParam({ name: 'packageId', description: 'Support package ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Support package deleted' })
  async deleteSupportPackage(@Param('packageId') packageId: string) {
    return this.supportService.deleteSupportPackage(packageId);
  }

  // Project Support Subscription Endpoints
  @Get('support/project/:projectId')
  @ApiOperation({ summary: 'Get active support subscription for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Project support retrieved',
    type: SupportPackageResponseDto,
  })
  async getProjectSupport(@Param('projectId') projectId: string) {
    return this.supportService.getProjectSupport(projectId);
  }

  @Post('support/project/:projectId/subscribe')
  @ApiOperation({ summary: 'Subscribe project to a support package' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Project subscribed to support package',
    type: SupportPackageResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Project already has active support',
  })
  async createProjectSupport(
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectSupportDto,
    @Request() req: any,
  ) {
    const userId = req.user.sub || req.user.userId;
    return this.supportService.createProjectSupport(projectId, userId, dto);
  }

  @Put('support/:supportId')
  @ApiOperation({ summary: 'Update project support subscription' })
  @ApiParam({ name: 'supportId', description: 'Support subscription ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Support subscription updated',
    type: SupportPackageResponseDto,
  })
  async updateProjectSupport(
    @Param('supportId') supportId: string,
    @Body() dto: UpdateProjectSupportDto,
  ) {
    return this.supportService.updateProjectSupport(supportId, dto);
  }

  @Put('support/:supportId/cancel')
  @ApiOperation({ summary: 'Cancel project support subscription' })
  @ApiParam({ name: 'supportId', description: 'Support subscription ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Support subscription cancelled',
    type: SupportPackageResponseDto,
  })
  async cancelProjectSupport(@Param('supportId') supportId: string) {
    return this.supportService.cancelProjectSupport(supportId);
  }

  @Post('support/:supportId/hours/:hours')
  @ApiOperation({ summary: 'Increment used support hours' })
  @ApiParam({ name: 'supportId', description: 'Support subscription ID' })
  @ApiParam({ name: 'hours', description: 'Hours to add' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Support hours updated',
    type: SupportPackageResponseDto,
  })
  async incrementSupportHours(
    @Param('supportId') supportId: string,
    @Param('hours') hours: number,
  ) {
    return this.supportService.incrementSupportHours(supportId, Number(hours));
  }

  // ============================================
  // ENHANCEMENT PROPOSAL ENDPOINTS
  // ============================================

  @Post('enhancement/project/:projectId')
  @ApiOperation({ summary: 'Create enhancement proposal for post-project improvements' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Enhancement proposal created',
    type: EnhancementProposalResponseDto,
  })
  async createEnhancementProposal(
    @Param('projectId') projectId: string,
    @Body() dto: CreateEnhancementProposalDto,
  ) {
    return this.supportService.createEnhancementProposal(projectId, dto);
  }

  @Get('enhancement/project/:projectId')
  @ApiOperation({ summary: 'Get all enhancement proposals for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Enhancement proposals retrieved',
    type: [EnhancementProposalResponseDto],
  })
  async getProjectEnhancementProposals(@Param('projectId') projectId: string) {
    return this.supportService.getProjectEnhancementProposals(projectId);
  }

  @Get('enhancement/:proposalId')
  @ApiOperation({ summary: 'Get enhancement proposal details' })
  @ApiParam({ name: 'proposalId', description: 'Proposal ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Enhancement proposal retrieved',
    type: EnhancementProposalResponseDto,
  })
  async getEnhancementProposalById(@Param('proposalId') proposalId: string) {
    return this.supportService.getEnhancementProposalById(proposalId);
  }

  @Put('enhancement/:proposalId')
  @ApiOperation({ summary: 'Update enhancement proposal' })
  @ApiParam({ name: 'proposalId', description: 'Proposal ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Enhancement proposal updated',
    type: EnhancementProposalResponseDto,
  })
  async updateEnhancementProposal(
    @Param('proposalId') proposalId: string,
    @Body() dto: UpdateEnhancementProposalDto,
  ) {
    return this.supportService.updateEnhancementProposal(proposalId, dto);
  }

  // ============================================
  // REPORT ENDPOINTS (uses reports table)
  // ============================================

  @Post('report')
  @ApiOperation({ summary: 'Create a new report' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Report created',
    type: ReportResponseDto,
  })
  async createReport(
    @Body() dto: CreateReportDto,
    @Request() req: any,
  ) {
    const userId = req.user.sub || req.user.userId;
    return this.supportService.createReport(userId, dto);
  }

  @Get('report/target/:targetId')
  @ApiOperation({ summary: 'Get all reports for a target' })
  @ApiParam({ name: 'targetId', description: 'Target ID (project, user, etc.)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Reports retrieved',
    type: [ReportResponseDto],
  })
  async getReportsByTarget(
    @Param('targetId') targetId: string,
    @Request() req: any,
  ) {
    const { status, reason } = req.query;
    return this.supportService.getReportsByTarget(targetId, { status, reason });
  }

  @Get('report/all')
  @ApiOperation({ summary: 'Get all reports (admin)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'All reports retrieved',
    type: [ReportResponseDto],
  })
  async getAllReports(@Request() req: any) {
    const { status, reportType, reason } = req.query;
    return this.supportService.getAllReports({ status, reportType, reason });
  }

  @Get('report/:reportId')
  @ApiOperation({ summary: 'Get report details' })
  @ApiParam({ name: 'reportId', description: 'Report ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Report retrieved',
    type: ReportResponseDto,
  })
  async getReportById(@Param('reportId') reportId: string) {
    return this.supportService.getReportById(reportId);
  }

  @Put('report/:reportId')
  @ApiOperation({ summary: 'Update report (admin review)' })
  @ApiParam({ name: 'reportId', description: 'Report ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Report updated',
    type: ReportResponseDto,
  })
  async updateReport(
    @Param('reportId') reportId: string,
    @Body() dto: UpdateReportDto,
    @Request() req: any,
  ) {
    const reviewerId = req.user.sub || req.user.userId;
    return this.supportService.updateReport(reportId, reviewerId, dto);
  }

  @Delete('report/:reportId')
  @ApiOperation({ summary: 'Delete report' })
  @ApiParam({ name: 'reportId', description: 'Report ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Report deleted' })
  async deleteReport(@Param('reportId') reportId: string) {
    return this.supportService.deleteReport(reportId);
  }

  @Get('report/user/my-reports')
  @ApiOperation({ summary: 'Get reports submitted by current user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User reports retrieved',
    type: [ReportResponseDto],
  })
  async getUserReports(@Request() req: any) {
    const userId = req.user.sub || req.user.userId;
    return this.supportService.getUserReports(userId);
  }

  @Get('report/user/against-me')
  @ApiOperation({ summary: 'Get reports filed against current user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Reports against user retrieved',
    type: [ReportResponseDto],
  })
  async getReportsAgainstUser(@Request() req: any) {
    const userId = req.user.sub || req.user.userId;
    return this.supportService.getReportsAgainstUser(userId);
  }
}
