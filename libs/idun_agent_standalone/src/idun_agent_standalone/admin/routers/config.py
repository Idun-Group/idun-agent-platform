"""``/admin/api/v1/config`` — operator-facing config export.

Spec §3.3 lists ``GET /config/export`` so operators can dump the
current DB-backed state to YAML for backup, hub migration, or
diff-against-bootstrap. The CLI ``idun-standalone export`` reuses the
same helper (``config_io.export_db_as_yaml``) so the two paths cannot
diverge.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response

from idun_agent_standalone.admin.deps import require_auth
from idun_agent_standalone.config_io import export_db_as_yaml

router = APIRouter(
    prefix="/admin/api/v1/config",
    tags=["config"],
    dependencies=[Depends(require_auth)],
)


@router.get("/export", response_class=Response)
async def export_config(request: Request) -> Response:
    """Dump the current DB-backed config as YAML.

    Returns ``application/yaml`` with a ``Content-Disposition`` header
    so browsers prompt to save as ``idun-config.yaml``.
    """
    sm = request.app.state.sessionmaker
    async with sm() as session:
        body = await export_db_as_yaml(session)
    return Response(
        content=body,
        media_type="application/yaml",
        headers={"Content-Disposition": "attachment; filename=idun-config.yaml"},
    )
