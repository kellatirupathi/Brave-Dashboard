I want to add SSO login via the Forms platform to this app. Replace any existing direct signup/login UI with a redirect-based SSO flow. Here's the full spec:

Flow  
User lands on app → sees a single "Sign In" button.  
Clicking it redirects to the Forms login URL (env var VITE\_FORMS\_LOGIN\_URL).  
After Forms auth, the Forms backend calls my backend at POST /api/auth/generate-token with header x-api-key: \<FORMS\_API\_KEY\> and body { "user\_id": "\<forms\_user\_id\>" }.  
My backend creates-or-finds the user (by formsUserId), generates a one-time token (5 min expiry), returns { "auth\_token": "\<token\>" }.  
Forms then redirects the browser back to my app with ?auth\_token=\<token\> in the URL.  
My frontend detects the token on load, calls POST /api/auth/validate-token with { "token": "..." }, server marks token used, establishes the session, returns the user object. Frontend cleans the token off the URL.  
Database changes (Drizzle)  
Add formsUserId: varchar("forms\_user\_id").unique() (nullable) to the users table — links my app's user to their Forms identity.  
New table auth\_tokens: id (serial PK), token (text, unique), userId (FK to users), expiresAt (timestamp), used (boolean, default false), createdAt (timestamp, default now).  
Run npm run db:push \--force to sync.  
Backend endpoints (Express)  
POST /api/auth/generate-token — guarded by x-api-key \=== process.env.FORMS\_API\_KEY. Body { user\_id }. Calls storage.createOrGetUserByFormsId(user\_id) then storage.generateAuthToken(userId). Returns { auth\_token }.  
POST /api/auth/validate-token — public. Body { token }. Calls storage.validateAndConsumeToken(token). On success: req.session.userId \= user.id, return user JSON. On failure: 401 with { message: "Invalid or expired token" }.  
Storage methods  
createOrGetUserByFormsId(formsUserId) — find user by formsUserId; if none, create one with username \= "sso\_\<formsUserId\>", formsUserId set, default role.  
generateAuthToken(userId) — random hex token (32 bytes), expires in 5 minutes, returns the token string.  
validateAndConsumeToken(token) — atomically: check token exists, not used, not expired; mark used \= true; return the joined user.  
Frontend (auth hook \+ landing page)  
On mount, read auth\_token from window.location.search.  
If present: skip the normal /api/auth/user session check. Instead POST /api/auth/validate-token with the token. On success: set user state, window.history.replaceState({}, "", window.location.pathname) to remove the token from URL. On failure: show error on landing page.  
If absent: do the normal /api/auth/user session check.  
Landing page: remove all signup/login forms. Single button "Sign In" that does window.location.href \= import.meta.env.VITE\_FORMS\_LOGIN\_URL. While validating, show a "Signing you in…" spinner.  
Env vars (use the secrets manager — do NOT hardcode)  
FORMS\_API\_KEY — random hex string, shared with Forms team.  
VITE\_FORMS\_LOGIN\_URL — Forms login URL, e.g. https://forms-gamma.earlywave.in/mid/\<my-app-slug\>.  
Important gotchas  
Dev and prod use separate databases — tokens generated on one won't validate on the other.  
Tokens are strictly one-time use; the frontend's auto-validation consumes them.  
After implementing, run npm run build before deploying so the production bundle includes the new auth hook.  
Don't collect name/college/mobile in my app anymore — that data comes from Forms or a later integration.  
What to share back with me when done  
The exact generate-token URL on my deployed app.  
Confirm the x-api-key header name and request/response shape match the spec above.  
Confirm the redirect-back URL pattern is https://\<my-app\>/?auth\_token=\<token\>.