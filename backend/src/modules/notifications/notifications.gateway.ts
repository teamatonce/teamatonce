import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { NotificationResponseDto } from './dto';
import { AppGateway } from '../../common/gateways/app.gateway';
import { TeamAtOnceGateway } from '../../websocket/teamatonce.gateway';
import { NotificationEvent } from '../../common/gateways/events.interface';

export interface RealtimeNotificationEvent {
  type: 'notification' | 'notification_read' | 'notification_deleted' | 'preferences_updated';
  data: any;
  user_id: string;
  timestamp: string;
}

@Injectable()
export class NotificationsGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsGateway.name);
  private subscriptions: Map<string, any> = new Map();

  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => AppGateway))
    private readonly socketGateway: AppGateway,
    @Inject(forwardRef(() => TeamAtOnceGateway))
    private readonly teamAtOnceGateway: TeamAtOnceGateway,
  ) {}

  async onModuleInit() {
    this.logger.log('NotificationsGateway initialized');
    
    // Temporarily disable realtime subscription to allow backend to start
    // TODO: Re-enable when database realtime server is available
    this.logger.warn('Realtime subscription disabled - notifications will work without database real-time updates');
    this.logger.log('Using Socket.IO for real-time notification delivery');
  }

  async onModuleDestroy() {
    this.logger.log('NotificationsGateway destroying subscriptions');
    
    // Clean up all subscriptions
    for (const [key, subscription] of this.subscriptions.entries()) {
      try {
        await this.db.unsubscribe(subscription);
        this.logger.log(`Unsubscribed from ${key}`);
      } catch (error) {
        this.logger.error(`Failed to unsubscribe from ${key}: ${error.message}`);
      }
    }
    
    this.subscriptions.clear();
  }

  // =============================================
  // REAL-TIME EVENT HANDLERS
  // =============================================

  private async handleNotificationTableChange(data: any): Promise<void> {
    try {
      const { eventType, new: newRecord, old: oldRecord } = data;
      
      switch (eventType) {
        case 'INSERT':
          await this.handleNewNotification(newRecord);
          break;
        case 'UPDATE':
          await this.handleNotificationUpdate(newRecord, oldRecord);
          break;
        case 'DELETE':
          await this.handleNotificationDelete(oldRecord);
          break;
        default:
          this.logger.debug(`Unhandled notification table event: ${eventType}`);
      }
    } catch (error) {
      this.logger.error(`Error handling notification table change: ${error.message}`, error.stack);
    }
  }

  private async handleNewNotification(notification: any): Promise<void> {
    try {
      const event: RealtimeNotificationEvent = {
        type: 'notification',
        data: this.formatNotification(notification),
        user_id: notification.user_id,
        timestamp: new Date().toISOString(),
      };

      await this.emitToUser(notification.user_id, event);
      this.logger.log(`New notification event emitted for user ${notification.user_id}`);
    } catch (error) {
      this.logger.error(`Failed to handle new notification: ${error.message}`, error.stack);
    }
  }

  private async handleNotificationUpdate(newNotification: any, oldNotification: any): Promise<void> {
    try {
      // Check if read status changed
      if (newNotification.is_read !== oldNotification.is_read) {
        const event: RealtimeNotificationEvent = {
          type: 'notification_read',
          data: {
            id: newNotification.id,
            is_read: newNotification.is_read,
            read_at: newNotification.read_at,
          },
          user_id: newNotification.user_id,
          timestamp: new Date().toISOString(),
        };

        await this.emitToUser(newNotification.user_id, event);
        this.logger.log(`Notification read status update emitted for user ${newNotification.user_id}`);
      }

      // Check if archived status changed
      if (newNotification.is_archived !== oldNotification.is_archived) {
        const event: RealtimeNotificationEvent = {
          type: newNotification.is_archived ? 'notification_deleted' : 'notification',
          data: {
            id: newNotification.id,
            is_archived: newNotification.is_archived,
          },
          user_id: newNotification.user_id,
          timestamp: new Date().toISOString(),
        };

        await this.emitToUser(newNotification.user_id, event);
        this.logger.log(`Notification archive status update emitted for user ${newNotification.user_id}`);
      }
    } catch (error) {
      this.logger.error(`Failed to handle notification update: ${error.message}`, error.stack);
    }
  }

  private async handleNotificationDelete(notification: any): Promise<void> {
    try {
      const event: RealtimeNotificationEvent = {
        type: 'notification_deleted',
        data: {
          id: notification.id,
        },
        user_id: notification.user_id,
        timestamp: new Date().toISOString(),
      };

      await this.emitToUser(notification.user_id, event);
      this.logger.log(`Notification deletion event emitted for user ${notification.user_id}`);
    } catch (error) {
      this.logger.error(`Failed to handle notification deletion: ${error.message}`, error.stack);
    }
  }

  // =============================================
  // PUBLIC METHODS FOR SERVICE INTEGRATION
  // =============================================

  async emitNotificationToUser(userId: string, notification: NotificationResponseDto): Promise<void> {
    try {
      const event: RealtimeNotificationEvent = {
        type: 'notification',
        data: notification,
        user_id: userId,
        timestamp: new Date().toISOString(),
      };

      await this.emitToUser(userId, event);
      this.logger.log(`Notification manually emitted to user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to emit notification to user: ${error.message}`, error.stack);
    }
  }

  async emitNotificationReadToUser(userId: string, notificationId: string, isRead: boolean, readAt?: string): Promise<void> {
    try {
      const event: RealtimeNotificationEvent = {
        type: 'notification_read',
        data: {
          id: notificationId,
          is_read: isRead,
          read_at: readAt,
        },
        user_id: userId,
        timestamp: new Date().toISOString(),
      };

      await this.emitToUser(userId, event);
      this.logger.log(`Notification read status emitted to user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to emit notification read status: ${error.message}`, error.stack);
    }
  }

  async emitNotificationDeletedToUser(userId: string, notificationId: string): Promise<void> {
    try {
      const event: RealtimeNotificationEvent = {
        type: 'notification_deleted',
        data: {
          id: notificationId,
        },
        user_id: userId,
        timestamp: new Date().toISOString(),
      };

      await this.emitToUser(userId, event);
      this.logger.log(`Notification deletion emitted to user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to emit notification deletion: ${error.message}`, error.stack);
    }
  }

  async emitPreferencesUpdatedToUser(userId: string, preferences: any): Promise<void> {
    try {
      const event: RealtimeNotificationEvent = {
        type: 'preferences_updated',
        data: preferences,
        user_id: userId,
        timestamp: new Date().toISOString(),
      };

      await this.emitToUser(userId, event);
      this.logger.log(`Notification preferences update emitted to user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to emit preferences update: ${error.message}`, error.stack);
    }
  }

  // =============================================
  // UTILITY METHODS FOR USER TARGETING
  // =============================================

  async emitToUserDevices(userId: string, event: RealtimeNotificationEvent): Promise<void> {
    try {
      // Emit to user's general channel
      await this.emitToUser(userId, event);

      // Also emit to specific device channels if needed
      // This could be extended to target specific devices or browser tabs
      const deviceChannels = [
        `user:${userId}:web`,
        `user:${userId}:mobile`,
        `user:${userId}:desktop`,
      ];

      for (const channel of deviceChannels) {
        try {
          await /* TODO: use Socket.io */ this.db.publishToChannel(channel, event);
        } catch (error) {
          // Don't log errors for device-specific channels as they might not exist
          this.logger.debug(`Could not emit to device channel ${channel}: ${error.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to emit to user devices: ${error.message}`, error.stack);
    }
  }

  async emitBulkNotificationUpdate(userId: string, notificationIds: string[], updateType: 'read' | 'deleted'): Promise<void> {
    try {
      const event: RealtimeNotificationEvent = {
        type: updateType === 'read' ? 'notification_read' : 'notification_deleted',
        data: {
          notification_ids: notificationIds,
          bulk_update: true,
        },
        user_id: userId,
        timestamp: new Date().toISOString(),
      };

      await this.emitToUser(userId, event);
      this.logger.log(`Bulk notification ${updateType} emitted to user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to emit bulk notification update: ${error.message}`, error.stack);
    }
  }

  // =============================================
  // PRIVATE HELPER METHODS
  // =============================================

  private async emitToUser(userId: string, event: RealtimeNotificationEvent): Promise<void> {
    try {
      // Emit via Socket.io gateway for real-time delivery
      const socketEvent = {
        type: event.type,
        data: event.data,
        userId: event.user_id,
        timestamp: event.timestamp,
      } as NotificationEvent;

      // Emit via AppGateway (default namespace)
      this.socketGateway.emitToUser(userId, 'notification:event', socketEvent);

      // Also emit via Team@OnceGateway (/teamatonce namespace) - this is what the frontend connects to
      this.teamAtOnceGateway.sendToUser(userId, 'notification', {
        ...socketEvent,
        notification: event.data, // Include notification data for easier access
      });

      // Also emit to storage channel for backup/persistence (non-critical, don't throw on failure)
      try {
        const channel = `user:${userId}:notifications`;
        await /* TODO: use Socket.io */ this.db.publishToChannel(channel, event);
      } catch (dbError) {
        this.logger.debug(`database backup channel not available: ${dbError.message}`);
      }
    } catch (error) {
      this.logger.error(`Failed to emit to user ${userId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  private formatNotification(notification: any): NotificationResponseDto {
    return {
      id: notification.id,
      user_id: notification.user_id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data || {},
      is_read: notification.is_read,
      is_archived: notification.is_archived,
      action_url: notification.action_url,
      priority: notification.priority,
      expires_at: notification.expires_at,
      read_at: notification.read_at,
      created_at: notification.created_at,
    };
  }

  // =============================================
  // ADMIN/SYSTEM METHODS
  // =============================================

  async emitSystemWideNotification(event: Omit<RealtimeNotificationEvent, 'user_id'>): Promise<void> {
    try {
      // This would emit to all connected users
      // For now, we'll just emit to a system channel
      await /* TODO: use Socket.io */ this.db.publishToChannel('system:notifications', {
        ...event,
        user_id: 'system',
      });
      
      this.logger.log('System-wide notification emitted');
    } catch (error) {
      this.logger.error(`Failed to emit system-wide notification: ${error.message}`, error.stack);
    }
  }

  async getActiveUserConnections(userId: string): Promise<number> {
    try {
      // This would return the number of active connections for a user
      // Since database doesn't provide this info directly, we'll return a default
      return 1;
    } catch (error) {
      this.logger.error(`Failed to get active connections for user ${userId}: ${error.message}`);
      return 0;
    }
  }

  async isUserOnline(userId: string): Promise<boolean> {
    try {
      // This would check if a user has active connections
      // For now, we'll assume users are online if they have recent activity
      return true;
    } catch (error) {
      this.logger.error(`Failed to check if user ${userId} is online: ${error.message}`);
      return false;
    }
  }
}