const getEffectiveOutputPath = (outputPath: string, inputPath: string) => {
  const trimmedOutputPath = String(outputPath || "").trim();

  if (trimmedOutputPath) {
    return trimmedOutputPath;
  }

  const normalizedInputPath = String(inputPath || "").trim();
  const pathMarkers = [
    { input: "/config/input/", output: "/config/output/" },
    { input: "\\config\\input\\", output: "\\config\\output\\" },
  ];
  const matchedMarker = pathMarkers.find((marker) =>
    normalizedInputPath.includes(marker.input)
  );

  if (matchedMarker) {
    return normalizedInputPath.replace(matchedMarker.input, matchedMarker.output);
  }

  return "";
};

export { getEffectiveOutputPath };
