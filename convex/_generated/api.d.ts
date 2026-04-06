/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as merchants from "../merchants.js";
import type * as merchantsInternal from "../merchantsInternal.js";
import type * as syncLog from "../syncLog.js";
import type * as transactions from "../transactions.js";
import type * as transactionsInternal from "../transactionsInternal.js";
import type * as userCards from "../userCards.js";
import type * as users from "../users.js";
import type * as xero from "../xero.js";
import type * as xeroInternal from "../xeroInternal.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  http: typeof http;
  merchants: typeof merchants;
  merchantsInternal: typeof merchantsInternal;
  syncLog: typeof syncLog;
  transactions: typeof transactions;
  transactionsInternal: typeof transactionsInternal;
  userCards: typeof userCards;
  users: typeof users;
  xero: typeof xero;
  xeroInternal: typeof xeroInternal;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
