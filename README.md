<p align="center">
  <img src="public/next.svg" alt="OPENLLMPIX" width="120" />
</p>

<h1 align="center">OPENLLMPIX</h1>

<p align="center">
  <strong>开源的 AI 生图控制台，密钥和模型选择权都在你手里。</strong>
</p>

<p align="center">
  <a href="https://github.com/nicremo/openllmpix/actions/workflows/ci.yml"><img src="https://github.com/nicremo/openllmpix/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/nicremo/openllmpix/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <a href="https://github.com/nicremo/openllmpix/pulls"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"></a>
  <a href="https://github.com/nicremo/openllmpix/issues"><img src="https://img.shields.io/github/issues/nicremo/openllmpix" alt="Issues"></a>
</p>

<p align="center">
  <a href="https://openllmpix.com">在线体验</a> •
  <a href="#特性">特性</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#provider-与模型">内置 Provider</a> •
  <a href="#自定义-provider">自定义 Provider</a> •
  <a href="#配置文件">配置文件</a> •
  <a href="#贡献">参与贡献</a>
</p>

---

## 为什么做这个

我想用 **Nano Banana Pro**——Google 那批新图像模型。问题在于：通过 Fal.ai、Higgsfield 这类服务调用要花钱。单次不多，但累积起来没必要，毕竟 Google AI Studio 本来就提供免费额度。

而 Google AI Studio 的界面并不合我胃口。

于是做了 **OPENLLMPIX**——一个干净的控制台，用我自己的 API Key 调用任意模型。没有中间商加价，没有笨重界面。写提示词、生成、完事。

**100% 开源**——无需注册、无埋点、配置不出本机。

---

## 特性

### 生成模式

- **文生图**——描述你想要的，得到一张图。
- **图生图**——上传参考图并描述如何修改。支持拖拽粘贴、直接粘贴剪贴板、点击上传。
- **对话式修图**——通过多轮对话迭代编辑，最多携带 4 张上下文图，支持 HEIC/TIFF。

### 图像控制

- **5 种宽高比**——1:1、16:9、9:16、4:3、3:4
- **批量生成**——单次 1–4 张
- **多张参考图**——图生图可同时输入多张

### 多 Provider

- **任意数量的 Provider**——OpenRouter、Google AI Studio、Fal.ai 之外，可添加多条并同时保留各自密钥
- **配置持久化到文件**——保存到 `~/.openllmpix/config.json`，换浏览器、重启开发服务器都不丢
- **统一模型选择器**——生图页一个下拉列出**所有** Provider 的模型，按 Provider 分组折叠，不再只显示当前激活的那一个
- **在线拉取模型**——一键 fetch 出可用模型后**自行勾选**，不再全部自动加入

### 自定义 Provider

- **OpenAI 兼容端点**——任何兼容 OpenAI 协议的生图服务都能接入，不限官方支持的名单
- **4 种协议格式**——`images`、`chat`、`dashscope`、`modelscope`，见[自定义 Provider](#自定义-provider)
- **可为本地端点无密钥运行**——如本地 Ollama / 兼容网关

### 界面

- **浅色 / 深色 / 跟随系统**三档主题，`Shift+L` 快速切换，选择持久化
- **大图查看器**——全屏查看，带元数据、键盘导航、下载
- **作为参考图复用**——点击任意生成结果即可作为图生图输入
- **键盘快捷键**——`Cmd/Ctrl+Enter` 生成、`ESC` 关闭弹窗、方向键导航

### 隐私与安全

- **密钥不出本机**——API Key 写入 `~/.openllmpix/config.json`，权限 `0600`，不上传任何服务器
- **本地请求校验**——`/api/config` 只接受来自 `localhost` 的请求，其余一律 `403`
- **生成走直连**——内置 Provider 的请求由浏览器直接发往服务商，不经本服务中转
- **本地历史**——生成记录存在 IndexedDB，随时可用，随时私密

---

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/nicremo/openllmpix.git
cd openllmpix

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)，点击**设置**图标，添加你的 API Key。

只需一步，配置会立即落盘到 `~/.openllmpix/config.json`。

---

## Provider 与模型

| Provider | 模型 | 模式 | 申请 Key |
|----------|------|------|----------|
| **Google AI Studio** | Nano Banana Pro、Gemini 2.0 Flash、Imagen 3 | 文生图、图生图* | [aistudio.google.com](https://aistudio.google.com) |
| **OpenRouter** | Gemini 2.0 Flash、Gemini 2.5 Flash Preview | 文生图、图生图 | [openrouter.ai](https://openrouter.ai) |
| **Fal.ai** | FLUX Pro 1.1、FLUX Schnell、FLUX Dev、FLUX LoRA | 文生图 | [fal.ai](https://fal.ai) |

*Imagen 仅支持文生图，Gemini 与 Nano Banana 系列两者皆可。

以上之外的服务请用[自定义 Provider](#自定义-provider)。

---

## 自定义 Provider

在设置里选 **Custom**，填入 Base URL 和 API Key 即可接入任意 OpenAI 兼容服务。关键在于选对**API 格式**——各家协议差异比看上去大。

| API 格式 | 端点 | 说明 |
|----------|------|------|
| `Images API` | `{base}/images/generations` | 通用 OpenAI 兼容图片协议，**默认选项** |
| `Chat API` | `{base}/chat/completions` | 多模态 `content` 数组形式 |
| `DashScope (阿里云)` | `{base}/services/aigc/multimodal-generation/generation` | 阿里云原生协议，**仅国内公共站需要** |
| `ModelScope (魔搭)` | `{base}/v1/images/generations` + 轮询 `/v1/tasks/{id}` | 魔搭，提交任务后需轮询取图 |

### 阿里云百炼

**选错格式会直接 404**，而且报错信息里看不出原因：

- **Workspace 端点**（形如 `https://<workspaceId>.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`）
  选 `Images API`。Base URL 填到 `/compatible-mode/v1` 为止即可。

- **国内公共站**（`https://dashscope.aliyuncs.com`）
  选 `DashScope (阿里云)`，Base URL 填 `https://dashscope.aliyuncs.com/api/v1`。

  为什么？公共站的 `/compatible-mode/v1` **只提供 `/chat/completions` 和 embeddings，没有图片端点**，请求 `/images/generations` 会返回 404——这与模型名和密钥都无关，纯粹是路由不存在。

两种端点的其他差异：

| | Workspace（`Images API`） | 公共站（`DashScope`） |
|---|---|---|
| 图生图 | 与文生图同端点，顶层 `image` 字段 | `input.messages[].content` 里的 `{ image }` 分片 |
| 尺寸写法 | `1024x1024` | `1024*1024`（星号） |

⚠️ **`/images/edits` 不可用。** 阿里云的 OpenAI 兼容层没有实现这个路由，也不支持 multipart 上传和 mask。参考图必须作为 `image` 字段随文生图请求一起发送——这正是设置里**图生图**默认选 `Inline image field` 的原因。只有遇到真正实现 `/images/edits` 的原生 OpenAI 端点时才切到 `Multipart upload`。

### 魔搭 ModelScope

Base URL 填 `https://api-inference.modelscope.cn/v1`（或 `-sgp` 新加坡站），选 `ModelScope (魔搭)`。

提交后返回的是任务 ID，需要轮询 `GET {base}/tasks/{id}`，且**轮询请求必须携带 `X-ModelScope-Task-Type: image_generation` 头**。该格式会自动加上这个头。

因为魔搭的 CORS 允许头列表里没有这个字段，**浏览器无法直接轮询**，所以请把「发送请求」选为 **Via app server**。

### 其他选项

- **尺寸**——留 `auto` 表示按所选宽高比自动推导。OpenAI 兼容协议普遍用 `x` 分隔（`1024x1024`），阿里云原生协议用 `*`（已在对应格式下自动转换）。
- **发送请求**——`Direct` 由浏览器直连服务商，适合支持 CORS 的端点；`Via app server` 经本项目服务端转发，适合需要隐藏密钥或不放开 CORS 的端点。
- **扩展请求头 / 轮询请求头**——每行一条，`Key: Value` 格式。用于填写上述协议硬性要求、但尚未内置的请求头。

> 没有为自定义 Provider 提供「任意地址中转」的服务端代理路由——那等于开一个公开的 SSRF 入口。选择 `Via app server` 时，请求只会发往你自己配置的地址。

---

## 配置文件

所有 Provider 配置保存在：

```
~/.openllmpix/config.json
```

目录以 `0700`、文件以 `0600` 创建。

**密钥以明文存储。** 这是刻意的取舍，和 `.env`、`.netrc`、`~/.docker/config.json` 的处理方式一致——换来的是跨浏览器、跨重启可用，以及可以手工查看编辑。代价是：**任何以当前系统用户身份运行的进程都能读取它**。

（`0600` 由上述代码在 POSIX 系统上保证；在 Windows 上 Node 的 `chmod` 仅映射到只读属性而非 ACL，实际保护来自用户目录继承的权限。）

可用环境变量 `OPENLLMPIX_CONFIG_DIR` 覆盖配置目录位置。

访问控制：

- `/api/config` 仅接受 `Host` 为 `localhost` / `127.0.0.1` / `[::1]` 的请求，其余返回 `403`。**公网部署的实例不会把运营者的密钥暴露出去。**
- `/api/generate` 不做此限制（它不读取配置文件）。
- 若配置路由不可达（如静态导出），配置会退回 localStorage，功能不受影响。

---

## 工作原理

```
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│                 │        │                 │        │                 │
│   你的浏览器    │───────▶│  Provider API   │───────▶│   生成的图片    │
│                 │        │ （Google、Fal、  │        │                 │
│  密钥存在本机   │  直连  │  OpenRouter、   │        │  存在浏览器     │
│  ~/.openllmpix  │        │  你的自建端点）  │        │  IndexedDB      │
│                 │        │                 │        │                 │
└─────────────────┘        └─────────────────┘        └─────────────────┘
```

**内置 Provider 的请求由浏览器经 CORS 直连服务商。** Next.js 服务端只负责静态页面、配置文件读写，以及你显式选择 `Via app server` 时的请求转发。

---

## 部署

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/nicremo/openllmpix)

1. 点击上方按钮
2. 部署
3. 完成——无需配置环境变量

> ⚠️ **公网部署无法保存 Provider 配置。** 从非 `localhost` 域名访问时 `/api/config` 会返回 `403`，配置将退回浏览器 localStorage，换浏览器即丢失。这是有意的：`/api/config` 读写的是明文密钥，绝不能暴露到公网。
>
> **本项目按「本机运行」场景设计。** 想长期保存多 Provider 配置，请在本机 `npm run dev` 或 `npm start` 后经 `http://localhost:3000` 访问。

### 自托管

```bash
npm run build
npm start
```

或使用 Docker：

```bash
docker build -t openllmpix .
docker run -p 3000:3000 openllmpix
```

---

## 竞品对比

| 特性 | OPENLLMPIX | Fal.ai | Higgsfield | Midjourney |
|------|------------|--------|------------|------------|
| 开源 | ✅ | ❌ | ❌ | ❌ |
| 多 Provider | ✅ | ❌ | ❌ | ❌ |
| 自带密钥（BYOK） | ✅ | ❌ | ❌ | ❌ |
| 文生图 | ✅ | ✅ | ✅ | ✅ |
| 图生图 | ✅ | ✅ | 受限 | ✅ |
| 可自托管 | ✅ | ❌ | ❌ | ❌ |
| 无需注册 | ✅ | ❌ | ❌ | ❌ |
| 任意 OpenAI 兼容端点 | ✅ | ❌ | ❌ | ❌ |
| 配置持久化到文件 | ✅ | — | — | — |

---

## 技术栈

- **框架：** Next.js 16（App Router）
- **UI：** React 19、Tailwind CSS 4
- **语言：** TypeScript 5
- **主题：** CSS 自定义属性（`:root.dark` / `:root.light`），`<head>` 内联脚本预置主题避免闪白
- **存储：** 本地 JSON 配置文件 + IndexedDB 历史记录
- **部署：** Vercel、Netlify、Docker

---

## 贡献

欢迎贡献！无论新增 Provider、修 Bug 还是完善文档，每个 PR 都有帮助。

```bash
# Fork 后：
git clone https://github.com/YOUR_USERNAME/openllmpix.git
cd openllmpix
npm install
npm run dev
```

**提交 PR 前：**
- 阅读[贡献指南](CONTRIBUTING.md)
- 确认 `npm run build` 通过
- 遵循 PR 模板

**可贡献的方向：**
- 新增内置 Provider（Replicate、Together.ai、Stability AI）
- 视频生成支持（Runway、Kling、Pika）
- 图像编辑工具（局部重绘、扩图）
- 补充测试

**反馈渠道：**
- Bug 与功能建议请提 [issue](https://github.com/nicremo/openllmpix/issues)
- 问题讨论请前往 [Discussions](https://github.com/nicremo/openllmpix/discussions)

---

## 许可证

MIT License——随意使用。

---

<p align="center">
  <sub>Built with mass amounts of mass produced mass market coffee by <a href="https://github.com/nicremo">@nicremo</a></sub>
</p>
