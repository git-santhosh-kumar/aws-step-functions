# AWS Step Functions: Approval + Child Workflow (Production Pattern)

## 📌 Overview

This guide explains how to build a **production-grade workflow** using AWS Step Functions that combines:

* ✅ Human approval using `WAIT_FOR_TASK_TOKEN`
* ✅ Nested workflows using `RUN_JOB`
* ✅ Proper error handling and failure propagation

This pattern is commonly used in:

* Order approvals
* Payment authorization flows
* Deployment approvals
* Loan processing systems

---

# 🧠 Architecture

```text
Parent State Machine
  ↓
Send Approval (WAIT_FOR_TASK_TOKEN)
  ↓
Choice (Approved?)
  ├── YES → Run Child Workflow (RUN_JOB)
  │          ├── Success → Done
  │          └── Fail → Catch → Error Handler
  └── NO → Cancel
```

---

# 🔧 Components

## 1. Parent State Machine

Responsible for:

* Initiating approval
* Making decision
* Calling child workflow
* Handling errors

---

## 2. Approval Step (`WAIT_FOR_TASK_TOKEN`)

### Purpose

Pause execution until an external system responds.

### Behavior

* Generates a **task token**
* Sends it to external system (email/API/UI)
* Waits for callback

---

## 3. Child State Machine (`RUN_JOB`)

### Purpose

Handle post-approval processing:

* Business logic
* Multi-step workflows
* Complex orchestration

---

## 4. Error Handling

* Parent uses `.addCatch()` to handle:

  * Approval failures
  * Child workflow failures

---

# ⚙️ Implementation Guide

---

## Step 1: Approval Task

```ts
const approvalStep = new tasks.LambdaInvoke(this, 'Send Approval', {
  lambdaFunction: approvalLambda,
  integrationPattern: stepfunctions.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
  payload: stepfunctions.TaskInput.fromObject({
    token: stepfunctions.JsonPath.taskToken,
    input: stepfunctions.JsonPath.entirePayload,
  }),
});
```

### 🔑 Key Points

* Must use `WAIT_FOR_TASK_TOKEN`
* Pass `taskToken` to external system
* Workflow pauses here

---

## Step 2: Approval Callback

External system must call one of:

### ✅ Approve

```bash
aws stepfunctions send-task-success \
  --task-token <TOKEN> \
  --task-output '{"approved": true}'
```

### ❌ Reject

```bash
aws stepfunctions send-task-success \
  --task-token <TOKEN> \
  --task-output '{"approved": false}'
```

### 💥 Fail

```bash
aws stepfunctions send-task-failure \
  --task-token <TOKEN> \
  --error "ApprovalFailed"
```

---

## Step 3: Approval Decision

```ts
const approvalChoice = new stepfunctions.Choice(this, 'Approved?')
  .when(
    stepfunctions.Condition.booleanEquals('$.approved', true),
    runChild.next(successState)
  )
  .otherwise(cancelState);
```

---

## Step 4: Child Workflow Execution

```ts
const runChild = new tasks.StepFunctionsStartExecution(
  this,
  'Run Child Workflow',
  {
    stateMachine: childSM,
    integrationPattern: stepfunctions.IntegrationPattern.RUN_JOB,
  }
).addCatch(errorHandler, {
  resultPath: '$.error',
});
```

### 🔑 Key Points

* Use `RUN_JOB` to wait for completion
* Enables failure propagation to parent

---

## Step 5: Error Handling

```ts
approvalStep.addCatch(errorHandler, {
  resultPath: '$.error',
});

runChild.addCatch(errorHandler, {
  resultPath: '$.error',
});
```

---

# 🔄 End-to-End Flow

## ✅ Approved + Child Success

* Workflow completes successfully

## ❌ Approved + Child Failure

* Child fails
* Parent catches error
* Error handler executes

## ❌ Rejected

* Workflow goes to cancel state

## 💥 Approval Failure

* Error handler executes

---

# ⚠️ Important Concepts

---

## 🔹 `WAIT_FOR_TASK_TOKEN`

* Pauses execution
* Requires external callback
* Used for human or async systems

---

## 🔹 `RUN_JOB`

* Waits for child workflow completion
* Required for failure propagation

---

## 🔹 State Transition

Each step movement counts as a **transition** and affects cost.

---

# 💡 Best Practices

---

## ✅ 1. Always Use Timeouts

Prevent stuck workflows:

```ts
timeout: cdk.Duration.hours(1)
```

---

## ✅ 2. Store Task Tokens Safely

* DynamoDB
* Cache
* Database

👉 Losing token = stuck execution

---

## ✅ 3. Do Not Swallow Errors in Child

❌ Avoid:

```ts
childTask.addCatch(...)
```

👉 This hides failures from parent

---

## ✅ 4. Use Structured Outputs

```json
{
  "approved": true,
  "orderId": "123"
}
```

---

## ✅ 5. Centralize Error Handling

Use a global handler for consistency.

---

# 🚨 Common Mistakes

| Mistake                  | Problem                 |
| ------------------------ | ----------------------- |
| Using `REQUEST_RESPONSE` | Parent won’t wait       |
| Not sending task token   | Workflow stuck          |
| Swallowing child errors  | No failure propagation  |
| No timeout               | Infinite wait           |
| Losing token             | Cannot resume execution |

---

# 📊 When to Use This Pattern

Use this pattern when:

* Human approval is required
* Workflow must pause and resume
* Complex logic is needed after approval
* You want modular workflows

---

# 🏆 Summary

| Feature             | Used For                |
| ------------------- | ----------------------- |
| WAIT_FOR_TASK_TOKEN | Human/external approval |
| RUN_JOB             | Nested workflows        |
| Choice              | Decision making         |
| Catch               | Error handling          |

---

# 🚀 Final Takeaway

This pattern enables:

> ✅ Controlled workflow execution
> ✅ External decision making
> ✅ Modular architecture
> ✅ Reliable error handling

It is one of the most powerful and widely used orchestration patterns in AWS Step Functions.

---
