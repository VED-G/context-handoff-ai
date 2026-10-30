"""
AI client: Groq (primary) → Gemini (failover) → rule-based fallback.
Each call is logged with provider, model, latency_ms, outcome, input_length.
Handles: timeout, rate-limit (429), server errors (5xx), invalid JSON.
"""
import json
import logging
import time
import hashlib
from typing import Any, Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _log_ai_call(
    task: str,
    provider: str,
    model: str,
    latency_ms: float,
    outcome: str,  # ok | retry | failover | fallback | error
    input_length: int,
    token_counts: Optional[dict] = None,
    error: Optional[str] = None,
) -> None:
    """Structured log for every AI call attempt."""
    extra = {
        "event": "ai.call",
        "task": task,
        "provider": provider,
        "model": model,
        "latency_ms": round(latency_ms, 1),
        "outcome": outcome,
        "input_length": input_length,
    }
    if token_counts:
        extra["tokens"] = token_counts
    if error:
        extra["error_summary"] = error[:200]  # cap length, never log content

    level = logging.INFO if outcome == "ok" else (
        logging.WARNING if outcome in ("retry", "failover", "fallback") else logging.ERROR
    )
    logger.log(level, f"ai_call task={task} provider={provider} outcome={outcome}", extra=extra)


def _call_groq(messages: list[dict], task: str) -> dict:
    """
    Call Groq API directly via httpx (JSON mode).
    Returns parsed JSON dict or raises on failure.
    """
    api_key = settings.groq_api_key
    model = settings.groq_model
    timeout = settings.ai_timeout_seconds

    if not api_key:
        raise ValueError("GROQ_API_KEY not set")

    start = time.perf_counter()
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": messages,
                    "response_format": {"type": "json_object"},
                    "temperature": 0.2,
                    "max_tokens": 2000,
                },
            )
        latency = (time.perf_counter() - start) * 1000

        if resp.status_code == 429:
            raise httpx.HTTPStatusError("rate_limited", request=resp.request, response=resp)
        if resp.status_code >= 500:
            raise httpx.HTTPStatusError(f"server_error_{resp.status_code}", request=resp.request, response=resp)

        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        token_counts = {
            "prompt": usage.get("prompt_tokens"),
            "completion": usage.get("completion_tokens"),
        }

        parsed = json.loads(content)
        input_len = sum(len(m.get("content", "")) for m in messages)
        _log_ai_call(task, "groq", model, latency, "ok", input_len, token_counts)
        return parsed

    except (httpx.TimeoutException, httpx.HTTPStatusError) as e:
        latency = (time.perf_counter() - start) * 1000
        input_len = sum(len(m.get("content", "")) for m in messages)
        _log_ai_call(task, "groq", model, latency, "retry", input_len, error=str(e))
        raise


def _call_gemini(messages: list[dict], task: str) -> dict:
    """
    Call Gemini via google-generativeai SDK.
    Converts OpenAI message format to Gemini format.
    Returns parsed JSON dict or raises on failure.
    """
    try:
        import google.generativeai as genai
    except ImportError:
        raise RuntimeError("google-generativeai not installed")

    api_key = settings.gemini_api_key
    model_name = settings.gemini_model
    timeout = settings.ai_timeout_seconds

    if not api_key:
        raise ValueError("GEMINI_API_KEY not set")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name,
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            temperature=0.2,
            max_output_tokens=2000,
        ),
    )

    # Convert messages: system + user into Gemini prompt
    system_parts = [m["content"] for m in messages if m["role"] == "system"]
    user_parts = [m["content"] for m in messages if m["role"] == "user"]
    prompt = "\n\n".join(system_parts + user_parts)

    start = time.perf_counter()
    try:
        response = model.generate_content(prompt, request_options={"timeout": timeout})
        latency = (time.perf_counter() - start) * 1000

        content = response.text
        parsed = json.loads(content)
        input_len = len(prompt)
        _log_ai_call(task, "gemini", model_name, latency, "ok", input_len)
        return parsed

    except Exception as e:
        latency = (time.perf_counter() - start) * 1000
        input_len = len(prompt)
        _log_ai_call(task, "gemini", model_name, latency, "error", input_len, error=str(e))
        raise


def call_ai(
    messages: list[dict],
    task: str,
    fallback_fn=None,
    fallback_args: Optional[dict] = None,
) -> tuple[Any, str]:
    """
    Provider-agnostic AI call with automatic failover.
    
    Policy:
    1. Try Groq → on failure retry once → failover to Gemini
    2. Try Gemini → on failure → rule-based fallback
    3. fallback_fn(**fallback_args) if provided, else raise
    
    Returns: (result_dict, mode) where mode is "ai" or "fallback"
    """
    input_len = sum(len(m.get("content", "")) for m in messages)

    # ── Attempt 1: Groq ───────────────────────────────────────────────────
    groq_err2: Exception = RuntimeError("groq_not_attempted")  # sentinel
    try:
        result = _call_groq(messages, task)
        return result, "ai"
    except Exception as groq_err1:
        groq_err2 = groq_err1  # capture for later logging even if retry skipped
        logger.warning(f"Groq attempt 1 failed for {task}: {type(groq_err1).__name__}")

    # ── Retry: Groq ────────────────────────────────────────────────────────
    try:
        result = _call_groq(messages, task)
        _log_ai_call(task, "groq", settings.groq_model, 0, "retry", input_len)
        return result, "ai"
    except Exception as _groq_retry_err:
        groq_err2 = _groq_retry_err  # final groq error
        logger.warning(f"Groq retry failed for {task}, failing over to Gemini")

    # ── Failover: Gemini ──────────────────────────────────────────────────
    try:
        result = _call_gemini(messages, task)
        _log_ai_call(task, "gemini", settings.gemini_model, 0, "failover", input_len)
        return result, "ai"
    except Exception as gemini_err:
        logger.error(
            f"All AI providers failed for {task}. Groq: {groq_err2}. Gemini: {gemini_err}",
            extra={"event": "ai.total_failure", "task": task},
        )

    # ── Fallback: rule-based ──────────────────────────────────────────────
    if fallback_fn is not None:
        _log_ai_call(task, "fallback", "rules", 0, "fallback", input_len)
        result = fallback_fn(**(fallback_args or {}))
        return result, "fallback"

    raise RuntimeError(f"AI unavailable for task={task} and no fallback provided")

