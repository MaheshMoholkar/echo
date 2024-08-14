import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query";
export const api = createApi({
  baseQuery: fetchBaseQuery({ baseUrl: "http://localhost:5173" }),
  reducerPath: "api",
  tagTypes: [],
  endpoints: () => ({}),
});

export const {} = api;
