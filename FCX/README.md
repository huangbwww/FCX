# FCX 用户脚本源码

本目录包含 FCX 完整用户脚本的 TypeScript 源码、测试和构建配置。

完整开发、架构、测试和发布流程见 [开发者文档](../docs/DEVELOPMENT.md)。

## 环境

- Node.js `>=20.19.0`
- npm
- Tampermonkey 支持的现代浏览器

## 命令

```powershell
npm ci
npm run typecheck
npm run test
npm run build
npm run check
```

- `npm run typecheck`：严格 TypeScript 检查。
- `npm run test`：运行 Vitest 测试。
- `npm run build`：构建完整用户脚本并更新根目录 `dist/` 发布产物。
- `npm run check`：执行发布前全部检查。

## 目录

- `src/config/`：默认设置、SBC 推荐规则和内置流程。
- `src/domain/`：SBC、卡包、球员、市场、进化和永动机领域逻辑。
- `src/platform/`：EA Web App 兼容层与请求封装。
- `src/remote/`：账号与远程控制客户端。
- `src/state/`：设置、缓存、保护和任务历史状态。
- `src/ui/`：FCX 页面、弹窗、导航和任务界面。
- `tests/`：单元测试与源码回归测试。
- `scripts/`：构建产物及发布校验。

## 运行边界

FCX 用户脚本不把求解器嵌入 JavaScript。求解时只连接用户本机的：

```text
http://127.0.0.1:<端口>/solve
```

默认端口为 `8000`，可在 FCX 设置中调整。本地求解器源码位于仓库根目录的 `backend/`；远程 API、小程序和数据库不属于本仓库。

## 构建产物

```text
dist/FCX.js
../dist/FCX.js
../dist/version.json
../dist/routines.json
../dist/SHA256SUMS.txt
```

用户脚本是完整单文件，不通过远程加载器下载或执行业务代码。

官方构建的版本与流程 JSON 默认由 `fczhushou.com` 提供。Fork 维护者没有官方主站上传权限，应按[开发者文档](../docs/DEVELOPMENT.md#自定义静态-json-地址)改用自己的 HTTPS 地址和 `@connect` 白名单。
