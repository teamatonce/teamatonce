# Team Management Module

## Overview
Complete implementation of the Team Management Module for the multi-tenant project outsourcing platform (Team@Once). This module manages the developer marketplace, project assignments, and real-time status tracking for independent contractors working across multiple client projects.

## Architecture

### Multi-Tenant Context
- **Team Members**: Independent contractors who can work for multiple clients
- **Project Assignments**: Links team members to specific client projects with custom rates and roles
- **Status Tracking**: Real-time online/offline status across all projects
- **Skill-Based Filtering**: Find developers by skills, technologies, experience, and availability

## File Structure

```
backend/src/modules/teamatonce/team/
├── dto/
│   ├── team-member.dto.ts          # Team member DTOs (Create, Update, Filter)
│   ├── team-assignment.dto.ts      # Assignment DTOs (Assign, Update)
│   └── member-status.dto.ts        # Status DTOs (Update, Online, Project Team Status)
├── team-members.service.ts         # Team member marketplace service
├── team-assignment.service.ts      # Project assignment service
├── member-status.service.ts        # Real-time status tracking service
├── team.controller.ts              # REST API controller
└── team.module.ts                  # Module definition
```

## Services

### 1. TeamMembersService
**Purpose**: Manage the developer directory and marketplace

**Methods**:
- `getAllTeamMembers(filters?)` - Browse available developers with filters
- `getTeamMemberById(id)` - Get full profile with skills, portfolio, and projects
- `createTeamMember(data)` - Onboard new developer to platform
- `updateTeamMember(id, data)` - Update profile, skills, rates, availability
- `deleteTeamMember(id)` - Soft delete (prevent deletion if active assignments exist)
- `searchTeamMembers(searchTerm)` - Search by name, role, or bio
- `filterTeamMembersBySkill(skill)` - Find developers with specific skills
- `getAvailableTeamMembers()` - Get developers available for hire

**Key Features**:
- JSON field parsing for skills, technologies, specializations
- Soft delete with is_active flag
- Conflict prevention (can't delete with active assignments)
- JSONB array filtering for skills using PostgreSQL operators

### 2. TeamAssignmentService
**Purpose**: Assign developers to client projects

**Methods**:
- `getProjectTeam(projectId)` - Get all developers assigned to a project
- `assignTeamMember(projectId, data)` - Assign developer with role, rate, allocation
- `removeTeamMember(assignmentId)` - Remove developer from project (soft delete)
- `updateAssignment(assignmentId, data)` - Update role, allocation percentage
- `getTeamMemberAssignments(teamMemberId, activeOnly)` - Get all projects for a developer

**Key Features**:
- Reactivation of inactive assignments
- Automatic current_projects array maintenance
- Project and member validation
- Duplicate assignment prevention
- Enriched responses with project/member details

### 3. MemberStatusService
**Purpose**: Track online/offline status for real-time collaboration

**Methods**:
- `updateMemberStatus(memberId, status, deviceInfo?)` - Update online/offline status
- `getAllOnlineMembers()` - Get all currently online developers
- `getMemberStatus(memberId)` - Check if specific developer is online
- `getProjectTeamStatus(projectId)` - Get online status of project team members
- `bulkUpdateStatuses(updates)` - Bulk update for reconnection scenarios
- `handleMemberConnect(userId, deviceInfo?)` - WebSocket connect handler
- `handleMemberDisconnect(userId)` - WebSocket disconnect handler

**Key Features**:
- WebSocket integration via AppGateway
- Real-time broadcasting to project rooms
- Device info tracking
- Status mapping (online, away, busy, offline)
- Cross-project status updates

## REST API Endpoints

### Team Members
```
GET    /teamatonce/team/members                    # Get all team members (with filters)
GET    /teamatonce/team/members/available          # Get available members
GET    /teamatonce/team/members/search?q=term      # Search members
GET    /teamatonce/team/members/by-skill/:skill    # Filter by skill
GET    /teamatonce/team/members/:id                # Get member by ID
POST   /teamatonce/team/members                    # Create team member
PUT    /teamatonce/team/members/:id                # Update team member
DELETE /teamatonce/team/members/:id                # Delete team member
```

### Team Assignments
```
GET    /teamatonce/team/assignments/project/:projectId           # Get project team
GET    /teamatonce/team/assignments/member/:teamMemberId         # Get member assignments
POST   /teamatonce/team/assignments/project/:projectId           # Assign to project
PUT    /teamatonce/team/assignments/:assignmentId                # Update assignment
DELETE /teamatonce/team/assignments/:assignmentId                # Remove from project
```

### Member Status
```
GET    /teamatonce/team/status/online                            # Get all online members
GET    /teamatonce/team/status/member/:memberId                  # Get member status
GET    /teamatonce/team/status/project/:projectId                # Get project team status
POST   /teamatonce/team/status/update                            # Update status
POST   /teamatonce/team/status/bulk-update                       # Bulk update statuses
```

## Database Schema

### team_members
```typescript
{
  id: uuid (primary key)
  user_id: string (Fluxez user ID, unique)
  display_name: string
  role: string (developer, designer, qa, pm, devops)
  specialization: jsonb[]
  skills: jsonb[]
  technologies: jsonb[]
  experience_years: integer
  hourly_rate: numeric
  currency: string (default: 'USD')
  availability_status: string (available, busy, unavailable)
  current_projects: jsonb[]
  capacity_hours_per_week: integer (default: 40)
  profile_image: string
  bio: text
  portfolio_url: string
  is_active: boolean (default: true)
  created_at: timestamptz
  updated_at: timestamptz
}
```

### project_team_assignments
```typescript
{
  id: uuid (primary key)
  project_id: uuid (foreign key to projects)
  team_member_id: uuid (foreign key to team_members)
  project_role: string (lead, developer, designer, qa, devops, pm)
  assigned_at: timestamptz (default: now())
  removed_at: timestamptz (nullable)
  allocation_percentage: integer (0-100, default: 100)
  is_active: boolean (default: true)
}
```

## WebSocket Integration

### Real-Time Events
The MemberStatusService integrates with AppGateway to broadcast status updates:

**Emitted Events**:
- `team:member_status_changed` - Broadcast to project rooms when member status changes
- `team:status_updated` - Sent to user's personal room

**Event Payload**:
```typescript
{
  member_id: string
  display_name: string
  role: string
  status: 'online' | 'away' | 'busy' | 'offline'
  last_seen: Date
  device_info?: string
  profile_image?: string
}
```

### Connection Flow
1. Team member connects via WebSocket
2. `handleMemberConnect()` called with userId
3. Status updated to 'online'
4. Broadcast to all project rooms where member is assigned
5. On disconnect, status updated to 'offline' and broadcast

## Implementation Details

### FluxezService Migration
All services use FluxezService instead of Prisma:

**Query Pattern**:
```typescript
// Get data with filters
const query = this.fluxez.table('team_members')
  .where('is_active', '=', true)
  .where('role', '=', 'developer')
  .orderBy('display_name', 'asc');

const result = await query.execute();
const members = result.data || [];
```

**Insert Pattern**:
```typescript
const result = await this.fluxez.insert('team_members', {
  user_id: data.user_id,
  display_name: data.display_name,
  skills: JSON.stringify(data.skills || [])
});
```

**Update Pattern**:
```typescript
const query = this.fluxez.client.table('team_members')
  .where('id', '=', id);

await query.update({
  display_name: 'New Name',
  updated_at: new Date().toISOString()
});
```

### Skill Filtering Implementation
Uses PostgreSQL JSONB operators with fallback:

```typescript
// Primary: PostgreSQL JSONB contains operator
const result = await this.fluxez.client.query
  .from('team_members')
  .select('*')
  .whereRaw(`skills @> ?`, [JSON.stringify([skill])])
  .execute();

// Fallback: In-memory filtering
const allMembers = await this.getAllTeamMembers({ is_active: true });
return allMembers.filter(member =>
  member.skills && member.skills.includes(skill)
);
```

### JSON Field Parsing
Safe JSON parsing with fallback values:

```typescript
private safeJsonParse(value: any, fallback: any = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
```

## Authentication & Authorization
- All endpoints protected with `@UseGuards(JwtAuthGuard)`
- JWT token required in Authorization header: `Bearer <token>`
- User ID extracted from token payload (`req.user.sub || req.user.userId`)

## Error Handling

### Common Errors
- `NotFoundException`: Resource not found (team member, project, assignment)
- `ConflictException`: Duplicate team member or assignment
- `BadRequestException`: Invalid data or operation not allowed

### Validation
- DTOs use class-validator decorators
- Min/max constraints on numeric fields
- Enum validation for status fields
- UUID validation for IDs

## Multi-Tenant Features

### How It Works
1. **Team Members**: Platform-wide pool of developers
2. **Project Assignments**: Connect members to client projects
3. **Flexible Rates**: Each assignment can have different hourly rates
4. **Cross-Project Visibility**: Member's online status visible across all assigned projects
5. **Current Projects Tracking**: JSONB array maintains list of active project IDs

### Use Cases
- **Marketplace Browse**: Clients search for developers by skills
- **Team Assembly**: Assign multiple developers to a project
- **Real-Time Collaboration**: See which team members are online
- **Resource Management**: Track developer availability and allocation
- **Multi-Project Developers**: Same developer working on multiple client projects

## Testing

### Manual Testing
```bash
# Get all team members
curl -X GET http://localhost:3001/teamatonce/team/members \
  -H "Authorization: Bearer <token>"

# Create team member
curl -X POST http://localhost:3001/teamatonce/team/members \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "usr_123",
    "display_name": "John Doe",
    "role": "developer",
    "skills": ["React", "Node.js"],
    "hourly_rate": 75
  }'

# Assign to project
curl -X POST http://localhost:3001/teamatonce/team/assignments/project/<projectId> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "team_member_id": "<memberId>",
    "project_role": "developer",
    "allocation_percentage": 100
  }'
```

## Integration Points

### Dependencies
- **FluxezService**: Database operations
- **AppGateway**: WebSocket real-time updates
- **JwtAuthGuard**: Authentication
- **ConfigService**: Environment configuration

### Exports
- TeamMembersService
- TeamAssignmentService
- MemberStatusService

These services can be injected into other modules for:
- Project creation workflows
- Analytics and reporting
- Notification systems
- Billing and invoicing

## Future Enhancements

### Planned Features
1. **Time Tracking**: Track hours worked per project
2. **Performance Ratings**: Client feedback on team members
3. **Availability Calendar**: Detailed scheduling and capacity planning
4. **Skill Endorsements**: Peer validation of skills
5. **Team Recommendations**: AI-powered team assembly
6. **Workload Analytics**: Utilization and burnout detection

### Optimization Opportunities
1. Caching frequently accessed team member profiles
2. Materialized views for team analytics
3. Real-time presence tracking with Redis
4. Full-text search with Elasticsearch
5. GraphQL API for complex queries

## Troubleshooting

### Common Issues

**Issue**: Team member not showing as online
- **Solution**: Check WebSocket connection, verify userId matches team_member.user_id

**Issue**: Skill filtering returns no results
- **Solution**: Skills must be exact match, case-sensitive in fallback mode

**Issue**: Cannot delete team member
- **Solution**: Remove all active assignments first

**Issue**: Assignment already exists error
- **Solution**: Check if inactive assignment exists, service will reactivate it

## Support
For questions or issues, refer to:
- Backend documentation: `/Users/islamnymul/DEVELOP/INFOINLET-PROD/teamatonce/backend/CLAUDE.md`
- Database schema: `/Users/islamnymul/DEVELOP/INFOINLET-PROD/teamatonce/backend/src/database/schema.ts`
- API documentation: Swagger UI at `http://localhost:3001/api`
