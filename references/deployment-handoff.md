# 交付与部署说明（deployment-handoff）

> 本 skill 默认产出**两种交付物**，并提醒平台连通性边界。

## 1. 本地运行版（先试玩）
`scripts/build_site.py` 产出的 `dist/` 双击 `index.html` 即可在浏览器试玩（需同源加载 config.js，建议用本地静态服务器，如 `python -m http.server`）。

## 2. 可分享的线上链接（部署）
用 `workbuddy_cloudstudio_deploy` 部署 `dist/`，得到 `shareLink`（分享链接），可在微信内置浏览器打开。

⚠️ 该链接是云端沙箱**临时网页**，可能失效。需要稳定长期链接时，按 `references/migration_prompt.md` 在新对话框迁移。

## 3. 干净交接压缩包（给别的部署助手）
若要把项目交给他人/别的平台托管，打包时包含：
- `SKILL.md`、模板（`assets/template/`）、脚本（`scripts/`）、本说明
- `dist/`（含源码、资源、生成的 `config.js`）
- 一张交接说明，写明：站点名、稀有度、概率、保底、兑换码、命名风格

**不包含**：`node_modules`、`__pycache__`、临时文件、个人照片原图之外的无关文件。

## 4. 中国大陆直连提醒
能否在中国大陆直连，取决于**托管平台与域名**，不取决于「由谁上传」。部署前告知用户：若对方在国内访问，优先选国内可达的托管；纯前端静态站本身无地域限制。
