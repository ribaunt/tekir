<div align="center">
<img src="public/favicon180.png" width="200"/>
<h1>Tekir Search</h1>
</div>


<p align="center">
  <a href="https://tekir.co">Try Tekir</a> |
  <a href="https://github.com/computebaker/tekir/issues/new">Report an Issue</a> |
  <a href="https://tekir.co/links">Links & More</a>
</p>

> [!WARNING]  
> Hosted Tekir is being sunset. You won't be able to use Tekir via `tekir.co` starting October 1 2026. [Read the Turkish announcement.](https://btt.community/t/tekir-meta-arama-motoru/18108/150?u=musti)

### What Tekir is

Tekir is a fast, privacy‑first search experience that helps you find what you need across the web, images, and news—and also chat with an AI assistant called Karakulak. It doesn’t track you or collect personal data, keeping your searches private by design. Tekir aims to feel simple and snappy, with a clean interface that gets out of your way so you can focus on finding answers.

### Technical elements

- Next.js App Router + React 18 power a fast, minimal UI with progressive rendering, Suspense, and Turbopack for quick dev cycles.
- Convex is the real‑time backend: it stores users, settings, sessions, feedback, and analytics; React hooks (useQuery/useMutation) keep data live across tabs.
- Privacy-first auth: HttpOnly JWT with automatic refresh; server guards verify roles from Convex to enforce RBAC without exposing tokens to the client.
- Multi‑modal search is normalized behind uniform APIs, with request deduplication and sessionStorage caching (10‑minute TTL) for snappy repeats.
- Provider strategy uses Brave as primary with graceful fallbacks, while Dive blends AI answers with selected web sources for verifiable results.
- Karakulak (the built‑in AI) integrates multiple model backends via lightweight API routes and consistent caching/streaming behavior.
- Settings sync instantly via Convex subscriptions (no manual polling), and all search/AI usage aggregates stay privacy‑preserving and purgeable.
- Tailwind + Radix UI keep the interface lean and accessible; small SVG charts and CSV export provide data for the administrators.

### License

See [LICENSE](LICENSE).

### Security

If you believe you have found a security vulnerability, please responsibly
disclose it by [using this
link](https://github.com/computebaker/tekir/security/advisories/new) instead of
opening a public issue. We will investigate all legitimate reports. To know
more, please see our [security policy](SECURITY.md).

### Contributing

Until our team is confident that we can properly manage new pull requests and contributions, we cannot guarantee that your submissions will be reviewed. The app is growing rapidly without a solid roadmap, and we want to avoid handling contributions poorly. We sincerely apologize for this and appreciate your patience as we work toward opening up for community contributions.
