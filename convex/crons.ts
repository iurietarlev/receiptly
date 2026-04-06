import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sync all merchant transactions",
  { hours: 6 },
  internal.transactionsInternal.syncAllMerchants,
  {}
);

export default crons;
