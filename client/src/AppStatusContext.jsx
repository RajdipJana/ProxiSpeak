import { createContext } from "react";

const AppStatusContext = createContext({
  connected: false,
  employees: [],
  nearbyEmployees: [],
  voiceRange: 120,
});

export default AppStatusContext;