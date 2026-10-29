---
name: Identity data boundary
description: Cedarline enrollment should not collect or retain raw Social Security numbers.
---

**Rule:** Do not add a raw SSN field or store SSNs in Cedarline. If identity verification requiring an SSN becomes necessary, use a vetted provider's secure hosted flow and retain only the verification result or provider reference.

**Why:** Cedarline has no secure identity-verification path, and storing raw SSNs in its application database would create unnecessary exposure.

**How to apply:** Keep enrollment fields limited to the information needed for application review. Admin requests should not solicit SSNs through free-text notes; use a secure verification provider for sensitive identity checks.
