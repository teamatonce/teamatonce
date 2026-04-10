import { Logger, UseGuards } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
// import { createAdapter } from '@socket.io/redis-adapter'; // Disabled - see afterInit()
// import { createClient } from 'redis'; // Disabled - see afterInit()
import { Server, Socket } from 'socket.io';
import { WsAuthGuard } from './guards/ws-auth.guard';
import {
  JoinProjectDto,
  LeaveProjectDto,
  JoinWhiteboardDto,
  WhiteboardUpdateDto,
  MemberStatusDto,
  ProjectMessageDto,
} from './dto/websocket.dto';
import { RoomHelper } from './interfaces/websocket.interface';

/**
 * Team@Once WebSocket Gateway
 * Handles real-time communication for the multi-tenant project outsourcing platform
 *
 * Features:
 * - Multi-tenant project rooms
 * - Whiteboard collaboration
 * - Member status tracking
 * - Real-time messaging
 * - Redis adapter for horizontal scaling
 */
@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:3003',
      'http://127.0.0.1:3003',
      'http://localhost:5173',
      'http://localhost:5175',
      'http://localhost:5176',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5175',
      'http://127.0.0.1:5176',
      'https://teamatonce.com',
      'https://www.teamatonce.com',
    ],
    credentials: true,
  },
  path: '/socket.io/',
  transports: ['websocket', 'polling'],
  namespace: '/teamatonce', // Namespace for TeamAtOnce specific events
})
export class TeamAtOnceGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TeamAtOnceGateway.name);
  private userSockets = new Map<string, Set<string>>();
  private projectMembers = new Map<string, Set<string>>(); // projectId -> Set of userIds
  private whiteboardSessions = new Map<string, Set<string>>(); // sessionId -> Set of userIds

  constructor(
    private configService: ConfigService,
  ) {}

  /**
   * Initialize WebSocket gateway with Redis adapter
   *
   * NOTE: Redis adapter is currently disabled for development.
   * To enable horizontal scaling, implement a custom IoAdapter following NestJS docs:
   * https://docs.nestjs.com/websockets/adapter#extend-socket-adapter
   */
  async afterInit(server: Server) {
    this.logger.log('Team@Once WebSocket Gateway initialized');
    this.logger.log('Redis adapter disabled - running in single-instance mode');
    this.logger.log('For production scaling, implement RedisIoAdapter');

    // TODO: Implement proper NestJS IoAdapter for Redis
    // See: https://docs.nestjs.com/websockets/adapter#extend-socket-adapter
    // Example: Create RedisIoAdapter extending IoAdapter
    // Then in main.ts: app.useWebSocketAdapter(new RedisIoAdapter(app));
  }

  /**
   * Handle new client connections
   */
  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    const projectId = client.handshake.query.projectId as string;
    const teamMemberId = client.handshake.query.teamMemberId as string;

    this.logger.log(`Client connecting: ${client.id} (User: ${userId || 'anonymous'})`);

    // Allow connections without userId (for unauthenticated users)
    if (!userId || userId === 'undefined') {
      this.logger.log(`Client ${client.id} connected without user ID`);
      return;
    }

    // Track user sockets
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId).add(client.id);

    // Join user-specific room
    client.join(RoomHelper.user(userId));
    this.logger.log(`Client ${client.id} joined user room: ${RoomHelper.user(userId)}`);

    // If projectId is provided, join the project room
    if (projectId && projectId !== 'undefined') {
      this.joinProjectRoom(client, projectId, userId, teamMemberId);
    }
  }

  /**
   * Handle client disconnections
   */
  handleDisconnect(client: Socket) {
    const userId = client.handshake.query.userId as string;
    const projectId = client.handshake.query.projectId as string;
    const teamMemberId = client.handshake.query.teamMemberId as string;

    this.logger.log(`Client disconnecting: ${client.id} (User: ${userId || 'anonymous'})`);

    if (userId && userId !== 'undefined') {
      const userSockets = this.userSockets.get(userId);
      if (userSockets) {
        userSockets.delete(client.id);

        // If this was the user's last connection
        if (userSockets.size === 0) {
          this.userSockets.delete(userId);

          // Update member status to offline if applicable
          if (teamMemberId && teamMemberId !== 'undefined' && projectId && projectId !== 'undefined') {
            this.updateMemberStatus(projectId, teamMemberId, false);
          }
        }
      }

      // Leave rooms
      client.leave(RoomHelper.user(userId));
      if (projectId && projectId !== 'undefined') {
        client.leave(RoomHelper.project(projectId));
        this.removeFromProjectMembers(projectId, userId);
      }
    }
  }

  /**
   * Join a project room
   */
  @SubscribeMessage('join-project')
  handleJoinProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinProjectDto,
  ) {
    this.joinProjectRoom(client, payload.projectId, payload.userId, payload.teamMemberId);
    client.emit('project-joined', { projectId: payload.projectId, success: true });
  }

  /**
   * Leave a project room
   */
  @SubscribeMessage('leave-project')
  handleLeaveProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LeaveProjectDto,
  ) {
    const userId = client.handshake.query.userId as string;
    const roomName = RoomHelper.project(payload.projectId);

    client.leave(roomName);
    this.removeFromProjectMembers(payload.projectId, userId);

    this.logger.log(`Client ${client.id} left project room: ${roomName}`);
    client.emit('project-left', { projectId: payload.projectId, success: true });
  }

  /**
   * Join a whiteboard session
   */
  @SubscribeMessage('join-whiteboard')
  handleJoinWhiteboard(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinWhiteboardDto,
  ) {
    const roomName = RoomHelper.whiteboard(payload.sessionId);
    client.join(roomName);

    // Track whiteboard session members
    if (!this.whiteboardSessions.has(payload.sessionId)) {
      this.whiteboardSessions.set(payload.sessionId, new Set());
    }
    this.whiteboardSessions.get(payload.sessionId).add(payload.userId);

    // Notify other users in the whiteboard
    client.to(roomName).emit('user-joined-whiteboard', {
      userId: payload.userId,
      userName: payload.userName,
      timestamp: new Date(),
    });

    this.logger.log(
      `User ${payload.userId} joined whiteboard session ${payload.sessionId}`,
    );

    client.emit('whiteboard-joined', {
      sessionId: payload.sessionId,
      success: true,
      participants: Array.from(this.whiteboardSessions.get(payload.sessionId) || []),
    });
  }

  /**
   * Handle whiteboard updates (drawing)
   */
  @SubscribeMessage('whiteboard-update')
  handleWhiteboardUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: WhiteboardUpdateDto,
  ) {
    const roomName = RoomHelper.whiteboard(payload.sessionId);

    // Broadcast to all clients in the whiteboard session except the sender
    client.to(roomName).emit('whiteboard-update', {
      userId: payload.userId,
      canvasData: payload.canvasData,
      timestamp: new Date(),
    });

    this.logger.debug(`Whiteboard update broadcast to session ${payload.sessionId}`);
  }

  /**
   * Handle project messages (legacy)
   */
  @SubscribeMessage('project-message')
  async handleProjectMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ProjectMessageDto,
  ) {
    try {
      const roomName = RoomHelper.project(payload.projectId);

      // Broadcast message to all clients in the project room
      this.server.to(roomName).emit('project-message', {
        userId: payload.userId,
        content: payload.content,
        type: payload.type || 'text',
        metadata: payload.metadata,
        timestamp: new Date(),
      });

      this.logger.log(`Message sent to project room ${payload.projectId}`);

      client.emit('message-sent', { success: true });
    } catch (error) {
      this.logger.error('Error handling project message:', error);
      client.emit('message-error', { success: false, error: 'Failed to send message' });
    }
  }

  /**
   * Handle send-message event (for real-time chat)
   * This is used by the frontend to send messages that get saved to DB
   */
  @SubscribeMessage('send-message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: {
      projectId: string;
      conversationId?: string;
      content: string;
      type?: string;
      attachments?: any[];
    },
  ) {
    try {
      const roomName = RoomHelper.project(payload.projectId);

      // This event is received from client but actual message saving
      // is done via REST API. Here we just acknowledge receipt.
      // The REST API will handle broadcasting via sendToProject()

      this.logger.log(
        `Received send-message event for project ${payload.projectId}`,
      );

      client.emit('message-acknowledged', {
        success: true,
        message: 'Message will be processed via API',
      });
    } catch (error) {
      this.logger.error('Error handling send-message:', error);
      client.emit('message-error', {
        success: false,
        error: 'Failed to process message',
      });
    }
  }

  /**
   * Handle member status updates
   */
  @SubscribeMessage('member-status-update')
  handleMemberStatusUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MemberStatusDto,
  ) {
    if (payload.projectId) {
      this.updateMemberStatus(payload.projectId, payload.teamMemberId, payload.online);
    }
    client.emit('status-updated', { success: true });
  }

  /**
   * Generic join room handler
   */
  @SubscribeMessage('join-room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() room: string,
  ) {
    client.join(room);
    this.logger.log(`Client ${client.id} joined room: ${room}`);
    client.emit('room-joined', { room, success: true });
  }

  /**
   * Generic leave room handler
   */
  @SubscribeMessage('leave-room')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() room: string,
  ) {
    client.leave(room);
    this.logger.log(`Client ${client.id} left room: ${room}`);
    client.emit('room-left', { room, success: true });
  }

  /**
   * Ping/Pong for connection health check
   */
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong', { timestamp: Date.now() });
  }

  // ============================================
  // Video Call Events
  // ============================================

  /**
   * Handle start-call event
   * Notifies all users in the project/conversation about an incoming call
   */
  @SubscribeMessage('start-call')
  handleStartCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: {
      sessionId: string;
      projectId: string;
      callerId: string;
      callerName: string;
      callerAvatar?: string;
      callType: 'audio' | 'video';
      conversationId?: string;
      inviteeIds?: string[];
    },
  ) {
    this.logger.log(
      `Video call started: ${payload.sessionId} by ${payload.callerName} (${payload.callType})`,
    );

    const callData = {
      sessionId: payload.sessionId,
      projectId: payload.projectId,
      callerId: payload.callerId,
      callerName: payload.callerName,
      callerAvatar: payload.callerAvatar,
      callType: payload.callType,
      conversationId: payload.conversationId,
      timestamp: new Date(),
    };

    // If specific invitees are provided, notify only them
    if (payload.inviteeIds && payload.inviteeIds.length > 0) {
      payload.inviteeIds.forEach((inviteeId) => {
        if (inviteeId !== payload.callerId) {
          this.sendToUser(inviteeId, 'incoming-call', callData);
        }
      });
    } else {
      // Otherwise, notify all users in the project room except the caller
      const roomName = RoomHelper.project(payload.projectId);
      client.to(roomName).emit('incoming-call', callData);
    }

    client.emit('call-started', { sessionId: payload.sessionId, success: true });
  }

  /**
   * Handle accept-call event
   * Notifies the caller that someone accepted their call
   */
  @SubscribeMessage('accept-call')
  handleAcceptCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: {
      sessionId: string;
      participantId: string;
      participantName: string;
    },
  ) {
    this.logger.log(
      `Call accepted: ${payload.sessionId} by ${payload.participantName}`,
    );

    // Broadcast to everyone in the video session room
    const roomName = `video:${payload.sessionId}`;
    client.join(roomName);

    this.server.to(roomName).emit('call-accepted', {
      sessionId: payload.sessionId,
      participantId: payload.participantId,
      participantName: payload.participantName,
      timestamp: new Date(),
    });
  }

  /**
   * Handle decline-call event
   * Notifies the caller that someone declined their call
   */
  @SubscribeMessage('decline-call')
  handleDeclineCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: {
      sessionId: string;
      participantId: string;
      participantName: string;
    },
  ) {
    this.logger.log(
      `Call declined: ${payload.sessionId} by ${payload.participantName}`,
    );

    // Broadcast to everyone in the video session room
    const roomName = `video:${payload.sessionId}`;

    this.server.to(roomName).emit('call-declined', {
      sessionId: payload.sessionId,
      participantId: payload.participantId,
      participantName: payload.participantName,
      timestamp: new Date(),
    });
  }

  /**
   * Handle end-call event
   * Notifies all participants that the call has ended
   */
  @SubscribeMessage('end-call')
  handleEndCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: {
      sessionId: string;
      endedBy: string;
    },
  ) {
    this.logger.log(`Call ended: ${payload.sessionId} by ${payload.endedBy}`);

    // Broadcast to everyone in the video session room
    const roomName = `video:${payload.sessionId}`;

    this.server.to(roomName).emit('call-ended', {
      sessionId: payload.sessionId,
      endedBy: payload.endedBy,
      timestamp: new Date(),
    });

    // Clean up the room
    this.server.in(roomName).socketsLeave(roomName);
  }

  /**
   * Handle join-video-room event
   * Used when a participant joins a video session
   */
  @SubscribeMessage('join-video-room')
  handleJoinVideoRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: {
      sessionId: string;
      userId: string;
      userName: string;
    },
  ) {
    const roomName = `video:${payload.sessionId}`;
    client.join(roomName);

    this.logger.log(
      `User ${payload.userName} joined video room: ${roomName}`,
    );

    // Notify others in the room
    client.to(roomName).emit('participant-joined', {
      sessionId: payload.sessionId,
      userId: payload.userId,
      displayName: payload.userName,
      timestamp: new Date(),
    });

    client.emit('video-room-joined', { sessionId: payload.sessionId, success: true });
  }

  /**
   * Handle leave-video-room event
   * Used when a participant leaves a video session
   */
  @SubscribeMessage('leave-video-room')
  handleLeaveVideoRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: {
      sessionId: string;
      userId: string;
      userName: string;
    },
  ) {
    const roomName = `video:${payload.sessionId}`;

    // Notify others in the room
    client.to(roomName).emit('participant-left', {
      sessionId: payload.sessionId,
      userId: payload.userId,
      displayName: payload.userName,
      timestamp: new Date(),
    });

    client.leave(roomName);

    this.logger.log(
      `User ${payload.userName} left video room: ${roomName}`,
    );
  }

  // ============================================
  // Public methods for external services
  // ============================================

  /**
   * Send message to a specific user
   */
  sendToUser(userId: string, event: string, data: any) {
    const roomId = RoomHelper.user(userId);
    this.server.to(roomId).emit(event, data);
    this.logger.debug(`Sent ${event} to user ${userId}`);
  }

  /**
   * Send message to a project room
   */
  sendToProject(projectId: string, event: string, data: any) {
    const roomId = RoomHelper.project(projectId);
    this.server.to(roomId).emit(event, data);
    this.logger.debug(`Sent ${event} to project ${projectId}`);
  }

  /**
   * Send message to a whiteboard session
   */
  sendToWhiteboard(sessionId: string, event: string, data: any) {
    const roomId = RoomHelper.whiteboard(sessionId);
    this.server.to(roomId).emit(event, data);
    this.logger.debug(`Sent ${event} to whiteboard ${sessionId}`);
  }

  /**
   * Broadcast to all connected clients
   */
  broadcastToAll(event: string, data: any) {
    this.server.emit(event, data);
    this.logger.debug(`Broadcast ${event} to all clients`);
  }

  /**
   * Update member status and notify project room
   */
  updateMemberStatus(projectId: string, memberId: string, online: boolean) {
    const roomId = RoomHelper.project(projectId);
    this.server.to(roomId).emit('member-status-update', {
      memberId,
      online,
      timestamp: new Date(),
    });
    this.logger.log(`Member ${memberId} status updated: ${online ? 'online' : 'offline'}`);
  }

  // ============================================
  // Private helper methods
  // ============================================

  /**
   * Join a project room helper
   */
  private joinProjectRoom(
    client: Socket,
    projectId: string,
    userId: string,
    teamMemberId?: string,
  ) {
    const roomName = RoomHelper.project(projectId);
    client.join(roomName);

    // Track project members
    if (!this.projectMembers.has(projectId)) {
      this.projectMembers.set(projectId, new Set());
    }
    this.projectMembers.get(projectId).add(userId);

    this.logger.log(`Client ${client.id} joined project room: ${roomName}`);

    // Update member status to online if team member ID is provided
    if (teamMemberId && teamMemberId !== 'undefined') {
      this.updateMemberStatus(projectId, teamMemberId, true);
    }
  }

  /**
   * Remove user from project members tracking
   */
  private removeFromProjectMembers(projectId: string, userId: string) {
    const members = this.projectMembers.get(projectId);
    if (members) {
      members.delete(userId);
      if (members.size === 0) {
        this.projectMembers.delete(projectId);
      }
    }
  }

  /**
   * Get online members for a project
   */
  getProjectMembers(projectId: string): string[] {
    return Array.from(this.projectMembers.get(projectId) || []);
  }

  /**
   * Get active whiteboard participants
   */
  getWhiteboardParticipants(sessionId: string): string[] {
    return Array.from(this.whiteboardSessions.get(sessionId) || []);
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId) && this.userSockets.get(userId).size > 0;
  }
}
