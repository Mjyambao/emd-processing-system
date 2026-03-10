import {
  getPnrQueueList,
  getPnrDetails,
  assignPnrs,
  logUiAction,
} from "@/api/pnrApi";

async function demo() {
  // Fetch Main Queues
  const list = await getPnrQueueList({
    page: 1,
    pageSize: 50,
    sortBy: "queueArrival",
    sortDir: "desc",
    filters: {
      status: ["Error", "Human Input Required"],
      assignedUser: "Unassigned",
      actionRequired: "Review RFIC",
    },
  });

  // Get details for a PNR from the list
  const pnrId = list?.data?.[0]?.pnrId;
  if (pnrId) {
    const details = await getPnrDetails(pnrId);

    // Assign the PNR
    await assignPnrs({ pnrIds: [pnrId], userId: "u123", mode: "direct" });

    // Log UI action
    await logUiAction({
      type: "assign",
      pnrId,
      metadata: { by: "michael", at: new Date().toISOString() },
    });
  }
}
