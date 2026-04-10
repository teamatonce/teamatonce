# Company Onboarding Component

A complete multi-step wizard for company onboarding in the Team@Once platform.

## Features

- **3-Step Wizard Process**
  1. Account Type Selection (Solo/Team/Company)
  2. Basic Information Entry
  3. Review & Submit

- **Smart Form Handling**
  - React Hook Form for validation
  - Conditional fields based on account type
  - Real-time error validation

- **Beautiful UI**
  - Animated transitions with Framer Motion
  - Gradient buttons and cards
  - Progress indicator
  - Responsive design

## Usage

### Basic Integration

```tsx
import { CompanyOnboarding } from '@/pages';

// In your router configuration
<Route path="/onboarding/company" element={<CompanyOnboarding />} />
```

### Full Example with React Router

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CompanyOnboarding } from '@/pages';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Onboarding - Requires authentication */}
        <Route
          path="/onboarding/company"
          element={
            <ProtectedRoute>
              <CompanyOnboarding />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
```

## User Flow

1. **After Signup**: User creates account with role (client/developer)
2. **Redirect to Onboarding**: Navigate user to `/onboarding/company`
3. **Complete Wizard**:
   - Select account type (Solo/Team/Company)
   - Enter basic info (name, email, website)
   - Review and submit
4. **Redirect to Dashboard**:
   - Client → `/client/dashboard`
   - Developer → `/developer/team`

## Account Types

### Solo (1 person)
- For individual professionals
- Simplified form (no company name required)
- Default business type: Individual
- Ideal for freelancers

### Team (2-10 members)
- For small teams
- Requires company name
- Supports team collaboration features
- Company size: 2-10

### Company (11+ members)
- For larger organizations
- Full company details required
- Enterprise-grade features
- Company size: 11+

## Form Fields

### Required Fields
- **Display Name**: User's name or company display name
- **Account Type**: Solo, Team, or Company

### Optional Fields
- **Company Name**: Legal company name (required for Team/Company)
- **Business Email**: Company contact email
- **Website**: Company website URL
- **Business Type**: Individual, LLC, Corporation, Partnership

## API Integration

The component uses the following services:

```tsx
import { createCompany } from '@/services/companyService';
import { useAuth } from '@/contexts/AuthContext';
```

### Company Creation Payload

```typescript
{
  account_type: 'solo' | 'team' | 'company',
  display_name: string,
  company_name?: string,
  business_type?: 'individual' | 'llc' | 'corporation' | 'partnership',
  company_size?: '1' | '2-10' | '11-50' | '51-200' | '201+',
  business_email?: string,
  website?: string
}
```

## Navigation After Onboarding

```tsx
// Client users
navigate('/client/dashboard');

// Developer users
navigate('/developer/team');
```

## Styling

The component uses:
- **Tailwind CSS** for styling
- **Gradient backgrounds** (blue → purple → pink)
- **Card-based layout** with shadows
- **Responsive design** (mobile-first)
- **Animated blobs** for background

## Error Handling

- Form validation errors displayed inline
- API errors shown via toast notifications (sonner)
- Loading states during submission
- Graceful error recovery

## Customization

### Modify Account Types

Edit the `ACCOUNT_TYPES` array to customize options:

```tsx
const ACCOUNT_TYPES = [
  {
    type: AccountType.SOLO,
    icon: User,
    title: 'Solo',
    description: 'Perfect for individual professionals',
    details: 'Work independently on projects',
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'from-blue-50 to-cyan-50',
    borderColor: 'border-blue-200 hover:border-blue-400',
  },
  // Add more types...
];
```

### Change Navigation Routes

Modify the navigation logic in `onSubmit`:

```tsx
if (user?.role === 'client') {
  navigate('/your-custom-client-route');
} else if (user?.role === 'developer') {
  navigate('/your-custom-developer-route');
}
```

## Dependencies

- `react`: ^18.x
- `react-router-dom`: ^6.x
- `react-hook-form`: ^7.x
- `framer-motion`: ^12.x
- `sonner`: ^2.x
- `lucide-react`: ^0.x

## Testing

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import CompanyOnboarding from './CompanyOnboarding';

describe('CompanyOnboarding', () => {
  it('renders account type selection', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <CompanyOnboarding />
        </AuthProvider>
      </BrowserRouter>
    );

    expect(screen.getByText('Choose Your Account Type')).toBeInTheDocument();
    expect(screen.getByText('Solo')).toBeInTheDocument();
    expect(screen.getByText('Team')).toBeInTheDocument();
    expect(screen.getByText('Company')).toBeInTheDocument();
  });
});
```

## Support

For issues or questions, refer to:
- `/src/services/companyService.ts` for API documentation
- `/src/types/company.ts` for type definitions
- `/src/contexts/AuthContext.tsx` for authentication logic
