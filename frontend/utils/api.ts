import axios from "axios";

const instance = axios.create({
  baseURL: "http://localhost:8000/api/v1/entities",
});

export const api = {
  getCompanies: () => instance.get("/companies").then((res) => res.data),
  getFields: () => instance.get("/fields").then((res) => res.data),
  getClusters: () => instance.get("/clusters").then((res) => res.data),
  getWells: () => instance.get("/wells").then((res) => res.data),
  getRigs: () => instance.get("/rigs").then((res) => res.data),
  saveAnomalies: (payload: any) =>
    instance.post("/anomalies/save-batch", payload).then((res) => res.data),
};
