/**
 * WebSocket Usage Examples
 *
 * This file demonstrates how to integrate the Team@Once WebSocket Gateway
 * into your services and controllers.
 */

import { Injectable } from '@nestjs/common';
import { TeamAtOnceGateway } from '../teamatonce.gateway';

/**
 * Example: Project Service with WebSocket Integration
 */
@Injectable()
export class ProjectServiceExample {
  constructor(
    private readonly wsGateway: TeamAtOnceGateway,
  ) {}

  /**
   * Example: Send project update notification to all project members
   */
  async updateProject(projectId: string, updateData: any) {
    // Your business logic here
    // ...

    // Notify all project members about the update
    this.wsGateway.sendToProject(projectId, 'project-updated', {
      projectId,
      updateData,
      timestamp: new Date(),
    });
  }

  /**
   * Example: Notify specific user about project assignment
   */
  async assignUserToProject(userId: string, projectId: string, role: string) {
    // Your business logic here
    // ...

    // Notify the user
    this.wsGateway.sendToUser(userId, 'project-assigned', {
      projectId,
      role,
      timestamp: new Date(),
    });
  }

  /**
   * Example: Broadcast milestone completion to project
   */
  async completeMilestone(projectId: string, milestoneId: string, completedBy: string) {
    // Your business logic here
    // ...

    // Notify all project members
    this.wsGateway.sendToProject(projectId, 'milestone-completed', {
      milestoneId,
      completedBy,
      timestamp: new Date(),
    });
  }

  /**
   * Example: Get online project members
   */
  async getOnlineMembers(projectId: string): Promise<string[]> {
    return this.wsGateway.getProjectMembers(projectId);
  }

  /**
   * Example: Check if a user is currently online
   */
  isUserOnline(userId: string): boolean {
    return this.wsGateway.isUserOnline(userId);
  }
}

/**
 * Example: Message Service with WebSocket Integration
 */
@Injectable()
export class MessageServiceExample {
  constructor(
    private readonly wsGateway: TeamAtOnceGateway,
  ) {}

  /**
   * Example: Send message to project room
   */
  async sendProjectMessage(
    projectId: string,
    userId: string,
    content: string,
    type: 'text' | 'file' | 'system' = 'text',
  ) {
    // Save message to database first
    // const savedMessage = await this.saveToDatabase(...);

    // Broadcast to all project members via WebSocket
    this.wsGateway.sendToProject(projectId, 'project-message', {
      userId,
      content,
      type,
      timestamp: new Date(),
    });
  }

  /**
   * Example: Send direct message to user
   */
  async sendDirectMessage(recipientId: string, senderId: string, content: string) {
    // Save message to database
    // ...

    // Send to recipient via WebSocket
    this.wsGateway.sendToUser(recipientId, 'direct-message', {
      senderId,
      content,
      timestamp: new Date(),
    });
  }
}

/**
 * Example: Notification Service with WebSocket Integration
 */
@Injectable()
export class NotificationServiceExample {
  constructor(
    private readonly wsGateway: TeamAtOnceGateway,
  ) {}

  /**
   * Example: Send notification to specific user
   */
  async notifyUser(userId: string, notification: any) {
    // Save notification to database
    // ...

    // Send real-time notification
    this.wsGateway.sendToUser(userId, 'notification', notification);
  }

  /**
   * Example: Send notification to all project members
   */
  async notifyProjectMembers(projectId: string, notification: any) {
    this.wsGateway.sendToProject(projectId, 'notification', notification);
  }

  /**
   * Example: Broadcast system-wide notification
   */
  async broadcastSystemNotification(notification: any) {
    this.wsGateway.broadcastToAll('system-notification', notification);
  }
}

/**
 * Example: Team Service with Member Status Tracking
 */
@Injectable()
export class TeamServiceExample {
  constructor(
    private readonly wsGateway: TeamAtOnceGateway,
  ) {}

  /**
   * Example: Update team member status
   */
  async updateMemberStatus(projectId: string, memberId: string, online: boolean) {
    // Update status in database
    // await this.updateStatusInDb(memberId, online);

    // Broadcast status to project members
    this.wsGateway.updateMemberStatus(projectId, memberId, online);
  }

  /**
   * Example: Get all online team members for a project
   */
  async getOnlineTeamMembers(projectId: string): Promise<string[]> {
    const onlineMembers = this.wsGateway.getProjectMembers(projectId);
    return onlineMembers;
  }

  /**
   * Example: Check if team member is available
   */
  async isMemberAvailable(userId: string): Promise<boolean> {
    return this.wsGateway.isUserOnline(userId);
  }
}

/**
 * Example: Whiteboard Service
 */
@Injectable()
export class WhiteboardServiceExample {
  constructor(
    private readonly wsGateway: TeamAtOnceGateway,
  ) {}

  /**
   * Example: Create new whiteboard session
   */
  async createWhiteboardSession(projectId: string, sessionId: string, createdBy: string) {
    // Create session in database
    // ...

    // Notify project members about new session
    this.wsGateway.sendToProject(projectId, 'whiteboard-session-created', {
      sessionId,
      createdBy,
      timestamp: new Date(),
    });
  }

  /**
   * Example: Save whiteboard state
   */
  async saveWhiteboardState(sessionId: string, canvasData: any) {
    // Save to database
    // await this.saveToDb(sessionId, canvasData);

    // Broadcast to session participants
    this.wsGateway.sendToWhiteboard(sessionId, 'whiteboard-saved', {
      sessionId,
      timestamp: new Date(),
    });
  }

  /**
   * Example: Get active whiteboard participants
   */
  async getActiveParticipants(sessionId: string): Promise<string[]> {
    return this.wsGateway.getWhiteboardParticipants(sessionId);
  }
}

/**
 * Example: Controller with WebSocket Integration
 */
import { Controller, Post, Body, Param, Get } from '@nestjs/common';

@Controller('projects')
export class ProjectControllerExample {
  constructor(
    private readonly wsGateway: TeamAtOnceGateway,
  ) {}

  /**
   * Example: HTTP endpoint that triggers WebSocket notification
   */
  @Post(':projectId/messages')
  async sendMessage(
    @Param('projectId') projectId: string,
    @Body() messageDto: any,
  ) {
    // Save message to database
    // const message = await this.messageService.create(messageDto);

    // Broadcast via WebSocket
    this.wsGateway.sendToProject(projectId, 'new-message', {
      content: messageDto.content,
      userId: messageDto.userId,
      timestamp: new Date(),
    });

    return { success: true };
  }

  /**
   * Example: Get online project members
   */
  @Get(':projectId/online-members')
  async getOnlineMembers(@Param('projectId') projectId: string) {
    const members = this.wsGateway.getProjectMembers(projectId);
    return { members };
  }
}

/**
 * Example: Module Configuration
 *
 * To use the WebSocket gateway in your modules, import the Team@OnceWebSocketModule
 */
/*
import { Module } from '@nestjs/common';
import { TeamAtOnceWebSocketModule } from '../websocket/websocket.module';
import { ProjectServiceExample } from './project.service.example';
import { ProjectControllerExample } from './project.controller.example';

@Module({
  imports: [TeamAtOnceWebSocketModule],
  controllers: [ProjectControllerExample],
  providers: [ProjectServiceExample],
})
export class ProjectModule {}
*/
