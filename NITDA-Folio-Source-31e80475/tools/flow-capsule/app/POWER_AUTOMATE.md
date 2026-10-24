# Power Automate verification branch

Immediately after **When an HTTP request is received**, add a Condition with this expression:

```text
@equals(triggerBody()?['_platform']?['operation'], 'verify')
```

In **If yes**, add only a Response action with status `200`, header `Content-Type: application/json`, and this body:

```json
{
  "verified": true,
  "flowIdentity": "SET_TO_THE_FLOW_IMMUTABLE_IDENTITY",
  "environment": "SET_TO_THE_DEPLOYMENT_ENVIRONMENT",
  "contractVersion": "SET_TO_THE_CURRENT_CONTRACT_VERSION",
  "correlationId": "@{triggerBody()?['_platform']?['correlationId']}"
}
```

Replace the three descriptive strings once in the designer with the actual non-secret deployment metadata. They must exactly match registration. End this branch immediately. It must contain no connector, update, email, approval, child-flow, delay, or business action. Put all business processing in **If no**.

Use this trigger schema if the normal business schema does not already admit `_platform`:

```json
{"type":"object","properties":{"_platform":{"type":"object","properties":{"operation":{"type":"string"},"correlationId":{"type":"string"}}}}}
```
