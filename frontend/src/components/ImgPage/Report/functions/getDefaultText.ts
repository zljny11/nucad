import translateFocalAreas from "../../../../functions/translateFocalAreas";

const getDefaultText1 = (): string => {
  return "确诊前列腺癌1天，病理：腺泡腺癌 GLEASON4+3=7分。小便不畅1年余，8.14体检我院PSA18.8ng/ml .我院前列腺 MR＋增强：前列腺癌，左侧移行带尖部，PI-RADS 5分。既往肠镜直肠息肉术后5年余。血糖指标稍高（体检查出）。弟弟肝癌。今行 PET-CT 协助病情诊断。";
};

const getDefaultText2 = (selectedSheetsData: string[][]): string => {
  const text = {
    brain:
      "脑部未见明显异常FDG摄取或结构改变，大脑形态如常，各脑叶形态正常，脑实质内未见异常密度影。皮层下各神经核团显影清晰，放射性分布对称，中线无移位。小脑显影如常。",
    kou: "口咽部两侧腺体显影对称，鼻咽部无异常放射性浓聚。",
    jia: "甲状腺两叶不大，形态可，腺实质内未见异常放射性增高灶。",
    jing: "双颈部、颌下淋巴结未见异常放射性增高灶。",
    suo: "锁骨上区未见明显异常淋巴结浓聚。",
    xiong: "左上胸腔纵隔显影如常。邻近左叶间胸膜极少量积液。",
    fei: "两肺显影清晰，肺纹理正常，右肺下叶见一钙化灶，余双肺未见磨玻璃样或实变性异常阴影，肺内未见异常放射性浓聚灶。",
    zong: "纵隔及两侧肺门未见异常肿大淋巴结或淋巴结浓聚。",
    heart: "心肌显影清晰。气管居中。",
    xiongmo: "右侧胸膜无增厚，胸水征阴性。",
    wei: "胃充盈好，胃壁显影如常。",
    gan: "肝脏形态可，轮廓光整，肝叶比例正常，肝实质内放射性分布稍欠均匀。肝内外胆管无扩张。",
    dan: "胆囊大小正常，胆囊底部见小结节样突起，未见异常浓聚。",
    yi: "胰腺形态放射性分布尚好，胰管不扩张。脾脏轻度显影，放射性分布均匀。",
    shen1: "两侧肾脏形态正常，肾实质密度均匀，肾盂、肾盏及输尿管无扩张。",
    shen2: "两侧肾上腺显影大致正常。",
    fu: "腹部可见条索状肠影。",
    fumo: "腹膜后未见明显肿大淋巴结。",
    pang: "膀胱放射性浓聚如常，膀胱壁无增厚。",
    qian: "前列腺大小正常，放射性分布大致正常。",
    fugou: "两侧腹股沟无异常淋巴结显示。",
    ge: "左骼骨见小囊变影，未见异常浓聚。",
    colon: "结肠放射性分布均匀，未见异常放射性增高灶。",
    sizhi: "上、下肢关节带大致正常。",
  };

  selectedSheetsData.forEach((sheetsData: string[]) => {
    if (sheetsData) {
      const organ = sheetsData[15];
      const organName = translateFocalAreas(organ);
      if (organName !== "未识别") {
        text[organ] = `${organName}摄取增高，SUVmax ${parseFloat(
          sheetsData[6]
        ).toFixed(2)}，SUVmean ${parseFloat(sheetsData[7]).toFixed(
          2
        )}，体积${parseFloat(sheetsData[5]).toFixed(2)}ml。`;
      }
    }
  });
  return Object.values(text).join("<br/>");
};

const getDefaultText3 = (selectedSheetsData: string[][]): string => {
  if (selectedSheetsData.length === 0) {
    return "基本正常，无明显病变";
  } else {
    return "结肠肿瘤病变可能性较大";
  }
};

const getDefaultText = (selectedSheetsData: string[][]): string[] => {
  return [
    getDefaultText1(),
    getDefaultText2(selectedSheetsData),
    getDefaultText3(selectedSheetsData),
  ];
};

export { getDefaultText1 };
export default getDefaultText;
