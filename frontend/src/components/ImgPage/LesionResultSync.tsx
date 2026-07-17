import React, { useEffect } from "react";
import PubSub from "pubsub-js";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import { updateSheets } from "../../redux/patientSlice";
import { safeWindowRequire } from "../../utils/electron";
import { getEffectiveOutputPath } from "./functions/pathUtils";
import {
  MASK_PERSISTED_TOPIC,
  MASK_STATE_TOPIC,
} from "./functions/maskEvents";
import {
  applyMaskStatsToSheet,
  getAlgorithmImportsDir,
  getDoctorMaskPath,
  getDoctorReportMetaPath,
  getDoctorReportXlsxPath,
  readTemplateRows,
  writeDoctorReportXlsx,
  writeJson,
} from "./functions/lesionReportCache";
import type { LesionMaskStat } from "./functions/lesionReportCache";

const fs = safeWindowRequire ? safeWindowRequire("fs") : null;
const path = safeWindowRequire ? safeWindowRequire("path") : null;
const ipcRenderer = safeWindowRequire
  ? safeWindowRequire("electron").ipcRenderer
  : null;

const formatTimestamp = (date = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

const copyDirectory = (sourceDir: string, targetDir: string) => {
  if (!fs || !path || !fs.existsSync(sourceDir)) {
    return;
  }

  fs.mkdirSync(targetDir, { recursive: true });
  fs.readdirSync(sourceDir, { withFileTypes: true }).forEach((entry: any) => {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
      return;
    }

    fs.copyFileSync(sourcePath, targetPath);
  });
};

const LesionResultSync: React.FC = () => {
  const dispatch = useAppDispatch();
  const patientInfo = useAppSelector((state) => state.patient.patientInfo);
  const sheets = useAppSelector((state) => state.patient.sheets);
  const { seriesId, outputPath, inputPath } = patientInfo;
  const effectiveOutputPath = getEffectiveOutputPath(outputPath, inputPath);

  useEffect(() => {
    const persistDoctorReport = (sheet = sheets[0]) => {
      if (!fs || !path || !effectiveOutputPath) {
        return null;
      }

      const templatePath =
        sheet.meta?.templatePath || sheet.meta?.cachePath || "";
      const templateRows = readTemplateRows(templatePath);
      const doctorReportXlsxPath = getDoctorReportXlsxPath(effectiveOutputPath);
      const doctorReportMetaPath = getDoctorReportMetaPath(effectiveOutputPath);
      const resolvedRows = writeDoctorReportXlsx(
        doctorReportXlsxPath,
        sheet,
        templateRows,
        sheet.meta?.templateSheetName || "lesion_report"
      );

      writeJson(doctorReportMetaPath, {
        name: "doctor_lesion_report.xlsx",
        header: sheet.header || [],
        algorithmData: sheet.data,
        doctorData: sheet.doctorData || [],
        resolvedRows,
        meta: {
          ...(sheet.meta || {}),
          sourceType: "doctor",
          cachePath: doctorReportXlsxPath,
        },
      });

      return {
        doctorReportXlsxPath,
        doctorReportMetaPath,
      };
    };

    const exportResultFolder = async (
      maskPath: string,
      sheet = sheets[0],
      selectedExportParentDir = ""
    ) => {
      if (!fs || !path || !effectiveOutputPath) {
        return;
      }

      const exportParentDir =
        selectedExportParentDir ||
        (ipcRenderer ? await ipcRenderer.invoke("select-result-export-directory") : "");
      if (!exportParentDir) {
        return;
      }

      const doctorReport = persistDoctorReport(sheet);
      if (!doctorReport) {
        return;
      }

      const resultDir = path.join(
        exportParentDir,
        `${seriesId || "study"}_doctor_result_${formatTimestamp()}`
      );
      const resolvedMaskPath = maskPath || getDoctorMaskPath(effectiveOutputPath);

      fs.mkdirSync(resultDir, { recursive: true });
      if (resolvedMaskPath && fs.existsSync(resolvedMaskPath)) {
        fs.copyFileSync(resolvedMaskPath, path.join(resultDir, "doctor_mask.nii.gz"));
      }
      fs.copyFileSync(
        doctorReport.doctorReportXlsxPath,
        path.join(resultDir, "doctor_lesion_report.xlsx")
      );
      fs.copyFileSync(
        doctorReport.doctorReportMetaPath,
        path.join(resultDir, "doctor_lesion_report.meta.json")
      );

      const algorithmImportsDir = getAlgorithmImportsDir(effectiveOutputPath);
      if (algorithmImportsDir && fs.existsSync(algorithmImportsDir)) {
        copyDirectory(algorithmImportsDir, path.join(resultDir, "algorithm_imports"));
      }

      PubSub.publish(MASK_STATE_TOPIC, {
        message: `医生结果已导出: ${resultDir}`,
      });
    };

    const token = PubSub.subscribe(MASK_PERSISTED_TOPIC, async (_, payload) => {
      if (!effectiveOutputPath) {
        return;
      }

      try {
        const maskStats = Array.isArray(payload?.maskStats)
          ? (payload.maskStats as LesionMaskStat[])
          : [];
        const nextSheet = maskStats.length
          ? applyMaskStatsToSheet(sheets[0], maskStats, payload?.lesionTarget || {})
          : sheets[0];

        if (nextSheet !== sheets[0]) {
          dispatch(updateSheets({ 0: nextSheet }));
        }

        if (payload?.reason === "save") {
          persistDoctorReport(nextSheet);
          return;
        }

        if (payload?.reason === "export") {
          await exportResultFolder(
            payload?.path || "",
            nextSheet,
            payload?.exportParentDir || ""
          );
        }
      } catch (error) {
        console.error("Failed to sync lesion result files:", error);
        PubSub.publish(MASK_STATE_TOPIC, {
          message: "医生结果同步或导出失败",
        });
      }
    });

    return () => {
      PubSub.unsubscribe(token);
    };
  }, [dispatch, effectiveOutputPath, seriesId, sheets]);

  return null;
};

export default LesionResultSync;
