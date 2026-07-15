# Image Background Remover — MVP 开发任务清单

> 版本：v1.0  
> 日期：2026-07-15  
> 关联需求：`docs/MVP-REQUIREMENTS.md`

---

## 任务总览

```
T1  ─ 清理脚手架 ───────────────┐
                                ├──→ T2 写引擎测试 (🔴 RED)
                                │         ↓
                                ├──→ T3 实现引擎层 (🟢 GREEN)
                                │
                                ├──→ T4 编写 HTML
                                ├──→ T5 编写 CSS
                                │         ↓
                                ├─────→ T6 实现 UI 逻辑 (main.js)
                                │
                                ├──→ T7 CF Pages 部署配置
                                │         ↓
                                └─────→ T8 构建验证 + 手动测试
```

## 执行顺序

```
顺序：T1 → T2 → T3 → (T4 + T5 可并行) → T6 → T7 → T8
```

| 阶段 | 任务 | 类型 |
|------|------|------|
| 准备 | T1 | ⚙️ 项目初始化 |
| 引擎层 TDD | T2 → T3 | 🧪 测试先行 → 💻 实现 |
| UI 层 | T4 → T5 → T6 | 🎨 HTML → 🎨 CSS → 💻 JS |
| 部署 | T7 | ⚙️ Cloudflare 配置 |
| 收尾 | T8 | ✅ 构建 + 验证 |

---

## T1 — 清理项目脚手架，创建目录结构

- [ ] **状态：** ⏳ 待开始
- [ ] **描述：** 删除 Vite 默认模板文件（counter.js、assets/、favicon.svg），创建 `src/engines/` 目录，安装 Vitest 测试框架

**涉及文件：**
- 删除 `src/counter.js`
- 删除 `src/assets/`
- 删除 `public/favicon.svg`
- 删除 `public/icons.svg`
- 创建 `src/engines/` 目录
- 安装 `vitest` 到 devDependencies

---

## T2 — TDD RED：写引擎抽象层测试（先失败）

- [ ] **状态：** ⏳ 待开始
- [ ] **描述：** 用 Vitest 编写引擎层测试，此时代码未实现，测试应为失败状态

### 测试用例

**engines/index.test.js**
- `engineFactory('wasm')` 返回 WasmEngine 实例
- `engineFactory('api')` 返回 ApiEngine 实例（返回 null 或桩）
- `engineFactory()` 默认返回 wasm 引擎

**engines/wasm-engine.test.js**
- `wasmEngine.removeBackground(file)` 返回 Promise<Blob>
- `wasmEngine.removeBackground()` 无参数时抛出错误
- `wasmEngine.removeBackground()` 传入非图片文件时优雅处理

**涉及文件（新建）：**
- `src/engines/index.test.js`
- `src/engines/wasm-engine.test.js`

---

## T3 — TDD GREEN：实现引擎抽象层

- [ ] **状态：** ⏳ 待开始
- [ ] **描述：** 实现引擎工厂和 WASM 引擎封装，让 T2 的测试通过

### 涉及文件（新建）

**`src/engines/index.js`** — 引擎工厂
```javascript
// 按环境变量 VITE_ENGINE 选择引擎实现
// 'wasm' → WasmEngine（默认）
// 'api'  → ApiEngine（Phase 2 预留）
```

**`src/engines/wasm-engine.js`** — WASM 引擎
```javascript
// 封装 @imgly/background-removal 的 removeBackground()
// 提供统一接口：removeBackground(file) → Promise<Blob>
```

**`src/engines/api-engine.js`** — API 引擎桩
```javascript
// Phase 2 预留，抛错提示"未实现"或返回 null
```

---

## T4 — 创建 HTML 页面结构

- [ ] **状态：** ⏳ 待开始
- [ ] **描述：** 重写 `index.html`，包含 MVP 完整 UI 结构

### 页面结构

```
header
  └─ h1 标题 + subtitle
main
  ├─ uploadZone       ← 拖拽 / 点击上传
  ├─ processing       ← 进度条（默认隐藏）
  └─ result           ← 结果预览（默认隐藏）
       ├─ result-tabs ← Tab: [原图] [结果]
       ├─ viewport    ← 图片预览区（棋盘格背景）
       └─ actions     ← 下载 + 处理下一张
footer
  └─ 隐私声明
```

**涉及文件（修改）：**
- `index.html`

---

## T5 — 创建 CSS 样式系统

- [ ] **状态：** ⏳ 待开始
- [ ] **描述：** 实现完整的样式系统，包含响应式布局

### 样式要点

- CSS 变量主题系统
- 上传区域：虚线边框、拖拽高亮动效
- 进度条：渐变色动画
- 结果视图：棋盘格透明背景
- Tab 切换：下划线指示器
- 按钮：主色调 + hover 反馈
- 移动端适配（< 600px）

**涉及文件（修改）：**
- `src/style.css`

---

## T6 — 实现 UI 主逻辑 main.js

- [ ] **状态：** ⏳ 待开始
- [ ] **描述：** 实现完整的 UI 交互逻辑，集成引擎抽象层

### 功能点

| # | 功能 | 对应需求 |
|---|------|---------|
| F1 | 点击上传 + 拖拽上传 | P0 |
| F2 | 拖拽高亮反馈 | P0 |
| F3 | 调用引擎处理 | P0 |
| F4 | 进度条 + 状态文字 | P0 |
| F5 | Tab 切换原图/结果 | P0 |
| F6 | 下载 PNG | P0 |
| F7 | 错误提示 | P0 |
| F8 | 重置/处理下一张 | P0 |
| F9 | 显示文件大小 | P1 |
**涉及文件（修改）：**
- `src/main.js`

---

## T7 — 配置 Cloudflare Pages 部署文件

- [ ] **状态：** ⏳ 待开始
- [ ] **描述：** 完善构建配置和 Cloudflare 部署配置

### 涉及文件

| 文件 | 用途 |
|------|------|
| `vite.config.js` | Vite 构建配置 |
| `public/_headers` | WASM MIME 类型 + 缓存策略 |
| `public/_redirects` | SPA 路由重定向（预留） |

---

## T8 — 构建验证 + 手动测试

- [ ] **状态：** ⏳ 待开始
- [ ] **描述：** 最终验证全部功能正常

### 验证清单

- [ ] `npm run build` 构建成功
- [ ] `dist/` 包含 `_headers`、`_redirects`
- [ ] `npm run dev` 能正常打开页面
- [ ] 上传区域可拖拽/点击选择图片
- [ ] 处理中显示进度条和状态文字
- [ ] 结果可切换原图/结果 Tab
- [ ] 结果背景已移除（棋盘格透明）
- [ ] 下载按钮触发 PNG 下载
- [ ] 点击"处理下一张"回到上传状态
- [ ] 上传非图片文件不崩溃
- [ ] 移动端布局正常
- [ ] 引擎层测试全部通过（`npx vitest run`）

---

## 进度标记

| 符号 | 含义 |
|------|------|
| ⏳ 待开始 | 未开始 |
| 🔄 进行中 | 正在执行 |
| ✅ 已完成 | 完成 |
| ❌ 已阻塞 | 遇到阻塞 |
| ➡️ 已跳过 | 决定不做 |

---

> 本文档与 `docs/MVP-REQUIREMENTS.md` 配套使用。
> 任务变更需同步更新本文档。
