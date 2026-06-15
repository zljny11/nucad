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
    "0": {
      data: [];
      name: string;
    };
  };
}

export { patientState };
