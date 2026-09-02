# Ether-MOSH account deletion runbook

This runbook supports the public `/delete-account` flow and the deletion language in the Privacy Policy.

## Service-level target

Complete valid account-deletion requests within **7 days** of submission.

## Intake

1. Open the `account-deletion` form submissions for the production Ether-MOSH Netlify project.
2. Record the request timestamp, account email, and account user ID.
3. Treat form fields as a deletion *request*, not standalone proof of ownership. Never delete an account solely because an arbitrary POST contains another user's ID.

## Verify ownership

1. In the production Supabase project (`coyzusnfkvheplcdvctf`, "Ether-MOSH Production"), locate the Auth user by the submitted user ID.
2. Confirm the submitted email matches the Auth user's current email.
3. If anything is inconsistent or suspicious, re-verify ownership through the account email before destructive processing.

## Delete Ether-MOSH account data

1. Identify account-linked rows in `entitlements` for the verified user ID.
2. Remove account-linked entitlement rows unless the production schema has a verified `ON DELETE CASCADE` relationship from the Auth user. Do not assume cascade behavior without checking it.
3. Delete the user from Supabase Auth using the production dashboard or a server-side/admin method. Never put a Supabase service-role/secret key in browser code.
4. If other user-owned tables are added later, update this runbook and the Privacy Policy before shipping them.

## Payment records

Do not attempt to erase records that Stripe or another payment processor must retain for tax, accounting, fraud prevention, disputes, or chargebacks. Those records must not be used to recreate or keep the deleted Ether-MOSH account active.

## Verify completion

1. Confirm the Auth user no longer exists.
2. Confirm account-linked entitlement rows are gone.
3. Confirm a normal sign-in cannot restore the deleted account state.
4. Mark the Netlify deletion request as completed in the operator's tracking process.
5. If ownership was re-verified by email, send completion confirmation through that same verified channel.

## Local-only data

Sticker Vault items, presets, cached assets, and UI preferences can live only in the user's browser/app storage. The `/delete-account` page tells users they can remove these immediately by clearing Ether-MOSH site/app storage. Server-side operators cannot reliably erase data that never left the user's device.

## Future automation

Once privileged tooling for the production Supabase project is connected, replace the manual destructive steps with a JWT-verified server/Edge Function. The function should derive the user ID from the authenticated session rather than accepting an arbitrary user ID from the client, delete account-owned data, delete the Auth user, revoke/sign out sessions, and return an auditable completion result.
