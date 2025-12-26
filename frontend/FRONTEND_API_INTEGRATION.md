# Frontend API Integration Guide

## Overview

The frontend has been refactored into a modular component architecture and is ready to integrate with the backend microservices. This document defines the API contracts and integration points.

---

## Architecture Overview

```
Frontend (React 18 + TypeScript)
    ↓
API Gateway (Port 8000)
    ↓
    ├── Exercise Service (Port 8001)
    ├── Solution Service (Port 8002)
    ├── Validation Service (Port 8003)
    └── Submission Service (Port 8004)
```

---

## API Endpoints Required

### 1. Exercise Service Endpoints

**Base URL**: `http://localhost:8000/exercises` (via API Gateway)

#### Get All Exercises
```
GET /exercises
Query Parameters:
  - topic: string (optional) - Filter by topic (e.g., "Deployment", "Pods")
  - difficulty: string (optional) - Filter by difficulty ("Basic", "Intermediate", "Advanced")
  - search: string (optional) - Search by title or description

Response:
{
  "exercises": [
    {
      "id": "ex1",
      "type": "code" | "quiz",
      "title": "1. Debug Broken Deployment",
      "difficulty": "Basic",
      "topic": "Deployment",
      "timeEstimate": "15 min",
      "tags": ["Deployment", "Troubleshooting"],
      "description": "## Problem Statement\n...",
      "template": "apiVersion: apps/v1\nkind: Deployment\n...",
      "steps": [
        {
          "phase": "Phase 1: Diagnosis",
          "tasks": [
            { "id": "t1", "text": "Check Deployment status using kubectl get deployment" },
            ...
          ]
        }
      ],
      "quizData": null // or quiz object if type === "quiz"
    }
  ],
  "total": 50
}
```

#### Get Exercise by ID
```
GET /exercises/:id

Response:
{
  "exercise": {
    "id": "ex1",
    "type": "code",
    "title": "1. Debug Broken Deployment",
    ...
  }
}
```

#### Get Exercise Topics
```
GET /exercises/topics

Response:
{
  "topics": [
    "Deployment",
    "Pods",
    "Services",
    "ConfigMaps",
    "Persistent Volumes"
  ]
}
```

---

### 2. Solution Service Endpoints

**Base URL**: `http://localhost:8000/solutions` (via API Gateway)

#### Auto-Save Solution
```
POST /solutions/:exerciseId/auto-save
Headers:
  - X-Session-ID: uuid (browser session identifier)
  
Body:
{
  "code": "apiVersion: apps/v1\nkind: Deployment\n...",
  "timestamp": 1704801000
}

Response:
{
  "id": "sol123",
  "exerciseId": "ex1",
  "code": "...",
  "version": 3,
  "savedAt": "2025-01-09T10:30:00Z"
}
```

#### Get Latest Solution
```
GET /solutions/:exerciseId
Headers:
  - X-Session-ID: uuid

Response:
{
  "id": "sol123",
  "exerciseId": "ex1",
  "code": "apiVersion: apps/v1\n...",
  "version": 3,
  "savedAt": "2025-01-09T10:30:00Z"
}
```

#### Get Solution History
```
GET /solutions/:exerciseId/history
Headers:
  - X-Session-ID: uuid

Response:
{
  "versions": [
    {
      "version": 3,
      "code": "...",
      "savedAt": "2025-01-09T10:30:00Z",
      "changeSize": 120
    },
    {
      "version": 2,
      "code": "...",
      "savedAt": "2025-01-09T10:15:00Z",
      "changeSize": 240
    }
  ]
}
```

#### Restore Previous Version
```
POST /solutions/:exerciseId/restore/:version
Headers:
  - X-Session-ID: uuid

Response:
{
  "id": "sol123",
  "exerciseId": "ex1",
  "code": "...",
  "version": 4,
  "restoredFrom": 2,
  "savedAt": "2025-01-09T10:35:00Z"
}
```

#### Reset to Template
```
POST /solutions/:exerciseId/reset
Headers:
  - X-Session-ID: uuid

Response:
{
  "id": "sol123",
  "exerciseId": "ex1",
  "code": "apiVersion: apps/v1\nkind: Deployment\n...",
  "version": 5,
  "savedAt": "2025-01-09T10:40:00Z"
}
```

---

### 3. Validation Service Endpoints

**Base URL**: `http://localhost:8000/validate` (via API Gateway)

#### Run Validation (REST - for quick checks)
```
POST /validate
Body:
{
  "exerciseId": "ex1",
  "yamlContent": "apiVersion: apps/v1\nkind: Deployment\n..."
}

Response:
{
  "status": "success" | "failure",
  "results": [
    {
      "step": "Check Deployment Exists",
      "status": "passed",
      "message": "Deployment 'nginx-deployment' found."
    },
    {
      "step": "Check Replicas",
      "status": "failed",
      "message": "Expected 3 replicas, found 1."
    }
  ],
  "executionTime": 2.5,
  "timestamp": "2025-01-09T10:30:00Z"
}
```

#### WebSocket Connection for Streaming (Live feedback)
```
WebSocket: ws://localhost:8000/validate/stream

Message Format (Client → Server):
{
  "type": "start_validation",
  "exerciseId": "ex1",
  "yamlContent": "..."
}

Message Format (Server → Client):
{
  "type": "step_started",
  "step": "Check Deployment Exists",
  "sequenceNumber": 1
}

{
  "type": "log_line",
  "content": "NAME                   READY   STATUS    RESTARTS   AGE",
  "sequenceNumber": 1
}

{
  "type": "step_completed",
  "step": "Check Deployment Exists",
  "status": "passed",
  "message": "Deployment found.",
  "sequenceNumber": 1
}

{
  "type": "validation_complete",
  "status": "success",
  "totalSteps": 3,
  "passedSteps": 2,
  "failedSteps": 1
}
```

---

### 4. Submission Service Endpoints

**Base URL**: `http://localhost:8000/submissions` (via API Gateway)

#### Submit Solution
```
POST /submissions
Headers:
  - X-Session-ID: uuid

Body:
{
  "exerciseId": "ex1",
  "code": "apiVersion: apps/v1\nkind: Deployment\n..."
}

Response:
{
  "id": "sub789",
  "exerciseId": "ex1",
  "sessionId": "uuid-xxx",
  "code": "...",
  "status": "validating" | "passed" | "failed",
  "results": [
    {
      "step": "Check Deployment Exists",
      "status": "passed",
      "message": "Deployment found."
    }
  ],
  "submittedAt": "2025-01-09T10:30:00Z",
  "completedAt": null // or timestamp if done
}
```

#### Get Submission History
```
GET /submissions
Headers:
  - X-Session-ID: uuid

Query Parameters:
  - exerciseId: string (optional)
  - limit: number (default 20)
  - offset: number (default 0)

Response:
{
  "submissions": [
    {
      "id": "sub789",
      "exerciseId": "ex1",
      "status": "passed",
      "passedSteps": 3,
      "totalSteps": 3,
      "submittedAt": "2025-01-09T10:30:00Z"
    }
  ],
  "total": 45
}
```

#### Get Submission Details
```
GET /submissions/:submissionId
Headers:
  - X-Session-ID: uuid

Response:
{
  "id": "sub789",
  "exerciseId": "ex1",
  "code": "...",
  "status": "passed",
  "results": [
    {
      "step": "Check Deployment Exists",
      "status": "passed",
      "message": "Deployment found."
    },
    ...
  ],
  "submittedAt": "2025-01-09T10:30:00Z",
  "completedAt": "2025-01-09T10:32:00Z",
  "executionTime": 2.5
}
```

---

## Frontend Component Data Contracts

### Exercise Interface
```typescript
interface Exercise {
  id: string;
  type: "code" | "quiz";
  title: string;
  difficulty: "Basic" | "Intermediate" | "Advanced";
  topic: string;
  timeEstimate: string;
  tags: string[];
  description: string;
  template: string;
  steps: Phase[];
  quizData?: QuizData;
}

interface Phase {
  phase: string;
  tasks: Task[];
}

interface Task {
  id: string;
  text: string;
}

interface QuizData {
  questions: Question[];
}

interface Question {
  id: number;
  text: string;
  options: Option[];
  correct: string;
  explanation: string;
}

interface Option {
  id: string;
  text: string;
}
```

### Validation Result Interface
```typescript
interface ValidationResult {
  step: string;
  status: "passed" | "failed";
  message: string;
}

interface ValidationResponse {
  status: "success" | "failure";
  results: ValidationResult[];
  executionTime: number;
  timestamp: string;
}
```

### Solution Interface
```typescript
interface Solution {
  id: string;
  exerciseId: string;
  code: string;
  version: number;
  savedAt: string;
}

interface SolutionVersion {
  version: number;
  code: string;
  savedAt: string;
  changeSize: number;
}
```

### Submission Interface
```typescript
interface Submission {
  id: string;
  exerciseId: string;
  sessionId: string;
  code: string;
  status: "validating" | "passed" | "failed";
  results: ValidationResult[];
  submittedAt: string;
  completedAt?: string;
  executionTime?: number;
}
```

---

## API Client Setup

### Environment Variables

Create `.env` file in frontend root:
```
REACT_APP_API_BASE_URL=http://localhost:8000
REACT_APP_WS_BASE_URL=ws://localhost:8000
```

### API Client Class

Create `src/services/apiClient.ts`:
```typescript
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';
const WS_BASE_URL = process.env.REACT_APP_WS_BASE_URL || 'ws://localhost:8000';

// Get or create session ID
const getSessionId = (): string => {
  let sessionId = sessionStorage.getItem('sessionId');
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('sessionId', sessionId);
  }
  return sessionId;
};

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'X-Session-ID': getSessionId(),
  },
});

export default apiClient;
export { getSessionId, API_BASE_URL, WS_BASE_URL };
```

### API Hooks (for React components)

Create `src/hooks/useExercises.ts`:
```typescript
import { useEffect, useState } from 'react';
import apiClient from '../services/apiClient';

export const useExercises = () => {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchExercises = async () => {
      setLoading(true);
      try {
        const { data } = await apiClient.get('/exercises');
        setExercises(data.exercises);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchExercises();
  }, []);

  return { exercises, loading, error };
};
```

---

## Integration Checklist

- [ ] Set up API Gateway (Port 8000) with reverse proxy
- [ ] Implement Exercise Service endpoints (`/exercises`, `/exercises/:id`, `/exercises/topics`)
- [ ] Implement Solution Service endpoints (auto-save, history, restore, reset)
- [ ] Implement Validation Service endpoints (REST + WebSocket)
- [ ] Implement Submission Service endpoints (submit, history, details)
- [ ] Update frontend `.env` with correct API URLs
- [ ] Test API endpoints with Postman/Insomnia
- [ ] Connect Console component to WebSocket stream
- [ ] Connect DescriptionPanel to fetch exercises
- [ ] Connect CodeEditor auto-save to Solution Service
- [ ] Connect validation button to Validation Service
- [ ] Implement error handling and loading states
- [ ] Add retry logic for failed requests
- [ ] Implement session management (X-Session-ID header)

---

## Error Handling

All API responses should include standard error format:
```json
{
  "error": {
    "code": "INVALID_YAML",
    "message": "Invalid YAML syntax",
    "details": "Line 5: expected ':' but got '>'"
  }
}
```

Frontend should handle:
- 400: Bad Request (invalid input)
- 401: Unauthorized (session expired)
- 404: Not Found
- 500: Server Error
- Network timeouts

---

## Performance Considerations

1. **Solution Auto-Save**:
   - Debounce interval: 2 seconds
   - Don't save identical content
   - Show unsaved indicator (dot) next to exercise title

2. **Exercise Caching**:
   - Cache exercise list in localStorage
   - Refresh on app load
   - Cache invalidation: manual refresh button

3. **Validation Streaming**:
   - Use WebSocket for real-time updates
   - Fall back to polling if WebSocket fails
   - Buffer log lines for performance

---

## Testing

### Unit Tests for API Client
```typescript
describe('apiClient', () => {
  it('should include X-Session-ID header', () => {
    // Test header injection
  });

  it('should handle 500 errors gracefully', () => {
    // Test error handling
  });
});
```

### Integration Tests
```typescript
describe('Exercise Service Integration', () => {
  it('should fetch exercises from API', async () => {
    // Mock API and test
  });

  it('should handle API timeout', async () => {
    // Test timeout handling
  });
});
```

---

## Deployment

### Development
```bash
REACT_APP_API_BASE_URL=http://localhost:8000 npm start
```

### Production
```bash
REACT_APP_API_BASE_URL=https://api.kubeplayground.com npm run build
```

---

## Next Steps

1. Start with Exercise Service integration
2. Test exercise listing and filtering
3. Implement Solution Service integration for code saving
4. Connect Validation Service for real-time feedback
5. Complete Submission Service for final submissions
6. Add comprehensive error handling and edge cases
