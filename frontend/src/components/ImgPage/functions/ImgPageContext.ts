import { createContext, createRef } from "react";

interface ImgPageContextProps {
  selectedLesions: React.MutableRefObject<string[]>;
  setSelectedLesions: React.Dispatch<React.SetStateAction<string[]>>;
  volumeLoaded: React.MutableRefObject<boolean>;
}

const ImgPageContext = createContext<ImgPageContextProps>({
  selectedLesions: createRef(),
  setSelectedLesions: () => undefined,
  volumeLoaded: createRef(),
});
export default ImgPageContext;
