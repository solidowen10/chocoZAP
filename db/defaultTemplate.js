// db/defaultTemplate.js
// The default 5-stage pipeline with sub-steps, seeded for every new org.
// Admins can rename, reorder, add, or remove stages/sub-steps afterward
// via the Admin > Pipeline screen -- nothing here is hard-coded elsewhere.

module.exports = [
  {
    key: 'scouting',
    name: '選址評估',
    color: '#8b5cf6',
    substeps: [
      '確認目標商圈',
      '候選點位初選完成',
      '完成現場勘查',
      '人流與商圈分析',
      '已聯繫房東',
    ],
  },
  {
    key: 'confirmed',
    name: '點位確認',
    color: '#3b82f6',
    substeps: [
      '租約條件確認',
      '租約簽署完成',
      '押金已支付',
      '交屋日期確認',
    ],
  },
  {
    key: 'planning',
    name: '開店規劃',
    color: '#f59e0b',
    substeps: [
      '平面配置圖完成',
      '設備清單確認',
      '預算核准',
      '承包商選定',
      '許可申請送件',
    ],
  },
  {
    key: 'building',
    name: '施工建置',
    color: '#ef4444',
    substeps: [
      '拆除與前置作業完成',
      '水電粗配完成',
      '地板安裝完成',
      '設備已到貨',
      '設備安裝完成',
      '招牌安裝完成',
      '最終驗收通過',
    ],
  },
  {
    key: 'grand_opening',
    name: '開幕準備',
    color: '#10b981',
    substeps: [
      '人員招募與訓練完成',
      '試營運完成',
      '行銷宣傳上線',
      '開幕活動完成',
      '交接給營運團隊',
    ],
  },
];
