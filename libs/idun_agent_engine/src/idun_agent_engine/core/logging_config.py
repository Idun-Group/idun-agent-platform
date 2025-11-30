import structlog
import uuid
import logging
import sys
import os
import asyncio
import json
import time
from typing import Any, Dict, Optional
from queue import Queue
import httpx


def add_log_id(logger, method_name, event_dict):
    event_dict["log_id"] = str(uuid.uuid4())
    return event_dict


class LokiProcessor:
    def __init__(self):
        self.enabled = os.getenv("LOKI_ENABLED", "true").lower() == "true"
        self.loki_url = os.getenv("LOKI_URL", "http://localhost:3100")
        self.batch_size = int(os.getenv("LOKI_BATCH_SIZE", "10"))
        self.queue = Queue()
        self.worker_started = False

    def __call__(self, logger, method_name, event_dict):
        if self.enabled:
            component = event_dict.get("component")
            if not component:
                return event_dict

            if not self.worker_started:
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(self._start_worker())
                    self.worker_started = True
                except RuntimeError:
                    pass

            try:
                serializable_dict = {}
                for k, v in event_dict.items():
                    try:
                        json.dumps(v)
                        serializable_dict[k] = v
                    except (TypeError, ValueError):
                        serializable_dict[k] = str(v)

                loki_event = {
                    "timestamp": int(time.time() * 1000000000),
                    "line": json.dumps(serializable_dict),
                    "stream": {
                        "component": serializable_dict.get("component"),
                        "operation": serializable_dict.get("operation", "unknown"),
                        "level": serializable_dict.get("level", "info")
                    }
                }

                self.queue.put_nowait(loki_event)
            except:
                pass

        return event_dict

    async def _start_worker(self):
        while True:
            try:
                await self._process_batch()
                await asyncio.sleep(1)
            except Exception:
                await asyncio.sleep(5)

    async def _process_batch(self):
        if self.queue.empty():
            return

        events = []
        for _ in range(min(self.batch_size, self.queue.qsize())):
            try:
                events.append(self.queue.get_nowait())
            except:
                break

        if not events:
            return

        streams = {}
        for event in events:
            stream_key = json.dumps(event["stream"], sort_keys=True)
            if stream_key not in streams:
                streams[stream_key] = {
                    "stream": event["stream"],
                    "values": []
                }
            streams[stream_key]["values"].append([str(event["timestamp"]), event["line"]])

        payload = {"streams": list(streams.values())}

        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                response = await client.post(f"{self.loki_url}/loki/api/v1/push", json=payload)
        except Exception as e:
            print(f"[DEBUG] Failed to send logs to Loki: {e}")


_loki_processor = LokiProcessor()


def setup_structured_logging(log_level: str = "INFO"):
    """
    Configures both structlog and the standard logging library (stdlib)
    to output structured JSON logs consistently, fixing the 'NoneType' error.
    """

    # Common processors for both internal (structlog) and external (stdlib) logs
    shared_processors = [
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="ISO"),
        add_log_id,
        _loki_processor,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
    ]

    # 1. Configure structlog's pipeline for internal logs
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,  # Keep filter for internal log calls
            *shared_processors,
            # Pass processed event dict to the standard library's handler/formatter
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # 2. Configure the standard Python logging root logger

    log_level_enum = getattr(logging, log_level.upper(), logging.INFO)

    # Set up the console handler (output stream)
    handler = logging.StreamHandler(sys.stdout)

    # Set up the processor formatter for foreign/stdlib logs
    formatter = structlog.stdlib.ProcessorFormatter(
        # CRITICAL FIX: Pass shared_processors (without filter_by_level)
        # The root_logger's setLevel() call handles the filtering now, avoiding the crash.
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            # Final rendering to JSON
            structlog.processors.JSONRenderer(),
        ],
    )

    # Attach the formatter and handler to the root logger
    handler.setFormatter(formatter)
    root_logger = logging.getLogger()

    # Prevent duplicate log messages when setup is called multiple times
    if not root_logger.handlers:
        root_logger.addHandler(handler)

    root_logger.setLevel(log_level_enum)

    # Optional: ensure uvicorn/fastapi logs flow through the new root logger
    # This prevents Uvicorn's default formatter from clashing with structlog.
    for name in ["uvicorn", "uvicorn.error", "uvicorn.access"]:
        log = logging.getLogger(name)
        log.handlers.clear()
        log.propagate = True


def get_logger(component: str):
    # This function sets up the logging on first call (though ideally this happens once at app startup)
    setup_structured_logging()
    return structlog.get_logger().bind(component=component)


def log_operation(
    logger,
    level: str,
    operation: str,
    message: str,
    agent_id: Optional[str] = None,
    agent_type: Optional[str] = None,
    agent_name: Optional[str] = None,
    agent_config: Optional[Dict[str, Any]] = None,
    session_id: Optional[str] = None,
    user_query: Optional[str] = None,
    agent_response: Optional[str] = None,
    guardrail_input_result: Optional[str] = None,
    guardrail_input_reason: Optional[str] = None,
    guardrail_output_result: Optional[str] = None,
    guardrail_output_reason: Optional[str] = None,
    error_type: Optional[str] = None,
    error_details: Optional[str] = None,
    server_config: Optional[Dict[str, Any]] = None,
    **kwargs: Any,
):
    bound_logger = logger.bind(
        operation=operation,
        **{
            k: v
            for k, v in {
                "agent_id": agent_id,
                "agent_type": agent_type,
                "agent_name": agent_name,
                "agent_config": agent_config,
                "session_id": session_id,
                "user_query": user_query,
                "agent_response": agent_response,
                "guardrail_input_result": guardrail_input_result,
                "guardrail_input_reason": guardrail_input_reason,
                "guardrail_output_result": guardrail_output_result,
                "guardrail_output_reason": guardrail_output_reason,
                "error_type": error_type,
                "error_details": error_details,
                "server_config": server_config,
                **kwargs,
            }.items()
            if v is not None
        },
    )

    getattr(bound_logger, level.lower())(message)

