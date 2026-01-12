import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URI ?? "http://localhost:3000",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});
