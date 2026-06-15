import { configureStore } from '@reduxjs/toolkit'
import ListPageReducer from "./ListPageSlice";
import patientReducer from "./patientSlice";

const store = configureStore({
  reducer: {
    ListPage: ListPageReducer,
    patient: patientReducer,
  }
})

export default store;

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch