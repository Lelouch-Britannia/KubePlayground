export const EXERCISES = [
  {
    id: "ex1",
    type: "code",
    title: "1. Debug Broken Deployment",
    difficulty: "Basic",
    topic: "Deployment",
    timeEstimate: "15 min",
    tags: ["Deployment", "Troubleshooting"],
    description: `
### Problem Statement

You have been assigned to fix a broken Deployment in the \`default\` namespace.
The application is supposed to run 3 replicas of Nginx, but the Pods are failing to start.

### Requirements

1. Fix the image name (it should be \`nginx:1.14.2\`).
2. Ensure the container port is set to \`80\`.
3. Scale the deployment to \`3\` replicas.

### Verification Commands

You can run these commands to verify the state locally:

\`\`\`bash
kubectl get deployment nginx-deployment
kubectl get pods -l app=nginx-deployment
\`\`\`
`,
    template: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
  labels:
    app: nginx-deployment
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx-deployment
  template:
    metadata:
      labels:
        app: wrong-label
    spec:
      containers:
      - name: nginx
        image: nginxx:1.14.2 # Typo here
        ports:
        - containerPort: 8080 # Wrong port
`,
    steps: [
      {
        phase: "Phase 1: Diagnosis",
        tasks: [
          { id: "t1", text: "Check Deployment status using kubectl get deployment" },
          { id: "t2", text: "Inspect Pod errors using kubectl describe pod" },
          { id: "t3", text: "Identify the image pull error" }
        ]
      },
      {
        phase: "Phase 2: Fix Configuration",
        tasks: [
          { id: "t4", text: "Correct the image name in the YAML" },
          { id: "t5", text: "Fix the container port mapping" },
          { id: "t6", text: "Match the Pod labels with the Selector" }
        ]
      },
      {
        phase: "Phase 3: Verification",
        tasks: [
          { id: "t7", text: "Apply the fixed manifest" },
          { id: "t8", text: "Verify 3/3 pods are Running" }
        ]
      }
    ]
  },
  // quiz/grading feature commented out — ex2 quiz exercise disabled
  // {
  //   id: "ex2",
  //   type: "quiz",
  //   title: "2. Pod Lifecycle Knowledge",
  //   difficulty: "Intermediate",
  //   topic: "Pods",
  //   timeEstimate: "5 min",
  //   tags: ["Pods", "Architecture"],
  //   description: `...`,
  //   quizData: { questions: [ ... ] },
  //   steps: [ ... ]
  // }
];

// MOCK_VALIDATION_RESULTS — commented out (quiz/grading feature disabled)
// export const MOCK_VALIDATION_RESULTS = [
//   { step: "Check Deployment Exists", status: "passed", message: "Deployment 'nginx-deployment' found." },
//   { step: "Check Replicas", status: "failed", message: "Expected 3 replicas, found 1." },
//   { step: "Check Image", status: "failed", message: "Image is 'nginxx:1.14.2', expected 'nginx:1.14.2'." },
// ];
