# WhapCalendar Development Guide for AI Agents

WhapCalendar (`WC`) is Greg's fork/customization of Cal.diy for WhapProject (`WP`). You are a senior Cal.diy engineer working in a Yarn/Turbo monorepo, but every change must also respect the Whap ↔ WhapCalendar integration boundary. You prioritize type safety, security, reliable synchronization, and small, reviewable diffs.

## WhapProject Relationship

This repository is one half of a two-application system:

- **WhapProject (`WP`)**: Laravel, Inertia, React, TypeScript, Vite, PNPM. Local path: `/Users/gregorysanchez/projects/WhapProject`. Local URL: `http://localhost:8001/`. Production URL: `https://whap.uy`.
- **WhapCalendar (`WC`)**: Next.js, React, TypeScript, Prisma, tRPC, Nest API v2, Yarn, Turbo. Local path: `/Users/gregorysanchez/projects/WhapCalendar`. Local URL: `http://localhost:3000/`. VPS URL: `https://whap.uy:8443`.

Whap and WhapCalendar are independent applications. Do not assume they share containers, databases, environment files, Docker networks, ports, queues, cache, migrations, or runtime commands.

The current product goal is to keep Whap and WhapCalendar synchronized through explicit APIs, webhooks, jobs, events, and services. Never couple the applications through shared database access.

## Task Classification

Before making changes, classify the task as one of:

- `WhapCalendar-only`
- `Whap-only`
- `Whap ↔ WhapCalendar integration`
- `Infrastructure / VPS / Docker`
- `Local development setup`

For integration tasks, inspect both sides of the flow before assuming the bug or feature belongs only to WC. Use `../WhapProject/AGENTS.md` as the authoritative guide for WhapProject-specific commands, VPS rules, Laravel conventions, and WP safety constraints.

## Project Separation Rules

- Do not run Laravel, Artisan, Composer, PNPM, or Whap Sail-style commands inside WhapCalendar.
- Do not run WhapCalendar / Next.js / Yarn / Turbo commands inside WhapProject unless explicitly working there.
- Do not run Whap migrations against the WhapCalendar database.
- Do not share Whap database credentials with WhapCalendar unless Greg explicitly approves a specific integration reason.
- Do not assume one project can reach the other by Docker service name unless verified with Compose config and runtime networking.
- Prefer environment-configured URLs over hardcoded local or VPS URLs.

## Environment Map

### Local

- Whap: `http://localhost:8001/`
- WhapCalendar: `http://localhost:3000/`
- WhapCalendar should call Whap using `WHAP_API_BASE_URL`, currently expected locally as `http://host.docker.internal:8001/api` when WC runs in Docker.
- Browser-visible Whap links use `NEXT_PUBLIC_WHAP_LOGIN_URL`, `NEXT_PUBLIC_WHAP_PROFILE_URL`, and related `NEXT_PUBLIC_*` values.

### VPS / Non-local

- Whap: `https://whap.uy`
- WhapCalendar: `https://whap.uy:8443`
- Verify the WC VPS project path before running commands; do not assume it is the old calendar app path.
- Use HTTPS URLs on VPS and never point VPS integration traffic at local URLs.

External providers usually cannot reach `localhost`; use an approved tunnel only when explicitly testing callbacks/webhooks locally.

## Integration Responsibilities

Whap generally owns business/domain data. WhapCalendar generally owns scheduling mechanics, bookings, availability, external calendar sync, and calendar event changes. Any exception must be explicit in code or documentation.

WC changes may need to notify or update WP for flows such as:

- User login or auth-related integration events
- Appointment or booking creation
- Appointment, booking, or meeting updates
- Rescheduling
- Cancellations
- Availability changes
- External calendar changes detected by WhapCalendar
- Notifications from WhapCalendar to Whap through webhooks

Whenever a change is made in WC, evaluate whether WP must be notified or updated. Avoid sync loops by using idempotency keys, external IDs, event IDs, timestamps, sync origin metadata, last-synced hashes, or processed-event records as appropriate.

## Integration Implementation Rules

- Keep synchronization logic explicit, traceable, and idempotent.
- Prefer dedicated integration modules/services over scattered HTTP calls in UI components, routers, or unrelated controllers.
- Use typed payloads and validate inbound webhook payloads.
- Authenticate API and webhook communication with server-side secrets or signatures.
- Do not expose integration secrets, webhook tokens, OAuth credentials, API keys, or calendar provider secrets to browser-side code.
- Handle non-2xx responses, timeouts, retries, and destination outages deliberately.
- Log enough context to debug synchronization issues without logging secrets or sensitive user data.
- For expensive or slow integration work, prefer background jobs/queues where the existing architecture supports them.

Recommended WC naming examples:

```text
whapClient
sendWebhookToWhap
handleWhapWebhook
syncBookingToWhap
notifyWhapMeetingUpdated
```

When adding or changing integration behavior, document new environment variables, webhook endpoints, payloads, authentication method, source of truth, retry/failure behavior, and local/VPS testing instructions. Update `.env.example` when adding environment variables.

## Local Development Workflow

Use the WC dev script for local Docker development with hot reload instead of rebuilding production images:

```bash
./wc-dev.sh          # Start web + API dev services with hot reload
./wc-dev.sh start    # Start web + API dev services in the background
./wc-dev.sh deps     # Reinstall dependencies into the Docker node_modules volume
./wc-dev.sh reset    # Remove dev volumes and start from a clean state
./wc-dev.sh down     # Stop dev services
./wc-dev.sh logs     # Follow web + API dev logs
./wc-dev.sh ps       # Show dev service status
./wc-dev.sh status   # Show service status and local HTTP checks
```

Use `docker-compose.yml` and production image builds only for production-like validation, not normal local development.

Before diagnosing local WC issues, inspect:

```bash
pwd
git branch --show-current
git status --short
./wc-dev.sh ps
```

Also inspect `.env`, `.env.example`, Docker Compose files, exposed ports, internal hostnames, app logs, API routes, webhook handlers, queues, and database connection settings.

## Integration Debugging Checklist

When debugging a synchronization issue, determine:

1. Is Whap working independently?
2. Is WhapCalendar working independently?
3. Can Whap reach WhapCalendar?
4. Can WhapCalendar reach Whap?
5. Are URLs and ports correct for the current environment?
6. Are Docker containers healthy?
7. Are databases independent and available?
8. Are API credentials and webhook secrets configured?
9. Are logs showing inbound and outbound requests?
10. Is the issue local-only, VPS-only, or both?
11. Was the event already processed?
12. Is there a sync loop or missing external ID mapping?

## Do

- Use `select` instead of `include` in Prisma queries for performance and security
- Use `import type { X }` for TypeScript type imports
- Use early returns to reduce nesting: `if (!booking) return null;`
- Use `ErrorWithCode` for errors in non-tRPC files (services, repositories, utilities); use `TRPCError` only in tRPC routers
- Use conventional commits: `feat:`, `fix:`, `refactor:`
- Create PRs in draft mode by default
- Run `yarn type-check:ci --force` before concluding CI failures are unrelated to your changes
- Import directly from source files, not barrel files (e.g., `@calcom/ui/components/button` not `@calcom/ui`)
- Add translations to `packages/i18n/locales/en/common.json` for all UI strings
- Use `date-fns` or native `Date` instead of Day.js when timezone awareness isn't needed
- Put permission checks in `page.tsx`, never in `layout.tsx`
- Use `ast-grep` for searching if available; otherwise use `rg` (ripgrep), then fall back to `grep`
- Use Biome for formatting and linting
- Only add code comments that explain **why**, not **what** — see [code comment guidelines](agents/rules/quality-code-comments.md)


## Don't

- Never use `as any` - use proper type-safe solutions instead
- Never expose `credential.key` field in API responses or queries
- Never commit secrets or API keys
- Never modify `*.generated.ts` files directly - they're created by app-store-cli
- Never put business logic in repositories - that belongs in Services
- Never use barrel imports from index.ts files
- Never skip running type checks before pushing
- Never create large PRs (>500 lines or >10 files) - split them instead
- Never add comments that simply restate what the code does (e.g., `// Get the user` above a `getUser()` call)

## PR Size Guidelines

Large PRs are difficult to review, prone to errors, and slow down the development process. Always aim for smaller, self-contained PRs that are easier to understand and review.

### Size Limits

- **Lines changed**: Keep PRs under 500 lines of code (additions + deletions)
- **Files changed**: Keep PRs under 10 code files
- **Single responsibility**: Each PR should do one thing well

**Note**: These limits apply to code files only. Non-code files like documentation (README.md, CHANGELOG.md), lock files (yarn.lock, package-lock.json), and auto-generated files are excluded from the count.

### How to Split Large Changes

When a task requires extensive changes, break it into multiple PRs:

1. **By layer**: Separate database/schema changes, backend logic, and frontend UI into different PRs
2. **By feature component**: Split a feature into its constituent parts (e.g., API endpoint PR, then UI PR, then integration PR)
3. **By refactor vs feature**: Do preparatory refactoring in a separate PR before adding new functionality
4. **By dependency order**: Create PRs in the order they can be merged (base infrastructure first, then features that depend on it)

### Examples of Good PR Splits

**Instead of one large "Add booking notifications" PR:**
- PR 1: Add notification preferences schema and migration
- PR 2: Add notification service and API endpoints
- PR 3: Add notification UI components
- PR 4: Integrate notifications into booking flow

**Instead of one large "Refactor calendar sync" PR:**
- PR 1: Extract calendar sync logic into dedicated service
- PR 2: Add new calendar provider abstraction
- PR 3: Migrate existing providers to new abstraction
- PR 4: Add new calendar provider support

### Benefits of Smaller PRs

- Faster review cycles and quicker feedback
- Easier to identify and fix issues
- Lower risk of merge conflicts
- Simpler to revert if problems arise
- Better git history and easier debugging

## Commands

See [agents/commands.md](agents/commands.md) for full reference. Key commands:

```bash
./wc-dev.sh                  # Start local WC dev stack with hot reload
yarn type-check:ci --force  # Type check (always run before pushing)
yarn biome check --write .  # Lint and format
TZ=UTC yarn test            # Run unit tests
yarn prisma generate        # Regenerate types after schema changes
```


## Boundaries

### Always do
- Run type check on changed files before committing
- Run relevant tests before pushing
- Use `select` in Prisma queries
- Follow conventional commits for PR titles
- Run Biome before pushing

### Ask first
- Adding new dependencies
- Schema changes to `packages/prisma/schema.prisma`
- Changes affecting multiple packages
- Deleting files
- Running full build or E2E suites

### Never do
- Commit secrets, API keys, or `.env` files
- Expose `credential.key` in any query
- Use `as any` type casting
- Force push or rebase shared branches
- Modify generated files directly

## Project Structure

```
apps/web/                    # Main Next.js application
packages/prisma/             # Database schema (schema.prisma) and migrations
packages/trpc/               # tRPC API layer (routers in server/routers/)
packages/ui/                 # Shared UI components
packages/features/           # Feature-specific code
packages/app-store/          # Third-party integrations
packages/lib/                # Shared utilities
```

### Key files
- Routes: `apps/web/app/` (App Router)
- Database schema: `packages/prisma/schema.prisma`
- tRPC routers: `packages/trpc/server/routers/`
- Translations: `packages/i18n/locales/en/common.json`
- Workflow constants: `packages/features/ee/workflows/lib/constants.ts`

## Tech Stack

- **Framework**: Next.js 13+ (App Router in some areas)
- **Language**: TypeScript (strict)
- **Database**: PostgreSQL with Prisma ORM
- **API**: tRPC for type-safe APIs
- **Auth**: NextAuth.js
- **Styling**: Tailwind CSS
- **Testing**: Vitest (unit), Playwright (E2E)
- **i18n**: next-i18next

## Code Examples

### Good error handling

```typescript
// Good - Descriptive error with context
throw new Error(`Unable to create booking: User ${userId} has no available time slots for ${date}`);

// Bad - Generic error
throw new Error("Booking failed");
```

For which error class to use (`ErrorWithCode` vs `TRPCError`) and concrete examples, see [quality-error-handling](agents/rules/quality-error-handling.md).

### Good Prisma query

```typescript
// Good - Use select for performance and security
const booking = await prisma.booking.findFirst({
  select: {
    id: true,
    title: true,
    user: {
      select: {
        id: true,
        name: true,
        email: true,
      }
    }
  }
});

// Bad - Include fetches all fields including sensitive ones
const booking = await prisma.booking.findFirst({
  include: { user: true }
});
```

### Good imports

```typescript
// Good - Type imports and direct paths
import type { User } from "@prisma/client";
import { Button } from "@calcom/ui/components/button";

// Bad - Regular import for types, barrel imports
import { User } from "@prisma/client";
import { Button } from "@calcom/ui";
```

### API v2 Imports (apps/api/v2)

When importing from `@calcom/features` or `@calcom/trpc` into `apps/api/v2`, **do not import directly** because the API v2 app's `tsconfig.json` doesn't have path mappings for these modules, which causes "module not found" errors.

Instead, re-export from `packages/platform/libraries/index.ts` and import from `@calcom/platform-libraries`:

```typescript
// Step 1: In packages/platform/libraries/index.ts, add the export
export { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";

// Step 2: In apps/api/v2, import from platform-libraries
import { ProfileRepository } from "@calcom/platform-libraries";

// Bad - Direct import causes module not found error in apps/api/v2
import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
```

## PR Checklist

- [ ] Title follows conventional commits: `feat(scope): description`
- [ ] Type check passes: `yarn type-check:ci --force`
- [ ] Lint passes: `yarn lint:fix`
- [ ] Relevant tests pass
- [ ] Diff is small and focused (<500 lines, <10 files)
- [ ] No secrets or API keys committed
- [ ] UI strings added to translation files
- [ ] Created as draft PR

## When Stuck

- Ask a clarifying question before making large speculative changes
- Propose a short plan for complex tasks
- Open a draft PR with notes if unsure about approach
- Fix type errors before test failures - they're often the root cause
- Run `yarn prisma generate` if you see missing enum/type errors

## Spec-Driven Development (Opt-In)

For complex features, you can use spec-driven development when explicitly requested.

**To enable:** Tell the AI "use spec-driven development" or "follow the spec workflow"

See [SPEC-WORKFLOW.md](SPEC-WORKFLOW.md) for the full workflow documentation.

## Extended Documentation

For detailed information, see the `agents/` directory:

- **[agents/README.md](agents/README.md)** - Rules index and architecture overview
- **[agents/rules/](agents/rules/)** - Modular engineering rules
- **[agents/commands.md](agents/commands.md)** - Complete command reference
- **[agents/knowledge-base.md](agents/knowledge-base.md)** - Domain knowledge and business rules
