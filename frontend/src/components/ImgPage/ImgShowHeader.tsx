import React, { useState, useContext, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import PubSub from "pubsub-js";
import { getRenderingEngine } from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import {
  VolumeToolGroup,
  NuCadWindowLevelTool,
  NuCadZoomTool,
  NuCadDragProbeTool,
  setUpVoiSynchronizers,
  removeVoiSynchronizers,
  setToolPassiveFun,
} from "./functions/cornerstoneAddTools";
import ImgPageContext from "./functions/ImgPageContext";
import { renderingEngineId, viewportIds } from "./functions/getConstant";
import {
  MASK_BRUSH_SHAPE_TOPIC,
  MASK_BRUSH_SIZE_TOPIC,
  MASK_REDO_TOPIC,
  MASK_SAVE_TOPIC,
  MASK_SET_MODE_TOPIC,
  MASK_STATE_TOPIC,
  MASK_TOGGLE_VISIBILITY_TOPIC,
  MASK_UNDO_TOPIC,
} from "./functions/maskEvents";
import { LESION_EDIT_TOGGLE_TOPIC } from "./functions/lesionEditEvents";
import { SERIES_CHANGE_TOPIC } from "./functions/seriesEvents";
import logo from "../../images/logonamegrey.png";

const {
  Enums: csToolsEnums,
  PanTool,
  CrosshairsTool,
  BrushTool,
} = cornerstoneTools;
const { MouseBindings } = csToolsEnums;

interface MaskToolbarState {
  ready: boolean;
  visible: boolean;
  source: "doctor" | "algorithm" | "empty" | "none" | "error";
  message: string;
  brushSize: number;
  brushShape: "circle" | "square";
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  mode: "none" | "brush" | "erase";
}

const initialMaskState: MaskToolbarState = {
  ready: false,
  visible: true,
  source: "none",
  message: "Mask未初始化",
  brushSize: 8,
  brushShape: "circle",
  dirty: false,
  canUndo: false,
  canRedo: false,
  mode: "none",
};

let probeCursorHidden = false;
let probeCursorHideTimer: number | null = null;
const hiddenCursor =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3C/svg%3E\") 0 0, none";

const probeCursorHiddenSelectors = [
  "html",
  "body",
  "#root",
  "#content",
  "#viewportGrid",
  "#viewportGrid *",
];

const applyProbeCursorHidden = () => {
  if (!probeCursorHidden) {
    return;
  }

  document.querySelectorAll<HTMLElement>(probeCursorHiddenSelectors.join(", "))
    .forEach((element) => {
      element.style.setProperty("cursor", hiddenCursor, "important");
    });
};

const resetProbeCursorHidden = () => {
  document.querySelectorAll<HTMLElement>(probeCursorHiddenSelectors.join(", "))
    .forEach((element) => {
      element.style.removeProperty("cursor");
    });
};

const setProbeCursorHidden = (hidden: boolean) => {
  probeCursorHidden = hidden;
  const viewportGrid = document.getElementById("viewportGrid");
  viewportGrid?.classList.toggle("probeCursorHidden", hidden);

  const { hideElementCursor, resetElementCursor } = (cornerstoneTools as any)
    .cursors.elementCursor;

  document
    .querySelectorAll<HTMLElement>("#viewportGrid .viewport")
    .forEach((element) => {
      if (hidden) {
        hideElementCursor(element);
      } else {
        resetElementCursor(element);
      }
    });

  if (hidden) {
    applyProbeCursorHidden();
    if (!probeCursorHideTimer) {
      probeCursorHideTimer = window.setInterval(applyProbeCursorHidden, 100);
    }
    ["mousemove", "pointermove", "mouseenter", "mouseover"].forEach(
      (eventName) => {
        document.addEventListener(eventName, applyProbeCursorHidden, true);
      }
    );
  } else if (probeCursorHideTimer) {
    window.clearInterval(probeCursorHideTimer);
    probeCursorHideTimer = null;
    ["mousemove", "pointermove", "mouseenter", "mouseover"].forEach(
      (eventName) => {
        document.removeEventListener(eventName, applyProbeCursorHidden, true);
      }
    );
    resetProbeCursorHidden();
  }
};

interface ImgShowHeaderProps {
  pflag: string;
  mode?: "viewer" | "editor";
}

const ImgShowHeader: React.FC<ImgShowHeaderProps> = (props) => {
  const navigate = useNavigate();
  const { volumeLoaded } = useContext(ImgPageContext);
  const { pflag, mode = "viewer" } = props;
  const isEditor = mode === "editor";
  const [curTool, setCurTool] = useState("");
  const [voiSync, setVoiSync] = useState(false);
  const [crosshairsActive, setCrosshairsActive] = useState(false);
  const [maskState, setMaskState] = useState<MaskToolbarState>(initialMaskState);
  const [brushMenuOpen, setBrushMenuOpen] = useState(false);
  const editorCrosshairsInitialized = useRef(false);

  useEffect(() => {
    const token = PubSub.subscribe(MASK_STATE_TOPIC, (_, data) => {
      setMaskState((previous) => ({
        ...previous,
        ...data,
      }));
    });
    const seriesChangeToken = PubSub.subscribe(SERIES_CHANGE_TOPIC, () => {
      VolumeToolGroup.setToolDisabled(CrosshairsTool.toolName);
      setCrosshairsActive(false);
      setCurTool("");
    });

    return () => {
      PubSub.unsubscribe(token);
      PubSub.unsubscribe(seriesChangeToken);
    };
  }, []);

  const disableCrosshairs = () => {
    VolumeToolGroup.setToolDisabled(CrosshairsTool.toolName);
    setCrosshairsActive(false);
  };

  const setCrosshairsPassive = () => {
    VolumeToolGroup.setToolPassive(CrosshairsTool.toolName);
    setCrosshairsActive(true);
  };

  const enableCrosshairs = useCallback(() => {
    if (!volumeLoaded.current) {
      return;
    }

    if (voiSync) {
      removeVoiSynchronizers();
      setVoiSync(false);
    }

    setProbeCursorHidden(false);
    setToolPassiveFun(VolumeToolGroup);
    PubSub.publishSync(MASK_SET_MODE_TOPIC, "none");
    VolumeToolGroup.setToolActive(CrosshairsTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    });
    setCurTool(CrosshairsTool.toolName);
    setCrosshairsActive(true);
  }, [voiSync, volumeLoaded]);

  useEffect(() => {
    if (!isEditor || !maskState.ready || editorCrosshairsInitialized.current) {
      return;
    }

    enableCrosshairs();
    editorCrosshairsInitialized.current = true;
  }, [enableCrosshairs, isEditor, maskState.ready]);

  const goBackListPage = () => {
    if (volumeLoaded.current) {
      setProbeCursorHidden(false);
      removeVoiSynchronizers();
      setToolPassiveFun(VolumeToolGroup);
      disableCrosshairs();
      navigate(isEditor ? "/ImgPage" : "/ListPage");
    }
  };

  const showLesionEditList = () => {
    if (volumeLoaded.current) {
      setProbeCursorHidden(false);
      removeVoiSynchronizers();
      setToolPassiveFun(VolumeToolGroup);
      disableCrosshairs();
      PubSub.publish(LESION_EDIT_TOGGLE_TOPIC);
    }
  };

  const handleLeftClicked = (toolName: string) => {
    if (!volumeLoaded.current) {
      return;
    }

    if (curTool === toolName) {
      if (toolName === NuCadWindowLevelTool.toolName && voiSync) {
        removeVoiSynchronizers();
        setVoiSync(false);
      }
      setToolPassiveFun(VolumeToolGroup);
      PubSub.publishSync(MASK_SET_MODE_TOPIC, "none");
      setProbeCursorHidden(false);
      setCurTool("");
      return;
    }

    if (toolName !== NuCadWindowLevelTool.toolName && voiSync) setVoiSyncFun();
    disableCrosshairs();
    setToolPassiveFun(VolumeToolGroup);
    PubSub.publishSync(MASK_SET_MODE_TOPIC, "none");
    setProbeCursorHidden(toolName === "NuCadDragProbeTool");
    switch (toolName) {
      case "NuCadZoomTool":
        VolumeToolGroup.setToolActive(NuCadZoomTool.toolName, {
          bindings: [
            {
              mouseButton: MouseBindings.Primary,
            },
          ],
        });
        break;
      case "PanTool":
        VolumeToolGroup.setToolActive(PanTool.toolName, {
          bindings: [
            {
              mouseButton: MouseBindings.Primary,
            },
          ],
        });
        break;
      case "NuCadDragProbeTool":
        VolumeToolGroup.setToolActive(NuCadDragProbeTool.toolName, {
          bindings: [
            {
              mouseButton: MouseBindings.Primary,
            },
          ],
        });
        break;
      case NuCadWindowLevelTool.toolName:
        VolumeToolGroup.setToolActive(NuCadWindowLevelTool.toolName, {
          bindings: [
            {
              mouseButton: MouseBindings.Primary,
            },
          ],
        });
        break;
      default:
        break;
    }
    setCurTool(toolName);
  };

  const setMaskMode = (mode: "brush" | "erase", forceActive = false) => {
    if (!maskState.ready) {
      return;
    }

    if (maskState.mode === mode && !forceActive) {
      PubSub.publishSync(MASK_SET_MODE_TOPIC, "none");
      if (crosshairsActive) {
        enableCrosshairs();
      } else {
        setToolPassiveFun(VolumeToolGroup);
        setCurTool("");
      }
      return;
    }

    if (voiSync) {
      setVoiSyncFun();
    }
    setToolPassiveFun(VolumeToolGroup);
    if (crosshairsActive) {
      setCrosshairsPassive();
    }
    setProbeCursorHidden(false);
    PubSub.publishSync(MASK_SET_MODE_TOPIC, mode);
    setCurTool(BrushTool.toolName);
  };

  const showBrushMenu = () => {
    if (!maskState.ready) {
      return;
    }

    if (maskState.mode === "brush") {
      setMaskMode("brush");
      setBrushMenuOpen(false);
      return;
    }

    setBrushMenuOpen((open) => !open);
  };

  const selectBrushShape = (shape: "circle" | "square") => {
    if (!maskState.ready) {
      return;
    }

    PubSub.publishSync(MASK_BRUSH_SHAPE_TOPIC, shape);
    setMaskMode("brush", true);
    setBrushMenuOpen(false);
  };

  const changeBrushSize = (delta: number) => {
    if (!maskState.ready) {
      return;
    }
    PubSub.publish(MASK_BRUSH_SIZE_TOPIC, delta);
  };

  const setVoiSyncFun = () => {
    if (!volumeLoaded.current) {
      return;
    }
    if (voiSync) {
      removeVoiSynchronizers();
    } else {
      disableCrosshairs();
      setToolPassiveFun(VolumeToolGroup);
      setProbeCursorHidden(false);
      PubSub.publishSync(MASK_SET_MODE_TOPIC, "none");
      VolumeToolGroup.setToolActive(NuCadWindowLevelTool.toolName, {
        bindings: [
          {
            mouseButton: MouseBindings.Primary,
          },
        ],
      });
      setCurTool(NuCadWindowLevelTool.toolName);
      setUpVoiSynchronizers();
    }
    setVoiSync(!voiSync);
  };

  const toogleCrosshairsTool = () => {
    if (!volumeLoaded.current) {
      return;
    }
    if (crosshairsActive) {
      disableCrosshairs();
      setCurTool(maskState.mode === "none" ? "" : BrushTool.toolName);
    } else {
      if (maskState.mode !== "none") {
        setCrosshairsPassive();
        setCurTool(BrushTool.toolName);
        return;
      }

      enableCrosshairs();
    }
  };

  const resetImage = () => {
    if (!volumeLoaded.current) {
      return;
    }
    disableCrosshairs();
    setToolPassiveFun(VolumeToolGroup);
    PubSub.publishSync(MASK_SET_MODE_TOPIC, "none");
    setCurTool("");
    const renderingEngine = getRenderingEngine(renderingEngineId);
    if (!renderingEngine) {
      return;
    }
    viewportIds.forEach((viewportId) => {
      const viewport = renderingEngine.getViewport(viewportId);
      viewport.resetCamera(true, true, false);
      viewport.render();
    });
  };

  const generateReport = () => {
    if (volumeLoaded.current) {
      PubSub.publish("showReport");
    }
  };

  return (
    <div className="ImgShowHeader">
      <img src={logo} alt="logo" className="logo" />

      <div className="ImgShowMenu">
        <div className="buttonContainer" onClick={goBackListPage}>
          <div className="NewIconfont">&#xe8a4;</div>
          <div>{isEditor ? "返回影像" : "返回"}</div>
        </div>

        <div
          className="buttonContainer"
          onClick={() => handleLeftClicked("NuCadZoomTool")}
        >
          <div
            className={
              curTool === "NuCadZoomTool" ? "chosenIconfont" : "NewIconfont"
            }
          >
            &#xec13;
          </div>
          <div>放大</div>
        </div>

        <div
          className="buttonContainer"
          onClick={() => handleLeftClicked("PanTool")}
        >
          <div
            className={curTool === "PanTool" ? "chosenIconfont" : "NewIconfont"}
          >
            &#xe6ab;
          </div>
          <div>拖拽</div>
        </div>

        <div
          className="buttonContainer"
          onClick={() => handleLeftClicked("NuCadDragProbeTool")}
        >
          <div
            className={
              curTool === "NuCadDragProbeTool"
                ? "chosenIconfont"
                : "NewIconfont"
            }
          >
            &#xe6b0;
          </div>
          <div>探针</div>
        </div>

        <div
          className="buttonContainer"
          onClick={() => handleLeftClicked(NuCadWindowLevelTool.toolName)}
        >
          <div
            className={
              curTool === NuCadWindowLevelTool.toolName
                ? "chosenIconfont"
                : "NewIconfont"
            }
          >
            &#xe685;
          </div>
          <div>WW/WL</div>
        </div>
        <div className="buttonContainer" onClick={setVoiSyncFun}>
          <div className={voiSync ? "chosenIconfont" : "NewIconfont"}>
            &#xe8da;
          </div>
          <div>WW/WL同步</div>
        </div>

        <div className="buttonContainer" onClick={toogleCrosshairsTool}>
          <div className={crosshairsActive ? "chosenIconfont" : "NewIconfont"}>
            <svg
              className="w-5 h-5 fill-current crosshairsIcon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 22 22"
            >
              <g
                fill="none"
                fillRule="evenodd"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
              >
                <path d="M12 11.631a.417.417 0 1 1 0 .835.417.417 0 0 1 0-.835M8.84 12H1.596M22.404 12H15.16M11.923 1.596V8.84M11.923 15.256V22.5"></path>
              </g>
            </svg>
          </div>
          <div>十字线</div>
        </div>

        <div className="buttonContainer" onClick={resetImage}>
          <div className="NewIconfont">&#xe6ad;</div>
          <div>重置影像</div>
        </div>
        <div className="buttonContainer" onClick={showLesionEditList}>
          <div className="NewIconfont">&#9998;</div>
          <div>病灶列表</div>
        </div>
        {isEditor ? (
          <>
            <div
              className={maskState.ready ? "buttonContainer" : "buttonContainer disabledAction"}
              onClick={() => maskState.ready && PubSub.publish(MASK_TOGGLE_VISIBILITY_TOPIC)}
            >
              <div className={maskState.visible ? "NewIconfont" : "chosenIconfont"}>
                &#xe8da;
              </div>
              <div>{maskState.visible ? "隐藏Mask" : "显示Mask"}</div>
            </div>
            <div
              className={
                maskState.ready
                  ? "buttonContainer brushToolContainer"
                  : "buttonContainer brushToolContainer disabledAction"
              }
              onClick={showBrushMenu}
            >
              <div
                className={
                  maskState.mode === "brush" ? "chosenIconfont" : "NewIconfont"
                }
              >
                &#9998;
              </div>
              <div>画刷</div>
              {brushMenuOpen ? (
                <div
                  className="brushShapeMenu"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    className={
                      maskState.brushShape === "circle"
                        ? "brushShapeOption active"
                        : "brushShapeOption"
                    }
                    onClick={() => selectBrushShape("circle")}
                    type="button"
                  >
                    <span className="circleBrushIcon" />
                    圆形画刷
                  </button>
                  <button
                    className={
                      maskState.brushShape === "square"
                        ? "brushShapeOption active"
                        : "brushShapeOption"
                    }
                    onClick={() => selectBrushShape("square")}
                    type="button"
                  >
                    <span className="squareBrushIcon" />
                    方形画刷
                  </button>
                </div>
              ) : null}
            </div>
            <div
              className={maskState.ready ? "buttonContainer" : "buttonContainer disabledAction"}
              onClick={() => setMaskMode("erase")}
            >
              <div
                className={
                  maskState.mode === "erase" ? "chosenIconfont" : "NewIconfont"
                }
              >
                <svg
                  className="eraserIcon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M16.8 3.7 21 7.9c.8.8.8 2 0 2.8l-8.9 8.9c-.4.4-.9.6-1.4.6H4.4c-.5 0-.8-.6-.5-1l3-4.8L14 3.7c.8-.8 2-.8 2.8 0Z"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M7.7 14.2 12.5 19M12.5 8l4.8 4.8"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
              </div>
              <div>橡皮</div>
            </div>
            <div
              className={maskState.ready ? "buttonContainer" : "buttonContainer disabledAction"}
              onClick={() => changeBrushSize(-2)}
            >
              <div className="NewIconfont">-</div>
              <div>半径-{2}</div>
            </div>
            <div
              className={maskState.ready ? "buttonContainer" : "buttonContainer disabledAction"}
              onClick={() => changeBrushSize(2)}
            >
              <div className="NewIconfont">+</div>
              <div>半径+{2}</div>
            </div>
            <div
              className={maskState.canUndo ? "buttonContainer" : "buttonContainer disabledAction"}
              onClick={() => maskState.canUndo && PubSub.publish(MASK_UNDO_TOPIC)}
            >
              <div className="NewIconfont">
                &#xe8a4;
              </div>
              <div>撤销</div>
            </div>
            <div
              className={maskState.canRedo ? "buttonContainer" : "buttonContainer disabledAction"}
              onClick={() => maskState.canRedo && PubSub.publish(MASK_REDO_TOPIC)}
            >
              <div className="NewIconfont">
                <svg
                  className="redoIcon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M17.8 8.2A7 7 0 1 0 19 12"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                  <path
                    d="M17.8 3.8v4.4h4.4"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              </div>
              <div>重做</div>
            </div>
            <div
              className={maskState.ready ? "buttonContainer" : "buttonContainer disabledAction"}
              onClick={() => maskState.ready && PubSub.publish(MASK_SAVE_TOPIC)}
            >
              <div className={maskState.dirty ? "chosenIconfont" : "NewIconfont"}>
                &#xe6ad;
              </div>
              <div>保存Mask</div>
            </div>
            <div
              className="buttonContainer"
              onClick={generateReport}
            >
              <div className="NewIconfont">
                &#9998;
              </div>
              <div>查看报告</div>
            </div>
          </>
        ) : null}
        {!isEditor && pflag !== "2" && pflag !== "6" ? (
          <div className="buttonContainer" onClick={generateReport}>
            <div className="NewIconfont">&#9998;</div>
            <div>查看报告</div>
          </div>
        ) : null}
      </div>

      {isEditor ? (
        <div className="maskRadiusFloating">半径: {maskState.brushSize}</div>
      ) : null}
    </div>
  );
};

export default ImgShowHeader;
