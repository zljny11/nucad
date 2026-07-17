interface lesionSheetMeta {
  sourceType: "none" | "legacy" | "algorithm" | "doctor";
  sourcePath: string;
  cachePath: string;
  templatePath: string;
  templateExt: string;
  templateFileName: string;
  templateSheetName: string;
  importedAt: string;
}

interface lesionSheetEntry {
  data: string[][];
  name: string;
  header?: string[];
  doctorData?: string[][];
  meta?: lesionSheetMeta;
}

interface patientState {
  patientInfo: {
    seriesId: string;
    pname: string;
    pID: string;
    sex: string;
    birthday: string;
    scanMode: string;
    scanTime: string;
    modifiedTime: string;
    inputPath: string;
    outputPath: string;
    pflag: string;
  };
  sheets: {
    "0": lesionSheetEntry;
  };
}

interface listSeriesItem {
  seriesId: string;
  pname: string;
  pID: string;
  sex: string;
  birthday: string;
  scanMode: string;
  scanTime: string;
  modifiedTime: string;
  inputPath: string;
  outputPath: string;
  pflag: string;
  seriesDesc: string;
  studyKey: string;
  studyLabel: string;
  studyDate: string;
}

interface listStudyGroup {
  studyKey: string;
  studyLabel: string;
  studyDate: string;
  seriesCount: number;
  seriesList: listSeriesItem[];
}

interface listPatientGroup {
  patientKey: string;
  pname: string;
  pID: string;
  sex: string;
  birthday: string;
  studyCount: number;
  seriesCount: number;
  studies: listStudyGroup[];
}

export type { lesionSheetMeta, lesionSheetEntry };
export { patientState, listSeriesItem, listStudyGroup, listPatientGroup };
