# FCX 本地求解后端

该服务只在用户电脑上运行，为 FCX 用户脚本提供本地 `/solve` 接口。球员池和求解请求不会通过远程 FCX API 中转。

接口结构、兼容规则和测试方法见 [开发者文档](../docs/DEVELOPMENT.md#本地后端接口)，安全边界见 [安全策略](../SECURITY.md)。

## 开发运行

```powershell
python -m pip install -r requirements.txt -r requirements-build.txt
python backend/gui.py
```

默认监听 `127.0.0.1:8000`。GUI 中修改端口后，需要在 FCX 设置中使用相同端口。

## 测试

```powershell
python -m pytest backend/tests -q
```

## Windows EXE

```powershell
powershell -ExecutionPolicy Bypass -File backend/build_gui.ps1
```

产物为 `dist/FCX后端.exe`。EXE 不提交到 Git；GitHub Release 工作流会和完整用户脚本一起构建、校验并上传。
