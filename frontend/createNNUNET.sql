CREATE TABLE `radyn`.`NNUNET` (
  `seriesId` varchar(32) NOT NULL COMMENT '序号',
  `name` varchar(32) NOT NULL COMMENT '姓名',
  `sex` varchar(12) DEFAULT NULL COMMENT '性别',
  `birthday` varchar(10) DEFAULT NULL COMMENT '生日',
  `scanMode` varchar(5) DEFAULT NULL COMMENT '扫描模态',
  `scanTime` date DEFAULT NULL COMMENT '扫描时间',
  `processingTime` datetime DEFAULT NULL COMMENT '处理时间',
  `seriesDesc` varchar(64) DEFAULT NULL COMMENT '序列描述',
  `institution` varchar(32) DEFAULT NULL COMMENT '要删没删',
  `inputPath` varchar(128) DEFAULT NULL COMMENT '路径',
  `outputPath` varchar(128) DEFAULT NULL,
  `pID` varchar(64) DEFAULT NULL,
  `flag` varchar(1) DEFAULT NULL,
  PRIMARY KEY (`seriesId`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3 COMMENT='序列信息表：seriesID->序号、name->姓名、sex->性别、birthday->生日、scanMode->扫描模态、scanTime->扫描时间、processingTime->处理时间、seriesDesc->序列描述、inputPath->路径';

