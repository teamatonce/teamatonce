# Email providers

Vasty Shop supports six email backends plus a `none` default. Pick one by
setting `EMAIL_PROVIDER` in your `.env`.

```
EMAIL_PROVIDER=smtp   # zero vendor lock-in default
```

## Comparison

| Provider | Free tier | Transport | Attachments | Best for |
|---|---|---|---|---|
| **smtp** *(default)* | depends on your server | nodemailer | ✅ | zero lock-in, dev with Mailtrap, Gmail app passwords |
| **resend** | 3,000 / month | REST | ✅ | modern API, best DX |
| **sendgrid** | 100 / day | REST | ✅ | enterprise standard |
| **postmark** | 100 / month | REST | ✅ | top-tier transactional deliverability |
| **ses** | 62k / month (from EC2) | AWS SDK *(optional dep)* | ❌ *(yet)* | cheapest at scale |
| **mailgun** | 100 / day × 30 days | REST | ✅ | solid EU/global |
| **none** | — | — | — | default — email features disabled |

## Which should I pick?

- **"I just want it to work locally"** → `smtp` with [Mailtrap](https://mailtrap.io) (free sandbox)
- **New production setup in 2 minutes** → `resend` (the cleanest DX)
- **Already on AWS, at scale** → `ses`
- **Europe-first deployment** → `mailgun` with `MAILGUN_REGION=eu` or `resend`
- **Max deliverability for transactional** → `postmark`
- **Existing SendGrid contract** → `sendgrid`

## Per-provider setup

### smtp (default)

Works with any SMTP server.

```
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=your-user
SMTP_PASSWORD=your-pass
SMTP_SECURE=false          # true for port 465 implicit TLS
EMAIL_FROM=Vasty Shop <noreply@yourdomain.com>
EMAIL_REPLY_TO=support@yourdomain.com
```

**Dev tip**: run Mailtrap (or the `maildev` compose profile once
install PR #24 lands) to inspect outgoing mail in a local web UI
without actually sending anything.

### resend

Sign up at <https://resend.com>, verify a sending domain, copy the API key
from the dashboard.

```
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
EMAIL_FROM=Vasty Shop <noreply@yourdomain.com>
```

Pure REST — no SDK dep on the server. 3,000 free emails/month + 100/day
with the free tier.

### sendgrid

Sign up at <https://sendgrid.com>, create an API key with "Mail Send"
permission, verify a sender identity.

```
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.xxxxx
EMAIL_FROM=Vasty Shop <noreply@yourdomain.com>
```

### postmark

Sign up at <https://postmarkapp.com>, create a Server, grab the Server API
Token.

```
EMAIL_PROVIDER=postmark
POSTMARK_SERVER_TOKEN=...
EMAIL_FROM=Vasty Shop <noreply@yourdomain.com>
```

### ses

`@aws-sdk/client-ses` is in **optionalDependencies**. When you run
`npm install` with `EMAIL_PROVIDER=ses`, npm installs it automatically.
Users who pick a different provider never download it.

```
EMAIL_PROVIDER=ses
SES_REGION=us-east-1
SES_ACCESS_KEY_ID=AKIA...
SES_SECRET_ACCESS_KEY=...
EMAIL_FROM=Vasty Shop <noreply@yourdomain.com>
```

**Limitation**: attachments aren't supported yet. The current provider
uses `SendEmailCommand`, which doesn't take attachments — attachment
support needs a `SendRawEmailCommand` MIME-building migration. Use
`smtp` or another provider for emails that need attachments, or file
a follow-up PR.

### mailgun

Sign up at <https://www.mailgun.com>, add and verify a domain.

```
EMAIL_PROVIDER=mailgun
MAILGUN_API_KEY=key-...
MAILGUN_DOMAIN=mail.yourdomain.com
MAILGUN_REGION=us            # or 'eu' for EU data residency
EMAIL_FROM=Vasty Shop <noreply@mail.yourdomain.com>
```

### none (default if unset)

Every method throws `EmailProviderNotConfiguredError`. The startup log
prints which env var to set.

## Migrating from the legacy SMTP helper

`backend/src/modules/database/email-helpers.ts` predates this adapter —
it's a direct nodemailer wrapper exposed via
`DatabaseService.sendEmail()`. It still works and isn't deprecated
**yet**, but new callers should inject `EmailService` instead:

```ts
import { EmailService } from '@/modules/email/email.service';

class MyService {
  constructor(private readonly email: EmailService) {}

  async notify() {
    await this.email.send({
      to: 'user@example.com',
      subject: 'Hello',
      html: '<p>Hi!</p>',
    });
  }
}
```

A follow-up PR will migrate `DatabaseService.sendEmail()` to delegate to
`EmailService` and then delete `email-helpers.ts`.

## Adding a new provider

1. Implement `EmailProvider` in
   `backend/src/modules/email/providers/<name>.provider.ts`
2. Add a case to `createEmailProvider()` in `providers/index.ts`
3. Document env vars in this file and in `.env.example`
4. If the provider needs an SDK, declare it in `optionalDependencies`
   in `backend/package.json` and `require()` it inside a `loadSdk()`
   method — never at the top of the file. See `ses.provider.ts` for
   the pattern.
