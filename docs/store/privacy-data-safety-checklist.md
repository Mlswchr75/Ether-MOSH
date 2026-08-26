# Ether-MOSH store privacy / data-safety worksheet

Working sheet for App Store Connect and Google Play Console. Re-check this immediately before submission, especially after native billing, crash reporting, analytics, or new cloud features are added.

## Current architecture assumptions

- Camera/video frames, imported photos/video, microphone input, system/tab audio analysis, segmentation, hand/face landmarks, and Sticker/Lottie compositing are processed locally on the device/browser.
- Ether-MOSH does not currently upload those user media streams to its own backend for storage.
- Supabase stores account authentication and account-linked entitlement data.
- Payment checkout is currently handled by Stripe; native-store billing architecture is still to be finalized before App Store/Play production submission.
- Netlify receives account-deletion request form submissions.
- No behavioral advertising SDK or advertising ID usage is intentionally present.

## Apple App Privacy — preliminary answers

Apple defines collection as transmitting data off-device in a form retained beyond servicing the immediate request. Data processed only on-device is not collected for App Privacy purposes.

### Declare

| Apple data type | Collected | Linked to user | Purpose | Notes |
| --- | --- | --- | --- | --- |
| Contact Info → Email Address | Yes | Yes | App Functionality / Account Management | Supabase Auth; deletion request flow also includes account email. |
| Identifiers → User ID | Yes | Yes | App Functionality / Account Management | Supabase account ID and account-linked entitlement ownership. |
| Purchases → Purchase History | Yes | Yes | App Functionality | Entitlement rows retain product/transaction references to restore unlocks. |

### On-device only — do not mark collected under current architecture

- Photos or Videos used as MOSH inputs.
- Audio Data / microphone audio used for reactivity.
- Hands / Head landmark data generated for tracking.
- Environment/subject segmentation information.

These must be revisited if any derived landmarks, frames, recordings, uploads, prompts, or telemetry are transmitted off-device in a later release.

### Deletion/support free text

The optional reason field on `/delete-account` is user-supplied, infrequent, and not core app functionality. Review Apple's then-current optional-disclosure test at submission time. Conservative fallback: disclose it as Customer Support or Other User Content used for App Functionality/Account Management.

### Payment Info

Do not guess. Apple states payment information can be excluded when a payment service collects it and the developer never has access. Re-evaluate this after the native purchase flow is finalized. If App Store in-app purchase replaces web Stripe checkout for digital unlocks on iOS, answer based on the shipped iOS build and Apple's services.

### Tracking

Current intended answer: **No tracking**. Revisit if advertising, cross-app profiling, third-party ad attribution, or data-broker sharing is ever added.

### Required URLs

- Privacy Policy: `https://ether-mosh.online/privacy`
- Privacy Choices / deletion URL: `https://ether-mosh.online/delete-account`

## Google Play Data Safety — preliminary answers

Google's definition of collection includes off-device transmission by the app or its SDKs. Purely on-device access/processing does not need to be declared as collection.

### Collected

| Google data type | Collection | Purpose | Required? | Notes |
| --- | --- | --- | --- | --- |
| Personal info → Email address | Collected | Account management / App functionality | Required for account features | Supabase Auth. |
| Personal info → User IDs | Collected | Account management / App functionality | Required for account features | Supabase Auth ID. |
| Financial info → Purchase history | Collected | App functionality | Only after purchase | Used to grant/restore supporter entitlement. |

### Currently on-device only

Do not declare as collected solely because the app requests or processes them locally:

- Photos and videos imported for effects.
- Camera frames.
- Microphone/system audio used for reactive analysis.
- Hand/face landmark information generated locally.

### Security / deletion answers

- Data encrypted in transit: **Yes** for the app's declared backend traffic (HTTPS/TLS). Verify all native endpoints before submission.
- Users can request deletion: **Yes**.
- In-app deletion path: Account → Delete account.
- External web deletion URL: `https://ether-mosh.online/delete-account`.

### Sharing

Review Google Play's current service-provider sharing exemptions when completing the final form. Supabase, Stripe, Netlify, and any native billing/crash SDKs must be considered based on the exact shipped build. Do not automatically mark data as unshared merely because a vendor processes it on Ether-MOSH's behalf; follow the current Play definition/exemptions.

## Store submission gate

Before submitting either native app, re-audit:

1. Package dependencies/SDKs actually present in the native build.
2. Network requests produced by a clean install, sign-in, purchase, capture/export, deletion request, and crash-free normal session.
3. Whether analytics or crash reporting was added after this worksheet.
4. Native billing architecture and what payment information is visible to Ether-MOSH.
5. Privacy Policy wording against the final network/data audit.
6. App Store Privacy and Play Data Safety answers against the final binaries, not this worksheet alone.
