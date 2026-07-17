import { createSlice } from "@reduxjs/toolkit";
import { patientState } from "../types";

const initialState: patientState = {
  patientInfo: {
    seriesId: "",
    pname: "",
    pID: "",
    sex: "",
    birthday: "",
    scanMode: "",
    scanTime: "",
    modifiedTime: "",
    inputPath: "",
    outputPath: "",
    pflag: "",
  },
  sheets: {
    "0": {
      data: [],
      name: "",
      header: [],
      doctorData: [],
      meta: {
        sourceType: "none",
        sourcePath: "",
        cachePath: "",
        templatePath: "",
        templateExt: "",
        templateFileName: "",
        templateSheetName: "",
        importedAt: "",
      },
    },
  },
};

const createEmptySheets = () => ({
  "0": {
    data: [],
    name: "",
    header: [],
    doctorData: [],
    meta: {
      sourceType: "none" as const,
      sourcePath: "",
      cachePath: "",
      templatePath: "",
      templateExt: "",
      templateFileName: "",
      templateSheetName: "",
      importedAt: "",
    },
  },
});

export const patientSlice = createSlice({
  name: "patient",
  initialState,
  reducers: {
    updatePatientInfo: (state, action) => {
      state.patientInfo = action.payload;
      state.sheets = createEmptySheets();
    },
    updateSheets: (state, action) => {
      state.sheets = action.payload;
    },
  },
});

export const { updatePatientInfo, updateSheets } = patientSlice.actions;

export default patientSlice.reducer;
