# Unified Structured Logging Standard (FastAPI + SQL/NoSQL SDKs, OTel Trace Context)

**Version:** 1.0

**Target:** Python Microservices (FastAPI + Uvicorn) and Database SDKs (`dbdaolib`)

**Log Transport:** **JSON Lines to stdout** (collector/agent ships to Elastic or GCP Logging)

**Trace Context Source:** **OpenTelemetry tracing** is present in-process (spans exist).

**Scope:** Logging schema, responsibilities, redaction, uvicorn integration, and trace context injection.

---

## 1. Executive Summary

This document defines a mandatory **structured logging standard** for:

1. **FastAPI microservices**, and
2. shared **SQL/NoSQL database SDKs**.

All logs are emitted as **single-line JSON** to `stdout`, enriched with:

* **service identity** (`service.*`)
* **OpenTelemetry trace identifiers** (`trace.id`, `span.id`)

The schema is **ECS-inspired** (dot-notation) for compatibility with Elasticsearch indexing and cloud log explorers (e.g., GCP). Logs are designed to be queryable as data without text parsing.

---

## 2. Architecture Overview (Stream-Based Logging)

### 2.1 Data Flow

1. Code logs via Python `logging`.
2. A **logging Filter** injects runtime context (service fields + trace/span IDs) into each LogRecord.
3. A **JSON Formatter** serializes the LogRecord (including structured `extra` fields) into one JSON line.
4. JSON line is written to stdout.
5. Platform collector ships stdout logs to Elastic or GCP Logging.

### 2.2 Responsibility Model

**SDKs (Passive)**

* MUST NOT configure handlers/formatters/levels.
* MUST NOT write to stdout/stderr.
* MUST use `logging.getLogger(__name__)`.
* MUST add structured fields via `extra={...}` consistent with this schema.
* MUST never log secrets or full connection strings.

**Applications (Active)**

* MUST configure logging once at startup (root logger and uvicorn loggers).
* MUST install trace context injection (Filter).
* MUST ensure request spans exist (so trace/span IDs are meaningful).

---

## 3. Field Naming and Schema Philosophy

### 3.1 Schema Choice

Logs use an **ECS-inspired dot-notation JSON schema** (e.g., `service.name`, `trace.id`, `event.action`).
This is a deliberate design choice to maximize compatibility with Elastic and general JSON log ingestion.

### 3.2 Relationship to OpenTelemetry

OpenTelemetry provides trace/span context at runtime. This design **does not** adopt the OpenTelemetry Log Data Model field naming. Instead, it injects OTel-derived IDs into the ECS-style fields:

* `trace.id` ← from the current OTel span context
* `span.id`  ← from the current OTel span context

---

## Architecture

<img src="./images/logging.png" alt="Logging architecture" width="800" />

## 4. Standard Log Schema (Mandatory)

### 4.1 Required Fields (All Logs)

| Field             | Type   | Description                                                               |
| ----------------- | ------ | ------------------------------------------------------------------------- |
| `@timestamp`      | string | RFC3339/ISO-8601 UTC timestamp                                            |
| `severity`        | string | `DEBUG` | `INFO` | `WARNING` | `ERROR` | `CRITICAL`                       |
| `message`         | string | Short human-readable summary                                              |
| `event.action`    | string | Stable event identifier (e.g., `mongo.init`, `sql.query`, `http.request`) |
| `event.outcome`   | string | `success` | `failure` | `unknown`                                         |
| `log.logger`      | string | Python logger name (module path)                                          |
| `service.name`    | string | Service identifier                                                        |
| `service.env`     | string | `dev` | `staging` | `prod`                                                |
| `service.version` | string | Build/version/commit                                                      |
| `trace.id`        | string | Current OpenTelemetry trace id (32-hex)                                   |
| `span.id`         | string | Current OpenTelemetry span id (16-hex)                                    |

**Note:** `trace.id` and `span.id` MUST be present for service logs. For SDK logs, they are present when called within a traced execution path (normal in services).

### 4.2 Required Runtime Fields

| Field         | Type   | Description       |
| ------------- | ------ | ----------------- |
| `process.pid` | int    | Process ID        |
| `thread.name` | string | Thread name       |
| `host.name`   | string | Hostname/pod name |

### 4.3 Duration (Required for Operational Events)

For events representing an operation (DB init, query, HTTP request end, redis push, etc.):

| Field         | Type   |
| ------------- | ------ |
| `duration_ms` | number |

---

## 5. Error Schema (Mandatory for Failures)

For any log record where `event.outcome = "failure"`:

| Field               | Type   | Description                                   |
| ------------------- | ------ | --------------------------------------------- |
| `error.code`        | int    | Stable numeric error code                     |
| `error.type`        | string | Exception class name                          |
| `error.message`     | string | Safe error message (no secrets)               |
| `error.stack_trace` | string | Full stack trace string with escaped newlines |

---

## 6. Context Fields (Mandatory When Applicable)

### 6.1 HTTP Context (Service Logs)

For `event.action = "http.request"` or endpoint-related failures:

| Field              | Type   |
| ------------------ | ------ |
| `http.method`      | string |
| `http.route`       | string |
| `http.status_code` | int    |

### 6.2 Database Context (SDK + Service Logs)

#### Common DB Fields (Required for DB events)

| Field       | Type                                         |
| ----------- | -------------------------------------------- |
| `db.system` | string (`mongodb`, `postgresql`, `mysql`, …) |
| `db.name`   | string                                       |
| `db.host`   | string (safe label only; no URI)             |

#### MongoDB Fields (Required for Mongo events)

| Field           | Type |
| --------------- | ---- |
| `db.srv`        | bool |
| `db.tls`        | bool |
| `db.pool.min`   | int  |
| `db.pool.max`   | int  |
| `db.timeout.ms` | int  |

#### SQL Fields (Required for SQL events)

| Field                  | Type                           |
| ---------------------- | ------------------------------ |
| `db.role`              | string (`primary` | `replica`) |
| `db.pool.size`         | int                            |
| `db.pool.max_overflow` | int                            |
| `db.pool.recycle_s`    | int                            |

#### Query Identification (Required for Query Events)

To avoid logging raw statements or sensitive data:

| Field               | Type   |
| ------------------- | ------ |
| `db.statement_hash` | string |

---

## 7. Event Taxonomy (Mandatory)

### 7.1 Service Event(s)

* `http.request`

### 7.2 Mongo Events

* `mongo.init`
* `mongo.ping`
* `mongo.odm.init`
* `mongo.query`
* `mongo.close`

### 7.3 SQL Events

* `sql.init`
* `sql.pool.ready`
* `sql.query`
* `sql.close`

---

## 8. Logging Level Rules (Mandatory)

### Services

* MUST emit exactly one `http.request` log per request at **INFO** on completion (includes duration and status).
* MUST log request failures at **ERROR** with `error.*`.

### SDKs

* MUST log DB init success at **INFO**.
* MUST log DB init failures at **ERROR** (or CRITICAL if it prevents startup).
* MUST NOT log raw SQL statements or Mongo URIs.
* Per-query logs SHOULD be **DEBUG** in high-throughput systems; query failures MUST be **ERROR**.

---

## 9. Security & Redaction Policy (Mandatory)

### 9.1 Prohibited Content

Logs MUST NOT contain:

* passwords, tokens, secrets, authorization headers
* full connection strings/URIs
* raw SQL with literal parameter values
* PII (email/phone/address) unless irreversibly hashed

### 9.2 Redaction Controls (Bounded)

To prevent accidental leakage without adding high CPU overhead:

* Formatter MUST redact values of keys matching:
  `password`, `token`, `secret`, `authorization`, `api_key`, `access_key`
  (case-insensitive; applies recursively to a bounded depth)
* Formatter MUST enforce:

  * maximum recursion depth = 3
  * maximum string length per field = 4096 characters (truncate and mark)
* DB logs MUST use `db.host` label only (never a URI).

---

## 10. Payload Size Limits (Mandatory)

* Each serialized log line MUST NOT exceed **16 KB**.
* If exceeded, the formatter MUST:

  * truncate oversized fields
  * set `log.truncated = true`
  * set `log.original_size_bytes = <n>`

This prevents stdout backpressure and logging driver issues.

---

## 11. Trace Context Injection Mechanism (Required)

### 11.1 What “trace context injection” means

When your code calls:

```python
logger.info("...", extra={...})
```

Python creates a `LogRecord`. By default, a `LogRecord` has no idea about the “current trace” in OpenTelemetry.

**Trace context injection** is the mechanism that automatically adds:

* `trace.id`
* `span.id`

to every log record **without developers passing them manually**.

### 11.2 How it works (required approach)

The application MUST install a `logging.Filter` (or equivalent) that:

1. Queries OpenTelemetry for the current span:

   * `trace.get_current_span()`
2. Extracts the span context:

   * trace id and span id
3. Attaches them to the LogRecord as attributes:

   * `record.trace_id`, `record.span_id`
4. The JSON formatter reads these and emits them as:

   * `trace.id`, `span.id`

This keeps the SDK clean and ensures every log produced inside a traced request is automatically correlated.

---

## 12. Uvicorn Integration (Mandatory)

Uvicorn does not reliably inherit root logging configuration unless explicitly configured.

The service MUST:

* provide a `dictConfig` logging configuration to uvicorn (`log_config`)
* route `uvicorn.error` and `uvicorn.access` through the same JSON handler and formatter
  OR disable `uvicorn.access` and rely on the service’s `http.request` logs.

This guarantees no unstructured access logs appear in production.

---

## 13. Compliance Rules (Mandatory)

A log record is non-compliant if it:

* is not JSON
* is emitted as multi-line output outside a JSON field
* is missing required schema fields
* includes prohibited secrets/PII/URIs
* uses event names outside the taxonomy
* omits `trace.id`/`span.id` in service logs

---

## 14. Canonical Examples (Compliant)

### 14.1 HTTP Request Completion

```json
{
  "@timestamp": "2026-01-02T12:34:56.789Z",
  "severity": "INFO",
  "message": "request completed",
  "event.action": "http.request",
  "event.outcome": "success",
  "log.logger": "app.middleware.request",
  "service.name": "kubeplayground-api",
  "service.env": "prod",
  "service.version": "0.2.2",
  "trace.id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span.id": "00f067aa0ba902b7",
  "process.pid": 1234,
  "thread.name": "MainThread",
  "host.name": "pod-abc123",
  "http.method": "GET",
  "http.route": "/exercises/{id}",
  "http.status_code": 200,
  "duration_ms": 37.2
}
```

### 14.2 Mongo Init Failure

```json
{
  "@timestamp": "2026-01-02T12:34:56.789Z",
  "severity": "ERROR",
  "message": "MongoDB init failed (timeout)",
  "event.action": "mongo.init",
  "event.outcome": "failure",
  "log.logger": "dbdaolib.mongo.connector",
  "service.name": "kubeplayground-api",
  "service.env": "prod",
  "service.version": "0.2.2",
  "trace.id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span.id": "00f067aa0ba902b7",
  "process.pid": 1234,
  "thread.name": "MainThread",
  "host.name": "pod-abc123",
  "db.system": "mongodb",
  "db.name": "kubeplayground",
  "db.host": "cluster0.mongodb.net (srv)",
  "db.srv": true,
  "db.tls": true,
  "db.pool.min": 10,
  "db.pool.max": 50,
  "db.timeout.ms": 5000,
  "duration_ms": 1203.4,
  "error.code": 20101,
  "error.type": "ServerSelectionTimeoutError",
  "error.message": "MongoDB connection timed out",
  "error.stack_trace": "Traceback (most recent call last):\\n ..."
}
```

---

## 15. Summary

This standard enforces:

* single-line JSON logs
* ECS-inspired schema compatible with Elastic and GCP
* mandatory OTel trace/span IDs injected automatically via a logging Filter
* strict redaction + payload size limits
* clear separation of responsibilities between SDK and service

This provides production-grade, consistent, searchable logs across microservices and database SDKs without relying on optional sampling or ad-hoc conventions.
