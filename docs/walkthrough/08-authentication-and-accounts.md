## 8. Authentication and accounts

> **Plain English.** Register with e-mail and password, prove you own the e-mail address by clicking a confirmation, then sign in. Passwords are stored scrambled, never in the clear. Administrators are either promoted on the admin page or listed in a configuration variable. Every sensitive action is limited to a few attempts per hour so nobody can guess passwords by brute force.

Files: [auth.ts](../../src/lib/auth.ts), [auth.config.ts](../../src/lib/auth.config.ts), [middleware.ts](../../src/middleware.ts), [(auth)/actions.ts](../../src/app/(auth)/actions.ts), [verify/actions.ts](../../src/app/(auth)/verify/actions.ts), [rate-limit.ts](../../src/lib/rate-limit.ts).

### Register and verify — and why the verification link is a button

```mermaid
sequenceDiagram
    participant P as Person
    participant W as Website
    participant M as Mail scanner
    participant DB as Database

    P->>W: register
    W->>DB: user + bcrypt hash + 24 h token
    W-->>P: e-mail with /verify?token=…
    rect rgb(255,229,223)
    Note over M: corporate scanners GET every link<br/>before the person clicks
    M->>W: GET /verify?token=…
    W-->>M: a page with a button — nothing changes
    end
    rect rgb(230,242,236)
    P->>W: click "Confirm" (a POST)
    W->>DB: emailVerified = now
    W-->>P: redirect to login
    end
```

The GET is side-effect free on purpose: before this change, mail scanners (Microsoft Safe Links, Proofpoint, Gmail) were consuming the one-time token before the person clicked. The token is also deliberately **left in place after success**, so a scanner firing after the click, or a double-click, lands on "already verified" instead of an error. The page even tells the user why: "This extra click keeps automated e-mail security scanners from activating accounts on your behalf."

### Login, and where you land afterwards

```mermaid
flowchart TB
    A["POST login"] --> L{"rate limits:<br/>10 / 15 min per e-mail<br/>40 / 15 min per IP"}
    L -- exceeded --> X["'Too many attempts, retry in N min'"]
    L -- ok --> B["bcrypt.compare(password, hash)"]
    B -- wrong --> Y["'Incorrect e-mail or password'"]
    B -- right --> C{"e-mail verified?"}
    C -- no --> Z["'Resend verification e-mail' path"]
    C -- yes --> D["signed JWT cookie, 14 days<br/>carrying id, role, name, affiliation"]
    D --> E{"?next= present<br/>and starts with '/'?"}
    E -- yes --> F["go there"]
    E -- no --> G{"has any submissions?"}
    G -- yes --> H["/submissions"]
    G -- no --> I["/submit"]
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    classDef good fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    class A,L,B,C,E,G web
    class X,Y,Z danger
    class D,F,H,I good
```

The `startsWith('/')` check blocks open redirects to other sites. Sessions are signed JWT cookies — no session table, so the database is not touched to verify a request. The `next` parameter is how a deep link survives login: open `/submissions/abc` while signed out and you come back to exactly that page.

### Authorization has two layers, and the first is not the boundary

```mermaid
flowchart TB
    R["request"] --> MW["<b>Middleware</b> — runs at the edge, before the page<br/>protects /submit, /profile, /admin and exactly /submissions<br/>no session → redirect to /login?next=…<br/>non-admin on /admin → home"]
    MW --> PG["page or server action"]
    PG --> RQ["<b>requireUser() / requireAdmin()</b><br/>re-checked inside every server action"]
    RQ --> DBX[("database")]
    classDef person fill:#EFE6F5,stroke:#6B3FA0,color:#1d2428
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    class R person
    class MW,PG web
    class RQ danger
    class DBX data
```

Middleware is a convenience that keeps signed-out users off the pages; the real check is inside each action. Two details worth knowing: `auth.config.ts` is split from `auth.ts` because middleware runs at the *edge* where Prisma cannot load; and the `ADMIN_EMAILS` variable is **re-read on every call** and applied in the session callback, so adding an address there makes that person an admin on their next request — no waiting for a token to expire.

### Rate limiting without a memory

Vercel functions are stateless — an in-memory counter would reset on every request — so the counter is the database.

```mermaid
flowchart TB
    A["rateLimit(key, limit, window)"] --> B["COUNT RateLimitHit rows<br/>with this key newer than now − window"]
    B --> C{"count ≥ limit?"}
    C -- yes --> D["find the oldest hit in the window<br/>retryAfter = when it leaves the window"]
    D --> X["blocked, with a precise 'try again in …'"]
    C -- no --> E["INSERT one hit"]
    E --> F{"2 % chance"}
    F -- yes --> G["delete hits older than 24 h<br/>(fire-and-forget)"]
    F -- no --> H["allowed"]
    G --> H
    classDef web fill:#F2E6EC,stroke:#7A003C,color:#1d2428
    classDef data fill:#E3F0F5,stroke:#0D5D78,color:#1d2428
    classDef danger fill:#FFE5DF,stroke:#B3261E,color:#1d2428
    classDef good fill:#E6F2EC,stroke:#0E5B3D,color:#1d2428
    class A,C,F web
    class B,D,E,G data
    class X danger
    class H good
```

The 2 % probabilistic prune means there is no clean-up cron to run or forget. Configured limits:

| Action | Limit |
|---|---|
| Register | 5 / hour / IP |
| Resend verification | 3 / hour / e-mail |
| Login | 10 / 15 min per e-mail **and** 40 / 15 min per IP |
| Password reset request | 3 / hour / e-mail, 10 / hour / IP |
| Contact form | 5 / hour / IP |
| Upload URLs | 30 / hour / user |
| Resend a collaborator invite | 1 / 12 h per person |
| Dry runs (separate quota, from real rows) | 5 / hour; admins unlimited |

### Other account details

- Password policy: ≥ 8 characters with an upper-case letter, a lower-case letter and a digit. Hash: bcrypt, cost 11 (about a tenth of a second per check — trivial for one login, ruinous for a million guesses).
- Tokens: 256-bit random, one live token per purpose per user; verification 24 h, reset 1 h. A successful password reset also sets `emailVerified` — proving mailbox control is treated as equivalent to clicking the verification link.
- Resend-verification and forgot-password always answer "if that address is registered…" so they cannot be used to discover accounts. Registration reports a duplicate e-mail explicitly — a deliberate usability trade-off.
- Avatars are resized in the browser to 256 px JPEG, capped at 400 KB on the server, stored as bytes in Postgres, served with a 24 h cache and an ETag derived from `avatarUpdatedAt`.

**Files to open, in order:** [auth.config.ts](../../src/lib/auth.config.ts) → [auth.ts](../../src/lib/auth.ts) → [middleware.ts](../../src/middleware.ts) → [(auth)/actions.ts](../../src/app/(auth)/actions.ts) → [verify/actions.ts](../../src/app/(auth)/verify/actions.ts) → [rate-limit.ts](../../src/lib/rate-limit.ts).

