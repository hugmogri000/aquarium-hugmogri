import { YANWEN_TRACKING_API } from "./config.js";

export async function fetchTrackingInfo(waybillNumber, authCode) {
  const trackingNumber = String(waybillNumber || "").trim();
  const authorization = String(authCode || "").trim();

  if (!trackingNumber || !authorization) {
    return null;
  }

  const url = new URL(YANWEN_TRACKING_API);
  url.searchParams.set("nums", trackingNumber);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: authorization,
    },
  });

  if (!response.ok) {
    throw new Error(`Yanwen tracking status ${response.status}`);
  }

  const payload = await response.json();
  const firstResult = Array.isArray(payload.result) ? payload.result[0] : null;
  if (!firstResult) {
    return {
      available: false,
      message: "No tracking yet.",
      trackingStatus: "EMPTY",
      rawMessage: String(payload.message || ""),
      checkpoints: [],
    };
  }

  const trackingStatus = String(firstResult.tracking_status || "").toUpperCase();
  const checkpoints = Array.isArray(firstResult.checkpoints)
    ? firstResult.checkpoints
        .map((item) => ({
          time: String(item.time_stamp || ""),
          timeZone: String(item.time_zone || ""),
          statusCode: String(item.tracking_status || ""),
          message: String(item.message || ""),
          location: String(item.location || ""),
          isLastMile: Number(item.is_last_mile_checkpoint || 0) === 1,
        }))
        .sort((left, right) => String(right.time).localeCompare(String(left.time)))
    : [];

  const latest = checkpoints[0] || null;
  const notFound = trackingStatus === "NOTFOUND";

  return {
    available: checkpoints.length > 0,
    message: checkpoints.length > 0 ? "" : (notFound ? "Waybill number not found." : "No tracking yet."),
    trackingNumber: String(firstResult.tracking_number || trackingNumber),
    waybillNumber: String(firstResult.waybill_number || trackingNumber),
    exchangeNumber: String(firstResult.exchange_number || ""),
    lastMileCarrier: String(firstResult.last_mile_carrier || ""),
    lastMileCarrierWebsite: String(firstResult.last_mile_carrier_website || ""),
    trackingStatus,
    trackingStatusWaybill: firstResult.tracking_status_waybill || null,
    destinationCountry: String(firstResult.destination_country || ""),
    originCountry: String(firstResult.origin_country || ""),
    latestCheckpoint: latest,
    checkpoints,
    rawMessage: String(payload.message || ""),
    requestTime: String(payload.requestTime || ""),
  };
}
