"""Logs router for proxying Loki API requests."""

import httpx
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
import os

router = APIRouter()

# Get Loki URL from environment, default to localhost
LOKI_URL = os.getenv("LOKI_URL", "http://localhost:3100")


@router.get("/query_range")
async def query_logs(
    query: str = Query(..., description="LogQL query string"),
    start: str = Query(..., description="Start time in RFC3339 format"),
    end: str = Query(..., description="End time in RFC3339 format"),
    limit: Optional[int] = Query(100, description="Maximum number of entries to return"),
    direction: Optional[str] = Query("backward", description="Direction to scan entries"),
):
    """
    Proxy Loki query_range API requests.

    This endpoint forwards requests to Loki's query_range API to avoid CORS issues
    when the frontend tries to access Loki directly.
    """
    try:
        # Build query parameters for Loki
        params = {
            "query": query,
            "start": start,
            "end": end,
            "limit": limit,
            "direction": direction,
        }

        # Remove None values
        params = {k: v for k, v in params.items() if v is not None}

        # Make request to Loki
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{LOKI_URL}/loki/api/v1/query_range",
                params=params
            )

            # Return Loki's response
            if response.status_code == 200:
                return response.json()
            else:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Loki request failed: {response.text}"
                )

    except httpx.RequestError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Failed to connect to Loki at {LOKI_URL}: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@router.get("/labels")
async def get_labels(
    start: Optional[str] = Query(None, description="Start time in RFC3339 format"),
    end: Optional[str] = Query(None, description="End time in RFC3339 format"),
):
    """
    Get available labels from Loki.
    """
    try:
        params = {}
        if start:
            params["start"] = start
        if end:
            params["end"] = end

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{LOKI_URL}/loki/api/v1/labels",
                params=params
            )

            if response.status_code == 200:
                return response.json()
            else:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Loki request failed: {response.text}"
                )

    except httpx.RequestError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Failed to connect to Loki at {LOKI_URL}: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@router.get("/label/{label_name}/values")
async def get_label_values(
    label_name: str,
    start: Optional[str] = Query(None, description="Start time in RFC3339 format"),
    end: Optional[str] = Query(None, description="End time in RFC3339 format"),
):
    """
    Get available values for a specific label.
    """
    try:
        params = {}
        if start:
            params["start"] = start
        if end:
            params["end"] = end

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{LOKI_URL}/loki/api/v1/label/{label_name}/values",
                params=params
            )

            if response.status_code == 200:
                return response.json()
            else:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Loki request failed: {response.text}"
                )

    except httpx.RequestError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Failed to connect to Loki at {LOKI_URL}: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )