/*
 * 抽抽乐网站配置示例（config.example.js）
 * 由 scripts/build_site.py 根据 config.json 自动生成真正的 config.js。
 * 这里只演示字段结构，供手动修改参考。
 */
window.GACHA_CONFIG = {
  siteName: "示例花园",
  subtitle: "在紫色小宇宙，遇见下一张卡",
  // 主题色：默认白底金边；可换成用户品牌色（如示例花园紫调）
  theme: {
    bg: "#f8f0fb",        // 页面背景
    surface: "#ffffff",   // 卡片/面板底色
    primary: "#8b5cf6",   // 主色（按钮、强调）
    accent: "#d4af37",    // 金边/点缀
    text: "#3a2d4d"       // 正文色
  },
  initialCoins: 300,                 // 初始积分
  drawCost: { single: 10, ten: 90 }, // 单抽 / 十连消耗
  pityLimit: 50,                     // 第 N 抽保底必出 SSR 或更高
  // 稀有度分级（顺序即由低到高；最后一项视为最高档）
  tiers: [
    { key: "HIDDEN", name: "隐藏款", prob: 1.5, color: "#e0b0ff" },
    { key: "SSR",    name: "SSR",    prob: 6.5, color: "#ffd700" },
    { key: "SR",     name: "SR",     prob: 20,  color: "#9b8cff" },
    { key: "R",      name: "R",      prob: 72,  color: "#b0a8c0" }
  ],
  // 兑换码：不写则由脚本自动生成「10 普通码(500) + 1 万分码(10000)」
  vouchers: [
    { code: "WANFEN10000", points: 10000 },
    { code: "DEMO500",    points: 500 }
  ],
  // 卡牌：front/back 为 WebP 路径；*_t 为缩略图
  cards: [
    {
      id: 1, name: "花朝初见", tier: "SSR",
      front: "assets/cards/card01.webp", back: "assets/cards/back01.webp",
      frontThumb: "assets/cards/card01_t.webp", backThumb: "assets/cards/back01_t.webp"
    }
    // ...其余由脚本填充
  ]
};
