import axios, { AxiosInstance, AxiosRequestConfig } from "axios";

export interface HevyClient {
  v1: {
    workouts: {
      get: (params?: any) => Promise<any>;
      post: (data: any) => Promise<any>;
      count: {
        get: (params?: any) => Promise<any>;
      };
      events: {
        get: (params?: any) => Promise<any>;
      };
      byId: (id: string) => {
        get: () => Promise<any>;
        patch: (data: any) => Promise<any>;
        delete: () => Promise<any>;
      };
    };
    routines: {
      get: (params?: any) => Promise<any>;
      post: (data: any) => Promise<any>;
      byId: (id: string) => {
        get: () => Promise<any>;
        patch: (data: any) => Promise<any>;
        delete: () => Promise<any>;
      };
    };
    routine_folders: {
      get: (params?: any) => Promise<any>;
      post: (data: any) => Promise<any>;
      byId: (id: string) => {
        get: () => Promise<any>;
        patch: (data: any) => Promise<any>;
        delete: () => Promise<any>;
      };
    };
    exercise_templates: {
      get: (params?: any) => Promise<any>;
      post: (data: any) => Promise<any>;
      byId: (id: string) => {
        get: () => Promise<any>;
        patch: (data: any) => Promise<any>;
        delete: () => Promise<any>;
      };
    };
  };
}

export function createClient(apiKey: string, baseUrl: string): HevyClient {
  const axiosInstance = axios.create({
    baseURL: baseUrl,
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
  });

  return {
    v1: {
      workouts: {
        get: (params) => axiosInstance.get("/v1/workouts", { params }).then(res => res.data),
        post: (data) => axiosInstance.post("/v1/workouts", data).then(res => res.data),
        count: {
          get: (params) => axiosInstance.get("/v1/workouts/count", { params }).then(res => res.data),
        },
        events: {
          get: (params) => axiosInstance.get("/v1/workouts/events", { params }).then(res => res.data),
        },
        byId: (id) => ({
          get: () => axiosInstance.get(`/v1/workouts/${id}`).then(res => res.data),
          patch: (data) => axiosInstance.patch(`/v1/workouts/${id}`, data).then(res => res.data),
          delete: () => axiosInstance.delete(`/v1/workouts/${id}`).then(res => res.data),
        }),
      },
      routines: {
        get: (params) => axiosInstance.get("/v1/routines", { params }).then(res => res.data),
        post: (data) => axiosInstance.post("/v1/routines", data).then(res => res.data),
        byId: (id) => ({
          get: () => axiosInstance.get(`/v1/routines/${id}`).then(res => res.data),
          patch: (data) => axiosInstance.patch(`/v1/routines/${id}`, data).then(res => res.data),
          delete: () => axiosInstance.delete(`/v1/routines/${id}`).then(res => res.data),
        }),
      },
      routine_folders: {
        get: (params) => axiosInstance.get("/v1/routine_folders", { params }).then(res => res.data),
        post: (data) => axiosInstance.post("/v1/routine_folders", data).then(res => res.data),
        byId: (id) => ({
          get: () => axiosInstance.get(`/v1/routine_folders/${id}`).then(res => res.data),
          patch: (data) => axiosInstance.patch(`/v1/routine_folders/${id}`, data).then(res => res.data),
          delete: () => axiosInstance.delete(`/v1/routine_folders/${id}`).then(res => res.data),
        }),
      },
      exercise_templates: {
        get: (params) => axiosInstance.get("/v1/exercise_templates", { params }).then(res => res.data),
        post: (data) => axiosInstance.post("/v1/exercise_templates", data).then(res => res.data),
        byId: (id) => ({
          get: () => axiosInstance.get(`/v1/exercise_templates/${id}`).then(res => res.data),
          patch: (data) => axiosInstance.patch(`/v1/exercise_templates/${id}`, data).then(res => res.data),
          delete: () => axiosInstance.delete(`/v1/exercise_templates/${id}`).then(res => res.data),
        }),
      },
    },
  };
}
