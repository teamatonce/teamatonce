# Deskive Workspace Module

Complete workspace invitation system for Deskive, based on the Team@Once implementation.

## 📦 What's Included

This module provides a production-ready invitation system with:

- ✅ **7 API Endpoints** - Create, list, accept, decline, resend, cancel invitations
- ✅ **Complete Service Layer** - Business logic with security and validation
- ✅ **DTOs with Validation** - Type-safe request/response objects
- ✅ **Email Integration** - Automated invitation emails via Fluxez
- ✅ **Token Security** - Secure 64-character random tokens
- ✅ **Permission System** - Role-based access control
- ✅ **Auto-expiration** - 7-day expiration with renewal on resend
- ✅ **Full Documentation** - Integration guide and API reference

## 📁 File Structure

```
workspace/
├── dto/
│   └── invitation.dto.ts              # DTOs with validation
├── invitation.service.ts              # Core business logic (671 lines)
├── workspace.controller.ts            # Authenticated endpoints
├── invitation-public.controller.ts    # Public endpoints
├── workspace.module.ts                # Module configuration
├── README.md                          # This file
├── INVITATION_SYSTEM.md              # Complete system documentation
└── INTEGRATION_GUIDE.md              # Quick integration guide
```

## 🚀 Quick Start

### 1. Add to App Module

```typescript
// app.module.ts
import { WorkspaceModule } from './modules/workspace/workspace.module';

@Module({
  imports: [
    // ... other modules
    WorkspaceModule,
  ],
})
export class AppModule {}
```

### 2. Create Database Tables

Run the SQL from `INVITATION_SYSTEM.md` to create:
- `workspace_invitations`
- `workspace_members`
- `workspaces`

### 3. Configure Environment

```env
FRONTEND_URL=https://app.deskive.com
FLUXEZ_API_KEY=your_service_key
FLUXEZ_ANON_KEY=your_anon_key
JWT_SECRET=your_jwt_secret
```

### 4. Done!

Your API endpoints are now available:
- `POST /workspace/:id/invitations` - Create invitation
- `GET /workspace/:id/invitations` - List invitations
- `GET /invitations/:token` - View invitation (public)
- `POST /invitations/:token/accept` - Accept invitation
- `POST /invitations/:token/decline` - Decline invitation
- `POST /workspace/:id/invitations/:invId/resend` - Resend
- `DELETE /workspace/:id/invitations/:invId` - Cancel

## 📚 Documentation

- **[INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)** - Step-by-step setup guide
- **[INVITATION_SYSTEM.md](./INVITATION_SYSTEM.md)** - Complete API reference and docs

## 🎯 Features

### Invitation Workflow

```
Create → Email → View → Login → Accept → Join Workspace
```

### Security

- **Token-based**: Secure 64-character random tokens
- **Email validation**: Must match user's email
- **Permission checks**: Owner/admin only
- **Auto-expiration**: 7-day validity
- **Rate limiting**: Prevent duplicate invitations

### Roles

- **Owner**: Full workspace control
- **Admin**: Manage members and projects
- **Member**: View and edit own tasks
- **Viewer**: Read-only access

## 📝 Usage Examples

### Create Invitation (Backend)

```typescript
const result = await invitationService.createInvitation(
  'workspace-uuid',
  'user-id',
  {
    email: 'newmember@example.com',
    name: 'New Member',
    role: WorkspaceMemberRole.MEMBER,
    message: 'Welcome!',
  }
);
```

### Create Invitation (Frontend)

```typescript
const response = await fetch(`/api/workspace/${workspaceId}/invitations`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'user@example.com',
    role: 'member',
    message: 'Join our workspace!',
  }),
});
```

### Accept Invitation (Frontend)

```typescript
// 1. Get invitation details (public)
const invitation = await fetch(`/api/invitations/${token}`).then(r => r.json());

// 2. User logs in

// 3. Accept invitation
const result = await fetch(`/api/invitations/${token}/accept`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'John Doe',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }),
});
```

## 🗄️ Database Schema

### workspace_invitations
- Stores all invitation records
- Tracks status (pending, accepted, declined, expired, cancelled)
- Contains secure token and expiration
- Links to workspace and inviter

### workspace_members
- Created when invitation is accepted
- Stores member profile and permissions
- Links to workspace and user

### workspaces
- Basic workspace information
- Owner and metadata

Full schema in `INVITATION_SYSTEM.md`.

## 🔐 Security Features

1. **Secure Tokens**: 64-character random hex
2. **Email Verification**: Must match authenticated user
3. **Permission Checks**: Owner/admin only for management
4. **Expiration**: Auto-expire after 7 days
5. **Status Tracking**: Prevent duplicate/replay attacks
6. **Input Validation**: DTOs with class-validator

## 🧪 Testing

The system includes validation for:

- ✅ Create invitation with valid data
- ✅ Prevent duplicate active invitations
- ✅ Prevent inviting existing members
- ✅ Non-admin cannot create invitations
- ✅ Accept with matching email
- ✅ Reject acceptance with mismatched email
- ✅ Prevent accepting expired invitation
- ✅ Resend expired invitation (new token)
- ✅ Cancel pending invitation
- ✅ Decline invitation

## 📊 API Response Examples

### Create Invitation Response

```json
{
  "success": true,
  "message": "Invitation sent successfully",
  "invitation": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "New User",
    "role": "member",
    "status": "pending",
    "expiresAt": "2025-11-03T12:00:00.000Z",
    "createdAt": "2025-10-27T12:00:00.000Z"
  }
}
```

### Accept Invitation Response

```json
{
  "success": true,
  "message": "Invitation accepted successfully",
  "workspaceMember": {
    "id": "uuid",
    "workspaceId": "uuid",
    "userId": "usr_123",
    "name": "John Doe",
    "email": "user@example.com",
    "role": "member",
    "status": "active",
    "joinedAt": "2025-10-27T12:00:00.000Z"
  }
}
```

## 🛠️ Customization

### Change Expiration Time

```typescript
// invitation.service.ts
private readonly INVITATION_EXPIRY_DAYS = 14; // Change from 7
```

### Custom Permissions

```typescript
// invitation.service.ts → getDefaultPermissions()
private getDefaultPermissions(role: WorkspaceMemberRole): string[] {
  const permissionMap: Record<string, string[]> = {
    owner: ['all'],
    admin: ['manage_workspace', 'manage_members'],
    // Add your custom permissions
  };
  return permissionMap[role] || ['view_workspace'];
}
```

### Custom Email Template

```typescript
// invitation.service.ts → sendInvitationEmail()
const emailHtml = `
  <!-- Your custom HTML -->
`;
```

## 🔍 Troubleshooting

### Email Not Sending
- Check `FLUXEZ_API_KEY` is set
- Verify Fluxez email service configuration
- Emails fail gracefully (won't block invitation creation)

### Permission Denied
- Ensure user is workspace owner or admin
- Check `workspace_members` table for user role

### Token Expired
- Invitations expire after 7 days
- Use resend endpoint to generate new token

### Email Mismatch
- User email must match invitation email
- Comparison is case-insensitive

## 📈 Monitoring

### Key Queries

```sql
-- Pending invitations
SELECT COUNT(*) FROM workspace_invitations
WHERE status = 'pending' AND expires_at > NOW();

-- Acceptance rate
SELECT
  COUNT(CASE WHEN status = 'accepted' THEN 1 END)::float /
  COUNT(*)::float * 100 as acceptance_rate
FROM workspace_invitations;

-- Average time to accept
SELECT AVG(accepted_at - created_at)
FROM workspace_invitations
WHERE status = 'accepted';
```

## 🎓 Learn More

- **Team@Once Reference**: `/backend/src/modules/company/`
- **Fluxez SDK**: Database and email service
- **NestJS**: Framework documentation

## 🤝 Contributing

When making changes:
1. Update DTOs if adding fields
2. Update service validation
3. Update documentation
4. Add tests for new functionality
5. Update database schema if needed

## 📄 License

Part of the Deskive project.

---

**Production Ready** • **Fully Documented** • **Based on Team@Once**

For detailed documentation, see:
- [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) - Setup and integration
- [INVITATION_SYSTEM.md](./INVITATION_SYSTEM.md) - Complete API reference
