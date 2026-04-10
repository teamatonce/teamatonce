# Team@Once WebSocket Module

## Overview

This module provides real-time communication capabilities for the Team@Once platform, a multi-tenant project outsourcing platform. It enables real-time features such as project messaging, whiteboard collaboration, and member status tracking.

## Features

- **Multi-tenant Architecture**: Isolated project rooms for different companies/clients
- **Redis Adapter**: Horizontal scaling support across multiple server instances
- **JWT Authentication**: Secure WebSocket connections with JWT token validation
- **Project Rooms**: Real-time communication within project contexts
- **Whiteboard Collaboration**: Live collaborative drawing sessions
- **Member Status Tracking**: Online/offline presence tracking
- **Real-time Messaging**: Instant project-specific messaging

## Architecture

### Components

1. **Team@OnceGateway** (`teamatonce.gateway.ts`)
   - Main WebSocket gateway with Socket.IO
   - Handles all real-time events and room management
   - Namespace: `/teamatonce`

2. **WsAuthGuard** (`guards/ws-auth.guard.ts`)
   - JWT token validation for WebSocket connections
   - Extracts user information from tokens

3. **DTOs** (`dto/websocket.dto.ts`)
   - Type-safe data transfer objects for WebSocket events
   - Validation using class-validator

4. **Interfaces** (`interfaces/websocket.interface.ts`)
   - TypeScript interfaces for WebSocket data structures
   - Room naming conventions and helpers

## Events

### Client -> Server Events

#### `join-project`
Join a project room to receive project-specific updates.

```typescript
{
  projectId: string;
  userId: string;
  teamMemberId?: string;
}
```

#### `leave-project`
Leave a project room.

```typescript
{
  projectId: string;
}
```

#### `join-whiteboard`
Join a whiteboard collaboration session.

```typescript
{
  sessionId: string;
  projectId: string;
  userId: string;
  userName: string;
}
```

#### `whiteboard-update`
Send drawing/canvas updates to whiteboard session.

```typescript
{
  sessionId: string;
  projectId: string;
  userId: string;
  canvasData: any;
}
```

#### `project-message`
Send a message to the project room.

```typescript
{
  projectId: string;
  userId: string;
  content: string;
  type?: string;
  metadata?: any;
}
```

#### `member-status-update`
Update member online/offline status.

```typescript
{
  teamMemberId: string;
  online: boolean;
  projectId?: string;
}
```

#### `ping`
Health check ping.

### Server -> Client Events

#### `project-joined`
Confirmation of joining a project room.

```typescript
{
  projectId: string;
  success: boolean;
}
```

#### `project-left`
Confirmation of leaving a project room.

```typescript
{
  projectId: string;
  success: boolean;
}
```

#### `whiteboard-joined`
Confirmation of joining whiteboard with participant list.

```typescript
{
  sessionId: string;
  success: boolean;
  participants: string[];
}
```

#### `user-joined-whiteboard`
Notification when another user joins the whiteboard.

```typescript
{
  userId: string;
  userName: string;
  timestamp: Date;
}
```

#### `whiteboard-update`
Whiteboard canvas update from another user.

```typescript
{
  userId: string;
  canvasData: any;
  timestamp: Date;
}
```

#### `project-message`
New message in the project room.

```typescript
{
  userId: string;
  content: string;
  type: string;
  metadata?: any;
  timestamp: Date;
}
```

#### `member-status-update`
Member online/offline status change.

```typescript
{
  memberId: string;
  online: boolean;
  timestamp: Date;
}
```

#### `pong`
Response to ping health check.

```typescript
{
  timestamp: number;
}
```

## Usage

### Backend Integration

The gateway is automatically initialized when the `Team@OnceWebSocketModule` is imported into `app.module.ts`.

#### Inject Gateway into Services

```typescript
import { Injectable } from '@nestjs/common';
import { Team@OnceGateway } from '../websocket/teamatonce.gateway';

@Injectable()
export class ProjectService {
  constructor(
    private readonly wsGateway: Team@OnceGateway,
  ) {}

  async notifyProjectUpdate(projectId: string, data: any) {
    this.wsGateway.sendToProject(projectId, 'project-update', data);
  }

  async notifyUser(userId: string, data: any) {
    this.wsGateway.sendToUser(userId, 'notification', data);
  }
}
```

#### Public Gateway Methods

```typescript
// Send to specific user
wsGateway.sendToUser(userId: string, event: string, data: any);

// Send to project room
wsGateway.sendToProject(projectId: string, event: string, data: any);

// Send to whiteboard session
wsGateway.sendToWhiteboard(sessionId: string, event: string, data: any);

// Broadcast to all clients
wsGateway.broadcastToAll(event: string, data: any);

// Update member status
wsGateway.updateMemberStatus(projectId: string, memberId: string, online: boolean);

// Get project members
wsGateway.getProjectMembers(projectId: string): string[];

// Get whiteboard participants
wsGateway.getWhiteboardParticipants(sessionId: string): string[];

// Check if user is online
wsGateway.isUserOnline(userId: string): boolean;
```

### Frontend Integration

#### Socket.IO Client Setup

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001/teamatonce', {
  path: '/socket.io/',
  transports: ['websocket', 'polling'],
  auth: {
    token: 'your-jwt-token', // JWT token for authentication
  },
  query: {
    userId: 'user-id',
    projectId: 'project-id', // Optional: auto-join project on connect
    teamMemberId: 'team-member-id', // Optional: for status tracking
  },
});

// Connection events
socket.on('connect', () => {
  console.log('Connected to Team@Once WebSocket');
});

socket.on('disconnect', () => {
  console.log('Disconnected from Team@Once WebSocket');
});

// Join a project
socket.emit('join-project', {
  projectId: 'project-123',
  userId: 'user-456',
  teamMemberId: 'member-789',
});

// Listen for project messages
socket.on('project-message', (message) => {
  console.log('New message:', message);
});

// Listen for member status updates
socket.on('member-status-update', (status) => {
  console.log('Member status:', status);
});
```

#### React Hook Example

```typescript
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export function useTeam@OnceSocket(userId: string, projectId?: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('auth-token');

    const socketInstance = io('http://localhost:3001/teamatonce', {
      path: '/socket.io/',
      auth: { token },
      query: { userId, projectId },
    });

    socketInstance.on('connect', () => {
      setConnected(true);
    });

    socketInstance.on('disconnect', () => {
      setConnected(false);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [userId, projectId]);

  return { socket, connected };
}
```

## Environment Variables

Add these variables to your `.env` file:

```bash
# Redis Configuration (required for scaling)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password # Optional

# JWT Configuration (already exists)
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=7d
```

## Room Naming Conventions

The module uses standardized room naming:

- **User rooms**: `user-{userId}`
- **Project rooms**: `project-{projectId}`
- **Whiteboard sessions**: `whiteboard-{sessionId}`
- **Organizations**: `org-{organizationId}`
- **Companies**: `company-{companyId}`

## Multi-Tenant Isolation

The system ensures multi-tenant isolation through:

1. **Project-based rooms**: Each project has its own isolated room
2. **Authentication**: JWT tokens validate user identity
3. **Authorization**: Only authorized users can join project rooms
4. **Room separation**: Different companies/projects cannot see each other's data

## Scaling

The Redis adapter enables horizontal scaling:

1. Multiple backend instances can run simultaneously
2. Redis pub/sub synchronizes messages across instances
3. Clients can connect to any instance and receive all messages
4. Load balancing can distribute connections

## Testing

### Manual Testing with Socket.IO Client

```bash
npm install -g socket.io-client-cli

# Connect and test
socket-io-client http://localhost:3001/teamatonce \
  --query userId=test-user \
  --auth token=your-jwt-token
```

### Unit Testing

```typescript
import { Test } from '@nestjs/testing';
import { Team@OnceGateway } from './teamatonce.gateway';

describe('Team@OnceGateway', () => {
  let gateway: Team@OnceGateway;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [Team@OnceGateway],
    }).compile();

    gateway = module.get<Team@OnceGateway>(Team@OnceGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
```

## Troubleshooting

### Connection Issues

1. **Check CORS settings**: Ensure frontend URL is in the CORS whitelist
2. **Verify JWT token**: Check token format and validity
3. **Redis connection**: Ensure Redis is running and accessible
4. **Port conflicts**: Verify port 3001 is available

### Redis Connection Errors

If Redis is not available, the gateway will log a warning and continue without the Redis adapter (single instance only):

```
Failed to initialize Redis adapter: [error]
WebSocket will run without Redis adapter (single instance only)
```

### Debug Logging

Enable debug logging by setting the log level in NestJS:

```typescript
app.useLogger(['log', 'error', 'warn', 'debug', 'verbose']);
```

## Security Considerations

1. **Always use JWT authentication** in production
2. **Validate all incoming data** using DTOs
3. **Implement rate limiting** for WebSocket events
4. **Use HTTPS/WSS** in production
5. **Sanitize user input** before broadcasting
6. **Implement proper authorization** checks for room access

## Performance Tips

1. **Use Redis adapter** for production deployments
2. **Implement message throttling** for high-frequency events
3. **Limit room sizes** for large-scale applications
4. **Use binary protocols** for large data transfers
5. **Implement connection pooling** for Redis

## Future Enhancements

- [ ] Video/audio streaming support
- [ ] File sharing through WebSocket
- [ ] Typing indicators
- [ ] Read receipts
- [ ] Message history synchronization
- [ ] Offline message queuing
- [ ] End-to-end encryption

## License

Part of the Team@Once platform. All rights reserved.
