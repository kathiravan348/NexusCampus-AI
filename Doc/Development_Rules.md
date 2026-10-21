# NexusCampus AI: Development Rules & Guidelines

These rules dictate the engineering standards, architecture constraints, and UI principles for the entire lifecycle of the NexusCampus AI project.

## 1. Modularity & Dependencies
- **Strict Decoupling:** Every secondary module must operate independently. Do not create hard dependencies between optional modules.
- **Mandatory Core Base:** Primary modules (Authentication, Logging, Tenant Management, Core Database) are mandatory. All other modules can safely depend on them.
- **Subscription-Based Access:** Secondary modules must toggle features based on the active tenant's subscription plan or purchased add-ons.
- **Graceful Degradation:** If a dependent module (or an AI service) is disabled, unsubscribed, or fails, the application must handle it gracefully without crashing the user's workflow.

## 2. UI/UX & Theming
- **Dynamic Multi-Theming:** The UI must fully support user-driven theme customization. Users should be able to change any primary or secondary color to match their institution's branding.
- **CSS Variables Only:** Use CSS custom properties (e.g., `--primary-color`, `--bg-color`) for all colors, fonts, and spacing to allow instant theme switching without code changes.
- **Visual Consistency:** Stick to the established design system (glassmorphism, clean typography, structured grids). Do not introduce rogue inline styles.

## 3. Multi-Tenancy & Data Security
- **Tenant ID Everywhere:** Every database query, API request, caching key, and file storage lookup must explicitly filter by the active `tenant_id`.
- **Zero Data Leakage:** Ensure strict data isolation between institutions. Use Row-Level Security (RLS) on the database level where possible.
- **Role-Based Access (RBAC):** All actions must verify the user's role and permissions before execution.

## 4. AI Feature Integration
- **AI as an Enhancement:** AI features are optional layers. The core campus management workflows must remain fully functional even if AI processing fails or is disabled.
- **Credit Metering:** Every AI API call (LLM, Vision, Audio, etc.) must be tracked and logged against the tenant's AI credit quota for accurate billing.
- **Data Privacy & Sanitization:** Never send Personally Identifiable Information (PII) to external AI models unless strictly required and legally consented to. 

## 5. Coding Standards & Maintenance
- **Bulletpoint Documentation:** Keep all documentation and inline comments brief, clear, and formatted as bullet points where possible. Avoid massive paragraphs.
- **Standardized Error Handling:** All errors must be logged centrally (via the core Logging module) with context, including the module name, tenant ID, and user action.
- **Clean Code:** Prioritize readability and maintainability over "clever" or overly complex code. If a new developer joins, they should understand a module in 10 minutes.
