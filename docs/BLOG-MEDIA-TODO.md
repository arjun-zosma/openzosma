# Blog & Media Content Todo

> Tracking media assets, blog content, and video strategy for OpenZosma.

## Assets We Already Have

| Asset                | Location                          | Used In                              |
| -------------------- | --------------------------------- | ------------------------------------ |
| Setup demo GIF       | `assets/setup-demo.gif`           | README, Blog 6 (Deploy in 5 Minutes) |
| Architecture diagram | `assets/diagram-architecture.png` | README, ARCHITECTURE.md              |
| Hierarchy diagram    | `assets/diagram-hierarchy.png`    | README                               |

## Assets Needed

### For Blog 6 (Deploy Your First AI Agent in 5 Minutes)

- [ ] **Agent audit trail screenshot** — `public/images/blogs/agent-audit-trail.jpeg` on website
  - Should show: SQL query, database response, timing, data source name
  - Record from actual dashboard during a real query
  - Style: Clean browser screenshot, no personal data visible

### GIFs for Future Blogs

- [ ] **Data source connection GIF** — 10-15s showing "Add Connection" form being filled and saved
- [ ] **Multi-agent delegation GIF** — showing CEO Agent delegating to Sales + Support agents
- [ ] **WhatsApp interaction GIF** — asking a question from phone, getting answer back

### Video Content (Later Stage)

- [ ] **2-minute setup video** — Narrated walkthrough of `pnpm create openzosma` from start to finish
- [ ] **5-minute feature tour** — Dashboard walkthrough, data sources, audit trail, agent config
- [ ] **Architecture explainer** — 3-minute whiteboard-style video explaining gateway → orchestrator → sandbox flow

## Blog Content Backlog

| #   | Blog                                                 | Status           | Notes                                  |
| --- | ---------------------------------------------------- | ---------------- | -------------------------------------- |
| 6   | Deploy Your First AI Agent in 5 Minutes              | 📝 Draft written | Needs audit trail image, GIF thumbnail |
| —   | OpenZosma Architecture Deep Dive                     | 📋 Planned       | Technical post for HN/dev.to           |
| —   | Building with the OpenZosma SDK                      | 📋 Planned       | Tutorial for developers                |
| —   | From Local to Production: OpenZosma Deployment Guide | 📋 Planned       | Docker, K8s, orchestrator mode         |

## Notes on Media Strategy

- **GIF thumbnails** work great for technical tutorials — they signal "this is hands-on" before the reader clicks
- **Demo videos** should be short (<2 min) and silent with captions (works on mobile without sound)
- **Screenshots** should use consistent browser framing (same window size, no bookmarks bar, clean desktop)
- Record on a dark or light theme consistently — the dashboard supports both, pick one for all media
- When recording GIFs, use a tool like Screen Studio or LICEcap at 15fps, 800px width max for fast loading
