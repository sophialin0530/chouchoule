# 抽抽乐网站生成器（gacha-site-builder）

一个 WorkBuddy 用户级 skill：把**一组照片 + 卡背素材**，做成一个有收藏感、可持续玩、可在微信/手机打开的**个人抽抽乐网站**。

## 它能做什么

1. **提取需求**（Phase 1）：网站名、稀有度分级（几类、概率、保底）、初始积分、主题色等。
2. **套用工作流**（Phase 2）：白底金边视觉、卡名从卡背联想生成、自动产出「10 个普通兑换码 + 1 个万分码」、质量门禁。
3. **搭建并部署**（Phase 3）：数据驱动的纯前端抽卡站（翻卡 / 图鉴 / 十连 / 抽卡记录），部署成线上可打开的临时链接，并附「迁移到稳定链接」的 prompt。

## 目录结构

```
gacha-site-builder/
├── SKILL.md                 # skill 主入口（三段式造物流程）
├── assets/template/         # 数据驱动抽卡站模板（index.html/styles.css/app.js/config.example.js/favicon.svg）
├── scripts/build_site.py    # 照片 + config → 可部署 dist/
└── references/              # 工程规则 / 命名规则 / 稀有度蓝图 / 迁移 prompt / 部署交接 / 聊天沉淀
```

## 快速使用

1. 在 WorkBuddy 新开对话，直接说「把我的照片做成抽抽乐网站」。
2. 按提示提供：照片目录、卡背目录、网站名、稀有度分级方向。
3. skill 会逐张看卡背起名、生成兑换码、构建并部署。

完整规则见 `SKILL.md`。
