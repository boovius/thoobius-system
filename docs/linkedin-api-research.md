# LinkedIn API Research: Company Search, People Lookup, Mutual Connections

**Date:** June 4, 2026
**Researcher:** Amelie (climate-tech recruiting lens)
**Sources:** LinkedIn Developer Product Catalog, Microsoft Learn API docs, developer community reports, third-party analysis

---

## Executive Summary

**Bottom-line verdict: No, you cannot realistically build this tool using LinkedIn's official API.**

All three desired capabilities — company search, finding employees at companies, and identifying mutual connections — are either **gated behind partner programs you're unlikely to get into** or **simply not exposed through the API at all**. LinkedIn has systematically locked down these capabilities over the past decade, and the situation has only gotten tighter through 2025–2026.

---

## Capability 1: Search/Find Companies by Name

### Verdict: **Partially possible** — but access is restricted

### What exists

LinkedIn offers two relevant endpoints:

1. **Company Search API** (`/v2/companySearch?q=search`)
   - Search companies by keywords, industry, location, size, Fortune ranking, network degree
   - Returns organization URNs with basic info (name, vanityName, logo, locations)
   - Supports filters: industry, company size, follower count, Fortune ranking
   - **⚠️ "This permission is granted to selected developers only"** — verbatim from LinkedIn docs

2. **Organization Lookup API** (`/rest/organizations/{id}` and `/rest/organizationsLookup`)
   - Look up a specific company by ID, vanity name, or email domain
   - Non-admin access returns only: id, name, localizedName, localizedWebsite, vanityName, logoV2, locations, primaryOrganizationType
   - Requires `rw_organization_admin` permission (Marketing API partner) or `r_compliance` (closed)
   - Full details (industry, size, specialties) require you to be an **admin of that organization**

### Access path

- You'd need to be an approved **Marketing API partner** through LinkedIn's Developer Portal
- Apply via the Products tab on your app → request "Advertising API" or "Community Management API"
- LinkedIn reviews your use case, company, and how data will be used
- **Approval is not guaranteed and can take weeks to months**
- Even if approved, the Company Search endpoint is separately restricted to "select developers"

### What you'd realistically get

If you just want to look up a company you already know the ID/vanity name of, the Organization Lookup API is more accessible (comes with Marketing API access). But **searching by name** (the fuzzy discovery use case) requires the Company Search endpoint, which is an additional restricted permission even within the Marketing partner tier.

---

## Capability 2: Find People Who Work at a Company

### Verdict: **Not possible** via the official API

### What exists (and what doesn't)

**There is no official LinkedIn API endpoint to search for or enumerate employees at a given company.**

Here's what the official API actually provides for people data:

1. **Profile API** (`/v2/me` and `/v2/people/(id:{person ID})`)
   - Can retrieve the authenticated user's own profile
   - Can retrieve another member's profile **only if you already have their Person ID** (obtained through other restricted APIs)
   - Cannot search or browse profiles by company affiliation
   - Person IDs are app-specific — sharing across apps results in 404 errors
   - **"The use of this API is restricted to those developers approved by LinkedIn"**
   - You can never store profile data for non-authenticated members
   - Returns nothing for members who've limited their "Off-LinkedIn Visibility"

2. **Connections API** (`/v2/connections?q=viewer`)
   - Returns only the **authenticated user's** 1st-degree connections
   - Returns Person URNs (with optional decoration for name)
   - **"You cannot browse connections"** — cannot get connections of connections (2nd-degree)
   - Requires `r_1st_connections` permission — restricted to approved developers
   - No filtering by company

3. **People Search API** — **Does not exist** in the current API
   - LinkedIn had a People Search API years ago; it was fully deprecated
   - There is no public endpoint for `search?q=people` or similar
   - The only "people search" capability is inside Sales Navigator (SNAP partner program)

### Why this is a dead end

LinkedIn deliberately removed people search from their API to protect member privacy and to monetize this capability through:
- **Sales Navigator** ($100-180/month per seat for UI access, no API without SNAP)
- **LinkedIn Recruiter** ($8,000-12,000+/year per seat)

### The Sales Navigator / SNAP route

The **Sales Navigator Application Platform (SNAP)** is the only official API path to people-search-at-companies capability. However:

- **"We are not currently accepting new partners"** — verbatim from LinkedIn's SNAP documentation page (as of May 2025, still true as of June 2026)
- SNAP is for established CRM/sales-tech vendors with enterprise Sales Navigator contracts
- Requires a rigorous application process and LinkedIn approval
- Individual developers and small companies are explicitly not eligible
- The SNAP API provides Display Services (embeddable iframes), Analytics, and Sync — not a raw people-search REST endpoint

---

## Capability 3: Find Mutual/Shared Connections

### Verdict: **Not possible** via the official API

### What exists

1. **Connections API** (covered above)
   - Returns your own 1st-degree connections only
   - Cannot see connections of other members
   - **Cannot compute mutual connections** — this would require seeing another person's connection list, which the API explicitly forbids
   - "2nd-degree connections, or connections of your member's connections, are not available from LinkedIn"

2. **Member Data Portability API** (DMA compliance)
   - EU/EEA members only
   - Returns your own data (posts, activity, history) — not relationship graphs
   - Does not include a connections list or mutual connections

3. **No mutual connections endpoint**
   - LinkedIn shows mutual connections in the UI but has **never exposed this through the API**
   - Multiple Stack Overflow questions from 2018-2023 confirm this has been asked and answered: no API support
   - The old v1 API (pre-2015) had some connection-browsing capabilities; these were fully removed

### Why this is locked down

Mutual connections are a core monetization lever for Sales Navigator and Recruiter. Exposing them via API would undermine the premium product value. LinkedIn's position has been consistent: relationship graph data stays inside LinkedIn's walled garden.

---

## Access Restrictions Summary

| Capability | API Product Needed | Access Level | Realistic for Us? |
|---|---|---|---|
| Company search by name | Company Search API (Marketing) | Restricted to select partners | ❌ Unlikely |
| Company lookup by ID | Organization Lookup API (Marketing) | Marketing API partner | ⚠️ Possible with effort |
| Find employees at company | Sales Navigator (SNAP) | Enterprise partner program, **currently closed** | ❌ No |
| List own connections | Connections API | Restricted, approved developers | ⚠️ Possible but limited |
| Find mutual connections | None exists | N/A | ❌ Impossible |

### Open permissions (what anyone can get)

The only API permissions available to all developers without partner approval are:
- **Sign In with LinkedIn** (OpenID Connect) — `profile`, `email` scopes
- **Share on LinkedIn** — `w_member_social`

That's it. Everything else requires LinkedIn approval through a partner program.

---

## Rate Limits

- Rate limits are **per-application** and **per-member**, reset daily at midnight UTC
- Specific limits are not published — you must check your app's Analytics tab in the Developer Portal
- Exceeding limits returns HTTP 429
- LinkedIn sends email alerts at 75% threshold (1-2 hour delay)
- Pagination on Connections API: max 50 per page recommended

---

## Compliance & Legal Gotchas

1. **No scraping allowed** — LinkedIn's ToS explicitly prohibit automated data collection outside the official API. They actively enforce this (legal action against scrapers, including the hiQ Labs case).

2. **Data storage restrictions** — You may only store profile data for authenticated members with their explicit permission. You may never store data for non-authenticated members.

3. **GDPR/CCPA** — Any data handling must comply with data protection regulations. LinkedIn is strict about this.

4. **Off-LinkedIn Visibility** — Members can opt out of having their data visible to third-party apps. The API respects this setting.

5. **Person IDs are app-scoped** — Each member's ID is unique to your application context. No cross-referencing between apps.

---

## Alternatives & Workarounds

Since the official API can't do what we need, here's the realistic landscape:

### Third-Party Data APIs

These services maintain their own LinkedIn data indexes (through various means):

| Provider | Company Search | People at Company | Mutual Connections | Notes |
|---|---|---|---|---|
| **LinkdAPI** | ✅ | ✅ | ❌ | Relatively new, API-first |
| **Apollo.io** | ✅ | ✅ | ❌ | Database-based (can be stale), free tier available |
| **ZoomInfo** | ✅ | ✅ | ❌ | Enterprise pricing ($15K+/year), most comprehensive |
| **Clearbit** (now HubSpot) | ✅ | Partial | ❌ | Good for enrichment, less for search |
| **Apify scrapers** | ✅ | ✅ | ✅* | Scraping-based — legal risk, fragile |
| **PhantomBuster** | ✅ | ✅ | ✅* | Browser automation — ban risk, ToS violation |

\* Apify and PhantomBuster can get mutual connections by scraping LinkedIn's UI, but this violates LinkedIn's ToS and risks account suspension.

**None of the legitimate third-party APIs offer mutual connections** because that data requires an authenticated session context (your specific relationship to another person).

### Manual/Semi-Automated Approaches

For the mutual connections use case specifically, the only approaches that work are:
1. **Sales Navigator UI** — shows TeamLink connections (shared contacts across your org's Sales Nav team)
2. **LinkedIn's own UI** — shows mutual connections when viewing a profile
3. **Browser extensions** — some tools overlay LinkedIn's UI to export visible mutual connection data (gray area, ban risk)

### The "Good Enough" Stack

For a climate-tech networking tool, a realistic approach might be:

1. **Company search** → Use Apollo.io free tier or similar data provider API
2. **People at companies** → Use Apollo.io, ZoomInfo, or similar for employee lookup
3. **Mutual connections** → Accept this is manual. Surface LinkedIn profile URLs and let the user check mutual connections themselves in the LinkedIn UI

---

## Recruiting-Lens Assessment

As someone who's worked the climate-tech hiring world: **LinkedIn has made a deliberate business decision to keep relationship data behind their paywall.** This isn't a technical limitation — it's a moat.

The capabilities Josh is asking about are exactly what Sales Navigator and Recruiter are designed to monetize. LinkedIn charges $100-180/month/seat for Sales Navigator and $8,000-12,000+/year/seat for Recruiter precisely because people/company search + relationship intelligence is their core value prop.

**What I'd recommend:**

1. **Don't fight the walled garden.** Building a tool that depends on cracking LinkedIn's API access is a losing game. They will change access rules, deprecate endpoints, and close loopholes.

2. **Layer data sources.** Use Apollo.io or a similar provider for company + people data (this is what most sales/recruiting tools actually do). Accept that mutual connections require a different approach.

3. **For mutual connections specifically:** Consider whether the tool could instead surface "connection paths" by:
   - Asking the user to export their own LinkedIn connections (LinkedIn provides a data download)
   - Cross-referencing that against target company employees from a third-party data source
   - This gives you "people you know at Company X" without needing the API

4. **Budget consideration:** If this is a high-priority, funded project, a Sales Navigator Team subscription ($100-180/month per seat) gives you the UI-level access to all three capabilities. It's not API access, but it might be "good enough" for the actual workflow.

---

## Sources

- LinkedIn Developer Product Catalog: https://developer.linkedin.com/product-catalog
- Organization Lookup API: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-lookup-api
- Company Search API: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/company-search
- Connections API: https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/connections-api
- Profile API: https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api
- Getting Access: https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access
- SNAP Documentation: https://learn.microsoft.com/en-us/linkedin/sales/
- Member Data Portability: https://learn.microsoft.com/en-us/linkedin/dma/member-data-portability/member-data-portability-member/
- Rate Limits: https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits
- Multiple third-party guides and Stack Overflow threads (2024-2026)
