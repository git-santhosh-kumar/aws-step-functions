import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export class StepFunctionExamplesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /**
     * =========================
     * Lambda Functions
     * =========================
     */

    const payLambda = new lambda.Function(this, 'PayFn', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log("Processing payment", event);
          const { status } = event || {};

          if (status !== "PAID") {
            throw new Error("Payment failed");
          }

          return { status: "PAID" };
        };
      `),
    });

    const shipLambda = new lambda.Function(this, 'ShipFn', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log("Shipping order", event);
          return { status: "SHIPPED" };
        };
      `),
    });

    const confirmLambda = new lambda.Function(this, 'ConfirmFn', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log("Order confirmed", event);
          return { status: "CONFIRMED" };
        };
      `),
    });

    const cancelLambda = new lambda.Function(this, 'CancelFn', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log("Cancelling order", event);
          return { status: "CANCELLED" };
        };
      `),
    });

    const notifyLambda = new lambda.Function(this, 'NotifyFn', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log("Sending notification", event);
          return { status: "NOTIFIED" };
        };
      `), 
    });

    /**
     * =========================
     * Global Handlers
     * =========================
     */

    const globalErrorHandler = new stepfunctions.Fail(this, 'Global Error Handler', {
      causePath: '$.error.Cause',
      errorPath: '$.error.Error'
    });

    const successState = new stepfunctions.Pass(this, 'Success Response', {
      parameters: {
        status: "SUCCESS",
        message: "Order processed successfully",
        "data.$": "$",
      },
    });

    /**
     * =========================
     * Step Function Tasks
     * =========================
    */

    const payStep = new tasks.LambdaInvoke(this, 'Process Payment', {
      lambdaFunction: payLambda,
      outputPath: '$.Payload',
    }).addRetry({
      maxAttempts: 3,
      interval: cdk.Duration.seconds(2),
    });

    const shipStep = new tasks.LambdaInvoke(this, 'Ship Order', {
      lambdaFunction: shipLambda,
      outputPath: '$.Payload',
    });

    const confirmStep = new tasks.LambdaInvoke(this, 'Confirm Order', {
      lambdaFunction: confirmLambda,
      outputPath: '$.Payload',
    });

    const notifyStep = new tasks.LambdaInvoke(this, 'Notify Customer', {
      lambdaFunction: notifyLambda,
      outputPath: '$.Payload',
    });

    const cancelStep = new tasks.LambdaInvoke(this, 'Cancel Order', {
      lambdaFunction: cancelLambda,
      outputPath: '$.Payload',
    }).addCatch(globalErrorHandler, {
      resultPath: '$.error',
    });

    /**
     * =========================
     * Parallel Processing
     * =========================
    */

    // You can also use Parallel inside child
    const childFlow = confirmStep
    .next(
      new stepfunctions.Parallel(this, 'Notify & Ship in Parallel')
        .branch(notifyStep)
        .branch(shipStep)
    );

    const childStateMachine = new stepfunctions.StateMachine(this, 'PostOrderSM', {
      definitionBody: stepfunctions.DefinitionBody.fromChainable(childFlow),
      stateMachineName: 'PostOrderProcessingStateMachine',
      timeout: cdk.Duration.minutes(5),
      comment: 'Child state machine for post-order processing steps like shipping and notification.'
    });

    const postOrderWorkflow = new tasks.StepFunctionsStartExecution(
      this,
      'Start Post Order Workflow',
      {
        stateMachine: childStateMachine,
        comment: 'Starts the post-order processing workflow after payment is successful',
        // IMPORTANT: wait for it to finish
        integrationPattern: stepfunctions.IntegrationPattern.RUN_JOB
      }
    ).addCatch(globalErrorHandler, {
      resultPath: '$.error',
    });

    const childSM_1 = new tasks.StepFunctionsStartExecution(
      this,
      'Child SM 1',
      {
        stateMachine: childStateMachine,
        comment: 'child state machine 1',
        integrationPattern: stepfunctions.IntegrationPattern.RUN_JOB,
        input: stepfunctions.TaskInput.fromObject({
          orderId: '12345',
          customerId: '67890',
          source: 'childSM_1'
        }),
        resultPath: '$.childSM1Result'
      }
    );

    const childSM_2 = new tasks.StepFunctionsStartExecution(
      this,
      'Child SM 2',
      {
        stateMachine: childStateMachine,
        comment: 'child state machine 2',
        integrationPattern: stepfunctions.IntegrationPattern.RUN_JOB,
        input: stepfunctions.TaskInput.fromObject({
          orderId: '12345',
          customerId: '67890',
          source: 'childSM_2'
        }),
        resultPath: '$.childSM2Result'
      }
    );

    const childSM_3 = new tasks.StepFunctionsStartExecution(
      this,
      'Child SM 3',
      {
        stateMachine: childStateMachine,
        comment: 'child state machine 3',
        integrationPattern: stepfunctions.IntegrationPattern.RUN_JOB,
        input: stepfunctions.TaskInput.fromObject({
          orderId: '12345',
          customerId: '67890',
          source: 'childSM_3'
        }),
        resultPath: '$.childSM3Result'
      }
    );

    /**
     * =========================
     * Choice Logic
     * =========================
     */

    const parallelChildSMs = new stepfunctions.Parallel(this, 'Run Multiple Child SMs in Parallel')
      .branch(childSM_1)
      .branch(childSM_2)
      .branch(childSM_3)
      .addCatch(globalErrorHandler, {
        resultPath: '$.error',
      });

    const isPaidChoice = new stepfunctions.Choice(this, 'Payment Successful?')
      .when(
        stepfunctions.Condition.stringEquals('$.status', 'PAID'),
        parallelChildSMs.next(postOrderWorkflow).next(successState)
      )
      .otherwise(
        cancelStep.next(globalErrorHandler)
      );

    /**
     * =========================
     * Wait Step
     * =========================
     */

    const wait = new stepfunctions.Wait(this, 'Wait 3 Seconds', {
      time: stepfunctions.WaitTime.duration(cdk.Duration.seconds(3)),
    });

    /**
     * =========================
     * Definition
     * =========================
     */

    const definition = wait
      .next(payStep)
      .next(isPaidChoice);

    /**
     * =========================
     * State Machine
     * =========================
     */

    new stepfunctions.StateMachine(this, 'OrderStateMachine', {
      definitionBody: stepfunctions.DefinitionBody.fromChainable(definition),
      stateMachineName: 'OrderProcessingStateMachine',
      timeout: cdk.Duration.minutes(5),
      comment: 'State machine to process orders with payment, shipping, and notification steps.'
    });
  }
}