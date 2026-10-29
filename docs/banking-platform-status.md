# Banking platform implementation status

## Delivered in this build

The current app is an independent, fictional banking demo. It now loads its dashboard from a persisted development database through the generated API client.

- Clerk-authenticated users are mapped server-side to private demo-space IDs. The browser cannot choose or send another customer's space ID.
- Checking and savings balances are derived from integer-cent ledger entries.
- Internal demo transfers create balanced ledger entries, use idempotency keys, lock accounts during balance checks, and reject insufficient funds.
- Demo bill payments are recorded in the ledger and mark matching sample bills as paid. No biller or payment network is contacted.
- Demo card freeze/unfreeze state is persisted. No card issuer or network is contacted.
- The dashboard exports a CSV containing fictional demo activity.
- The app labels itself as an independent demo, never asks for bank credentials, and only accepts sample check images for its private manual-review prototype. Clerk handles sign-in.
- Mobile check-image submissions can be uploaded privately for admin review using sample images only; the app does not clear checks or credit funds.
- Admin authorization is checked against Clerk public metadata on the server. The reviewer role is configured only in the development Clerk instance and must be configured separately before any production use.

## Not production banking

This implementation is not a bank, a customer account system, or a production payment service. The `/api/demo/*` endpoints require a Clerk session, but still contain only fictional sample data and must not be used as real customer banking APIs.

The following PRD capabilities remain unavailable until the operator selects and authorizes suitable providers and completes legal, regulatory, security, and operational review:

- Customer authentication, MFA, recovery, session lifecycle, and role-based access control.
- Customer onboarding, identity verification, sanctions screening, and KYC/AML case management.
- Real deposit accounts, account numbers, statements, deposits, ACH, wires, biller settlement, credit decisions, card issuance, and card-network controls.
- Staff/admin access, customer support case management, audit review, fraud operations, reconciliation, disputes, and regulatory reporting.
- Production observability, incident response, retention/deletion controls, penetration testing, and independent compliance review.

Do not add password collection or financial identifiers to the demo. Production onboarding must use approved identity and financial-service providers, with explicit authorization and a security review before any real customer data is collected.

## Verification

Run `pnpm run typecheck` for workspace static checks. With the API server running, `pnpm --filter @workspace/api-server run test:integration` checks public health and verifies that customer endpoints reject unauthenticated requests and client-selected demo-space IDs. Transfer, payment, balance-locking, and card behavior were exercised against the development database before Clerk enforcement; signed-in browser flows have not been verified with a test account.
