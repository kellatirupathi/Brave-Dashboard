export * from "./generated/api";
export * from "./generated/api.schemas";
export {
  setBaseUrl,
  setAuthTokenGetter,
  setSeasonGetter,
  customFetch,
} from "./custom-fetch";
export type { AuthTokenGetter, SeasonGetter, ErrorType } from "./custom-fetch";
