---
name: 抽抽乐网站生成器
description: 把一组照片变成一个可在线打开、可微信分享的「抽抽乐 / 抽卡 / 盲盒」网站。当用户说"把我的照片做成抽卡网站""想要个抽盲盒的网页""上传照片生成抽抽乐""给我做个卡牌抽取小游戏""做个卡牌 gacha 站"或类似需求时，优先用本 skill。它先提取网站名与稀有度等级（给用户搭建方向），结合既定工作流（白底金边视觉、英文带中文、整包交付），最后自动搭建网站并部署成可分享的临时链接，并提示如何在新对话里迁移到稳定链接。
license: Internal
allowed-tools:
disable: false
---

# 抽抽乐网站生成器（gacha-site-builder）

把任意一组「卡面 + 卡背」照片，变成一个数据驱动、可抽卡、可图鉴、可兑换积分、能直接发微信链接打开的网站。

本 skill 是**造物类** skill，运行时严格走三段式：**Phase 1 提取需求 → Phase 2 套用工作流 → Phase 3 搭建并部署**。未走完 Phase 1、2 的确认闸，不进入搭建。

---

## 强提醒：沉淀的「必吸收项」（最终版以本 skill 为准，GPT 复盘作为增强）

这些是从做抽卡网站的实战聊天记录 + GPT 复盘里挑出来、经实战验证的做法。本 skill 默认就这么做，不要等用户再说一遍；详细工程规则见 `references/engineering_rules.md`。

### A. 来自用户原始诉求（卡名 / 兑换码 / 命名规范）
1. **卡名从卡背来取。** 每张卡名必须看**卡背（背面）图像**联想生成（默认四个汉字、贴合画面气质、去重、不自动加编号）。逐张/批量给用户确认，支持 `旧名→新名` 覆盖表。详见 `references/naming-rules.md`，这是本 skill 的差异化能力。
2. **自动生成「10 个普通兑换码 + 1 个万分码」。** 普通码默认 500 积分；万分码一次到账 10000。码名贴合主题（如 `WANFEN10000`）。同一浏览器只能兑换一次。由 build 脚本自动产出。
3. **图片命名规范固定。** 卡面 `cardNN.webp`、卡背 `backNN.webp`、缩略图 `cardNN_t.webp / backNN_t.webp`。源图转 WebP 并修 EXIF 方向（实战踩过的坑：手机横拍图翻面会横过来），抽卡时预加载大图防白屏。

### B. 来自工程复盘（质量门槛，避免经典坑）
4. **先建完整卡牌目录，不边抽边生成。** 每张卡一开始就有 `id/name/rarity/frontImage/backImage`；图鉴、动画、记录、详情读同一份。
5. **全站唯一用户存档。** 积分、库存与持有数、首次/最近获得时间、抽卡记录、保底计数、未确认结果、已兑换口令，统一存 localStorage；确认抽卡时一次性结算写入。
6. **抽卡结果 vs 动画分离。** 先生成结果→动画只展示→点「收下全部」才结算并持久化；**未确认结果刷新不丢**。
7. **十连区分「新卡 / 重复卡」。** 新卡逐张卡背→卡面揭晓（仪式感）；重复卡直接卡面缩略图并列；揭完显示本次全部、一次收下。
8. **图鉴锁定态显示灰色卡背（非灰卡面）。** 未解锁=卡背+强灰化+不可点详情；已解锁=彩色卡面+数量角标。
9. **翻卡用「切换 src」而非双面 3D 叠层。** 用揭晓状态切 src + CSS 旋转/闪光模拟翻转；不依赖 `backface-visibility`（曾出现翻开仍是镜像卡背的兼容问题）。
10. **兑换码边界说清。** 前端版是「同浏览器一次性」，换浏览器/清数据可再兑——不要宣传成全网唯一密钥（详见 engineering_rules.md §7）。

### C. 始终遵守的交付约定
11. **必须微信可打开 + 移动端友好**：相对路径、viewport、图片预加载。
12. **初始积分 / 消耗可配**：默认 300 / 10 / 90（示例站迭代 100→500→300 后的最终值）。
13. **稀有度由用户定方向**：默认 R / SR / SSR / 隐藏款（72/20/6.5/1.5，第 50 抽保底 SSR+），blueprint 见 `references/tiers_blueprint.md`。
14. **临时链接 + 迁移提示**：部署给的是临时链接，交付时必须提示并附迁移 prompt（见 `references/migration_prompt.md`）。

---

## Phase 1 · 提取需求（extract）

**先钉需求，不急着写代码。** 用提问或读图把下面几项确认清楚（没给的用方括号默认值，但要点一下让用户知道）：

- **网站名字** + 副标题/slogan（如「示例花园 · 在紫色小宇宙，遇见下一张卡」）
- **卡牌数量** = 照片组数（示例站是 49 张）
- **稀有度分几类、每类名字与概率**（强烈建议给 `references/tiers_blueprint.md` 让用户选或改）
- **初始积分 / 单抽消耗 / 十连消耗**（默认 300 / 10 / 90）
- **主题色**：默认**白底金边**；若用户有自己的品牌色（如示例花园紫调），按品牌色走，并在 SKILL 注释标明
- **照片怎么给**：卡面（正面）+ 卡背（背面）两套图。规范命名 `cardNN.ext` / `backNN.ext`；若不规整，先用脚本统一（`scripts/build_site.py` 会按序号配对重命名）
- **兑换码**：默认自动生成「10 普通码(500) + 1 万分码(10000)」；用户也可指定码名或价值

把确认结果写成一份 `config.json`（结构见 `assets/template/config.example.js` 的注释），作为 Phase 3 的输入。

---

## Phase 2 · 套用工作流（apply workflow）

至少落实这三条跨领域默认（已在下方列出，无需外部文件）：

- **视觉**：白底金边为主；不引入医疗蓝绿/红警告/大渐变/AI 风装饰/大量卡片堆叠。主题色由 Phase 1 决定。
- **英文术语带中文备注**：界面/文案里出现的英文（SSR、Rarity（稀有度）、Pity（保底）等）首次出现附中文。
- **整包交付**：最终产物是一个可部署的目录（含 index.html + app.js + styles.css + config.js + assets/cards/），不是一堆散文件；对外分享走部署链接。

---

## Phase 3 · 搭建并部署（build + deploy）——【最终步，确认闸之后才跑】

### Step A · 整理图片
把用户照片按 `cardNN` / `backNN` 配对；调 `scripts/build_site.py` 统一转 WebP + 缩略图 + 修方向。

### Step B · 卡背取卡名（对应强提醒 #1 / 命名规则）
先用脚本生成的 `cardback_contact_sheet.png` 或逐张 Read 看 `backNN` 图像，**为每张卡联想一个默认四字诗意名**（贴合画面、去重、不附加编号），列出给用户确认/微调；支持 `旧名→新名` 覆盖表写进 `config.json` 的 `override`。规则详见 `references/naming-rules.md`。确认后写进 `config.json` 的 `names[]`。

### Step C · 生成站点（自动跑质量门禁）
运行：
```bash
python scripts/build_site.py --config config.json --cards-dir <照片目录> --out dist
# 或卡面/卡背分目录：
python scripts/build_site.py --config config.json --faces-dir <卡面目录> --backs-dir <卡背目录> --out dist
```
脚本会产出 `dist/`（填好数据的 `config.js` + 模板三件套 + `assets/cards/` + 卡背总览图），并自动校验：卡面/卡背数量与配对、卡名去重、稀有度是否在设定档位内、兑换码数量（见强提醒 #2）。若 `config.json` 没写 vouchers，脚本自动生成「10 普通码 + 1 万分码」。

### Step D · 部署成线上链接
用 `workbuddy_cloudstudio_deploy` 工具，目录指向 `dist/`：
```json
{ "directory": "<dist 绝对路径>" }
```
返回 `shareLink` 即为**分享链接**。

### Step E · 交付 + 临时提示（对应强提醒 #7）
向用户给出分享链接，并明确说明：
> 这是云端沙箱的**临时网页**，可能随时失效。需要稳定长期链接时，**新开一个对话框**，把 `references/migration_prompt.md` 里的 prompt 连同本链接/目录路径一起发过去即可迁移。

---

## 边界与兜底
- 只支持纯前端静态站（HTML/CSS/JS + 图片），无后端。
- 涉及个人照片默认本地处理，不外传。
- 部署失败或链接打不开：等几秒重试；仍不行就回退为「把 dist/ 打包成 zip 给用户自己传」。
- 卡名若用户始终不确认，先用占位名（如「未命名 01」）生成，后续可改 `config.js` 重跑 Step C/D。

## 文件地图
- `assets/template/`：数据驱动的抽卡站模板（index.html / styles.css / app.js / favicon.svg / config.example.js），app.js 读 `window.GACHA_CONFIG`，翻卡用「切换 src」不依赖背面 3D 叠层
- `scripts/build_site.py`：config + 照片 → 可部署 `dist/`，内置质量门禁与卡背总览图
- `references/engineering_rules.md`：工程质量门槛全集（状态分离、唯一存档、十连新/旧卡、灰卡背、翻卡、兑换码边界、质量门禁、可配置项表）
- `references/naming-rules.md`：卡名从卡背逐张联想的规则（四字默认、去重、覆盖表、不编号）
- `references/tiers_blueprint.md`：稀有度分级示例与概率设计参考
- `references/migration_prompt.md`：临时链接迁移到稳定链接的 prompt 模板
- `references/deployment-handoff.md`：本地版 + 干净交接压缩包 + 中国大陆连通性提醒
