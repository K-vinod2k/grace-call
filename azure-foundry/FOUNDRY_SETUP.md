# GraceCall in Azure AI Foundry — Setup Guide

Wire the GraceCall telephony tool into an Azure AI Foundry agent so you can place a real
overdue-rental call by typing a request in the agent playground.

**Prerequisite:** the GraceCall server must be running and reachable at
`https://ninth-douche-disfigure.ngrok-free.dev`. Have its `TRIGGER_API_KEY` value handy — you
will paste it as the tool's API key.

## 1. Open Azure AI Foundry

Go to [https://ai.azure.com](https://ai.azure.com) and sign in with your Azure account.

## 2. Create or select a project

- From the landing page, pick an existing project, or click **+ Create project**.
- Give it a name (e.g. `gracecall-demo`) and attach a hub if prompted.
- A project needs a deployed chat model (e.g. `gpt-4o`) for the agent to reason. If you have
  none, go to **Models + endpoints → Deploy model** and deploy one before continuing.

## 3. Create the agent

- In the left nav, open **Agents**.
- Click **+ New agent** (or **Create agent**).
- Name it `GraceCall Operations Assistant`.
- Set its model to the chat deployment from step 2.

## 4. Set the system prompt

In the agent's **Instructions** field, paste exactly:

```
You are an operations assistant for Horizon Car Rental. When asked to call a customer about an overdue rental, use the triggerOverdueCall tool with the appropriate rentalId. Available rentals: RNT-1001 (Alex Rivera, SUV), RNT-1002 (Jordan Lee, Economy). Always confirm the call was placed and report back the objective and rationale.
```

## 5. Add the OpenAPI tool

- In the agent's **Actions** (or **Tools**) section, click **+ Add → OpenAPI 3.0 specified tool**.
- **Name:** `GraceCall`.
- **Upload schema:** select `openapi-foundry.yaml` from this folder
  (`grace-call/azure-foundry/openapi-foundry.yaml`).
- When prompted for authentication, choose **API Key (Custom)**:
  - **Header name:** `X-GraceCall-Key`
  - **Value:** paste the GraceCall server's `TRIGGER_API_KEY`.
  - Auth location: **Header**.
- Save. Foundry should detect the `triggerOverdueCall` operation. Confirm it appears in the
  agent's tool list.

> If Foundry asks to store the key as a connection / secret, create one named
> `gracecall-key`, then reference it from the tool. The header name stays `X-GraceCall-Key`.

## 6. Test in the playground

Open the agent's **playground / chat** pane and type a natural request, for example:

```
Call the customer on rental RNT-1001 — their SUV is overdue.
```

The agent should:
1. Recognize the intent and call `triggerOverdueCall` with `rentalId: "RNT-1001"`.
2. Receive the policy decision back (objective, rationale, amount owed, placed = true).
3. Confirm the call was placed and report the objective and rationale, e.g.
   *"Call placed for RNT-1001 (Alex Rivera). Objective: recover — the SUV is overdue and within
   the recovery window. $X owed."*

Try `RNT-1002` for the extend scenario:

```
Please follow up with Jordan Lee about the overdue Economy rental, RNT-1002.
```

The phone listed for that rental will actually ring, so only test against numbers you control.

## 7. See the call results on the GraceCall dashboard

Open the live dashboard in a browser:

```
https://ninth-douche-disfigure.ngrok-free.dev/dashboard
```

Each triggered call appears with its rentalId, chosen objective, rationale, amount owed, and
live call status (dialing → connected → completed). You can also fetch the raw log at
`https://ninth-douche-disfigure.ngrok-free.dev/calls`.

## Troubleshooting

- **401 from the tool:** the API key is wrong or not sent as `X-GraceCall-Key`. Recheck step 5.
- **404 from the tool:** the rentalId is unknown — use `RNT-1001` or `RNT-1002`.
- **Connection / timeout error:** the ngrok tunnel or the GraceCall server is down. Confirm the
  server is running and `https://ninth-douche-disfigure.ngrok-free.dev/dashboard` loads.
- **Agent answers without calling the tool:** make sure the system prompt from step 4 is saved
  and the `GraceCall` tool is attached to this agent.
