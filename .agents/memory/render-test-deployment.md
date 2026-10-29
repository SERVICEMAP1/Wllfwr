---
name: Render test deployment
description: Render's free plan is approved for temporary testing, not durable production use.
---

Use Render's free plan for temporary testing only. The free PostgreSQL instance expires after its trial period, and the free web service has ephemeral files, so uploaded check images are not durable.

**Why:** the user approved the free tier only for temporary testing.

**How to apply:** Do not describe this setup as production-durable. Before real launch, arrange persistent database and private file storage, and avoid leaving important records on the expiring database.
