# Payment Module

Complete Stripe payment integration for Team@Once platform.

## 📁 Module Structure

```
payment/
├── dto/
│   └── payment.dto.ts          # Data Transfer Objects with validation
├── payment.controller.ts       # REST API endpoints (25+ endpoints)
├── payment.module.ts           # NestJS module configuration
├── stripe.service.ts           # Stripe SDK wrapper service
├── PAYMENT_API_QUICKREF.md     # API quick reference guide
└── README.md                   # This file
```

## 🚀 Quick Start

### 1. Install Dependencies

Already installed in the project:
- `stripe` - Stripe Node.js SDK
- `@nestjs/config` - Environment configuration

### 2. Configure Environment Variables

Add to your `.env` file:

```bash
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret_here
FRONTEND_URL=http://localhost:5173
```

### 3. Import Module

The module is already registered in `app.module.ts`:

```typescript
import { PaymentModule } from './modules/payment/payment.module';

@Module({
  imports: [
    // ... other modules
    PaymentModule,
  ],
})
export class AppModule {}
```

### 4. Access API

All endpoints are available at `/payment/*`:

```bash
# Example: Create a customer
curl -X POST http://localhost:3001/payment/customer \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"customer@example.com"}'
```

## 📚 API Endpoints

### Customer Management
- `POST /payment/customer` - Create/get customer
- `GET /payment/customer/:customerId` - Get customer
- `PUT /payment/customer/:customerId` - Update customer

### Subscription Management
- `POST /payment/subscription` - Create subscription
- `GET /payment/subscription/:subscriptionId` - Get subscription
- `PUT /payment/subscription/:subscriptionId` - Update subscription
- `POST /payment/subscription/:subscriptionId/cancel` - Cancel subscription
- `POST /payment/subscription/:subscriptionId/resume` - Resume subscription
- `GET /payment/customer/:customerId/subscriptions` - List subscriptions

### Payment Methods
- `POST /payment/payment-method` - Add payment method
- `GET /payment/customer/:customerId/payment-methods` - List payment methods
- `DELETE /payment/payment-method/:paymentMethodId` - Remove payment method
- `PUT /payment/customer/:customerId/default-payment-method` - Set default

### Invoices
- `GET /payment/customer/:customerId/invoices` - List invoices
- `GET /payment/invoice/:invoiceId` - Get invoice
- `GET /payment/customer/:customerId/upcoming-invoice` - Get upcoming invoice

### Checkout
- `POST /payment/checkout/session` - Create checkout session
- `GET /payment/checkout/session/:sessionId` - Get session

### Pricing
- `GET /payment/price/:priceId` - Get price
- `GET /payment/prices` - List prices

### Webhooks
- `POST /payment/webhook` - Handle Stripe webhooks

See [PAYMENT_API_QUICKREF.md](./PAYMENT_API_QUICKREF.md) for detailed API documentation.

## 🔐 Authentication

All endpoints (except webhook) require JWT authentication:

```typescript
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
```

Access user ID in request:
```typescript
const userId = req.user.sub || req.user.userId;
```

## 🔔 Webhook Integration

### 1. Configure Webhook Endpoint in Stripe

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://api.teamatonce.com/payment/webhook`
3. Select events to listen:
   - `customer.subscription.*`
   - `invoice.*`
   - `payment_method.*`
4. Copy webhook signing secret to `STRIPE_WEBHOOK_SECRET`

### 2. Test Webhooks Locally

Using Stripe CLI:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3001/payment/webhook

# Trigger test events
stripe trigger customer.subscription.created
stripe trigger invoice.paid
```

### 3. Handle Webhook Events

Events are automatically handled in `PaymentController.handleWebhook()`:

```typescript
switch (event.type) {
  case 'customer.subscription.created':
    // TODO: Store subscription in database
    break;
  case 'invoice.paid':
    // TODO: Update payment records
    break;
  // ... other events
}
```

## 🧪 Testing

### Test Mode

Use Stripe test keys (starting with `sk_test_`):

```bash
STRIPE_SECRET_KEY=sk_test_51abcdef...
```

### Test Cards

Use Stripe test cards:

```
Visa Success:           4242 4242 4242 4242
Visa Decline:           4000 0000 0000 0002
3D Secure Required:     4000 0027 6000 3184
```

### Test Flow

1. Create customer
2. Create checkout session
3. Use test card to complete payment
4. Verify webhook events are received
5. Check subscription status

## 🔧 Service Usage

You can inject `StripeService` into other modules:

```typescript
import { StripeService } from '../payment/stripe.service';

@Injectable()
export class ProjectService {
  constructor(private stripeService: StripeService) {}

  async createProjectSubscription(projectId: string, priceId: string) {
    const subscription = await this.stripeService.createSubscription(
      customerId,
      priceId,
    );
    // Store subscription data...
  }
}
```

## 📊 Available Plans

Create Stripe products and prices in the Stripe Dashboard or via API:

```typescript
// Example: Create a price
const price = await stripe.prices.create({
  unit_amount: 1999,  // $19.99
  currency: 'usd',
  recurring: { interval: 'month' },
  product: 'prod_1234567890',
});
```

## 🛡️ Security Best Practices

1. **Never expose secret keys** in client-side code
2. **Always verify webhook signatures** using raw body
3. **Use HTTPS in production** for all payment endpoints
4. **Store customer IDs** securely in your database
5. **Log all payment events** for audit trails
6. **Handle failed payments** gracefully
7. **Implement retry logic** for failed API calls

## 🚨 Error Handling

All Stripe errors are caught and transformed to NestJS HTTP exceptions:

```typescript
try {
  return await this.stripe.subscriptions.create(data);
} catch (error) {
  console.error('[StripeService] Error creating subscription:', error);
  throw new BadRequestException('Failed to create subscription');
}
```

Common errors:
- `BadRequestException` - Invalid request data
- `NotFoundException` - Resource not found
- `UnauthorizedException` - Invalid API key

## 📈 Next Steps

### Database Integration

Create database entities to store:
- Customer Stripe ID mapping
- Subscription records
- Payment history
- Invoice records

### Service Integration

Integrate with other modules:
- **CompanyModule**: Link subscriptions to companies
- **ProjectModule**: Associate costs with projects
- **NotificationsModule**: Send payment notifications

### Additional Features

- Metered billing for usage-based pricing
- Coupon/discount support
- Refund functionality
- Payment analytics dashboard
- Subscription usage tracking

## 📞 Support

- [Stripe Documentation](https://stripe.com/docs)
- [NestJS Stripe Guide](https://docs.nestjs.com/techniques/queues)
- [Stripe Community](https://support.stripe.com/community)

## 📝 License

Part of Team@Once platform - All rights reserved.
