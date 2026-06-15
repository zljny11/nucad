import React, { useState } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.bubble.css";

interface MedicalHistoryProps {
  text1: string;
}

const MedicalHistory: React.FC<MedicalHistoryProps> = (props) => {
  const { text1 } = props;
  const [content1, setContent1] = useState(text1);

  return (
    <div className="MedicalHistory">
      <div className="title">简要病史及检查目的：</div>
      <ReactQuill
        className="text"
        theme="bubble"
        value={content1}
        onChange={(value) => setContent1(value)}
      />
    </div>
  );
};

export default MedicalHistory;
