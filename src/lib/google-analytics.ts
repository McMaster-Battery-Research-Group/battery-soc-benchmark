import { randomUUID } from "crypto";

type EvaluationStatus = "succeeded" | "failed";

/** Send aggregate evaluation outcomes through the GA4 Measurement Protocol. */
export async function trackEvaluationOutcome(modelType: string, status: EvaluationStatus) {
  const measurementId = process.env.GOOGLE_ANALYTICS_DEV_ID;
  const apiSecret = process.env.GOOGLE_ANALYTICS_DEV_API_SECRET;
  if (!measurementId || !apiSecret) return;

  try {
    // to read more about this API call visit https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events?client_type=firebase
    await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: randomUUID(),
        events: [{
          name: "evaluation_outcome",
          params: { model_type: modelType, evaluation_status: status },
        }],
      }),
    });
  } catch (error) {
    console.error("[analytics] evaluation outcome tracking failed", error instanceof Error ? error.message : String(error));
  }
}