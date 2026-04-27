"""Reserved for operational schemas.

Pending audit-log implementation in a later version of the standalone
admin/db rework. The standalone error envelope already covers
rate-limit responses via ``StandaloneAdminError`` with
``code = rate_limited`` (see ``errors.py``). When audit ships, this
module will define structured audit event types per spec
§"Operational hardening".

This module intentionally has no public types so its import path is
reserved without locking content.
"""

from __future__ import annotations

# No public types yet. See module docstring.
