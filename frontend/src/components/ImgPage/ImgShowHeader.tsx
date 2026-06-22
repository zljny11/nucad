import React, { useState, useContext, useEffect } from "react";
import { useNavigate } from "react-router";
import PubSub from "pubsub-js";
import { getRenderingEngine } from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";
import {
  VolumeToolGroup,
  setUpVoiSynchronizers,
  removeVoiSynchronizers,
  setToolPassiveFun,
} from "./functions/cornerstoneAddTools";
import ImgPageContext from "./functions/ImgPageContext";
import { renderingEngineId, viewportIds } from "./functions/getConstant";
import {
  MASK_BRUSH_SIZE_TOPIC,
  MASK_REDO_TOPIC,
  MASK_SAVE_TOPIC,
  MASK_SET_MODE_TOPIC,
  MASK_STATE_TOPIC,
  MASK_TOGGLE_VISIBILITY_TOPIC,
  MASK_UNDO_TOPIC,
} from "./functions/maskEvents";
import logo from "../../images/logonamegrey.png";

const {
  Enums: csToolsEnums,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  DragProbeTool,
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
  brushSize: 25,
  dirty: false,
  canUndo: false,
  canRedo: false,
  mode: "none",
};

interface ImgShowHeaderProps {
  pflag: string;
}

const ImgShowHeader: React.FC<ImgShowHeaderProps> = (props) => {
  const navigate = useNavigate();
  const { volumeLoaded } = useContext(ImgPageContext);
  const { pflag } = props;
  const [curTool, setCurTool] = useState("");
  const [voiSync, setVoiSync] = useState(false);
  const [crosshairsActive, setCrosshairsActive] = useState(false);
  const [maskState, setMaskState] = useState<MaskToolbarState>(initialMaskState);

  useEffect(() => {
    const token = PubSub.subscribe(MASK_STATE_TOPIC, (_, data) => {
      setMaskState((previous) => ({
        ...previous,
        ...data,
      }));
    });

    return () => {
      PubSub.unsubscribe(token);
    };
  }, []);

  const goBackListPage = () => {
    if (volumeLoaded.current) {
      removeVoiSynchronizers();
      removeVoiSynchronizers();
      setToolPassiveFun(VolumeToolGroup);
      VolumeToolGroup.setToolDisabled(CrosshairsTool.toolName);
      navigate("/ListPage");
    }
  };

  const handleLeftClicked = (toolName: string) => {
    if (toolName !== "WindowLevelTool" && voiSync) setVoiSyncFun();
    setToolPassiveFun(VolumeToolGroup);
    PubSub.publish(MASK_SET_MODE_TOPIC, "none");
    switch (toolName) {
      case "ZoomTool":
        VolumeToolGroup.setToolActive(ZoomTool.toolName, {
          bindings: [
            {
              mouseButton: MouseBindings.Primary, // Left Click
            },
          ],
        });
        break;
      case "PanTool":
        VolumeToolGroup.setToolActive(PanTool.toolName, {
          bindings: [
            {
              mouseButton: MouseBindings.Primary, // Left Click
            },
          ],
        });
        break;
      case "DragProbeTool":
        VolumeToolGroup.setToolActive(DragProbeTool.toolName, {
          bindings: [
            {
              mouseButton: MouseBindings.Primary, // Left Click
            },
          ],
        });
        break;
      case "WindowLevelTool":
        VolumeToolGroup.setToolActive(WindowLevelTool.toolName, {
          bindings: [
            {
              mouseButton: MouseBindings.Primary, // Left Click
            },
          ],
        });
        break;
      default:
        break;
    }
    setCurTool(toolName);
  };

  const setMaskMode = (mode: "brush" | "erase") => {
    if (!maskState.ready) {
      return;
    }
    if (voiSync) {
      setVoiSyncFun();
    }
    setToolPassiveFun(VolumeToolGroup);
    PubSub.publish(MASK_SET_MODE_TOPIC, mode);
    setCurTool(BrushTool.toolName);
  };

  const changeBrushSize = (delta: number) => {
    if (!maskState.ready) {
      return;
    }
    PubSub.publish(MASK_BRUSH_SIZE_TOPIC, delta);
  };

  const setVoiSyncFun = () => {
    if (voiSync) {
      removeVoiSynchronizers();
    } else {
      handleLeftClicked("WindowLevelTool");
      setUpVoiSynchronizers();
    }
    setVoiSync(!voiSync);
  };

  const toogleCrosshairsTool = () => {
    if (crosshairsActive) {
      VolumeToolGroup.setToolDisabled(CrosshairsTool.toolName);
    } else {
      VolumeToolGroup.setToolActive(CrosshairsTool.toolName, {
        bindings: [
          {
            mouseButton: MouseBindings.Secondary, // Right Click
          },
        ],
      });
    }
    setCrosshairsActive(!crosshairsActive);
  };

  const resetImage = () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    viewportIds.forEach((viewportId) => {
      const viewport = renderingEngine.getViewport(viewportId);
      viewport.resetCamera(true, true, false); // resetPan, resetZoom, resetToCenter
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
          <div>返回</div>
        </div>

        <div
          className="buttonContainer"
          onClick={() => handleLeftClicked("ZoomTool")}
        >
          <div
            className={
              curTool === "ZoomTool" ? "chosenIconfont" : "NewIconfont"
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
          onClick={() => handleLeftClicked("DragProbeTool")}
        >
          <div
            className={
              curTool === "DragProbeTool" ? "chosenIconfont" : "NewIconfont"
            }
          >
            &#xe6b0;
          </div>
          <div>探针</div>
        </div>

        <div
          className="buttonContainer"
          onClick={() => handleLeftClicked("WindowLevelTool")}
        >
          <div
            className={
              curTool === "WindowLevelTool" ? "chosenIconfont" : "NewIconfont"
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
          <div>重置图像</div>
        </div>
        <div
          className={maskState.ready ? "buttonContainer" : "buttonContainer disabledAction"}
          onClick={() => PubSub.publish(MASK_TOGGLE_VISIBILITY_TOPIC)}
        >
          <div className={maskState.visible ? "chosenIconfont" : "NewIconfont"}>
            &#xe8da;
          </div>
          <div>{maskState.visible ? "隐藏Mask" : "显示Mask"}</div>
        </div>
        <div
          className={maskState.ready ? "buttonContainer" : "buttonContainer disabledAction"}
          onClick={() => setMaskMode("brush")}
        >
          <div
            className={
              maskState.mode === "brush" ? "chosenIconfont" : "NewIconfont"
            }
          >
            &#9998;
          </div>
          <div>画刷</div>
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
          <div className={maskState.canUndo ? "NewIconfont" : "disabledButton"}>
            &#xe8a4;
          </div>
          <div>撤销</div>
        </div>
        <div
          className={maskState.canRedo ? "buttonContainer" : "buttonContainer disabledAction"}
          onClick={() => maskState.canRedo && PubSub.publish(MASK_REDO_TOPIC)}
        >
          <div className={maskState.canRedo ? "NewIconfont" : "disabledButton"}>
            &#xe8a3;
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
        {pflag !== "2" ? (
          <div className="buttonContainer" onClick={generateReport}>
            <div className="NewIconfont">&#9998;</div>
            <div>查看报告</div>
          </div>
        ) : null}
      </div>

      <div className="maskStatusFloating">
        NuCAD
        <div className="maskStatus">
          <div>
            Mask:
            {maskState.source === "doctor"
              ? "医生版"
              : maskState.source === "algorithm"
              ? "算法版"
              : maskState.source === "empty"
              ? "空白"
              : "未加载"}
          </div>
          <div>
            半径: {maskState.brushSize}
            {maskState.dirty ? " | 未保存" : ""}
          </div>
          <div>{maskState.message}</div>
        </div>
      </div>
    </div>
  );
};

export default ImgShowHeader;
