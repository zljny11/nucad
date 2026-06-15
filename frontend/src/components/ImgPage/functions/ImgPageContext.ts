import { createContext, createRef } from "react";

interface ImgPageContextProps {
  selectedLesions: React.MutableRefObject<string[]>;
  volumeLoaded: React.MutableRefObject<boolean>;
}

const ImgPageContext = createContext<ImgPageContextProps>({
  selectedLesions: createRef(),
  volumeLoaded: createRef(),
});
export default ImgPageContext;
