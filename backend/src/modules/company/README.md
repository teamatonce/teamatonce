# Company Management Module

## Overview

The Company Management Module provides a comprehensive system for managing developer companies/organizations within the Team@Once platform. This module enables developers to create companies, invite team members, manage roles and permissions, and track company statistics and workload.

## Features

- **Company CRUD Operations**: Create, read, update, and delete companies
- **Team Member Management**: Add, update, and remove team members
- **Invitation System**: Email-based invitations with token authentication
- **Role-Based Access Control**: Owner, Admin, Developer, Designer, and QA roles
- **Workload Management**: Track team member workload and capacity
- **Company Statistics**: Analytics on projects, revenue, and team performance
- **Settings Management**: Company-wide configuration and preferences

## Architecture

### Services

1. **CompanyService**: Handles company CRUD operations and statistics
2. **CompanyMemberService**: Manages team members and workload
3. **InvitationService**: Processes team invitations and acceptance

### Database Tables

- `developer_companies`: Company information and settings
- `company_team_members`: Team member profiles and assignments
- `team_invitations`: Pending and processed invitations
- `team_member_project_assignments`: Project assignments for team members

## API Endpoints

### Company Operations

#### Create Company
```bash
POST /company
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "account_type": "team",
  "display_name": "Acme Development",
  "company_name": "Acme Development LLC",
  "business_type": "llc",
  "company_size": "2-10",
  "website": "https://acmedev.com",
  "description": "Full-stack development agency",
  "business_email": "contact@acmedev.com",
  "business_phone": "+1-555-123-4567",
  "business_address": {
    "street": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "postal_code": "94102",
    "country": "United States"
  },
  "timezone": "America/Los_Angeles",
  "currency": "USD",
  "language": "en"
}
```

**Response**: 201 Created
```json
{
  "id": "comp_abc123",
  "owner_id": "usr_xyz789",
  "account_type": "team",
  "display_name": "Acme Development",
  "company_name": "Acme Development LLC",
  "business_type": "llc",
  "is_active": true,
  "is_verified": false,
  "created_at": "2024-01-15T10:30:00Z"
}
```

#### Get All User Companies
```bash
GET /company
Authorization: Bearer <JWT_TOKEN>
```

**Response**: 200 OK
```json
[
  {
    "id": "comp_abc123",
    "display_name": "Acme Development",
    "account_type": "team",
    "user_role": "owner",
    "user_is_owner": true,
    "user_status": "active",
    "user_permissions": ["all"]
  }
]
```

#### Get Company by ID
```bash
GET /company/:companyId
Authorization: Bearer <JWT_TOKEN>
```

**Response**: 200 OK

#### Update Company
```bash
PUT /company/:companyId
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "display_name": "Acme Dev Team",
  "description": "Updated description",
  "website": "https://newsite.com"
}
```

**Response**: 200 OK

#### Delete Company
```bash
DELETE /company/:companyId
Authorization: Bearer <JWT_TOKEN>
```

**Response**: 200 OK
```json
{
  "success": true,
  "message": "Company deleted successfully",
  "companyId": "comp_abc123"
}
```

**Note**: Cannot delete companies with active projects. Owner role required.

### Company Settings & Statistics

#### Update Company Settings
```bash
PUT /company/:companyId/settings
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "timezone": "America/New_York",
  "currency": "USD",
  "language": "en",
  "settings": {
    "notifications": {
      "email": true,
      "push": true
    },
    "work_hours": {
      "start": "09:00",
      "end": "17:00"
    }
  }
}
```

**Response**: 200 OK

#### Get Company Statistics
```bash
GET /company/:companyId/stats
Authorization: Bearer <JWT_TOKEN>
```

**Response**: 200 OK
```json
{
  "company": { ... },
  "statistics": {
    "team": {
      "total_members": 12,
      "active_members": 10,
      "members_by_role": {
        "owner": 1,
        "admin": 2,
        "developer": 7,
        "designer": 2
      },
      "average_workload_percentage": 72.5,
      "total_hours_this_month": 480
    },
    "projects": {
      "total_projects": 28,
      "active_projects": 5,
      "completed_projects": 23,
      "completion_rate": 82.14
    },
    "financial": {
      "total_spending": 156780.50,
      "total_revenue": 189450.00,
      "currency": "USD"
    },
    "assignments": {
      "active_assignments": 15
    }
  },
  "generated_at": "2024-01-15T10:30:00Z"
}
```

### Team Member Management

#### Get All Company Members
```bash
GET /company/:companyId/members
Authorization: Bearer <JWT_TOKEN>

# With filters
GET /company/:companyId/members?role=developer&status=active
```

**Response**: 200 OK
```json
[
  {
    "id": "member_123",
    "company_id": "comp_abc123",
    "user_id": "usr_xyz789",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "developer",
    "status": "active",
    "skills": ["JavaScript", "TypeScript", "React"],
    "hourly_rate": 75.0,
    "workload_percentage": 65.5,
    "current_projects": 3
  }
]
```

#### Get Current User Membership
```bash
GET /company/:companyId/members/me
Authorization: Bearer <JWT_TOKEN>
```

**Response**: 200 OK

#### Get Company Member by ID
```bash
GET /company/:companyId/members/:memberId
Authorization: Bearer <JWT_TOKEN>
```

**Response**: 200 OK

#### Update Company Member
```bash
PUT /company/:companyId/members/:memberId
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "name": "John Doe",
  "role": "admin",
  "skills": ["JavaScript", "TypeScript", "React", "Node.js"],
  "hourly_rate": 85.0,
  "permissions": ["project:read", "project:write", "team:read"],
  "status": "active"
}
```

**Response**: 200 OK

**Note**: Only owners and admins can update members.

#### Remove Company Member
```bash
DELETE /company/:companyId/members/:memberId
Authorization: Bearer <JWT_TOKEN>
```

**Response**: 200 OK
```json
{
  "message": "Member removed successfully"
}
```

**Note**: Cannot remove company owners. Only owners and admins can remove members.

### Workload Management

#### Get Member Workload
```bash
GET /company/:companyId/members/:memberId/workload
Authorization: Bearer <JWT_TOKEN>
```

**Response**: 200 OK
```json
{
  "member_id": "member_123",
  "member_name": "John Doe",
  "workload_percentage": 75.5,
  "capacity_hours_per_week": 40,
  "allocated_hours_this_week": 30.0,
  "hours_worked_this_week": 28.5,
  "active_projects_count": 3,
  "active_projects": [
    {
      "project_id": "proj_abc",
      "project_name": "E-commerce Platform",
      "role": "developer",
      "allocation_percentage": 40,
      "estimated_hours": 120
    }
  ],
  "availability": "available",
  "can_take_more_work": true
}
```

#### Get Team Workload Overview
```bash
GET /company/:companyId/workload
Authorization: Bearer <JWT_TOKEN>
```

**Response**: 200 OK
```json
{
  "company_id": "comp_abc123",
  "team_workload": [
    {
      "member_id": "member_123",
      "member_name": "John Doe",
      "workload_percentage": 75.5,
      "can_take_more_work": true
    }
  ],
  "average_workload": 68.2,
  "overloaded_members": 2,
  "available_capacity_hours": 120
}
```

### Invitation Management

#### Create Invitation
```bash
POST /company/:companyId/invitations
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "email": "newdev@example.com",
  "name": "Jane Smith",
  "role": "developer",
  "message": "We would love to have you join our team!",
  "initial_skills": ["React", "Node.js", "TypeScript"],
  "hourly_rate": 70.0,
  "initial_projects": ["proj_abc123"]
}
```

**Response**: 201 Created
```json
{
  "id": "inv_abc123",
  "company_id": "comp_xyz789",
  "email": "newdev@example.com",
  "role": "developer",
  "status": "pending",
  "token": "inv_token_abc123xyz789",
  "expires_at": "2024-01-22T10:30:00Z",
  "sent_count": 1,
  "created_at": "2024-01-15T10:30:00Z"
}
```

**Note**: Only owners and admins can send invitations.

#### Get Company Invitations
```bash
GET /company/:companyId/invitations
Authorization: Bearer <JWT_TOKEN>

# With filter
GET /company/:companyId/invitations?status=pending
```

**Response**: 200 OK
```json
[
  {
    "id": "inv_abc123",
    "email": "newdev@example.com",
    "name": "Jane Smith",
    "role": "developer",
    "status": "pending",
    "invited_by_name": "John Doe",
    "expires_at": "2024-01-22T10:30:00Z"
  }
]
```

#### Cancel Invitation
```bash
DELETE /company/:companyId/invitations/:invitationId
Authorization: Bearer <JWT_TOKEN>
```

**Response**: 200 OK
```json
{
  "message": "Invitation cancelled successfully"
}
```

#### Resend Invitation
```bash
POST /company/:companyId/invitations/:invitationId/resend
Authorization: Bearer <JWT_TOKEN>
```

**Response**: 200 OK

### Public Invitation Endpoints (Token-Based)

#### Get Invitation by Token
```bash
GET /company/invitations/:token
```

**Response**: 200 OK
```json
{
  "id": "inv_abc123",
  "company_name": "Acme Development LLC",
  "company_display_name": "Acme Dev",
  "email": "newdev@example.com",
  "name": "Jane Smith",
  "role": "developer",
  "message": "We would love to have you join our team!",
  "status": "pending",
  "expires_at": "2024-01-22T10:30:00Z"
}
```

#### Accept Invitation
```bash
POST /company/invitations/accept/:token
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "name": "Jane Smith",
  "bio": "Experienced React developer",
  "phone": "+1-555-987-6543",
  "location": "New York, NY",
  "timezone": "America/New_York",
  "skills": ["React", "TypeScript", "Node.js", "GraphQL"],
  "technologies": ["Next.js", "NestJS", "PostgreSQL"]
}
```

**Response**: 200 OK
```json
{
  "id": "member_new123",
  "company_id": "comp_xyz789",
  "user_id": "usr_abc789",
  "name": "Jane Smith",
  "email": "newdev@example.com",
  "role": "developer",
  "status": "active",
  "joined_date": "2024-01-15"
}
```

#### Decline Invitation
```bash
POST /company/invitations/decline/:token
Authorization: Bearer <JWT_TOKEN>
```

**Response**: 200 OK
```json
{
  "message": "Invitation declined successfully"
}
```

## Data Transfer Objects (DTOs)

### Company DTOs

#### CreateCompanyDto
- `account_type`: enum ('solo', 'team', 'company') - Required
- `display_name`: string (2-100 chars) - Required
- `company_name`: string (2-200 chars) - Optional
- `business_type`: enum ('individual', 'llc', 'corporation', 'partnership') - Optional
- `tax_id`: string - Optional
- `company_size`: enum ('1', '2-10', '11-50', '51-200', '201+') - Optional
- `website`: URL - Optional
- `description`: string (max 2000 chars) - Optional
- `business_email`: email - Optional
- `business_phone`: string - Optional
- `business_address`: BusinessAddressDto - Optional
- `timezone`: string (default: 'UTC') - Optional
- `currency`: string (default: 'USD') - Optional
- `language`: string (default: 'en') - Optional

#### UpdateCompanyDto
All fields are optional, same types as CreateCompanyDto.

#### UpdateCompanySettingsDto
- `timezone`: string - Optional
- `currency`: string - Optional
- `language`: string - Optional
- `settings`: object - Optional

### Team Member DTOs

#### InviteMemberDto
- `email`: email - Required
- `name`: string (2-100 chars) - Required
- `role`: enum ('owner', 'admin', 'developer', 'designer', 'qa') - Required
- `title`: string (max 100 chars) - Optional
- `skills`: string[] - Optional
- `specializations`: string[] - Optional
- `technologies`: string[] - Optional
- `hourly_rate`: number (min 0) - Optional
- `currency`: string (default: 'USD') - Optional
- `permissions`: string[] - Optional
- `message`: string (max 500 chars) - Optional
- `initial_projects`: string[] - Optional

#### UpdateMemberDto
- `name`: string (2-100 chars) - Optional
- `title`: string (max 100 chars) - Optional
- `bio`: string (max 2000 chars) - Optional
- `role`: enum - Optional
- `permissions`: string[] - Optional
- `skills`: string[] - Optional
- `specializations`: string[] - Optional
- `technologies`: string[] - Optional
- `expertise`: string[] - Optional
- `experience_years`: number (min 0) - Optional
- `hourly_rate`: number (min 0) - Optional
- `currency`: string - Optional
- `availability`: enum ('available', 'busy', 'offline', 'on_leave') - Optional
- `status`: enum ('active', 'pending', 'inactive', 'suspended') - Optional
- `capacity_hours_per_week`: number (1-168) - Optional
- `avatar_url`: string - Optional
- `phone`: string - Optional
- `location`: string - Optional
- `timezone`: string - Optional
- `social_links`: object - Optional

### Invitation DTOs

#### CreateInvitationDto
- `email`: email - Required
- `name`: string (2-100 chars) - Optional
- `role`: enum - Required
- `message`: string (max 1000 chars) - Optional
- `initial_skills`: string[] - Optional
- `hourly_rate`: number (min 0) - Optional
- `initial_projects`: string[] - Optional

#### AcceptInvitationDto
- `token`: string - Required
- `name`: string (2-100 chars) - Optional
- `bio`: string (max 2000 chars) - Optional
- `phone`: string - Optional
- `location`: string - Optional
- `timezone`: string - Optional
- `skills`: string[] - Optional
- `technologies`: string[] - Optional

## Permissions & Access Control

### Role Hierarchy

1. **Owner**: Full control over company
   - Create/update/delete company
   - Manage all members and settings
   - Cannot be removed from company
   - Access all financial data

2. **Admin**: Management capabilities
   - Update company details
   - Invite and manage members
   - Update company settings
   - View statistics

3. **Developer/Designer/QA**: Standard member
   - View company information
   - Update own profile
   - View team members
   - View assigned projects

### Permission Patterns

Companies use a role-based access control system where:
- Owners have `['all']` permissions
- Admins have defined management permissions
- Regular members have limited permissions

Custom permissions can include:
- `project:read`, `project:write`, `project:delete`
- `team:read`, `team:write`, `team:manage`
- `settings:read`, `settings:write`
- `billing:read`, `billing:write`

## Error Handling

### Common Error Responses

**400 Bad Request**
```json
{
  "statusCode": 400,
  "message": "Invalid input data",
  "error": "Bad Request"
}
```

**401 Unauthorized**
```json
{
  "statusCode": 401,
  "message": "Invalid or missing authentication token",
  "error": "Unauthorized"
}
```

**403 Forbidden**
```json
{
  "statusCode": 403,
  "message": "You do not have permission to perform this action",
  "error": "Forbidden"
}
```

**404 Not Found**
```json
{
  "statusCode": 404,
  "message": "Company with ID comp_abc123 not found",
  "error": "Not Found"
}
```

**409 Conflict**
```json
{
  "statusCode": 409,
  "message": "User is already a member of this company",
  "error": "Conflict"
}
```

## Business Rules

### Company Management
- Each user can own multiple companies
- Company owner is automatically added as a team member with `role: 'owner'`
- Companies with active projects cannot be deleted
- Company deletion is a soft delete (sets `deleted_at` timestamp)

### Team Members
- Each member must have a unique email within a company
- Owners cannot be removed from their company
- Only owners and admins can invite new members
- Members can update their own profile but not their role
- Workload is automatically calculated based on project assignments

### Invitations
- Invitations expire after 7 days by default
- One pending invitation per email per company
- Accepting an invitation automatically creates a team member record
- Invitation tokens are cryptographically secure (32 bytes)
- Email is sent when invitation is created or resent

### Workload Calculation
- Workload percentage = (allocated hours / capacity hours) × 100
- Members with workload > 100% are considered overloaded
- Available capacity = total team capacity - allocated hours
- Workload tracked per week and per month

## Integration with Other Modules

### Projects Module
- Company members can be assigned to projects
- Project assignments affect member workload
- Active projects prevent company deletion

### Billing Module
- Company subscription tier affects features
- Stripe integration for payment processing
- Company owner manages billing

### Analytics Module
- Company statistics aggregated from multiple sources
- Team performance metrics
- Financial reporting

## Development Notes

### Authentication Pattern
```typescript
const userId = req.user.sub || req.user.userId; // Use fallback pattern
```

### Database Operations
- Uses FluxezService for all database operations
- All JSONB fields must be stringified before insert/update
- Use `safeJsonParse()` helper for parsing JSONB fields
- Soft deletes: set `deleted_at` instead of actual deletion

### Service Patterns
- Services inject FluxezService for database access
- All methods include error handling with specific exceptions
- Methods use async/await for database operations
- Console logging for debugging and monitoring

## Testing

### Example Test Cases

#### Create Company
```bash
curl -X POST http://localhost:3001/company \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "account_type": "team",
    "display_name": "Test Company",
    "company_name": "Test Company LLC",
    "business_type": "llc",
    "timezone": "America/New_York"
  }'
```

#### Invite Team Member
```bash
curl -X POST http://localhost:3001/company/COMPANY_ID/invitations \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "developer@example.com",
    "name": "Test Developer",
    "role": "developer",
    "initial_skills": ["JavaScript", "TypeScript"]
  }'
```

#### Get Company Stats
```bash
curl -X GET http://localhost:3001/company/COMPANY_ID/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Roadmap

### Planned Features
- [ ] Company teams/departments hierarchy
- [ ] Advanced permission system with custom roles
- [ ] Team activity feed and notifications
- [ ] Bulk member import from CSV
- [ ] Integration with external HR systems
- [ ] Company templates for quick setup
- [ ] Advanced analytics dashboard
- [ ] Team capacity planning tools

## Support

For issues or questions:
1. Check API documentation at `/api` (Swagger)
2. Review error messages for specific guidance
3. Consult backend logs for debugging
4. Contact development team

---

**Last Updated**: January 2024
**Module Version**: 1.0.0
**Compatible with**: Team@Once Platform v2.0+
